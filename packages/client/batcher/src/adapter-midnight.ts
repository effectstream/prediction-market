/**
 * Midnight Adapter for Prediction Market Batcher
 *
 * Handles Midnight blockchain transactions on behalf of users.
 * The batcher's wallet (funded via MIDNIGHT_SEED) submits all circuit calls —
 * placeBet, registerUser, resolveMarket, claimWinnings — passing the user's
 * ZswapCoinPublicKey explicitly as a parameter since ownPublicKey() inside
 * the circuit returns the batcher's key, not the user's.
 */

import { MidnightAdapter } from "@paimaexample/batcher";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import * as contractInfo from "@prediction-market/midnight-contract";
import * as contract from "@prediction-market/midnight-contract/contract";

const isTestnet = Deno.env.get("EFFECTSTREAM_ENV") === "testnet";
const networkID = isTestnet ? "testnet" : "undeployed";

// Midnight infrastructure URLs — override via env vars for testnet/staging
const indexer = Deno.env.get("INDEXER_HTTP_URL") ?? "http://localhost:8088/api/v3/graphql";
const indexerWS = Deno.env.get("INDEXER_WS_URL") ?? "ws://localhost:8088/api/v3/graphql/ws";
const node = Deno.env.get("NODE_URL") ?? "http://localhost:9944";
const proofServer = Deno.env.get("PROOF_SERVER_URL") ?? "http://localhost:6300";

// The batcher wallet seed — set via MIDNIGHT_SEED env var.
// This is the key that funds and signs all Midnight transactions.
// The corresponding ZswapCoinPublicKey is set as resolverKey at deploy time.
const MIDNIGHT_SEED = Deno.env.get("MIDNIGHT_SEED") ??
  "0000000000000000000000000000000000000000000000000000000000000001";

const {
  contractInfo: compiledContractInfo,
  contractAddress,
  zkConfigPath,
} = readMidnightContract(
  "prediction-market-contract",
  {
    // Resolve relative to this file so the search works regardless of cwd
    baseDir: new URL("../../../shared/contracts/midnight", import.meta.url).pathname,
    networkId: networkID,
  },
);

export const midnightAdapter = new MidnightAdapter(
  contractAddress,
  MIDNIGHT_SEED,
  {
    indexer,
    indexerWS,
    node,
    proofServer,
    zkConfigPath,
    privateStateStoreName: "private-state",
    privateStateId: "privateState",
    walletNetworkId: networkID,
    contractJoinTimeoutSeconds: 300,
    walletFundingTimeoutSeconds: 300,
    contractTag: "prediction-market-contract",
  },
  contract.Contract,
  contractInfo.witnesses,
  compiledContractInfo,
  "parallelMidnight",
);
