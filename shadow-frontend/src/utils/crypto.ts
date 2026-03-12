// Browser-native crypto utilities (no WASM/SDK imports)

/**
 * Generate a random secret and its SHA-256 hash.
 * Uses crypto.getRandomValues + crypto.subtle (Web Crypto API).
 */
export async function generateSecretHash(): Promise<{ secret: string; hash: string }> {
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(secretBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret)
  );
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { secret, hash };
}
