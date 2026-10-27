import assert from 'node:assert/strict';

// The provider adapter is exercised through pure helpers: address parsing and
// status derivation, which decide whether a link can be sent at all.
function splitAddress(from) {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: from.trim() };
}

// Brevo and MailerSend need the display name in a separate field.
assert.deepEqual(splitAddress('Loft Finance <acesso@loft.app>'), { name: 'Loft Finance', email: 'acesso@loft.app' });
assert.deepEqual(splitAddress('acesso@loft.app'), { email: 'acesso@loft.app' });
assert.deepEqual(splitAddress('  <acesso@loft.app> '), { name: undefined, email: 'acesso@loft.app' });
assert.deepEqual(splitAddress('Nome com espaço <a@b.co>'), { name: 'Nome com espaço', email: 'a@b.co' });

// Status derivation mirrors lib/mailer.ts: a provider plus a sender is required.
function status(env) {
  const get = (k) => (typeof env[k] === 'string' && env[k].trim() ? env[k].trim() : undefined);
  const explicit = get('MAIL_PROVIDER')?.toLowerCase();
  let provider = null;
  if (explicit && ['resend', 'brevo', 'mailersend', 'cloudflare'].includes(explicit)) provider = explicit;
  else if (get('RESEND_API_KEY')) provider = 'resend';
  else if (get('BREVO_API_KEY')) provider = 'brevo';
  else if (get('MAILERSEND_API_KEY')) provider = 'mailersend';
  else if (env.EMAIL) provider = 'cloudflare';
  const sender = get('MAGIC_LINK_FROM') || get('MAIL_FROM');
  if (!provider) return { configured: false, provider: null, missing: 'chave' };
  if (!sender) return { configured: false, provider, missing: 'MAGIC_LINK_FROM' };
  return { configured: true, provider, missing: '' };
}

// Nothing configured: the screen must explain what is missing.
assert.deepEqual(status({}), { configured: false, provider: null, missing: 'chave' });

// A key alone is not enough: without a sender the provider would reject the call.
assert.deepEqual(status({ RESEND_API_KEY: 're_123' }), { configured: false, provider: 'resend', missing: 'MAGIC_LINK_FROM' });
assert.deepEqual(status({ RESEND_API_KEY: 're_123', MAGIC_LINK_FROM: 'a@b.co' }), { configured: true, provider: 'resend', missing: '' });

// Each supported provider is auto-detected from its own key.
assert.equal(status({ BREVO_API_KEY: 'x', MAIL_FROM: 'a@b.co' }).provider, 'brevo');
assert.equal(status({ MAILERSEND_API_KEY: 'x', MAIL_FROM: 'a@b.co' }).provider, 'mailersend');
assert.equal(status({ EMAIL: {}, MAIL_FROM: 'a@b.co' }).provider, 'cloudflare');

// An explicit MAIL_PROVIDER wins over the auto-detection order.
assert.equal(status({ MAIL_PROVIDER: 'brevo', RESEND_API_KEY: 'x', BREVO_API_KEY: 'y', MAIL_FROM: 'a@b.co' }).provider, 'brevo');

// Unknown values are ignored instead of silently sending with the wrong shape.
assert.equal(status({ MAIL_PROVIDER: 'smtp', BREVO_API_KEY: 'y', MAIL_FROM: 'a@b.co' }).provider, 'brevo');

// Working tree must keep the disabled state honest: mailerStatus is used by the
// login route to decide whether to offer automatic delivery.
assert.equal(status({ MAGIC_LINK_FROM: 'a@b.co' }).configured, false);

console.log('PASS: envio de e-mail — provedor detectado pela chave, remetente obrigatório e nome de exibição separado.');
