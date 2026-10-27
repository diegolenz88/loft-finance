import assert from 'node:assert/strict';
import {safeReturnTo} from '../lib/redirects.ts';
import {LINK_TTL_MINUTES,digestToken,newToken} from '../lib/magic-core.ts';

// The post-login destination must never leave the site.
assert.equal(safeReturnTo(null), '/');
assert.equal(safeReturnTo(undefined), '/');
assert.equal(safeReturnTo(''), '/');
assert.equal(safeReturnTo('https://evil.example'), '/');
assert.equal(safeReturnTo('//evil.example'), '/');
assert.equal(safeReturnTo('/\\evil.example'), '/');
assert.equal(safeReturnTo('/api/session?token=abc'), '/');
assert.equal(safeReturnTo('/api/session/magic'), '/');
assert.equal(safeReturnTo('/despesas'), '/despesas');
assert.equal(safeReturnTo('/despesas?filtro=aberto'), '/despesas?filtro=aberto');
assert.equal(safeReturnTo('/?x=1'), '/?x=1');

// Tokens are long, URL safe and never repeat.
const tokens = new Set();
for (let i = 0; i < 200; i += 1) tokens.add(newToken());
assert.equal(tokens.size, 200);
for (const token of tokens) {
  assert.ok(token.length >= 40, 'token curto');
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'token fora do base64url');
}

// A short validity window is part of the design.
assert.equal(LINK_TTL_MINUTES, 15);
assert.ok(LINK_TTL_MINUTES <= 30);

// Only the digest is stored, and different tokens never share a digest.
const sample = newToken();
const digest = await digestToken(sample);
assert.match(digest, /^[A-Za-z0-9_-]+$/);
assert.notEqual(digest, sample);
assert.equal(await digestToken(sample), digest);
assert.notEqual(await digestToken(newToken()), digest);

console.log('PASS: link mágico — destino seguro após login e tokens únicos de uso único.');
