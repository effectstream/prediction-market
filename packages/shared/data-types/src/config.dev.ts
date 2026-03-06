/**
 * Development configuration for Paima Engine
 * Phase 1: NTP-only (no EVM, no Midnight contract yet).
 * Phase 2 will add a Midnight parallel sync protocol and primitives.
 */

import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";

export const config = new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("[prediction-market]"))
  .buildNetworks((builder) =>
    builder.addNetwork({
      name: "ntp",
      type: ConfigNetworkType.NTP,
      startTime: new Date().getTime(),
      blockTimeMS: 1000,
    })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder.addMain(
      (networks) => networks.ntp,
      (_network, _deployments) => ({
        name: "mainNtp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        chainUri: "",
        startBlockHeight: 1,
        pollingInterval: 3000,
      })
    )
  )
  .buildPrimitives((builder) => builder)
  .build();
