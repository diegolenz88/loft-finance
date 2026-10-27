// Small AES-GCM envelope used for values that must survive a database dump.
//
// The key is derived from AUTH_SECRET, which lives only in the Worker runtime, so
// a copy of the D1 file alone cannot reveal a provider key.
import {env} from 'cloudflare:workers';

const encoder = new TextEncoder();

function secretValue(): string {
  const value = (env as unknown as Record<string, unknown>).AUTH_SECRET;
  if (typeof value !== 'string' || value.length < 32) {
    throw new Error('AUTH_SECRET ausente ou curto demais para cifrar valores.');
  }
  return value;
}

async function key(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`lf-settings:${secretValue()}`));
  return crypto.subtle.importKey('raw', digest, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await key(), encoder.encode(plain));
  return `${toB64(iv)}.${toB64(new Uint8Array(box))}`;
}

export async function open(sealed: string | null | undefined): Promise<string | null> {
  if (!sealed || !sealed.includes('.')) return null;
  const [ivPart, dataPart] = sealed.split('.');
  try {
    const clear = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv: fromB64(ivPart) as unknown as BufferSource},
      await key(),
      fromB64(dataPart) as unknown as BufferSource,
    );
    return new TextDecoder().decode(clear);
  } catch {
    // A different AUTH_SECRET (rotated or another environment) cannot open the
    // value; the caller falls back to "not configured" instead of crashing.
    return null;
  }
}
