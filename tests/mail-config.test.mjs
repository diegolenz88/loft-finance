import assert from 'node:assert/strict';
import {
  PROVIDERS,
  addressOf,
  addressProblem,
  isProvider,
  mailStatusOf,
  maskKey,
  resolveMail,
} from '../lib/mail-config.ts';

const stored = {provider: 'brevo', from: 'Loft Finance <acesso@loft.app>', key: 'xkeysib-1234567890'};

// Only the three editable providers are accepted from the screen. The native
// Cloudflare binding is environment-only, so it is not offered there.
assert.deepEqual(PROVIDERS, ['resend', 'brevo', 'mailersend']);
assert.equal(isProvider('brevo'), true);
assert.equal(isProvider('cloudflare'), false);
assert.equal(isProvider('smtp'), false);
assert.equal(isProvider(undefined), false);

// Sender parsing accepts both shapes and rejects incomplete values.
assert.equal(addressOf('Loft Finance <acesso@loft.app>'), 'acesso@loft.app');
assert.equal(addressOf('acesso@loft.app'), 'acesso@loft.app');
assert.equal(addressProblem('Loft <acesso@loft.app>'), null);
assert.equal(addressProblem('acesso@loft.app'), null);
assert.match(addressProblem('') ?? '', /Informe o endereço/);
assert.match(addressProblem('sem-arroba') ?? '', /e-mail completo/);
assert.match(addressProblem('Loft <sem-arroba>') ?? '', /e-mail completo/);

// The key never travels back to the browser.
assert.equal(maskKey('xkeysib-1234567890'), '••••7890');
assert.equal(maskKey('abc'), '••••');

// Precedence: an environment provider is final, otherwise the saved settings win.
const envResend = {MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_env_key_1', MAGIC_LINK_FROM: 'a@b.co'};
assert.deepEqual(resolveMail(envResend, stored), {provider: 'resend', from: 'a@b.co', key: 're_env_key_1', source: 'environment'});
assert.deepEqual(resolveMail({}, stored), {provider: 'brevo', from: stored.from, key: stored.key, source: 'app'});

// An explicit provider without its key is treated as absent, not as a half
// configured state that would fail at send time.
assert.equal(resolveMail({MAIL_PROVIDER: 'resend', MAGIC_LINK_FROM: 'a@b.co'}, null), null);
assert.equal(resolveMail({MAIL_PROVIDER: 'resend'}, null), null);

// A stored record missing the key is ignored.
assert.equal(resolveMail({}, {provider: 'brevo', from: 'a@b.co', key: '   '}), null);
assert.equal(resolveMail({}, {provider: 'brevo', from: 'invalido', key: 'chave'}), null);

// The native binding still works through the environment.
assert.equal(resolveMail({EMAIL: {}, MAGIC_LINK_FROM: 'a@b.co'}, null)?.provider, 'cloudflare');

// Status exposes what is missing instead of a generic failure.
const empty = mailStatusOf({}, null);
assert.equal(empty.configured, false);
assert.equal(empty.missing, 'provedor');
assert.equal(mailStatusOf({}, {provider: 'brevo', from: '', key: 'k'}).missing, 'remetente');
assert.equal(mailStatusOf({}, {provider: 'brevo', from: 'a@b.co', key: ''}).missing, 'chave de API');

const ready = mailStatusOf({}, stored);
assert.equal(ready.configured, true);
assert.equal(ready.label, 'Brevo');
assert.equal(ready.sender, 'acesso@loft.app');
assert.equal(ready.keyHint, '••••7890');
assert.equal(ready.source, 'app');
assert.ok(!JSON.stringify(ready).includes(stored.key), 'a chave apareceu no status');

const fromEnv = mailStatusOf(envResend, stored);
assert.equal(fromEnv.source, 'environment');
assert.equal(fromEnv.label, 'Resend');

console.log('PASS: configuração de e-mail pela interface — precedência, mascaramento da chave e diagnóstico do que falta.');
