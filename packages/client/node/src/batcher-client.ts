/**
 * Batcher Client
 *
 * Sends Midnight circuit calls to the batcher's /send-input endpoint.
 * The batcher holds the funded wallet and submits the actual on-chain
 * transactions on behalf of users.
 *
 * The `input` field must be the concise-encoded command string matching
 * the grammar (e.g. "b|market_001|option_yes|50").  The batcher parses
 * this string with the same grammar the state machine uses, and the
 * MidnightAdapter maps it to the correct circuit call.
 */

const BATCHER_URL = Deno.env.get("BATCHER_URL") ?? "http://localhost:3336";

/** A fake EVM address used as the "sender" for resolver-issued calls. */
const RESOLVER_ADDRESS = "0x0000000000000000000000000000000000000001";

export interface BatcherResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Post a concise-encoded command string to the batcher.
 *
 * @param input   Concise command string matching the prediction market grammar
 * @param address The wallet address on whose behalf this is submitted
 *                (used for batcher routing; resolver calls use RESOLVER_ADDRESS)
 */
export async function sendToBatcher(
  input: string,
  address: string = RESOLVER_ADDRESS,
): Promise<BatcherResult> {
  const body = {
    data: {
      target: "midnight",
      address,
      addressType: 0,
      input,
      timestamp: Date.now(),
      // Signature verification is disabled in dev mode
      signature: "0x" + "00".repeat(65),
    },
    confirmationLevel: "wait-receipt",
  };

  try {
    const res = await fetch(`${BATCHER_URL}/send-input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    const result = await res.json() as Record<string, unknown>;

    if (res.ok) {
      return {
        success: true,
        transactionHash: result.transactionHash as string | undefined,
      };
    }

    return {
      success: false,
      error: (result.message ?? JSON.stringify(result)) as string,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
