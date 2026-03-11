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

      // With private bets, we don't know which bets won — the ZK contract enforces
      // correctness at claim time. Only update the market status here.
      await db.query(
        `UPDATE markets
         SET status = 'resolved', resolved_option_id = $2, resolved_at = CURRENT_TIMESTAMP
         WHERE market_id = $1`,
        [marketId, winningOptionId],
      );

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
    const { marketId, commitment, amount, walletAddress } = request.body as {
      marketId: string;
      commitment: string;   // 64-char hex = persistentHash([optionId, blinding]) — optionId stays private
      amount: number;
      walletAddress: string;
    };

    if (!marketId || !commitment || !amount || !walletAddress) {
      return reply.code(400).send({ error: "Missing required fields" });
    }

    if (![10, 25, 50].includes(amount)) {
      return reply.code(400).send({ error: "Invalid amount. Must be 10, 25, or 50" });
    }

    if (!/^[0-9a-f]{64}$/i.test(commitment)) {
      return reply.code(400).send({ error: "Invalid commitment format (expected 64 hex chars)" });
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
      if (!profile || profile.tokens < amount) {
        return reply.code(400).send({ error: "Insufficient tokens" });
      }

      const existingBet = await db.query(
        `SELECT bet_id FROM bets WHERE market_id = $1 AND account_id = $2`,
        [marketId, accountId],
      );
      if (existingBet.rows.length > 0) {
        return reply.code(400).send({ error: "You have already bet on this market" });
      }

      const betId = `bet_${marketId}_${accountId}_${Date.now()}`;
      await placeBet(db, betId, marketId, commitment, accountId, amount);

      // Submit on-chain command (state machine picks it up and calls batcher)
      const batcherResult = await sendToBatcher(
        `b|${marketId}|${commitment}|${amount}`,
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
    const { walletAddress, optionId, blinding } = request.body as {
      walletAddress: string;
      optionId: string;    // private — comes from user's localStorage, never stored server-side
      blinding: string;    // 64-char hex — private ZK witness
    };
    const db = dbPool!;

    if (!walletAddress || !optionId || !blinding) {
      return reply.code(400).send({ error: "walletAddress, optionId, and blinding are required" });
    }

    if (!/^[0-9a-f]{64}$/i.test(blinding)) {
      return reply.code(400).send({ error: "Invalid blinding format (expected 64 hex chars)" });
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

      // Check market is resolved and bet is unclaimed
      const market = await getMarketById(db, marketId);
      if (!market) return reply.code(404).send({ error: "Market not found" });
      if (market.status !== "resolved") {
        return reply.code(400).send({ error: "Market is not yet resolved" });
      }

      const betResult = await db.query(
        `SELECT amount, status FROM bets WHERE market_id = $1 AND account_id = $2`,
        [marketId, accountId],
      );
      if (betResult.rows.length === 0) {
        return reply.code(404).send({ error: "No bet found for this market" });
      }

      const bet = betResult.rows[0];
      if (bet.status !== "pending") {
        return reply.code(400).send({ error: "Winnings already claimed" });
      }

      // Forward to Midnight batcher with optionId + blinding as private ZK witnesses.
      // The ZK circuit verifies the commitment opening and winning option in zero-knowledge.
      const result = await sendToBatcher(`cw|${marketId}|${optionId}|${blinding}`, walletAddress);
      if (!result.success) {
        console.warn("[API] claimWinnings batcher warn:", result.error);
        return reply.code(502).send({ error: `Batcher error: ${result.error}` });
      }

      return {
        success: true,
        payout: bet.amount * 2,
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
            tokens: 1000,
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
          tokens: profile?.tokens ?? 1000,
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
          tokens: 1000,
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

  // ── Register display name ────────────────────────────────────────────────
  // POST /api/register  { walletAddress, displayName }
  // Submits a registeredUser command to the batcher so the state machine
  // persists the display name in Postgres and on the Midnight ledger.

  server.post("/api/register", async (request, reply) => {
    const { walletAddress, displayName } = request.body as {
      walletAddress: string;
      displayName: string;
    };

    if (!walletAddress || !displayName) {
      return reply.code(400).send({ error: "walletAddress and displayName are required" });
    }
    if (displayName.length > 30) {
      return reply.code(400).send({ error: "displayName must be 30 characters or fewer" });
    }

    const input = `reg|${displayName}`;
    const result = await sendToBatcher(input, walletAddress);
    if (!result.success) {
      console.warn("[API] register batcher warn:", result.error);
    }
    return { success: true, transactionHash: result.transactionHash };
  });

  // ── Discord OAuth ────────────────────────────────────────────────────────
  // GET /api/auth/discord?wallet=0x...
  // Redirects the browser to Discord's OAuth consent page.
  // After approval Discord redirects back to /api/auth/discord/callback.

  const DISCORD_CLIENT_ID = Deno.env.get("DISCORD_CLIENT_ID");
  const DISCORD_CLIENT_SECRET = Deno.env.get("DISCORD_CLIENT_SECRET");
  const DISCORD_REDIRECT_URI = Deno.env.get("DISCORD_REDIRECT_URI") ??
    "http://localhost:9996/api/auth/discord/callback";
  const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "http://localhost:3002";

  server.get("/api/auth/discord", async (request, reply) => {
    if (!DISCORD_CLIENT_ID) {
      return reply.code(503).send({ error: "Discord OAuth not configured (set DISCORD_CLIENT_ID)" });
    }
    const { wallet } = request.query as { wallet?: string };
    if (!wallet) return reply.code(400).send({ error: "wallet query param required" });

    // Encode wallet address in the state param so we can retrieve it in the callback
    const state = Buffer.from(JSON.stringify({ wallet })).toString("base64url");
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: "code",
      scope: "identify",
      state,
    });
    return reply.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  server.get("/api/auth/discord/callback", async (request, reply) => {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      return reply.code(503).send({ error: "Discord OAuth not configured" });
    }
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code || !state) return reply.code(400).send({ error: "Missing code or state" });

    let wallet: string;
    try {
      wallet = JSON.parse(Buffer.from(state, "base64url").toString()).wallet;
    } catch {
      return reply.code(400).send({ error: "Invalid state param" });
    }

    // Exchange code for access token
    let tokenData: Record<string, unknown>;
    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: DISCORD_REDIRECT_URI,
        }),
      });
      tokenData = await tokenRes.json() as Record<string, unknown>;
      if (!tokenRes.ok) throw new Error(String(tokenData.error_description ?? tokenData.error));
    } catch (err) {
      console.error("[API] Discord token exchange failed:", err);
      return reply.redirect(`${FRONTEND_URL}?discord_error=token`);
    }

    // Fetch Discord user info
    let discordUsername: string;
    try {
      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const user = await userRes.json() as Record<string, unknown>;
      if (!userRes.ok) throw new Error("Failed to fetch Discord user");
      discordUsername = user.global_name as string ?? user.username as string;
    } catch (err) {
      console.error("[API] Discord user fetch failed:", err);
      return reply.redirect(`${FRONTEND_URL}?discord_error=user`);
    }

    // Persist via state machine command (fire-and-forget batcher call)
    const input = `discord|${wallet}|${discordUsername}`;
    sendToBatcher(input, wallet).catch((err: Error) =>
      console.error("[API] Discord link batcher error:", err.message)
    );

    // Also update Postgres directly for immediate visibility
    dbPool?.query(
      `UPDATE user_profiles up
       SET discord_username = $1, discord_linked = true, updated_at = CURRENT_TIMESTAMP
       FROM effectstream.addresses a
       WHERE a.account_id = up.account_id AND a.address = $2`,
      [discordUsername, wallet],
    ).catch((err: Error) => console.error("[API] Discord link db error:", err.message));

    return reply.redirect(`${FRONTEND_URL}?discord_linked=1`);
  });

  console.log("Prediction Market API routes registered");
};
