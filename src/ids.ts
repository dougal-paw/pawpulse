// Random id/token generation using the Workers-native Web Crypto API.
// No personal data is ever used as input — purely random bytes.

function randomHex(byteLength: number): string {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Short public-facing monitor id (16 hex chars ~ 64 bits of entropy). */
export function randomMonitorId(): string {
  return randomHex(8);
}

/** Long-lived secret token (48 hex chars ~ 192 bits of entropy). */
export function randomToken(): string {
  return randomHex(24);
}

/** Constant-time-ish string comparison to avoid trivial timing leaks on tokens. */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
