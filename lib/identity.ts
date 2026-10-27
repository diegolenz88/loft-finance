import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {headers} from 'next/headers';

// The app can run under two identity providers:
// 1. A hosting platform that injects `oai-authenticated-user-*` headers (Sites).
// 2. A standalone Cloudflare Worker protected by a signed session cookie.
// The cookie path is used only when no platform identity is present, so the
// hosted deployment keeps working without any change.
export type Identity = {userId:string;email:string;displayName:string};

export const SESSION_COOKIE = 'lf_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();
const ACCESS_KEYS_TTL = 60 * 60 * 1000;
let accessKeysCache:{expires:number;keys:JsonWebKey[]}|undefined;

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

function setting(name:string):string|undefined{return secret(name)}

function decodeBase64url(value:string):Uint8Array{
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

function decodeJwtPart(value:string):any{
  return JSON.parse(new TextDecoder().decode(decodeBase64url(value)));
}

async function accessKeys(teamDomain:string):Promise<JsonWebKey[]>{
  if(accessKeysCache&&accessKeysCache.expires>Date.now())return accessKeysCache.keys;
  const response=await fetch(`https://${teamDomain}/cdn-cgi/access/certs`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Não foi possível validar a identidade do Cloudflare Access.');
  const body=await response.json() as {public_certificates?:JsonWebKey[];keys?:JsonWebKey[]};
  const keys=body.keys||body.public_certificates;
  if(!Array.isArray(keys)||!keys.length)throw new Error('Cloudflare Access não retornou chaves públicas válidas.');
  accessKeysCache={keys,expires:Date.now()+ACCESS_KEYS_TTL};
  return keys;
}

function keyId(key:JsonWebKey):string|undefined{
  const value=(key as JsonWebKey&{kid?:unknown}).kid;
  return typeof value==='string'?value:undefined;
}

async function accessIdentity(assertion:string|undefined):Promise<Identity|null>{
  const teamDomain=setting('ACCESS_TEAM_DOMAIN')?.replace(/^https?:\/\//,'').replace(/\/$/,'');
  const audience=setting('ACCESS_AUD');
  if(!teamDomain||!audience||!assertion)return null;
  try{
    const parts=assertion.split('.');
    if(parts.length!==3)return null;
    const header=decodeJwtPart(parts[0]);
    const claims=decodeJwtPart(parts[1]);
    if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
    const now=Math.floor(Date.now()/1000);
    const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
    if(claims.iss!==`https://${teamDomain}`||!aud.includes(audience)||typeof claims.exp!=='number'||claims.exp<=now)return null;
    if(typeof claims.nbf==='number'&&claims.nbf>now+60)return null;
    // Cloudflare Access signs the identity and audience; its documented JWT
    // payload does not guarantee an `email_verified` claim.
    if(typeof claims.email!=='string'||!claims.email.includes('@'))return null;
    const jwk=(await accessKeys(teamDomain)).find(key=>keyId(key)===header.kid);
    if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signature=decodeBase64url(parts[2]);
    const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature as unknown as BufferSource,encoder.encode(`${parts[0]}.${parts[1]}`));
    if(!valid)return null;
    const email=claims.email.toLowerCase();
    const owner=authOwner();
    const userId=owner&&owner.email===email?owner.id:`access:${email}`;
    return {userId,email,displayName:typeof claims.name==='string'&&claims.name?claims.name:email};
  }catch{return null}
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
  // Cloudflare Access JWT is cryptographically verified before trusting claims.
  const requestHeaders=await headers();
  const assertion=requestHeaders.get('cf-access-jwt-assertion')||undefined;
  const access=await accessIdentity(assertion);
  if(access)return access;

  // Hosted platform identity wins over the standalone password fallback.
  const hosted = await getChatGPTUser();
  if (hosted) return {userId:hosted.userId, email:hosted.email, displayName:hosted.displayName};

  // Enable this only after the Access application, team domain and AUD are
  // configured. Then missing/invalid Access JWTs never fall back to password.
  if(setting('ACCESS_REQUIRED')==='1')return null;

  const owner = authOwner();
  if (!owner) return null;

  const session = await readSessionToken(cookieValue(cookieHeader), sessionSecret());
  if (!session || session.email !== owner.email) return null;

  return {userId:owner.id, email:owner.email, displayName:owner.email};
}
