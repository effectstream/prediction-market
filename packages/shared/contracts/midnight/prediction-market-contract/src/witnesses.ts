import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type Ledger = Record<string, never>;
export type PrivateState = Record<string, never>;

/**
 * Per-claim secrets store.
 *
 * Before calling claimWinnings, the batcher must call setClaimSecrets()
 * to supply the optionId and blinding for the user's commitment.
 * After the circuit call the batcher should call clearClaimSecrets().
 *
 * Key format: `${marketIdHex}:${userKeyHex}`
 */
const claimSecrets = new Map<string, { optionId: Uint8Array; blinding: Uint8Array }>();

function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Set the private optionId and blinding for a user's claim on a market.
 * Call this BEFORE invoking the claimWinnings circuit.
 */
export function setClaimSecrets(
  marketId: Uint8Array,
  userKey: Uint8Array,
  optionId: Uint8Array,
  blinding: Uint8Array,
): void {
  const k = `${toHex(marketId)}:${toHex(userKey)}`;
  claimSecrets.set(k, { optionId, blinding });
  console.log(`[Witnesses] Claim secrets set for market=${toHex(marketId).slice(0, 8)}..`);
}

/**
 * Clear the claim secrets after the circuit call.
 */
export function clearClaimSecrets(marketId: Uint8Array, userKey: Uint8Array): void {
  const k = `${toHex(marketId)}:${toHex(userKey)}`;
  claimSecrets.delete(k);
}

/**
 * Current claim context — set by the batcher just before calling claimWinnings.
 * The witnesses look here to supply optionId() and blinding().
 */
let _currentClaimKey: string | null = null;

/**
 * Activate the claim context so the witnesses know which secrets to supply.
 * Call this immediately before executing the claimWinnings circuit.
 */
export function activateClaim(marketId: Uint8Array, userKey: Uint8Array): void {
  _currentClaimKey = `${toHex(marketId)}:${toHex(userKey)}`;
}

/**
 * Deactivate the claim context after the circuit call completes.
 */
export function deactivateClaim(): void {
  _currentClaimKey = null;
}

function getActiveSecrets(): { optionId: Uint8Array; blinding: Uint8Array } {
  if (!_currentClaimKey) {
    throw new Error("[Witnesses] No active claim context. Call activateClaim() first.");
  }
  const s = claimSecrets.get(_currentClaimKey);
  if (!s) {
    throw new Error(
      `[Witnesses] No claim secrets found for key ${_currentClaimKey}. Call setClaimSecrets() first.`,
    );
  }
  return s;
}

export const witnesses = {
  /**
   * Private witness: the option the user bet on.
   * Never disclosed — verified in ZK against the stored commitment.
   */
  optionId: ({ privateState }: WitnessContext<Ledger, PrivateState>): [PrivateState, Uint8Array] => {
    const { optionId } = getActiveSecrets();
    console.log(`[Witnesses] optionId() called (${optionId.length} bytes)`);
    return [privateState, optionId];
  },

  /**
   * Private witness: the blinding factor used in the commitment.
   * Never disclosed — verified in ZK against the stored commitment.
   */
  blinding: ({ privateState }: WitnessContext<Ledger, PrivateState>): [PrivateState, Uint8Array] => {
    const { blinding } = getActiveSecrets();
    console.log(`[Witnesses] blinding() called (${blinding.length} bytes)`);
    return [privateState, blinding];
  },
};
