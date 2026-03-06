import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type Ledger = Record<string, never>;
export type PrivateState = Record<string, never>;

// No ZK witnesses needed — the prediction market contract uses only
// public ledger state and does not require any private inputs.
export const witnesses = {};
