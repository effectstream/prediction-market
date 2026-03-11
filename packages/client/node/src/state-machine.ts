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
 *   placedBet       → placeBet(marketId, commitment, userKey, amount)
 *   createdMarket   → createMarket(marketId)       [resolver only]
 *   closedMarket    → closeMarket(marketId)        [resolver only]
 *   resolvedMarket  → resolveMarket(marketId, winningOptionId)  [resolver only]
 *   claimedWinnings → claimWinnings(marketId, userKey, optionId, blinding)
 *                     optionId + blinding are private ZK witnesses (never disclosed)
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
  const { marketId, commitment, amount } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] placedBet wallet=${walletAddress} market=${marketId} commitment=${commitment.slice(0, 8)}... amount=${amount}`);

  const accountId = yield* getOrCreateAccountId(walletAddress);
  if (!accountId) return;

  // Forward to Midnight batcher: placeBet(marketId, commitment, userKey, amount)
  // commitment is the only option-related value that touches the chain — optionId stays private
  const input = `b|${marketId}|${commitment}|${amount}`;
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
 *
 * With private bets, Postgres cannot determine winners (optionId is hidden).
 * We only update the market status here. Bet settlement (payout + balance
 * credit) happens in claimedWinnings when each user individually claims.
 * The ZK contract enforces that only correct picks can claim.
 */
stm.addStateTransition("resolvedMarket", function* (data) {
  const { marketId, winningOptionId } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] resolvedMarket market=${marketId} winner=${winningOptionId}`);

  // Update market status only — bets are settled individually at claim time
  data.dbConn?.query(
    `UPDATE markets
     SET status = 'resolved', resolved_option_id = $2, resolved_at = CURRENT_TIMESTAMP
     WHERE market_id = $1`,
    [marketId, winningOptionId],
  ).catch((err: Error) => console.error("[STM] resolvedMarket db error:", err.message));

  // Forward to Midnight batcher: resolveMarket(marketId, winningOptionId)
  const input = `rm|${marketId}|${winningOptionId}`;
  logBatcher("resolvedMarket", input, sendToBatcher(input, walletAddress));
});

/**
 * claimedWinnings — settle bet in Postgres + submit ZK claim to Midnight
 *
 * The ZK circuit verifies (in zero-knowledge) that:
 *   1. optionId + blinding correctly open the user's stored commitment
 *   2. optionId equals the market's resolvedOptionId (correct pick)
 * If the circuit accepts, payout = 2× stake is credited on-chain.
 *
 * Postgres is updated here (not at resolveMarket) because we don't know
 * who won until they prove it via ZK. payout = amount * 2.
 */
stm.addStateTransition("claimedWinnings", function* (data) {
  const { marketId, optionId, blinding } = data.parsedInput;
  const walletAddress = data.signerAddress!;

  console.log(`[STM] claimedWinnings wallet=${walletAddress} market=${marketId}`);

  const accountId = yield* getOrCreateAccountId(walletAddress);
  if (!accountId) return;

  // Credit payout in Postgres at claim time
  data.dbConn?.query(
    `UPDATE bets SET status = 'claimed', payout = amount * 2, resolved_at = CURRENT_TIMESTAMP
     WHERE market_id = $1 AND account_id = $2 AND status = 'pending'`,
    [marketId, accountId],
  ).then(() => data.dbConn?.query(
    `UPDATE user_profiles
     SET tokens = tokens + (SELECT amount * 2 FROM bets WHERE market_id = $1 AND account_id = $2),
         total_won = total_won + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE account_id = $2`,
    [marketId, accountId],
  )).catch((err: Error) => console.error("[STM] claimedWinnings db error:", err.message));

  // Forward to Midnight batcher: claimWinnings(marketId, userKey, optionId, blinding)
  // optionId and blinding are passed as private ZK witnesses — never disclosed on-chain
  const input = `cw|${marketId}|${optionId}|${blinding}`;
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
