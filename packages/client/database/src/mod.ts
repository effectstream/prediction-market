/**
 * Database module - exports migration table and query helpers
 */

import type { Pool } from "pg";
import type { DBMigrations } from "@paimaexample/runtime";

export const migrationTable: DBMigrations[] = [
  {
    name: "1_initial_prediction_market",
    sql: `
-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    account_id INTEGER PRIMARY KEY,
    display_name TEXT,
    points INTEGER NOT NULL DEFAULT 1000, -- renamed to tokens by migration 3
    discord_username TEXT,
    discord_linked BOOLEAN DEFAULT false,
    total_bets INTEGER DEFAULT 0,
    total_won INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Markets table
CREATE TABLE IF NOT EXISTS markets (
    market_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'open',
    close_time TIMESTAMP NOT NULL,
    resolved_option_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Market options table (labels only — per-option staking is private after migration 2)
CREATE TABLE IF NOT EXISTS market_options (
    option_id TEXT NOT NULL,
    market_id TEXT NOT NULL REFERENCES markets(market_id),
    label TEXT NOT NULL,
    total_staked INTEGER NOT NULL DEFAULT 0,
    bet_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (market_id, option_id)
);

-- Bets table
CREATE TABLE IF NOT EXISTS bets (
    bet_id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL REFERENCES markets(market_id),
    option_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payout INTEGER,
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    UNIQUE (market_id, account_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_close_time ON markets(close_time);
CREATE INDEX IF NOT EXISTS idx_bets_market ON bets(market_id);
CREATE INDEX IF NOT EXISTS idx_bets_account ON bets(account_id);
CREATE INDEX IF NOT EXISTS idx_market_options_market ON market_options(market_id);
    `,
  },
  {
    name: "3_rename_points_to_tokens",
    sql: `
-- Migration 3: Rename points → tokens
-- Single token type for the full lifecycle: register, bet, win, re-bet.
ALTER TABLE user_profiles RENAME COLUMN points TO tokens;
    `,
  },
  {
    name: "2_private_bets",
    sql: `
-- Migration 2: Private bets (commitment+nullifier scheme)
--
-- The option a user bets on is now hidden on-chain. Instead of storing
-- option_id in the bets table, we store a cryptographic commitment:
--   commitment = persistentHash([optionId, blinding])
-- Only the user (via their localStorage blinding factor) can reveal
-- which option they picked.
--
-- Bet status simplifies to 'pending' | 'claimed'.
-- The ZK contract enforces that only correct picks can claim;
-- Postgres no longer needs to know who won.
--
-- Payout is always 2x the stake (credited at claim time, not resolve time).

-- Add commitment column
ALTER TABLE bets ADD COLUMN IF NOT EXISTS commitment TEXT;

-- Drop option_id (option choice is now private)
ALTER TABLE bets DROP COLUMN IF EXISTS option_id;

-- Add market-level total staked (replaces per-option tracking which is private)
ALTER TABLE markets ADD COLUMN IF NOT EXISTS total_market_staked INTEGER NOT NULL DEFAULT 0;

-- Update status constraint: 'pending' | 'claimed' only
-- (won/lost removed — contract enforces correctness, Postgres reflects claim status)
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_status_check;
ALTER TABLE bets ADD CONSTRAINT bets_status_check CHECK (status IN ('pending', 'claimed'));
    `,
  },
];

// --- Query helpers ---

export async function getOrCreateUser(
  db: Pool,
  walletAddress: string,
  accountId: number
): Promise<{ account_id: number; tokens: number; display_name: string | null }> {
  const result = await db.query(
    `INSERT INTO user_profiles (account_id, tokens)
     VALUES ($1, 1000)
     ON CONFLICT (account_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING account_id, tokens, display_name`,
    [accountId]
  );
  return result.rows[0];
}

export async function getUserProfile(db: Pool, accountId: number) {
  const result = await db.query(
    `SELECT account_id, display_name, tokens, discord_username, discord_linked,
            total_bets, total_won
     FROM user_profiles WHERE account_id = $1`,
    [accountId]
  );
  return result.rows[0] || null;
}

export async function getOpenMarkets(db: Pool) {
  const result = await db.query(`
    SELECT m.*,
           json_agg(json_build_object(
             'optionId', mo.option_id,
             'label', mo.label,
             'totalStaked', 0,
             'betCount', 0
           ) ORDER BY mo.option_id) as options,
           (SELECT COUNT(*) FROM bets WHERE market_id = m.market_id) as total_bets
    FROM markets m
    LEFT JOIN market_options mo ON m.market_id = mo.market_id
    WHERE m.status = 'open'
    GROUP BY m.market_id
    ORDER BY m.close_time ASC
  `);
  return result.rows;
}

export async function getMarketById(db: Pool, marketId: string) {
  const result = await db.query(`
    SELECT m.*,
           json_agg(json_build_object(
             'optionId', mo.option_id,
             'label', mo.label,
             'totalStaked', 0,
             'betCount', 0
           ) ORDER BY mo.option_id) as options,
           (SELECT COUNT(*) FROM bets WHERE market_id = m.market_id) as total_bets
    FROM markets m
    LEFT JOIN market_options mo ON m.market_id = mo.market_id
    WHERE m.market_id = $1
    GROUP BY m.market_id
  `, [marketId]);
  return result.rows[0] || null;
}

export async function getUserBets(db: Pool, accountId: number) {
  const result = await db.query(`
    SELECT b.bet_id, b.market_id, m.title as market_title,
           b.commitment,
           b.amount, b.status, b.payout, b.placed_at
    FROM bets b
    JOIN markets m ON b.market_id = m.market_id
    WHERE b.account_id = $1
    ORDER BY b.placed_at DESC
  `, [accountId]);
  return result.rows;
}

export async function getLeaderboard(db: Pool, limit = 20) {
  const result = await db.query(`
    SELECT
      ROW_NUMBER() OVER (ORDER BY tokens DESC) as rank,
      up.account_id,
      up.display_name,
      up.discord_username,
      up.tokens,
      up.total_won as correct_bets,
      up.total_bets
    FROM user_profiles up
    ORDER BY up.tokens DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

export async function placeBet(
  db: Pool,
  betId: string,
  marketId: string,
  commitment: string,   // replaces optionId — option choice is now private
  accountId: number,
  amount: number
) {
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO bets (bet_id, market_id, commitment, account_id, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [betId, marketId, commitment, accountId, amount]
    );
    await db.query(
      `UPDATE user_profiles SET tokens = tokens - $1, total_bets = total_bets + 1
       WHERE account_id = $2`,
      [amount, accountId]
    );
    // Track total market stake (per-option tracking removed — options are private)
    await db.query(
      `UPDATE markets SET total_market_staked = COALESCE(total_market_staked, 0) + $1
       WHERE market_id = $2`,
      [amount, marketId]
    );
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
