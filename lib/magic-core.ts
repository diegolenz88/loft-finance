// Pure pieces of the passwordless flow, kept free of runtime bindings so they
// can be unit tested with plain Node.
export const LINK_TTL_MINUTES = 15;

export function toBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 256 bits of entropy: guessing a live token is not practical.
export function newToken(): string {
  return toBase64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function digestToken(token: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return toBase64url(bytes);
}
