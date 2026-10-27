import assert from 'node:assert/strict';
import {safeReturnTo} from '../lib/redirects.ts';
import {LINK_TTL_MINUTES,digestToken,newToken} from '../lib/magic-core.ts';
import {renderLogin,renderMagicConfirm} from '../lib/login-page.ts';

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

// Opening the link must not spend the token: messengers and antivirus fetch the
// URL automatically, so the GET only renders a confirmation that shows which
// e-mail the link belongs to and posts back to spend it.
const token = newToken();
const confirm = await renderMagicConfirm({email: 'diego_lenz@hotmail.com', token, returnTo: '/despesas'}).text();
assert.match(confirm, /method="post"/, 'a confirmação precisa enviar por POST');
assert.match(confirm, new RegExp(`name="token" value="${token}"`), 'o token precisa ir no formulário');
assert.match(confirm, /diego_lenz@hotmail\.com/, 'é preciso mostrar o e-mail do link');
assert.match(confirm, /name="return_to" value="\/despesas"/, 'o destino deve ser preservado');
assert.ok(!/Entrar agora<\/a>/.test(confirm), 'não deve existir link GET que consuma o token');

// The e-mail is escaped: an address cannot inject markup into the page.
const hostile = await renderMagicConfirm({email: '<script>x</script>@a.co', token}).text();
assert.ok(!hostile.includes('<script>x</script>'));
assert.match(hostile, /&lt;script&gt;/);

// The magic tab explains that the link is personal.
const login = await renderLogin({mode: 'magic'}).text();
assert.match(login, /O link é pessoal e só funciona para este e-mail/);

console.log('PASS: link mágico — destino seguro, token único e confirmação que não consome por GET.');

// Only the digest is stored, and different tokens never share a digest.
const sample = newToken();
const digest = await digestToken(sample);assert.match(digest, /^[A-Za-z0-9_-]+$/);
assert.notEqual(digest, sample);
assert.equal(await digestToken(sample), digest);
assert.notEqual(await digestToken(newToken()), digest);

console.log('PASS: link mágico — destino seguro após login e tokens únicos de uso único.');
