#!/usr/bin/env -S deno run -A --unstable-detect-cjs
/**
 * Prediction Market Contract — In-Memory Test Script
 *
 * Exercises the full circuit flow directly against the TypeScript-compiled
 * contract, with no running Midnight node, indexer, or batcher required.
 *
 * Flow tested:
 *   initialize → registerUser (x2) → createMarket → placeBet (x3) →
 *   closeMarket → resolveMarket → claimWinnings → verify balances
 *
 * Usage:
 *   deno task test
 *   deno run -A --unstable-detect-cjs src/test-contract.ts
 */

import {
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  createConstructorContext,
  CostModel,
} from "@midnight-ntwrk/compact-runtime";
import { Contract, ledger, type Witnesses } from "./managed/contract/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PrivateState = Record<string, never>;

// ---------------------------------------------------------------------------
// Key / ID helpers
// ---------------------------------------------------------------------------

/** Make a deterministic fake ZswapCoinPublicKey from a label string (32 bytes) */
function makeKey(label: string): { bytes: Uint8Array } {
  const enc = new TextEncoder().encode(label);
  const bytes = new Uint8Array(32);
  bytes.set(enc.slice(0, 32));
  return { bytes };
}

/** Convert a key's bytes to the hex string createConstructorContext expects */
function keyToHex(key: { bytes: Uint8Array }): string {
  return Array.from(key.bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Encode a string into a Bytes<32> (zero-padded) */
function strToBytes32(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  const bytes = new Uint8Array(32);
  bytes.set(enc.slice(0, 32));
  return bytes;
}

/** Compute payout = floor(userStake * totalStaked / winnerStake) */
function computePayout(
  userStake: bigint,
  totalStaked: bigint,
  winnerStake: bigint,
): { payout: bigint; remainder: bigint } {
  const numerator = userStake * totalStaked;
  return { payout: numerator / winnerStake, remainder: numerator % winnerStake };
}

// ---------------------------------------------------------------------------
// In-memory simulator
// ---------------------------------------------------------------------------

class PredictionMarketSim {
  readonly contract: Contract<PrivateState, Witnesses<PrivateState>>;
  ctx: CircuitContext<PrivateState>;

  constructor(callerKey: { bytes: Uint8Array }) {
    this.contract = new Contract<PrivateState, Witnesses<PrivateState>>({});
    const { currentPrivateState, currentContractState, currentZswapLocalState } =
      this.contract.initialState(createConstructorContext({}, keyToHex(callerKey)));
    this.ctx = {
      currentPrivateState,
      currentZswapLocalState,
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
      costModel: CostModel.initialCostModel(),
    };
  }

  getLedger() {
    return ledger(this.ctx.currentQueryContext.state);
  }

  /**
   * Run a circuit as `callerKey` — swaps the zswap coinPublicKey so that
   * ownPublicKey() returns `callerKey` inside the circuit.
   * Updates shared contract state from the result.
   */
  callAs<R>(
    callerKey: { bytes: Uint8Array },
    fn: (ctx: CircuitContext<PrivateState>) => { context: CircuitContext<PrivateState>; result: R },
  ): R {
    const callerCtx: CircuitContext<PrivateState> = {
      ...this.ctx,
      currentZswapLocalState: {
        ...this.ctx.currentZswapLocalState,
        coinPublicKey: callerKey,
      },
    };
    const r = fn(callerCtx);
    this.ctx = r.context;
    return r.result;
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logStep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  Deno.exit(1);
}

function assertEq<T>(label: string, actual: T, expected: T) {
  if (actual === expected) {
    pass(`${label}: ${actual}`);
  } else {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

function runTests() {
  const resolverKey = makeKey("resolver");
  const user1Key    = makeKey("user1");
  const user2Key    = makeKey("user2");
  const user3Key    = makeKey("user3");

  // Initialise the simulator with the resolver as the deployer
  const sim = new PredictionMarketSim(resolverKey);
  const { impureCircuits } = sim.contract;

  const marketId  = strToBytes32("market-btc-100k");
  const optionYes = strToBytes32("option-yes");
  const optionNo  = strToBytes32("option-no");

  // ── Step 1: initialize ─────────────────────────────────────────────────
  logStep("Step 1: initialize (resolver sets resolverKey)");
  {
    sim.callAs(resolverKey, ctx => impureCircuits.initialize(ctx, resolverKey));
    pass("initialize succeeded");
    assertEq("initialized", sim.getLedger().initialized, true);
  }

  // ── Step 2: registerUser ───────────────────────────────────────────────
  logStep("Step 2: registerUser (user1 and user2)");
  {
    // The batcher calls registerUser passing the user's key as an explicit arg;
    // ownPublicKey() (the batcher/resolver key) is not checked in registerUser.
    sim.callAs(resolverKey, ctx => impureCircuits.registerUser(ctx, user1Key));
    pass("registerUser user1 succeeded");

    sim.callAs(resolverKey, ctx => impureCircuits.registerUser(ctx, user2Key));
    pass("registerUser user2 succeeded");

    sim.callAs(resolverKey, ctx => impureCircuits.registerUser(ctx, user3Key));
    pass("registerUser user3 succeeded");

    assertEq("user1 starting balance", sim.getLedger().balances.lookup(user1Key), 1000n);
    assertEq("user2 starting balance", sim.getLedger().balances.lookup(user2Key), 1000n);
    assertEq("user3 starting balance", sim.getLedger().balances.lookup(user3Key), 1000n);
  }

  // ── Step 3: createMarket ───────────────────────────────────────────────
  logStep("Step 3: createMarket (resolver only)");
  {
    sim.callAs(resolverKey, ctx => impureCircuits.createMarket(ctx, marketId));
    pass("createMarket succeeded");

    const market = sim.getLedger().markets.lookup(marketId);
    assertEq("market status (open=0)", market.status, 0n);
    assertEq("market totalStaked",    market.totalStaked, 0n);
  }

  // ── Step 4: placeBet ──────────────────────────────────────────────────
  logStep("Step 4: placeBet — user1:150 YES, user2:50 NO, user3:50 YES");
  {
    // user1: 150 on YES
    sim.callAs(resolverKey, ctx => impureCircuits.placeBet(ctx, marketId, optionYes, user1Key, 150n));
    pass("placeBet user1 150 on YES");
    assertEq("user1 balance after bet", sim.getLedger().balances.lookup(user1Key), 850n);

    // user2: 50 on NO
    sim.callAs(resolverKey, ctx => impureCircuits.placeBet(ctx, marketId, optionNo, user2Key, 50n));
    pass("placeBet user2 50 on NO");
    assertEq("user2 balance after bet", sim.getLedger().balances.lookup(user2Key), 950n);

    // user3: 50 on YES
    sim.callAs(resolverKey, ctx => impureCircuits.placeBet(ctx, marketId, optionYes, user3Key, 50n));
    pass("placeBet user3 50 on YES");
    assertEq("user3 balance after bet", sim.getLedger().balances.lookup(user3Key), 950n);

    // totalStaked = 150+50+50 = 250; YES pool = 200, NO pool = 50
    assertEq("market totalStaked (250)", sim.getLedger().markets.lookup(marketId).totalStaked, 250n);

    const yesStake = sim.callAs(resolverKey, ctx =>
      impureCircuits.getWinnerStakeForOption(ctx, marketId, optionYes));
    assertEq("YES option stake (200)", yesStake, 200n);

    const noStake = sim.callAs(resolverKey, ctx =>
      impureCircuits.getWinnerStakeForOption(ctx, marketId, optionNo));
    assertEq("NO option stake (50)", noStake, 50n);
  }

  // ── Step 5: closeMarket ────────────────────────────────────────────────
  logStep("Step 5: closeMarket (resolver only)");
  {
    sim.callAs(resolverKey, ctx => impureCircuits.closeMarket(ctx, marketId));
    pass("closeMarket succeeded");

    const status = sim.callAs(resolverKey, ctx => impureCircuits.getMarketStatus(ctx, marketId));
    assertEq("market status (closed=1)", status, 1n);
  }

  // ── Step 6: resolveMarket ──────────────────────────────────────────────
  logStep("Step 6: resolveMarket → YES wins");
  {
    sim.callAs(resolverKey, ctx => impureCircuits.resolveMarket(ctx, marketId, optionYes));
    pass("resolveMarket succeeded");

    const status = sim.callAs(resolverKey, ctx => impureCircuits.getMarketStatus(ctx, marketId));
    assertEq("market status (resolved=2)", status, 2n);
  }

  // ── Step 7: claimWinnings ─────────────────────────────────────────────
  // YES wins: totalStaked=250, winnerTotalStaked=200
  // user1 (stake=150): payout = floor(150*250/200) = 187, remainder = 100
  // user3 (stake=50):  payout = floor(50*250/200)  = 62,  remainder = 100
  logStep("Step 7: claimWinnings — user1 and user3 claim (both bet YES)");
  {
    const u1 = computePayout(150n, 250n, 200n);
    console.log(`  user1: payout=${u1.payout}, remainder=${u1.remainder}`);
    sim.callAs(resolverKey, ctx =>
      impureCircuits.claimWinnings(ctx, marketId, user1Key, u1.payout, u1.remainder));
    pass("claimWinnings user1 succeeded");
    // user1 had 850 after bet; gains payout=187
    assertEq("user1 balance after claim", sim.getLedger().balances.lookup(user1Key), 850n + u1.payout);

    const claimed1 = sim.callAs(resolverKey, ctx =>
      impureCircuits.isBetClaimed(ctx, marketId, user1Key));
    assertEq("user1 bet marked claimed", claimed1, true);

    const u3 = computePayout(50n, 250n, 200n);
    console.log(`  user3: payout=${u3.payout}, remainder=${u3.remainder}`);
    sim.callAs(resolverKey, ctx =>
      impureCircuits.claimWinnings(ctx, marketId, user3Key, u3.payout, u3.remainder));
    pass("claimWinnings user3 succeeded");
    // user3 had 950 after bet; gains payout=62
    assertEq("user3 balance after claim", sim.getLedger().balances.lookup(user3Key), 950n + u3.payout);
  }

  // ── Step 8: double-claim guard ────────────────────────────────────────
  logStep("Step 8: double-claim should be rejected");
  {
    const { payout, remainder } = computePayout(150n, 250n, 200n);
    try {
      sim.callAs(resolverKey, ctx =>
        impureCircuits.claimWinnings(ctx, marketId, user1Key, payout, remainder));
      fail("expected double-claim to throw");
    } catch (_e) {
      pass("double-claim correctly rejected");
    }
  }

  // ── Step 9: loser cannot claim ────────────────────────────────────────
  logStep("Step 9: loser (user2 bet NO) cannot claim");
  {
    try {
      sim.callAs(resolverKey, ctx =>
        impureCircuits.claimWinnings(ctx, marketId, user2Key, 0n, 0n));
      fail("expected loser claim to throw");
    } catch (_e) {
      pass("loser claim correctly rejected");
    }
  }

  // ── Step 10: query circuits ───────────────────────────────────────────
  logStep("Step 10: query circuits");
  {
    const reg1 = sim.callAs(resolverKey, ctx => impureCircuits.isUserRegistered(ctx, user1Key));
    assertEq("user1 is registered", reg1, true);

    const betAmt = sim.callAs(resolverKey, ctx => impureCircuits.getBetAmount(ctx, marketId, user1Key));
    assertEq("user1 bet amount", betAmt, 150n);

    const total = sim.callAs(resolverKey, ctx => impureCircuits.getMarketTotalStaked(ctx, marketId));
    assertEq("market total staked", total, 250n);

    // user2 lost — balance unchanged from after their bet
    assertEq("user2 balance unchanged (lost)", sim.getLedger().balances.lookup(user2Key), 950n);
  }

  // ── Step 11: auth guard ───────────────────────────────────────────────
  logStep("Step 11: auth guard — non-resolver cannot create market");
  {
    try {
      sim.callAs(user1Key, ctx =>
        impureCircuits.createMarket(ctx, strToBytes32("market-eth-5k")));
      fail("expected auth rejection");
    } catch (_e) {
      pass("non-resolver createMarket correctly rejected");
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("  All tests passed!");
  console.log(`${"═".repeat(60)}\n`);
}

runTests();
