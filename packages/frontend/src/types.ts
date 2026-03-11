export type MarketStatus = "open" | "closed" | "resolved";
export type BetAmount = 10 | 25 | 50;

export interface MarketOption {
  optionId: string;
  label: string;
  totalStaked: number;
  betCount: number;
}

export interface Market {
  marketId: string;
  title: string;
  description: string;
  options: MarketOption[];
  status: MarketStatus;
  closeTime: string;
  resolvedOption?: string;
  createdAt: string;
  totalBets: number;
  category: string;
}

export interface UserBet {
  betId: string;
  marketId: string;
  marketTitle: string;
  commitment: string;   // opaque hex — option choice is private; use localStorage for display
  amount: BetAmount;
  placedAt: string;
  status: "pending" | "claimed";
  payout?: number;
}

export interface UserProfile {
  walletAddress: string;
  displayName?: string;
  tokens: number;
  discordLinked: boolean;
  discordUsername?: string;
  totalBets: number;
  totalWon: number;
  rank?: number;
  isNew?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  displayName?: string;
  discordUsername?: string;
  tokens: number;
  correctBets: number;
  totalBets: number;
}

export type AppScreen = "markets" | "market-detail" | "my-bets" | "leaderboard" | "profile" | "admin";

export interface AppState {
  currentScreen: AppScreen;
  selectedMarketId?: string;
  userProfile?: UserProfile;
  walletAddress?: string;
  walletConnected: boolean;
}
