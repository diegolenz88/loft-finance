import assert from 'node:assert/strict';
import {DEFAULT_ITERATIONS,hashSecret,secretProblem,verifySecret,base64url,fromBase64url,sameSecret} from '../lib/passwords.ts';

// base64url round-trips without padding, so records stay URL safe in SQL.
const sample = crypto.getRandomValues(new Uint8Array(16));
assert.deepEqual(Array.from(fromBase64url(base64url(sample))), Array.from(sample));
assert.ok(!base64url(sample).includes('='));

// A secret is stored only as salt + derived hash, never in clear text.
const record = await hashSecret('obra2026segura', 2000);
assert.equal(record.iterations, 2000);
assert.ok(record.salt.length >= 20);
assert.ok(record.hash.length >= 40);
assert.ok(!JSON.stringify(record).includes('obra2026segura'));

// The same secret verifies; a wrong one, an empty one and a tampered record do not.
assert.equal(await verifySecret('obra2026segura', record), true);
assert.equal(await verifySecret('obra2026segura ', record), false);
assert.equal(await verifySecret('Obra2026segura', record), false);
assert.equal(await verifySecret('', record), false);
assert.equal(await verifySecret('obra2026segura', {...record, hash: record.hash.replace(/^./, 'A')}), false);
assert.equal(await verifySecret('obra2026segura', {...record, salt: 'invalido'}), false);
assert.equal(await verifySecret('obra2026segura', {salt: '', hash: '', iterations: 0}), false);

// Two hashes of the same secret differ: the salt is random per record.
const second = await hashSecret('obra2026segura', 2000);
assert.notEqual(second.salt, record.salt);
assert.notEqual(second.hash, record.hash);
assert.equal(await verifySecret('obra2026segura', second), true);

// The default cost is high enough to be expensive offline but cheap online.
assert.equal(DEFAULT_ITERATIONS, 100000);

// Strength rules: length, letter and digit.
assert.match(secretProblem('curta1') ?? '', /pelo menos 8/);
assert.match(secretProblem('somenteletras') ?? '', /letra e um número/);
assert.match(secretProblem('12345678') ?? '', /letra e um número/);
assert.equal(secretProblem('obra2026'), null);
assert.equal(secretProblem(''), secretProblem('curta1'));
assert.match(secretProblem('a1'.repeat(120)) ?? '', /muito longa/);

// Bootstrap secret comparison is constant-time and rejects missing values.
assert.equal(sameSecret('senha-mestra', 'senha-mestra'), true);
assert.equal(sameSecret('senha-mestra', 'senha-mestrd'), false);
assert.equal(sameSecret('senha', 'senha-mestra'), false);
assert.equal(sameSecret('', undefined), false);

console.log('PASS: senhas por sócio — hash PBKDF2 com sal, verificação, força mínima e comparação do segredo mestre.');
