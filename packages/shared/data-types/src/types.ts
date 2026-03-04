/**
 * Core types for the Prediction Market application
 */

export type MarketStatus = "open" | "closed" | "resolved";
export type BetAmount = 10 | 25 | 50;

export interface Market {
  marketId: string;
  title: string;
  description: string;
  options: MarketOption[];
  status: MarketStatus;
  closeTime: string; // ISO timestamp
  resolvedOption?: string; // option id of winning option
  createdAt: string;
  totalBets: number;
  category: string;
}

export interface MarketOption {
  optionId: string;
  label: string;
  totalStaked: number;
  betCount: number;
}

export interface UserBet {
  betId: string;
  marketId: string;
  marketTitle: string;
  optionId: string;
  optionLabel: string;
  amount: BetAmount;
  placedAt: string;
  status: "pending" | "won" | "lost";
  payout?: number;
}

export interface UserProfile {
  walletAddress: string;
  displayName?: string;
  points: number;
  discordLinked: boolean;
  discordUsername?: string;
  totalBets: number;
  totalWon: number;
  rank?: number;
}

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  displayName?: string;
  discordUsername?: string;
  points: number;
  correctBets: number;
  totalBets: number;
}
