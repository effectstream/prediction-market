import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const midnightContractsDir = path.resolve(__dirname, "../../../shared/contracts/midnight");

const skipPglite = Deno.env.get("SKIP_PGLITE") === "true";

// Set SKIP_MIDNIGHT_INFRA=true if you already have the Midnight node/indexer/proof-server running
const skipMidnightInfra = Deno.env.get("SKIP_MIDNIGHT_INFRA") === "true";

// Set DEPLOY_MIDNIGHT_CONTRACT=true to deploy the contract at startup (~2-6 mins)
// Leave unset if the contract is already deployed (normal dev workflow after first deploy)
const deployMidnightContract = Deno.env.get("DEPLOY_MIDNIGHT_CONTRACT") === "true";

console.log(
  `[Orchestrator] SKIP_PGLITE=${skipPglite}, SKIP_MIDNIGHT_INFRA=${skipMidnightInfra}, DEPLOY_MIDNIGHT_CONTRACT=${deployMidnightContract}`,
);

// ============================================
// MIDNIGHT INFRASTRUCTURE
// ============================================

const midnightProcesses = skipMidnightInfra ? [] : [
  /** MIDNIGHT-NODE-BLOCK */
  {
    name: "midnight-node",
    args: [
      "run", "-A", "--unstable-detect-cjs",
      "npm:@paimaexample/npm-midnight-node@0.7.2",
      "--dev", "--rpc-port", "9944",
      "--state-pruning", "archive",
      "--blocks-pruning", "archive",
      "--public-addr", "/ip4/127.0.0.1",
      "--unsafe-rpc-external",
    ],
    env: { CFG_PRESET: "dev" },
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:9944",
    stopProcessAtPort: [9944],
    dependsOn: [],
  },
  /** MIDNIGHT-NODE-BLOCK */

  /** MIDNIGHT-INDEXER-BLOCK */
  {
    name: "midnight-indexer",
    args: [
      "run", "-A", "--unstable-detect-cjs",
      "npm:@paimaexample/npm-midnight-indexer@0.7.2",
      "--standalone",
      "--binary",
    ],
    env: {
      LEDGER_NETWORK_ID: "Undeployed",
      SUBSTRATE_NODE_WS_URL: "ws://localhost:9944",
      APP__INFRA__SECRET: "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
    },
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:8088",
    stopProcessAtPort: [8088],
    dependsOn: ["midnight-node"],
  },
  /** MIDNIGHT-INDEXER-BLOCK */

  /** MIDNIGHT-PROOF-SERVER-BLOCK */
  {
    name: "midnight-proof-server",
    args: [
      "run", "-A", "--unstable-detect-cjs",
      "npm:@paimaexample/npm-midnight-proof-server@0.7.2",
    ],
    env: {
      LEDGER_NETWORK_ID: "Undeployed",
      RUST_BACKTRACE: "full",
      SUBSTRATE_NODE_WS_URL: "ws://localhost:9944",
    },
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:6300",
    stopProcessAtPort: [6300],
    dependsOn: ["midnight-node"],
  },
  /** MIDNIGHT-PROOF-SERVER-BLOCK */
];

// ============================================
// CONTRACT DEPLOYMENT
// ============================================

const midnightContractDeployment = (deployMidnightContract && !skipMidnightInfra) ? [
  {
    name: "midnight-contract-deploy",
    args: [
      "--unstable-detect-cjs", "-A",
      "deploy.ts",
    ],
    env: {
      MIDNIGHT_DEPLOY_VERIFIER_KEYS_LIMIT: "1",
    },
    cwd: midnightContractsDir,
    waitToExit: true,
    type: "system-dependency",
    dependsOn: ["midnight-proof-server", "midnight-indexer"],
  },
] : [];

// ============================================
// BATCHER + FRONTEND + EXPLORER
// ============================================

const batcherDependsOn = deployMidnightContract && !skipMidnightInfra
  ? ["midnight-contract-deploy"]
  : skipMidnightInfra ? [] : ["midnight-proof-server"];

const customProcesses = [
  ...midnightProcesses,
  ...midnightContractDeployment,

  /** BATCHER-BLOCK */
  {
    name: "batcher",
    args: ["task", "-f", "@prediction-market/batcher", "start"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:3336",
    stopProcessAtPort: [3336],
    dependsOn: batcherDependsOn,
  },
  /** BATCHER-BLOCK */

  /** FRONTEND-BLOCK */
  {
    name: "install-frontend",
    command: "npm",
    cwd: "../../frontend/",
    args: ["install"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [],
  },
  {
    name: "serve-frontend",
    command: "npm",
    cwd: "../../frontend",
    args: ["run", "dev"],
    waitToExit: false,
    link: "http://localhost:3002",
    type: "system-dependency",
    dependsOn: ["install-frontend"],
    logs: "none",
  },
  /** FRONTEND-BLOCK */

  /** EXPLORER-BLOCK */
  {
    name: "explorer",
    args: ["run", "-A", "--unstable-detect-cjs", "@paimaexample/explorer"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10590",
    stopProcessAtPort: [10590],
  },
  /** EXPLORER-BLOCK */
];

const config = Value.Parse(OrchestratorConfig, {
  packageName: "jsr:@paimaexample",
  processes: {
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,
    [ComponentNames.EFFECTSTREAM_PGLITE]: !skipPglite,
    [ComponentNames.COLLECTOR]: true,
  },
  processesToLaunch: customProcesses,
});

if (Deno.env.get("EFFECTSTREAM_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
