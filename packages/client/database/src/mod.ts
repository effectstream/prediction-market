/**
 * Database module - exports migration table and query helpers
 */

import type { Pool } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read migration SQL
const migrationSQL = fs.readFileSync(
  path.resolve(__dirname, "../migrations/database.sql"),
  "utf-8"
);

export const migrationTable = migrationSQL;

// --- Query helpers ---

export async function getOrCreateUser(
  db: Pool,
  walletAddress: string,
  accountId: number
): Promise<{ account_id: number; points: number; display_name: string | null }> {
  const result = await db.query(
    `INSERT INTO user_profiles (account_id, points)
     VALUES ($1, 1000)
     ON CONFLICT (account_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING account_id, points, display_name`,
    [accountId]
  );
  return result.rows[0];
}

export async function getUserProfile(db: Pool, accountId: number) {
  const result = await db.query(
    `SELECT account_id, display_name, points, discord_username, discord_linked,
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
             'totalStaked', mo.total_staked,
             'betCount', mo.bet_count
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
             'totalStaked', mo.total_staked,
             'betCount', mo.bet_count
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
           b.option_id, mo.label as option_label,
           b.amount, b.status, b.payout, b.placed_at
    FROM bets b
    JOIN markets m ON b.market_id = m.market_id
    JOIN market_options mo ON b.market_id = mo.market_id AND b.option_id = mo.option_id
    WHERE b.account_id = $1
    ORDER BY b.placed_at DESC
  `, [accountId]);
  return result.rows;
}

export async function getLeaderboard(db: Pool, limit = 20) {
  const result = await db.query(`
    SELECT
      ROW_NUMBER() OVER (ORDER BY points DESC) as rank,
      up.account_id,
      up.display_name,
      up.discord_username,
      up.points,
      up.total_won as correct_bets,
      up.total_bets
    FROM user_profiles up
    ORDER BY up.points DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

export async function placeBet(
  db: Pool,
  betId: string,
  marketId: string,
  optionId: string,
  accountId: number,
  amount: number
) {
  // Insert bet and deduct points atomically
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO bets (bet_id, market_id, option_id, account_id, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [betId, marketId, optionId, accountId, amount]
    );
    await db.query(
      `UPDATE user_profiles SET points = points - $1, total_bets = total_bets + 1
       WHERE account_id = $2`,
      [amount, accountId]
    );
    await db.query(
      `UPDATE market_options SET total_staked = total_staked + $1, bet_count = bet_count + 1
       WHERE market_id = $2 AND option_id = $3`,
      [amount, marketId, optionId]
    );
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
