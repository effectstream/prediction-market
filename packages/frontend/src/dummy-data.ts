/**
 * Dummy data for Phase 1 frontend demo.
 * All interactions are local — no backend calls.
 */

import type { Market, UserBet, UserProfile, LeaderboardEntry } from "./types.ts";

export const DUMMY_MARKETS: Market[] = [
  {
    marketId: "market_001",
    title: "Who will win Super Bowl LX?",
    description: "Pick the team you think will win the Super Bowl this season. 🏈",
    category: "Sports",
    status: "open",
    closeTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    totalBets: 342,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    options: [
      { optionId: "opt_kc", label: "Kansas City Chiefs", totalStaked: 3200, betCount: 128 },
      { optionId: "opt_sf", label: "San Francisco 49ers", totalStaked: 1800, betCount: 96 },
      { optionId: "opt_dal", label: "Dallas Cowboys", totalStaked: 950, betCount: 72 },
      { optionId: "opt_other", label: "Other Team", totalStaked: 450, betCount: 46 },
    ],
  },
  {
    marketId: "market_002",
    title: "Will Taylor Swift attend the Super Bowl? 🎤",
    description: "Simple yes or no — will T-Swift show up to cheer on her team?",
    category: "Entertainment",
    status: "open",
    closeTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    totalBets: 891,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    options: [
      { optionId: "opt_yes", label: "Yes 🎉", totalStaked: 6200, betCount: 620 },
      { optionId: "opt_no", label: "No 🚫", totalStaked: 2800, betCount: 271 },
    ],
  },
  {
    marketId: "market_003",
    title: "Best Picture at the Oscars 🎬",
    description: "Which film will take home the gold? Vote for your pick!",
    category: "Entertainment",
    status: "open",
    closeTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    totalBets: 156,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    options: [
      { optionId: "opt_conclave", label: "Conclave", totalStaked: 800, betCount: 48 },
      { optionId: "opt_emilia", label: "Emilia Pérez", totalStaked: 1200, betCount: 54 },
      { optionId: "opt_anora", label: "Anora", totalStaked: 600, betCount: 32 },
      { optionId: "opt_other2", label: "Other Film", totalStaked: 200, betCount: 22 },
    ],
  },
  {
    marketId: "market_004",
    title: "Will Bitcoin hit $150K before April? 🚀",
    description: "The eternal question — bull run or correction? Place your bet.",
    category: "Crypto",
    status: "open",
    closeTime: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    totalBets: 503,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    options: [
      { optionId: "opt_yes2", label: "Yes, to the moon! 🌙", totalStaked: 3800, betCount: 280 },
      { optionId: "opt_no2", label: "No, correction incoming 📉", totalStaked: 4200, betCount: 223 },
    ],
  },
  {
    marketId: "market_005",
    title: "Who scores first in the Championship? ⚽",
    description: "Goal by goal prediction — who draws first blood?",
    category: "Sports",
    status: "closed",
    closeTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    totalBets: 228,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    options: [
      { optionId: "opt_home", label: "Home Team", totalStaked: 1400, betCount: 120 },
      { optionId: "opt_away", label: "Away Team", totalStaked: 900, betCount: 84 },
      { optionId: "opt_nil", label: "No Goals (0-0)", totalStaked: 280, betCount: 24 },
    ],
  },
  {
    marketId: "market_006",
    title: "Most viral meme of March? 😂",
    description: "Internet culture moves fast — which meme format will dominate this month?",
    category: "Culture",
    status: "resolved",
    resolvedOption: "opt_cat",
    closeTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalBets: 412,
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    options: [
      { optionId: "opt_cat", label: "Cat memes 🐱", totalStaked: 2400, betCount: 200 },
      { optionId: "opt_dog", label: "Dog memes 🐶", totalStaked: 1800, betCount: 140 },
      { optionId: "opt_other3", label: "Something new 🤔", totalStaked: 600, betCount: 72 },
    ],
  },
];

export const DUMMY_USER_PROFILE: UserProfile = {
  walletAddress: "0xDummy1234567890abcdef1234567890abcdef12",
  displayName: "CryptoOracle",
  points: 1000,
  discordLinked: false,
  totalBets: 0,
  totalWon: 0,
};

export const DUMMY_USER_BETS: UserBet[] = [];

export const DUMMY_LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1,
    walletAddress: "0xAce1111111111111111111111111111111111111",
    displayName: "OracleGod",
    discordUsername: "OracleGod#0001",
    points: 4200,
    correctBets: 18,
    totalBets: 22,
  },
  {
    rank: 2,
    walletAddress: "0xAce2222222222222222222222222222222222222",
    displayName: "MidnightSeer",
    discordUsername: "MidnightSeer#4242",
    points: 3750,
    correctBets: 15,
    totalBets: 20,
  },
  {
    rank: 3,
    walletAddress: "0xAce3333333333333333333333333333333333333",
    displayName: "BlockchainBob",
    discordUsername: "BlockchainBob#1337",
    points: 2900,
    correctBets: 12,
    totalBets: 18,
  },
  {
    rank: 4,
    walletAddress: "0xAce4444444444444444444444444444444444444",
    displayName: "CryptoCarla",
    discordUsername: undefined,
    points: 2100,
    correctBets: 9,
    totalBets: 14,
  },
  {
    rank: 5,
    walletAddress: "0xAce5555555555555555555555555555555555555",
    displayName: "ProphetPete",
    discordUsername: "ProphetPete#9999",
    points: 1850,
    correctBets: 8,
    totalBets: 13,
  },
  {
    rank: 6,
    walletAddress: "0xAce6666666666666666666666666666666666666",
    displayName: "ZeroKnowledge",
    discordUsername: undefined,
    points: 1600,
    correctBets: 7,
    totalBets: 12,
  },
  {
    rank: 7,
    walletAddress: "0xAce7777777777777777777777777777777777777",
    displayName: "NightOwl",
    discordUsername: "NightOwl#2024",
    points: 1400,
    correctBets: 6,
    totalBets: 11,
  },
  {
    rank: 8,
    walletAddress: "0xDummy1234567890abcdef1234567890abcdef12",
    displayName: "CryptoOracle",
    discordUsername: undefined,
    points: 1000,
    correctBets: 0,
    totalBets: 0,
  },
];
