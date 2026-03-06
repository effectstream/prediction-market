/**
 * State Machine — Prediction Market
 *
 * Processes on-chain commands and:
 *   1. Maintains the Postgres projection (user_profiles, markets, bets)
 *   2. Forwards every command to the Midnight batcher (fire-and-forget Promise)
 *      so the same operation lands on the Midnight contract ledger.
 *
 * Note: addStateTransition handlers are generator functions and cannot use
 * `await`. All async work (DB queries and batcher calls) is started as
 * fire-and-forget Promises via .then()/.catch().
 *
 * Command → Midnight circuit mapping:
 *   registeredUser  → registerUser(userKey)
 *   placedBet       → placeBet(marketId, optionId, userKey, amount)
 *   createdMarket   → createMarket(marketId)       [resolver only]
 *   closedMarket    → closeMarket(marketId)        [resolver only]
 *   resolvedMarket  → resolveMarket(marketId, winningOptionId)  [resolver only]
 *   claimedWinnings → claimWinnings(marketId, userKey, payout, remainder)
 *   linkedDiscord   → Postgres only, no Midnight circuit
 */

import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@prediction-market/data-types/grammar";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { World } from "@paimaexample/coroutine";
import {
  getAddressByAddress,
  newAddressWithId,
  newAccount,
  updateAddressAccount,
} from "@paimaexample/db";
import { sendToBatcher } from "./batcher-client.ts";

const stm = new PaimaSTM<typeof grammar, any>(grammar);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Log a batcher result at the appropriate level */
function logBatcher(tag: string, input: string, p: Promise<{ success: boolean; transactionHash?: string; error?: string }>) {
  p.then(r => {
    if (r.success) {
      console.log(`[STM] ${tag} batcher tx=${r.transactionHash ?? "?"}`);
    } else {
      console.warn(`[STM] ${tag} batcher warn (input="${input}"): ${r.error}`);
    }
  }).catch((err: Error) => console.error(`[STM] ${tag} batcher error:`, err.message));
}

/** Get or create a Postgres account_id for a wallet address */
function* getOrCreateAccountId(walletAddress: string): Generator<any, number | undefined, any> {
  const addressResult = yield* World.resolve(getAddressByAddress, {
    address: walletAddress,
  });

  if (addressResult?.length > 0 && addressResult[0].account_id !== null) {
    return addressResult[0].account_id as number;
  }

  const newAccountResult = yield* World.resolve(newAccount, {
    primary_address: walletAddress,
  });

  if (!newAccountResult || newAccountResult.length === 0) {
    console.error("[STM] Failed to create account for:", walletAddress);
    return undefined;
  }

  const accountId = newAccountResult[0].id as number;

  if (addressResult?.length > 0) {
    yield* World.resolve(updateAddressAccount, { address: walletAddress, account_id: accountId });
  } else {
    yield* World.resolve(newAddressWithId, {
      address: walletAddress,
      address_type: 0,
      account_id: accountId,
    });
  }

  return accountId;
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * registeredUser — create Postgres profile + register on Midnight
 */
stm.addStateTransition("registeredUser", function* (data) {
  const { displayName } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] registeredUser wallet=${walletAddress} name=${displayName}`);

  const accountId = yield* getOrCreateAccountId(walletAddress);
  if (!accountId) return;

  // Upsert display name in Postgres
  data.dbConn?.query(
    `INSERT INTO user_profiles (account_id, display_name)
     VALUES ($1, $2)
     ON CONFLICT (account_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           updated_at = CURRENT_TIMESTAMP`,
    [accountId, displayName],
  ).catch((err: Error) => console.error("[STM] registeredUser db error:", err.message));

  // Forward to Midnight batcher: registerUser(userKey)
  const input = `reg|${displayName}`;
  logBatcher("registeredUser", input, sendToBatcher(input, walletAddress));
});

/**
 * placedBet — record in Postgres + place bet on Midnight
 */
stm.addStateTransition("placedBet", function* (data) {
  const { marketId, optionId, amount } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] placedBet wallet=${walletAddress} market=${marketId} option=${optionId} amount=${amount}`);

  const accountId = yield* getOrCreateAccountId(walletAddress);
  if (!accountId) return;

  // Forward to Midnight batcher: placeBet(marketId, optionId, userKey, amount)
  const input = `b|${marketId}|${optionId}|${amount}`;
  logBatcher("placedBet", input, sendToBatcher(input, walletAddress));
});

/**
 * createdMarket — create market in Postgres + on Midnight (resolver only)
 */
