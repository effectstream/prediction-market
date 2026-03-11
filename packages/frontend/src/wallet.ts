/**
 * Lace Wallet Bridge
 *
 * Connects to the Midnight Lace browser extension.
 * Tries @paimaexample/wallets first, then falls back to direct window.midnight.
 *
 * The shielded address returned by the wallet is used as the user's identity
 * throughout the app (passed to API calls as walletAddress).
 */

import { walletLogin, WalletMode } from "@paimaexample/wallets";
import { setNetworkId, type NetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import semver from "semver";

export interface WalletInfo {
  /** Midnight shielded address — used as the user's identity in API calls */
  address: string;
  coinPublicKey: string;
  encryptionPublicKey: string;
}

const MIDNIGHT_NETWORK_ID: NetworkId =
  (import.meta as any).env?.VITE_MIDNIGHT_NETWORK_ID ?? "undeployed";
const COMPATIBLE_CONNECTOR_API_VERSION = ">=1.0.0";

// Set network ID globally before any wallet operations
setNetworkId(MIDNIGHT_NETWORK_ID);

let _connectedAPI: ConnectedAPI | null = null;
let _walletInfo: WalletInfo | null = null;

/** Returns true if the Lace Midnight extension is present in the browser */
export function isWalletAvailable(): boolean {
  const midnight = (window as any).midnight;
  if (!midnight) return false;
  return Object.values(midnight).some(
    (api: any) => api?.apiVersion && semver.satisfies(api.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)
  );
}

/** Direct connection to window.midnight (fallback when @paimaexample/wallets fails) */
async function connectDirect(): Promise<ConnectedAPI> {
  const midnight = (window as any).midnight;
  if (!midnight) {
    throw new Error(
      "Midnight Lace wallet not found. Please install the Lace wallet extension."
    );
  }

  const wallets = Object.entries(midnight).filter(([_, api]: [string, any]) =>
    api?.apiVersion && semver.satisfies(api.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION)
  ) as [string, any][];

  if (wallets.length === 0) {
    throw new Error("No compatible Midnight wallet found. Please update your Lace extension.");
  }

  const [name, api] = wallets[0];
  console.log(`[Wallet] Direct connect to: ${name} (v${api.apiVersion})`);

  const apiWithPassword: any = { ...api };
  apiWithPassword.privateStoragePasswordProvider = async () => "PAIMA_STORAGE_PASSWORD";
  if (typeof api.connect === "function") {
    apiWithPassword.connect = api.connect.bind(api);
  }

  return await apiWithPassword.connect(MIDNIGHT_NETWORK_ID);
}

/**
 * Connect the Lace wallet. Prompts the extension popup.
 * Returns the wallet info (shielded address + keys) on success, or throws.
 */
export async function connectLaceWallet(): Promise<WalletInfo> {
  // Try @paimaexample/wallets first
  try {
    const result = await walletLogin({
      // @ts-ignore — WalletMode.Midnight = 2
      mode: WalletMode.Midnight,
      networkId: MIDNIGHT_NETWORK_ID,
    });
    if (result.success) {
      console.log("[Wallet] Connected via @paimaexample/wallets");
      _connectedAPI = result.result.provider.getConnection().api as ConnectedAPI;
    } else {
      throw new Error("paimaexample/wallets returned failure");
    }
  } catch {
    console.log("[Wallet] Falling back to direct window.midnight connection");
    _connectedAPI = await connectDirect();
  }

  const addresses = await _connectedAPI!.getShieldedAddresses();
  _walletInfo = {
    address: addresses.shieldedAddress,
    coinPublicKey: addresses.shieldedCoinPublicKey,
    encryptionPublicKey: addresses.shieldedEncryptionPublicKey,
  };

  console.log("[Wallet] Connected:", _walletInfo.address);
  return _walletInfo;
}

/** Returns the currently connected wallet info, or null if not connected */
export function getWalletInfo(): WalletInfo | null {
  return _walletInfo;
}

/** True if a wallet is currently connected */
export function isConnected(): boolean {
  return _connectedAPI !== null && _walletInfo !== null;
}

/** Disconnect and clear wallet state */
export function disconnectWallet(): void {
  _connectedAPI = null;
  _walletInfo = null;
  console.log("[Wallet] Disconnected");
}
