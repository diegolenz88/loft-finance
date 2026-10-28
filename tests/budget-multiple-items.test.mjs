import assert from 'node:assert/strict';
import {
  apply,
  budgetRemoveLine,
  budgetRows,
  budgetSetLine,
  demoLedger,
  emptyLedger,
  entryBudgetLine,
  sum,
} from '../lib/finance.ts';

const base = emptyLedger(demoLedger().config).config;
const [category] = base.categories;
const [, otherCategory] = base.categories;
const stage = base.stages[0];

// Two items in the same category and stage, told apart by the description.
let config = {...base, budgets: []};
config = budgetSetLine(config, {category, stage, amount: 500_00, description: 'Portas'});
config = budgetSetLine(config, {category, stage, amount: 700_00, description: 'Janelas'});
assert.equal(config.budgets.length, 2, 'as duas linhas devem coexistir');
assert.deepEqual(config.budgets.map(b => b.description), ['Portas', 'Janelas']);
assert.ok(config.budgets[0].id !== config.budgets[1].id, 'cada linha tem id próprio');
assert.equal(sum(config.budgets.map(b => b.amount)), 1_200_00);

// Editing one line keeps the other untouched.
const doors = config.budgets[0];
const edited = budgetSetLine(config, {id: doors.id, category, stage, amount: 550_00, description: 'Portas de correr'});
assert.equal(edited.budgets.find(b => b.id === doors.id).amount, 550_00);
assert.equal(edited.budgets.find(b => b.id === doors.id).description, 'Portas de correr');
assert.deepEqual(edited.budgets.find(b => b.id !== doors.id), config.budgets[1]);

// A different category is a different line even with the same amount.
const mixed = budgetSetLine(edited, {category: otherCategory, stage, amount: 300_00, description: 'Portas'});
assert.equal(mixed.budgets.length, 3);

// Zero on an existing line removes only that line.
const removed = budgetSetLine(mixed, {id: doors.id, category, stage, amount: 0, description: 'x'});
assert.equal(removed.budgets.length, 2);
assert.ok(!removed.budgets.some(b => b.id === doors.id));

// Removing by id is explicit and refuses unknown ids.
assert.throws(() => budgetRemoveLine(mixed, 'nao-existe'), /não encontrada/);
assert.throws(() => budgetRemoveLine(mixed, ''), /Selecione a linha/);
const removedById = budgetRemoveLine(mixed, mixed.budgets[0].id);
assert.equal(removedById.budgets.length, 2);

// The per-unit split survives an amount edit, and a new line starts without one.
const withUnits = {...config};
withUnits.budgets = withUnits.budgets.map((b, i) => i === 0 ? {...b, units: Object.fromEntries(base.units.map(u => [u, u === base.units[0] ? 100 : 0]))} : b);
const resized = budgetSetLine(withUnits, {id: withUnits.budgets[0].id, category, stage, amount: 900_00, description: 'Portas'});
assert.deepEqual(resized.budgets.find(b => b.id === withUnits.budgets[0].id).units, withUnits.budgets[0].units);
assert.equal(resized.budgets.find(b => b.id === withUnits.budgets[1].id).units, undefined);

// Validation rejects invalid entries and never mutates the input.
const frozen = JSON.stringify(config);
assert.throws(() => budgetSetLine(config, {category: 'inexistente', stage, amount: 1}), /Categoria ou etapa/);
assert.throws(() => budgetSetLine(config, {category, stage, amount: -1}), /valor válido/);
assert.throws(() => budgetSetLine(config, {category, stage, amount: 1_00, description: 'x'.repeat(400)}), /muito longa/);
assert.throws(() => budgetSetLine(config, {id: 'zzz', category, stage, amount: 10}), /não encontrada/);
assert.equal(JSON.stringify(config), frozen);

// Rows: one per line, so the two items of the same pair show separately.
let ledger = {...demoLedger(), entries: [], moves: [], audit: []};
ledger.config = {...ledger.config, budgets: config.budgets};
const rows = budgetRows(ledger);
assert.equal(rows.length, 2);
assert.deepEqual(rows.map(r => r.description), ['Portas', 'Janelas']);
assert.equal(sum(rows.map(r => r.budget)), 1_200_00);

// An expense linked to a line counts only for that line.
const expense = {
  id: 'e1', kind: 'expense', description: 'Portas instaladas', party: '', document: '',
  category, stage, units: {[base.units[1]]: 100}, amount: 200_00, fees: 0, date: '2026-01-10',
  due: '2026-02-10', note: '', planned: false, cancelled: false,
  shares: config.rules.at(-1).cost, ruleId: config.rules.at(-1).id, base: 'net', reserve: 0,
  exception: '', attachments: [], budgetId: config.budgets[0].id,
};
ledger = {...ledger, entries: [expense]};
const withEntry = budgetRows(ledger);
assert.equal(withEntry[0].contracted, 200_00);
assert.equal(withEntry[1].contracted, 0);
assert.equal(withEntry.length, 2, 'não deve criar linha extra para despesa vinculada');

// An expense from the same pair but without a link is ambiguous, so it goes to a
// separate row instead of being folded into one of the items.
const unlinked = {...expense, id: 'e2', budgetId: '', description: 'Outro item'};
const ambiguous = budgetRows({...ledger, entries: [expense, unlinked]});
assert.equal(ambiguous.length, 3, 'a despesa sem vínculo precisa de linha própria');
const extra = ambiguous.find(r => !r.lineId);
assert.equal(extra.contracted, 200_00);
assert.equal(extra.category, category);

// With only ONE line for the pair, an unlinked expense still matches it — the
// previous behaviour is preserved for existing data.
const single = {...ledger.config, budgets: [config.budgets[0]]};
const singleRows = budgetRows({...ledger, config: single, entries: [{...unlinked, budgetId: ''}]});
assert.equal(singleRows.length, 1);
assert.equal(singleRows[0].contracted, 200_00);

// entryBudgetLine never picks an arbitrary line when the pair is ambiguous and
// the description does not match.
assert.equal(entryBudgetLine(config, {category, stage, description: 'Outro'}), undefined);
assert.equal(entryBudgetLine(config, {category, stage, description: 'Portas'}).id, config.budgets[0].id);
assert.equal(entryBudgetLine(config, {category, stage, budgetId: config.budgets[1].id}).id, config.budgets[1].id);

// The whole flow survives `apply`, so the server accepts multiple same-pair lines.
const action = {id: crypto.randomUUID(), type: 'config', data: mixed};
const stored = apply({...demoLedger(), entries: [], moves: [], audit: []}, action, 'teste', true);
assert.equal(stored.config.budgets.filter(b => b.category === category && b.stage === stage).length, 2);

console.log('PASS: orçamento com vários itens por categoria e etapa, cada um com o seu rateio e valor.');
