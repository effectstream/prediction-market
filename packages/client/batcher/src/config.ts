import { FileStorage, type BatcherConfig, type DefaultBatcherInput } from "@paimaexample/batcher";

const batchIntervalMs = 1000;
const port = Number(Deno.env.get("BATCHER_PORT") ?? "3336");

export const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  namespace: "",
  confirmationLevel: "wait-receipt",
  enableEventSystem: false,
  port,
};

export const BATCHER_DATA_DIR = "./batcher-data";
export const storage = new FileStorage(BATCHER_DATA_DIR);
