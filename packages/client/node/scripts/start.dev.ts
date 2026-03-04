import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";

const skipPglite = Deno.env.get("SKIP_PGLITE") === "true";

// EVM is not used in Phase 1 (Midnight-only). Set LAUNCH_EVM=true to opt into EVM infra.
const launchEvmFlag = Deno.env.get("LAUNCH_EVM") === "true";

console.log(`[Orchestrator] SKIP_PGLITE=${skipPglite}, LAUNCH_EVM=${launchEvmFlag}`);

const customProcesses = [
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
    link: "http://localhost:3000",
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

  processesToLaunch: [
    // EVM not used in Phase 1 (Midnight-only app).
    // When EVM is needed in a later phase, uncomment and add the evm-contracts package:
    // ...(launchEvmFlag ? launchEvm("@prediction-market/evm-contracts") : []),
    ...customProcesses,
  ],
});

if (Deno.env.get("EFFECTSTREAM_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
