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

  server.options("*", async (_request, reply) => {
    reply.send();
  });

  // --- Health ---

  server.get("/api/health", async () => ({
    status: "ok",
    timestamp: Date.now(),
  }));

  // --- Markets ---

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

  // --- Bets ---

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
      // Resolve account
      const accountResult = await db.query(
        `SELECT account_id FROM effectstream.addresses WHERE address = $1`,
        [walletAddress]
      );

      if (accountResult.rows.length === 0) {
        return reply.code(403).send({ error: "Wallet not registered" });
      }

      const accountId = accountResult.rows[0].account_id;

      // Check market exists and is open
      const market = await getMarketById(db, marketId);
      if (!market) return reply.code(404).send({ error: "Market not found" });
      if (market.status !== "open") {
        return reply.code(400).send({ error: "Market is not open for betting" });
      }

      // Check user has enough points
      const profile = await getUserProfile(db, accountId);
      if (!profile || profile.points < amount) {
        return reply.code(400).send({ error: "Insufficient points" });
      }

      // Check user hasn't already bet on this market
      const existingBet = await db.query(
        `SELECT bet_id FROM bets WHERE market_id = $1 AND account_id = $2`,
        [marketId, accountId]
      );
      if (existingBet.rows.length > 0) {
        return reply.code(400).send({ error: "You have already bet on this market" });
      }

      const betId = `bet_${marketId}_${accountId}_${Date.now()}`;
      await placeBet(db, betId, marketId, optionId, accountId, amount);

      return { success: true, betId };
    } catch (err) {
      console.error("[API] place bet error:", err);
      return reply.code(500).send({ error: "Failed to place bet" });
    }
  });

  // --- User ---

  server.get("/api/user/:walletAddress", async (request, reply) => {
    const { walletAddress } = request.params as { walletAddress: string };
    const db = dbPool!;

    try {
      const accountResult = await db.query(
        `SELECT account_id FROM effectstream.addresses WHERE address = $1`,
        [walletAddress]
      );

      if (accountResult.rows.length === 0) {
        // Return a default profile for new users
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
        [walletAddress]
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

  // --- Leaderboard ---

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
