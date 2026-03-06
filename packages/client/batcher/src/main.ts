/**
 * Prediction Market Transaction Batcher
 *
 * Batches Midnight blockchain transactions on behalf of users who don't hold dust.
 * Uses MidnightAdapter to submit circuit calls (placeBet, registerUser, etc.)
 * signed by the batcher's funded wallet (MIDNIGHT_SEED env var).
 */

import { main, suspend } from "effection";
import { createNewBatcher, MidnightAdapter } from "@paimaexample/batcher";
import { config, storage, BATCHER_DATA_DIR } from "./config.ts";

// Clear stale batcher data on startup to prevent processing old transactions
try {
  await Deno.remove(BATCHER_DATA_DIR, { recursive: true });
  console.log("🧹 Cleared stale batcher data from previous session");
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) {
    console.warn("⚠️ Could not clear batcher data:", error);
  }
}

const batcher = createNewBatcher(config, storage);

// Add Midnight adapter — one transaction per batch (circuit calls are atomic)
const { midnightAdapter } = await import("./adapter-midnight.ts");
if (midnightAdapter instanceof MidnightAdapter) {
  batcher.addBlockchainAdapter("midnight", midnightAdapter, {
    criteriaType: "time",
    timeWindowMs: 50,
  });
}

batcher.setDefaultTarget("midnight");

batcher
  .addStateTransition("startup", ({ publicConfig }) => {
    console.log(
      `🎯 Prediction Market Batcher startup — polling every ${publicConfig.pollingIntervalMs}ms\n` +
      `      | 📍 Default target: ${publicConfig.defaultTarget}\n` +
      `      | ⛓️ Adapters: ${publicConfig.adapterTargets.join(", ")}`,
    );
  })
  .addStateTransition("http:start", ({ port }) => {
    console.log(`🌐 Batcher HTTP server ready at http://localhost:${port}`);
  });

main(function* () {
  console.log("🚀 Starting Prediction Market Batcher...");
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("❌ Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
