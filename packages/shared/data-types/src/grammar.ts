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
} as const satisfies GrammarDefinition;

export const grammar = {
  ...predictionMarketGrammar,
} as const satisfies GrammarDefinition;
