import assert from 'node:assert/strict';
import {ROLES,isRole,normalizeEmail,conflictsWithPartner,ledgerAllows} from '../lib/access-roles.ts';

// Standalone users carry their own role, and only the three known roles are
// accepted — the value ends up deciding write permission.
assert.deepEqual([...ROLES], ['admin', 'editor', 'viewer']);
assert.equal(isRole('admin'), true);
assert.equal(isRole('editor'), true);
assert.equal(isRole('viewer'), true);
assert.equal(isRole('root'), false);
assert.equal(isRole('ADMIN'), false);
assert.equal(isRole(''), false);
assert.equal(isRole(null), false);
assert.equal(isRole(undefined), false);
assert.equal(isRole(1), false);

// E-mail normalisation keeps "one person, one account" regardless of typing.
assert.equal(normalizeEmail('  Pessoa@Exemplo.COM '), 'pessoa@exemplo.com');
assert.equal(normalizeEmail(null), '');
assert.equal(normalizeEmail(undefined), '');
assert.equal(normalizeEmail('a@b.co'), normalizeEmail('A@B.CO'));

// A standalone account is only valid when both the role and the e-mail are; the
// API refuses a partner e-mail to avoid two sources of truth for the same person.
const partners = ['diego_lenz@hotmail.com'];
assert.equal(conflictsWithPartner(partners, 'DIEGO_LENZ@hotmail.com', 'editor'), true);
assert.equal(conflictsWithPartner(partners, 'contadora@loft.app', 'editor'), false);
assert.equal(conflictsWithPartner([], 'contadora@loft.app', 'root'), true);

// The magic link is only issued for an address that can actually sign in: the
// owner, an active partner, or a standalone account (checked separately).
const ledger = {
  config: {
    partners: [
      {email: 'diego_lenz@hotmail.com', active: true},
      {email: 'socio.inativo@loft.app', active: false},
    ],
  },
};
const OWNER = 'diego.lenz@h2oinnovation.com.py';

assert.equal(ledgerAllows('diego.lenz@h2oinnovation.com.py', ledger, OWNER), OWNER);
assert.equal(ledgerAllows('DIEGO.LENZ@H2OINNOVATION.COM.PY', ledger, OWNER), OWNER);
assert.equal(ledgerAllows('diego_lenz@hotmail.com', ledger, OWNER), 'diego_lenz@hotmail.com');
assert.equal(ledgerAllows('  DIEGO_LENZ@hotmail.com ', ledger, OWNER), 'diego_lenz@hotmail.com');

// An inactive partner no longer receives a link, even if one was already sent.
assert.equal(ledgerAllows('socio.inativo@loft.app', ledger, OWNER), null);
assert.equal(ledgerAllows('desconhecido@loft.app', ledger, OWNER), null);
assert.equal(ledgerAllows('', ledger, OWNER), null);
assert.equal(ledgerAllows(null, ledger, OWNER), null);

// Without a ledger (project not configured) only the owner passes; an owner email
// that is not configured must never match an empty address.
assert.equal(ledgerAllows('diego.lenz@h2oinnovation.com.py', null, OWNER), OWNER);
assert.equal(ledgerAllows('qualquer@loft.app', null, OWNER), null);
assert.equal(ledgerAllows('', null, ''), null);

console.log('PASS: link mágico — só é emitido e aceito para o e-mail que tem acesso.');