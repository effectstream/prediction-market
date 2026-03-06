/**
 * Grammar definitions for Paima Engine command parsing
 * Prediction Market - Defines the concise encoding format for on-chain commands
 */

import type { GrammarDefinition } from "@paimaexample/concise";
import { Type } from "@sinclair/typebox";

const WalletAddress = Type.String({ minLength: 1, maxLength: 100 });
const MarketID = Type.String({ minLength: 1, maxLength: 100 });
const OptionID = Type.String({ minLength: 1, maxLength: 100 });
const BetAmount = Type.Union([
  Type.Literal(10),
  Type.Literal(25),
  Type.Literal(50),
]);
const DisplayName = Type.String({ minLength: 1, maxLength: 30 });
const MarketTitle = Type.String({ minLength: 1, maxLength: 200 });
const MarketDescription = Type.String({ minLength: 0, maxLength: 500 });
const MarketCategory = Type.String({ minLength: 1, maxLength: 50 });
const CloseTime = Type.String({ minLength: 1, maxLength: 50 }); // ISO timestamp string

export const predictionMarketGrammar = {
  /**
   * Place Bet: b|marketId|optionId|amount
   * Example: b|market_001|option_a|25
   */
  placedBet: [
    ["marketId", MarketID],
    ["optionId", OptionID],
    ["amount", BetAmount],
  ],

  /**
   * Register / Set Display Name: reg|displayName
   * Example: reg|CryptoOracle42
   */
  registeredUser: [["displayName", DisplayName]],

  /**
   * Link Discord: discord|walletAddress|discordUsername
   * Example: discord|0xabc123|DiscordUser#1234
   */
  linkedDiscord: [
    ["walletAddress", WalletAddress],
    ["discordUsername", Type.String({ minLength: 1, maxLength: 50 })],
  ],

  /**
   * Create Market (resolver only): cm|marketId|title|description|category|closeTime
   * Example: cm|market_001|Will BTC hit 100k?|Bitcoin price prediction|crypto|2024-12-31T00:00:00Z
   */
  createdMarket: [
    ["marketId", MarketID],
    ["title", MarketTitle],
    ["description", MarketDescription],
    ["category", MarketCategory],
    ["closeTime", CloseTime],
  ],

  /**
   * Close Market (resolver only): clm|marketId
   * Example: clm|market_001
   */
  closedMarket: [
    ["marketId", MarketID],
  ],

  /**
   * Resolve Market (resolver only): rm|marketId|winningOptionId
   * Example: rm|market_001|option_yes
   */
  resolvedMarket: [
    ["marketId", MarketID],
    ["winningOptionId", OptionID],
  ],

  /**
   * Claim Winnings: cw|marketId
   * Example: cw|market_001
   * The node computes the payout witness and submits to the Midnight batcher.
   */
  claimedWinnings: [
    ["marketId", MarketID],
  ],
} as const satisfies GrammarDefinition;

export const grammar = {
  ...predictionMarketGrammar,
} as const satisfies GrammarDefinition;
