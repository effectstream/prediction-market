/**
 * Deploy Prediction Market Contract to Midnight Network
 *
 * Deploys the PredictionMarket compact contract and sets the resolver key
 * to the deployer's ZswapCoinPublicKey (derived from MIDNIGHT_SEED).
 * The same key is used by the batcher to sign resolveMarket calls.
 *
 * Usage:
 *   DEPLOY_MIDNIGHT_CONTRACT=true deno task dev
 *
 * Or manually:
 *   deno run -A --unstable-detect-cjs deploy.ts
 *
 * Prerequisites:
 *   1. Midnight node running on localhost:9944
 *   2. Midnight indexer running on localhost:8088
 *   3. Midnight proof server running on localhost:6300
 *   4. Contract compiled (deno task contract:compile in prediction-market-contract/)
 */

import { type DeployConfig, deployMidnightContract } from "@paimaexample/midnight-contracts/deploy";
import * as contractModule from "@prediction-market/midnight-contract";
import * as contract from "@prediction-market/midnight-contract/contract";

const isTestnet = Deno.env.get("EFFECTSTREAM_ENV") === "testnet";

const networkConfig = isTestnet
  ? {
      id: "testnet",
      indexer: Deno.env.get("INDEXER_HTTP_URL") ?? "http://localhost:8088/api/v3/graphql",
      indexerWS: Deno.env.get("INDEXER_WS_URL") ?? "ws://localhost:8088/api/v3/graphql/ws",
      node: Deno.env.get("NODE_URL") ?? "http://localhost:9944",
      proofServer: Deno.env.get("PROOF_SERVER_URL") ?? "http://localhost:6300",
    }
  : undefined; // Use defaults (localhost) for local dev

const config: DeployConfig = {
  contractName: "prediction-market-contract",
  contractFileName: "prediction-market-contract.undeployed.json",
  contractClass: contract.Contract,
  witnesses: contractModule.witnesses,
  privateStateId: "privateState",
  initialPrivateState: {},
  privateStateStoreName: "private-state",
  // initialize(resolverKey_: ZswapCoinPublicKey) — pass deployer's key as resolverKey
  deployArgs: [null as any],
  extractWalletAddress: true,
};

deployMidnightContract(config, networkConfig)
  .then(() => {
    console.log("✅ Prediction Market contract deployed successfully");
    Deno.exit(0);
  })
  .catch((e: unknown) => {
    console.error("❌ Deployment failed:", e);
    Deno.exit(1);
  });
