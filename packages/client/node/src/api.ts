/**
 * API Router - REST endpoints for the prediction market
 */

import type { FastifyInstance } from "fastify";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type { Pool } from "pg";
import {
  getOpenMarkets,
  getMarketById,
  getUserBets,
  getUserProfile,
  getLeaderboard,
  placeBet,
  getOrCreateUser,
} from "@prediction-market/database";
import { sendToBatcher } from "./batcher-client.ts";

/** Wallet address of the resolver/admin — set via RESOLVER_ADDRESS env var */
const RESOLVER_ADDRESS = Deno.env.get("RESOLVER_ADDRESS") ??
  "0x0000000000000000000000000000000000000001";

let dbPool: Pool | null = null;

export const apiRouter: StartConfigApiRouter = async (
  server: FastifyInstance,
  dbConn: Pool
) => {
  dbPool = dbConn;

  // CORS for all routes
  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  });

  // ── Health ──────────────────────────────────────────────────────────────

  server.get("/api/health", async () => ({
    status: "ok",
    timestamp: Date.now(),
  }));

  // ── Markets ─────────────────────────────────────────────────────────────

  server.get("/api/markets", async (_request, reply) => {
    try {
      const markets = await getOpenMarkets(dbPool!);
      return { markets };
    } catch (err) {
      console.warn("[API] markets query failed:", (err as Error).message);
      return { markets: [] };
    }
  });

  server.get("/api/markets/:marketId", async (request, reply) => {
    const { marketId } = request.params as { marketId: string };
    try {
      const market = await getMarketById(dbPool!, marketId);
      if (!market) return reply.code(404).send({ error: "Market not found" });
      return { market };
    } catch (err) {
      console.warn("[API] market query failed:", (err as Error).message);
      return reply.code(500).send({ error: "Database error" });
    }
  });

  // ── Admin: market lifecycle ─────────────────────────────────────────────
  //
  // These endpoints submit an on-chain command which the state machine then
  // processes (Postgres update + Midnight circuit call via batcher).
  // In production, gate these behind an API key / admin auth.

  server.post("/api/admin/markets", async (request, reply) => {
    const { marketId, title, description, category, closeTime, options } =
      request.body as {
        marketId: string;
        title: string;
        description?: string;
        category?: string;
        closeTime: string;
        options?: Array<{ optionId: string; label: string }>;
      };

    if (!marketId || !title || !closeTime) {
      return reply.code(400).send({ error: "marketId, title, and closeTime are required" });
    }

    const db = dbPool!;

    try {
      // Insert market + options into Postgres immediately (state machine will also
      // upsert when it processes the on-chain command, but we do it here for
      // instant API visibility).
      await db.query(
        `INSERT INTO markets (market_id, title, description, category, close_time, status)
         VALUES ($1, $2, $3, $4, $5::timestamp, 'open')
         ON CONFLICT (market_id) DO NOTHING`,
        [marketId, title, description ?? "", category ?? "general", closeTime],
      );

      const marketOptions = options ?? [
        { optionId: "yes", label: "Yes" },
        { optionId: "no", label: "No" },
      ];
      for (const opt of marketOptions) {
        await db.query(
          `INSERT INTO market_options (market_id, option_id, label)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [marketId, opt.optionId, opt.label],
        );
      }

      // Submit on-chain command (state machine picks it up and calls batcher)
      const result = await sendToBatcher(
        `cm|${marketId}|${title}|${description ?? ""}|${category ?? "general"}|${closeTime}`,
        RESOLVER_ADDRESS,
      );

      if (!result.success) {
        console.warn("[API] admin createMarket batcher warn:", result.error);
      }

      return { success: true, marketId, transactionHash: result.transactionHash };
    } catch (err) {
      console.error("[API] admin createMarket error:", err);
      return reply.code(500).send({ error: "Failed to create market" });
    }
  });

  server.post("/api/admin/markets/:marketId/close", async (request, reply) => {
    const { marketId } = request.params as { marketId: string };
    const db = dbPool!;

    try {
      const market = await getMarketById(db, marketId);
      if (!market) return reply.code(404).send({ error: "Market not found" });
      if (market.status !== "open") {
        return reply.code(400).send({ error: "Market is not open" });
      }

      await db.query(
        `UPDATE markets SET status = 'closed' WHERE market_id = $1`,
        [marketId],
      );

      const result = await sendToBatcher(`clm|${marketId}`, RESOLVER_ADDRESS);
      if (!result.success) {
        console.warn("[API] admin closeMarket batcher warn:", result.error);
      }

      return { success: true, transactionHash: result.transactionHash };
    } catch (err) {
      console.error("[API] admin closeMarket error:", err);
      return reply.code(500).send({ error: "Failed to close market" });
    }
  });

  server.post("/api/admin/markets/:marketId/resolve", async (request, reply) => {
    const { marketId } = request.params as { marketId: string };
    const { winningOptionId } = request.body as { winningOptionId: string };
    const db = dbPool!;

    if (!winningOptionId) {
      return reply.code(400).send({ error: "winningOptionId is required" });
    }

    try {
      const market = await getMarketById(db, marketId);
      if (!market) return reply.code(404).send({ error: "Market not found" });
      if (market.status === "resolved") {
        return reply.code(400).send({ error: "Market already resolved" });
      }

      // Settle bets in Postgres
      await db.query(`
        WITH totals AS (
          SELECT
            SUM(total_staked) AS total_staked,
            MAX(CASE WHEN option_id = $2 THEN total_staked ELSE 0 END) AS winner_staked
          FROM market_options WHERE market_id = $1
        )
        UPDATE bets SET
          status = CASE WHEN option_id = $2 THEN 'won' ELSE 'lost' END,
          payout = CASE
            WHEN option_id = $2 THEN
              FLOOR(amount::numeric * t.total_staked / NULLIF(t.winner_staked, 0))::integer
            ELSE 0
          END,
          resolved_at = CURRENT_TIMESTAMP
        FROM totals t
        WHERE market_id = $1 AND status = 'pending'
      `, [marketId, winningOptionId]);

      await db.query(
        `UPDATE markets
         SET status = 'resolved', resolved_option_id = $2, resolved_at = CURRENT_TIMESTAMP
         WHERE market_id = $1`,
        [marketId, winningOptionId],
      );

      await db.query(`
        UPDATE user_profiles up
        SET points = points + b.payout,
            total_won = total_won + 1,
            updated_at = CURRENT_TIMESTAMP
        FROM bets b
        WHERE b.account_id = up.account_id
          AND b.market_id = $1
          AND b.status = 'won'
          AND b.payout > 0
      `, [marketId]);

      // Submit on-chain command
      const result = await sendToBatcher(
        `rm|${marketId}|${winningOptionId}`,
        RESOLVER_ADDRESS,
      );
      if (!result.success) {
        console.warn("[API] admin resolveMarket batcher warn:", result.error);
      }

      return { success: true, transactionHash: result.transactionHash };
    } catch (err) {
      console.error("[API] admin resolveMarket error:", err);
      return reply.code(500).send({ error: "Failed to resolve market" });
    }
  });

  // ── Bets ────────────────────────────────────────────────────────────────

  server.post("/api/bets", async (request, reply) => {
    const { marketId, optionId, amount, walletAddress } = request.body as {
      marketId: string;
      optionId: string;
      amount: number;
      walletAddress: string;
    };

    if (!marketId || !optionId || !amount || !walletAddress) {
      return reply.code(400).send({ error: "Missing required fields" });
    }

    if (![10, 25, 50].includes(amount)) {
      return reply.code(400).send({ error: "Invalid amount. Must be 10, 25, or 50" });
    }

    const db = dbPool!;

    try {
      const accountResult = await db.query(
        `SELECT account_id FROM effectstream.addresses WHERE address = $1`,
        [walletAddress],
      );

      if (accountResult.rows.length === 0) {
        return reply.code(403).send({ error: "Wallet not registered" });
      }

      const accountId = accountResult.rows[0].account_id;

      const market = await getMarketById(db, marketId);
      if (!market) return reply.code(404).send({ error: "Market not found" });
      if (market.status !== "open") {
        return reply.code(400).send({ error: "Market is not open for betting" });
      }

      const profile = await getUserProfile(db, accountId);
      if (!profile || profile.points < amount) {
        return reply.code(400).send({ error: "Insufficient points" });
      }

      const existingBet = await db.query(
        `SELECT bet_id FROM bets WHERE market_id = $1 AND account_id = $2`,
        [marketId, accountId],
      );
      if (existingBet.rows.length > 0) {
        return reply.code(400).send({ error: "You have already bet on this market" });
      }

      const betId = `bet_${marketId}_${accountId}_${Date.now()}`;
      await placeBet(db, betId, marketId, optionId, accountId, amount);

      // Submit on-chain command (state machine picks it up and calls batcher)
      const batcherResult = await sendToBatcher(
        `b|${marketId}|${optionId}|${amount}`,
        walletAddress,
      );
      if (!batcherResult.success) {
        console.warn("[API] placeBet batcher warn:", batcherResult.error);
      }

      return { success: true, betId, transactionHash: batcherResult.transactionHash };
    } catch (err) {
      console.error("[API] place bet error:", err);
      return reply.code(500).send({ error: "Failed to place bet" });
    }
  });

  // ── Claim Winnings ──────────────────────────────────────────────────────

  server.post("/api/bets/:marketId/claim", async (request, reply) => {
    const { marketId } = request.params as { marketId: string };
    const { walletAddress } = request.body as { walletAddress: string };
    const db = dbPool!;

    if (!walletAddress) {
      return reply.code(400).send({ error: "walletAddress is required" });
    }

    try {
      const accountResult = await db.query(
        `SELECT account_id FROM effectstream.addresses WHERE address = $1`,
        [walletAddress],
      );
      if (accountResult.rows.length === 0) {
        return reply.code(403).send({ error: "Wallet not registered" });
      }

      const accountId = accountResult.rows[0].account_id;

      const betResult = await db.query(
        `SELECT b.status, b.payout FROM bets b
         WHERE b.market_id = $1 AND b.account_id = $2`,
        [marketId, accountId],
      );

      if (betResult.rows.length === 0) {
        return reply.code(404).send({ error: "No bet found for this market" });
      }

      const bet = betResult.rows[0];
      if (bet.status !== "won") {
        return reply.code(400).send({ error: "Bet did not win or is not yet resolved" });
      }

      // Forward claimWinnings to Midnight batcher
      // The MidnightAdapter reads on-chain state to compute payout/remainder witnesses
      const result = await sendToBatcher(`cw|${marketId}`, walletAddress);
      if (!result.success) {
        console.warn("[API] claimWinnings batcher warn:", result.error);
        return reply.code(502).send({ error: `Batcher error: ${result.error}` });
      }

      return {
        success: true,
        payout: bet.payout,
        transactionHash: result.transactionHash,
      };
    } catch (err) {
      console.error("[API] claimWinnings error:", err);
      return reply.code(500).send({ error: "Failed to claim winnings" });
    }
  });

  // ── User ────────────────────────────────────────────────────────────────

  server.get("/api/user/:walletAddress", async (request, reply) => {
    const { walletAddress } = request.params as { walletAddress: string };
    const db = dbPool!;

    try {
      const accountResult = await db.query(
        `SELECT account_id FROM effectstream.addresses WHERE address = $1`,
        [walletAddress],
      );

      if (accountResult.rows.length === 0) {
        return {
          profile: {
            walletAddress,
            displayName: null,
            points: 1000,
            discordLinked: false,
            discordUsername: null,
            totalBets: 0,
            totalWon: 0,
            isNew: true,
          },
        };
      }

      const accountId = accountResult.rows[0].account_id;
      const profile = await getUserProfile(db, accountId);

      return {
        profile: {
          walletAddress,
          displayName: profile?.display_name ?? null,
          points: profile?.points ?? 1000,
          discordLinked: profile?.discord_linked ?? false,
          discordUsername: profile?.discord_username ?? null,
          totalBets: profile?.total_bets ?? 0,
          totalWon: profile?.total_won ?? 0,
        },
      };
    } catch (err) {
      console.warn("[API] user query failed:", (err as Error).message);
      return {
        profile: {
          walletAddress,
          displayName: null,
          points: 1000,
          discordLinked: false,
          discordUsername: null,
          totalBets: 0,
          totalWon: 0,
        },
      };
    }
  });

  server.get("/api/user/:walletAddress/bets", async (request, reply) => {
    const { walletAddress } = request.params as { walletAddress: string };
    const db = dbPool!;

    try {
      const accountResult = await db.query(
        `SELECT account_id FROM effectstream.addresses WHERE address = $1`,
        [walletAddress],
      );

      if (accountResult.rows.length === 0) {
        return { bets: [] };
      }

      const accountId = accountResult.rows[0].account_id;
      const bets = await getUserBets(db, accountId);
      return { bets };
    } catch (err) {
      console.warn("[API] user bets query failed:", (err as Error).message);
      return { bets: [] };
    }
  });

  // ── Leaderboard ─────────────────────────────────────────────────────────

  server.get("/api/leaderboard", async (_request, reply) => {
    try {
      const entries = await getLeaderboard(dbPool!, 20);
      return { leaderboard: entries };
    } catch (err) {
      console.warn("[API] leaderboard query failed:", (err as Error).message);
      return { leaderboard: [] };
    }
  });

  console.log("Prediction Market API routes registered");
};
