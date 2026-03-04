/**
 * State Machine - Defines how game state transitions based on blockchain events
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

const stm = new PaimaSTM<typeof grammar, any>(grammar);

// Helper: get or create account ID for a wallet address
function* getOrCreateAccountId(walletAddress: string): Generator<any, number | undefined, any> {
  const addressResult = yield* World.resolve(getAddressByAddress, {
    address: walletAddress,
  });

  if (
    addressResult &&
    addressResult.length > 0 &&
    addressResult[0].account_id !== null
  ) {
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

  if (addressResult && addressResult.length > 0) {
    yield* World.resolve(updateAddressAccount, {
      address: walletAddress,
      account_id: accountId,
    });
  } else {
    yield* World.resolve(newAddressWithId, {
      address: walletAddress,
      address_type: 0,
      account_id: accountId,
    });
  }

  return accountId;
}

/**
 * Handle placedBet command - record a bet on-chain
 */
stm.addStateTransition("placedBet", function* (data) {
  const { marketId, optionId, amount } = data.parsedInput;
  const walletAddress = data.signerAddress;

  console.log(`[placedBet] wallet=${walletAddress} market=${marketId} option=${optionId} amount=${amount}`);

  const accountId = yield* getOrCreateAccountId(walletAddress!);
  if (!accountId) return;

  // The actual bet insertion is handled by the API when it receives a placedBet event,
  // but we record the account existence here so the address is tracked.
  console.log(`[placedBet] accountId=${accountId} resolved`);
});

/**
 * Handle registeredUser command - set display name
 */
stm.addStateTransition("registeredUser", function* (data) {
  const { displayName } = data.parsedInput;
  const walletAddress = data.signerAddress;

  console.log(`[registeredUser] wallet=${walletAddress} name=${displayName}`);

  const accountId = yield* getOrCreateAccountId(walletAddress!);
  if (!accountId) return;

  console.log(`[registeredUser] accountId=${accountId} resolved`);
});

/**
 * Handle linkedDiscord command - link Discord account
 */
stm.addStateTransition("linkedDiscord", function* (data) {
  const { walletAddress, discordUsername } = data.parsedInput;

  console.log(`[linkedDiscord] wallet=${walletAddress} discord=${discordUsername}`);

  const accountId = yield* getOrCreateAccountId(walletAddress);
  if (!accountId) return;

  console.log(`[linkedDiscord] accountId=${accountId} resolved`);
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
