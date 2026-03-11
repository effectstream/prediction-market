/**
 * API Client — typed wrappers around the prediction market REST API.
 *
 * All paths are relative (/api/...) so they route through the Vite dev-server
 * proxy (→ localhost:9996) in development and hit the same origin in production.
 * Set VITE_API_BASE only when the API lives on a different host entirely.
 */

import type { Market, UserProfile, UserBet, LeaderboardEntry } from "./types.ts";
import { persistentHash, CompactTypeBytes } from "@midnight-ntwrk/compact-runtime";

const BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error ?? `POST ${path} failed: ${res.status}`);
  return data as T;
}

// ── Markets ────────────────────────────────────────────────────────────────

export async function fetchMarkets(): Promise<Market[]> {
  const data = await get<{ markets: Market[] }>("/api/markets");
  return data.markets ?? [];
}

export async function fetchMarket(marketId: string): Promise<Market | null> {
  try {
    const data = await get<{ market: Market }>(`/api/markets/${marketId}`);
    return data.market ?? null;
  } catch {
    return null;
  }
}

// ── User ───────────────────────────────────────────────────────────────────

export async function fetchUserProfile(walletAddress: string): Promise<UserProfile> {
  const data = await get<{ profile: UserProfile }>(`/api/user/${walletAddress}`);
  return data.profile;
}

export async function fetchUserBets(walletAddress: string): Promise<UserBet[]> {
  const data = await get<{ bets: UserBet[] }>(`/api/user/${walletAddress}/bets`);
  return data.bets ?? [];
}

// ── Commitment helpers ──────────────────────────────────────────────────────
//
// The user's option choice is hidden on-chain via a commitment scheme:
//   commitment = persistentHash<[Bytes<32>, Bytes<32>]>([optionId_bytes32, blinding_bytes32])
//
// This uses the same persistentHash function as the Compact contract, ensuring
// the commitment computed here matches what the ZK circuit verifies.
//
// The blinding factor and optionId are stored in localStorage so the user can
// open the commitment at claim time. They are NEVER sent to the server.

/** Runtime type descriptor for [Bytes<32>, Bytes<32>] — matches Compact's tuple type */
class CompactTypeTupleBytes32Bytes32 {
  private readonly _b32 = new CompactTypeBytes(32);

  alignment() {
    return this._b32.alignment().concat(this._b32.alignment());
  }

  fromValue(value: any): [Uint8Array, Uint8Array] {
    return [this._b32.fromValue(value), this._b32.fromValue(value)];
  }

  toValue(value: [Uint8Array, Uint8Array]): any {
    return this._b32.toValue(value[0]).concat(this._b32.toValue(value[1]));
  }
}

const tupleBytes32Type = new CompactTypeTupleBytes32Bytes32();

/** Pad or truncate a string to exactly 32 bytes (UTF-8 encoded) */
function toBytes32(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  const padded = new Uint8Array(32);
  padded.set(encoded.slice(0, 32));
  return padded;
}

/** Convert Uint8Array to lowercase hex string */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute commitment = persistentHash<[Bytes<32>, Bytes<32>]>([optionId_bytes32, blinding])
 * This must produce the same value as the Compact circuit's:
 *   persistentHash<[Bytes<32>, Bytes<32>]>([optionId, blinding])
 */
function computeCommitment(optionId: string, blinding: Uint8Array): string {
  const optionBytes = toBytes32(optionId);
  const result = persistentHash(tupleBytes32Type as any, [optionBytes, blinding]);
  return toHex(result);
}

/** localStorage key for a user's bet claim data */
function claimKey(marketId: string, walletAddress: string): string {
  return `bet:${marketId}:${walletAddress}`;
}

/**
 * Get the locally stored option label for a bet (from localStorage).
 * Returns null if data is missing (e.g., storage was cleared).
 */
export function getLocalBetOption(
  marketId: string,
  walletAddress: string,
): { optionId: string; blinding: string } | null {
  try {
    const stored = localStorage.getItem(claimKey(marketId, walletAddress));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// ── Bets ───────────────────────────────────────────────────────────────────

/**
 * Place a bet with a private option choice.
 *
 * Generates a random blinding factor, computes a cryptographic commitment
 * to the option choice, and stores { optionId, blinding } in localStorage
 * so the user can claim winnings later. The optionId is NEVER sent to the server.
 *
 * ⚠️ If localStorage is cleared, the user cannot claim. After placing a bet,
 * show the user a copyable "claim receipt" with their optionId and blinding.
 * Token balance is deducted server-side and credited back (with winnings) at claim time.
 */
export async function placeBetApi(
  marketId: string,
  optionId: string,
  amount: number,
  walletAddress: string,
): Promise<{ betId: string; transactionHash?: string }> {
  // Generate random 32-byte blinding factor
  const blindingBytes = crypto.getRandomValues(new Uint8Array(32));
  const blinding = toHex(blindingBytes);

  // Compute commitment using the same hash as the Compact contract
  const commitment = computeCommitment(optionId, blindingBytes);

  // Persist claim data to localStorage — user must not lose this
  localStorage.setItem(claimKey(marketId, walletAddress), JSON.stringify({ optionId, blinding }));

  return post("/api/bets", { marketId, commitment, amount, walletAddress });
}

/**
 * Claim winnings for a won bet.
 *
 * Reads the optionId and blinding from localStorage and sends them to the API.
 * These are passed as private ZK witnesses to the claimWinnings circuit —
 * they prove the user picked the winning option without revealing their choice on-chain.
 *
 * Throws if localStorage data is missing (storage cleared / different device).
 */
export async function claimWinningsApi(
  marketId: string,
  walletAddress: string,
): Promise<{ payout: number; transactionHash?: string }> {
  const stored = localStorage.getItem(claimKey(marketId, walletAddress));
  if (!stored) {
    throw new Error(
      "Claim data not found in local storage. " +
      "If you cleared your browser storage or are on a different device, " +
      "you will need your saved claim receipt (optionId + blinding) to claim."
    );
  }
  const { optionId, blinding } = JSON.parse(stored) as { optionId: string; blinding: string };
  return post(`/api/bets/${marketId}/claim`, { walletAddress, optionId, blinding });
}

// ── Leaderboard ────────────────────────────────────────────────────────────

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const data = await get<{ leaderboard: LeaderboardEntry[] }>("/api/leaderboard");
  return data.leaderboard ?? [];
}

// ── User registration ───────────────────────────────────────────────────────

export async function registerUser(
  walletAddress: string,
  displayName: string,
): Promise<{ success: boolean; transactionHash?: string }> {
  return post("/api/register", { walletAddress, displayName });
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface CreateMarketPayload {
  marketId: string;
  title: string;
  description: string;
  category: string;
  closeTime: string;
  options?: Array<{ optionId: string; label: string }>;
}

export async function adminCreateMarket(
  payload: CreateMarketPayload,
): Promise<{ marketId: string; transactionHash?: string }> {
  return post("/api/admin/markets", payload);
}

export async function adminCloseMarket(
  marketId: string,
): Promise<{ transactionHash?: string }> {
  return post(`/api/admin/markets/${marketId}/close`, {});
}

export async function adminResolveMarket(
  marketId: string,
  winningOptionId: string,
): Promise<{ transactionHash?: string }> {
  return post(`/api/admin/markets/${marketId}/resolve`, { winningOptionId });
}
