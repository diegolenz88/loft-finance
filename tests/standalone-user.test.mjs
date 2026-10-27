import assert from 'node:assert/strict';
import {ROLES,isRole,normalizeEmail,conflictsWithPartner} from '../lib/access-roles.ts';

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

console.log('PASS: usuários sem sócio — papéis aceitos, normalização de e-mail e conflito com sócio existente.');