stm.addStateTransition("createdMarket", function* (data) {
  const { marketId, title, description, category, closeTime } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] createdMarket market=${marketId} title="${title}"`);

  // Upsert market row + default options (yes/no) in Postgres
  data.dbConn?.query(
    `INSERT INTO markets (market_id, title, description, category, close_time, status)
     VALUES ($1, $2, $3, $4, $5::timestamp, 'open')
     ON CONFLICT (market_id) DO NOTHING`,
    [marketId, title, description, category, closeTime],
  ).then(() => data.dbConn?.query(
    `INSERT INTO market_options (market_id, option_id, label)
     VALUES ($1, 'yes', 'Yes'), ($1, 'no', 'No')
     ON CONFLICT DO NOTHING`,
    [marketId],
  )).catch((err: Error) => console.error("[STM] createdMarket db error:", err.message));

  // Forward to Midnight batcher: createMarket(marketId)
  const input = `cm|${marketId}|${title}|${description}|${category}|${closeTime}`;
  logBatcher("createdMarket", input, sendToBatcher(input, walletAddress));
});

/**
 * closedMarket — close market in Postgres + on Midnight (resolver only)
 */
stm.addStateTransition("closedMarket", function* (data) {
  const { marketId } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] closedMarket market=${marketId}`);

  data.dbConn?.query(
    `UPDATE markets SET status = 'closed' WHERE market_id = $1`,
    [marketId],
  ).catch((err: Error) => console.error("[STM] closedMarket db error:", err.message));

  const input = `clm|${marketId}`;
  logBatcher("closedMarket", input, sendToBatcher(input, walletAddress));
});

/**
 * resolvedMarket — resolve market in Postgres + on Midnight (resolver only)
 * Settles all bets and credits winners in Postgres.
 */
stm.addStateTransition("resolvedMarket", function* (data) {
  const { marketId, winningOptionId } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] resolvedMarket market=${marketId} winner=${winningOptionId}`);

  // Settle bets in Postgres: mark won/lost, compute floor-division payout, credit balances
  data.dbConn?.query(`
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
  `, [marketId, winningOptionId])
    .then(() => data.dbConn?.query(
      `UPDATE markets
       SET status = 'resolved', resolved_option_id = $2, resolved_at = CURRENT_TIMESTAMP
       WHERE market_id = $1`,
      [marketId, winningOptionId],
    ))
    .then(() => data.dbConn?.query(`
      UPDATE user_profiles up
      SET points = points + b.payout,
          total_won = total_won + 1,
          updated_at = CURRENT_TIMESTAMP
      FROM bets b
      WHERE b.account_id = up.account_id
        AND b.market_id = $1
        AND b.status = 'won'
        AND b.payout > 0
    `, [marketId]))
    .catch((err: Error) => console.error("[STM] resolvedMarket db error:", err.message));

  // Forward to Midnight batcher: resolveMarket(marketId, winningOptionId)
  const input = `rm|${marketId}|${winningOptionId}`;
  logBatcher("resolvedMarket", input, sendToBatcher(input, walletAddress));
});

/**
 * claimedWinnings — forward claimWinnings to Midnight
 * Postgres payout already credited by resolvedMarket; this settles
 * the on-chain balance so users can withdraw via their Midnight wallet.
 */
stm.addStateTransition("claimedWinnings", function* (data) {
  const { marketId } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] claimedWinnings wallet=${walletAddress} market=${marketId}`);

  const accountId = yield* getOrCreateAccountId(walletAddress);
  if (!accountId) return;

  // The batcher's MidnightAdapter reads on-chain state to compute payout/remainder witnesses
  const input = `cw|${marketId}`;
  logBatcher("claimedWinnings", input, sendToBatcher(input, walletAddress));
});

/**
 * linkedDiscord — link Discord account (Postgres only)
 */
stm.addStateTransition("linkedDiscord", function* (data) {
  const { walletAddress, discordUsername } = data.parsedInput;

  console.log(`[STM] linkedDiscord wallet=${walletAddress} discord=${discordUsername}`);

  const accountId = yield* getOrCreateAccountId(walletAddress);
  if (!accountId) return;

  data.dbConn?.query(
    `UPDATE user_profiles
     SET discord_username = $1, discord_linked = true, updated_at = CURRENT_TIMESTAMP
     WHERE account_id = $2`,
    [discordUsername, accountId],
  ).catch((err: Error) => console.error("[STM] linkedDiscord db error:", err.message));
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight,
  input
) {
  if (blockHeight >= 0) {
    yield* stm.processInput(input);
  }
  return;
};
