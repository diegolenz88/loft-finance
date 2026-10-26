import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';

// The app can run under two identity providers:
// 1. A hosting platform that injects `oai-authenticated-user-*` headers (Sites).
// 2. A standalone Cloudflare Worker protected by a signed session cookie.
// The cookie path is used only when no platform identity is present, so the
// hosted deployment keeps working without any change.
export type Identity = {userId:string;email:string;displayName:string};

export const SESSION_COOKIE = 'lf_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}

function secret(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
}

export function sessionSecret(): string {
  const value = secret('AUTH_SECRET');
  if (!value || value.length < 32) {
    throw new Error('AUTH_SECRET ausente ou com menos de 32 caracteres. Configure o segredo antes de publicar.');
  }
  return value;
}

export function authOwner(): {email:string;id:string} | undefined {
  const email = secret('AUTH_OWNER_EMAIL');
  const id = secret('AUTH_OWNER_ID');
  return email && id ? {email:email.toLowerCase(), id} : undefined;
}

export async function createSessionToken(email: string, secretValue: string): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify({
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  })));
  return `${payload}.${await sign(payload, secretValue)}`;
}

export async function readSessionToken(token: string | undefined, secretValue: string) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = await sign(payload, secretValue);
  if (signature.length !== expected.length) return null;
  let divergence = 0;
  for (let index = 0; index < signature.length; index++) {
    divergence |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (divergence !== 0) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (typeof data?.email !== 'string' || typeof data?.exp !== 'number') return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return {email: data.email.toLowerCase()};
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, secure = true): string {
  // `Secure` is omitted only for plain-HTTP local previews; every deployed
  // Worker is served over HTTPS.
  const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${flags}${secure ? '; Secure' : ''}`;
}

export function clearedSessionCookie(secure = true): string {
  const flags = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  return `${SESSION_COOKIE}=; ${flags}${secure ? '; Secure' : ''}`;
}

function cookieValue(cookieHeader: string | null): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const item = part.trim();
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator) !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function currentIdentity(cookieHeader: string | null): Promise<Identity | null> {
  // Hosted platform identity wins: it is injected by trusted dispatch headers.
  const hosted = await getChatGPTUser();
  if (hosted) return {userId:hosted.userId, email:hosted.email, displayName:hosted.displayName};

  const owner = authOwner();
  if (!owner) return null;

  const session = await readSessionToken(cookieValue(cookieHeader), sessionSecret());
  if (!session || session.email !== owner.email) return null;

  return {userId:owner.id, email:owner.email, displayName:owner.email};
}
