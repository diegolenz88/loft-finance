import assert from 'node:assert/strict';
import {
  budgetByUnit,
  budgetLineRateio,
  budgetRateio,
  budgetSet,
  budgetUnitRateio,
  demoLedger,
  emptyLedger,
  sum,
  unitBudgetShares,
} from '../lib/finance.ts';

const base = emptyLedger(demoLedger().config).config;
const units = base.units;
const common = units[0];
const studios = units.slice(1);
const [first, second] = base.categories;
const stage = base.stages[0];
const total = c => sum(Object.values(budgetByUnit(c)));
const only = (c, id) => ({...c, budgets: c.budgets.filter(b => b.id === id)});

const config = {
  ...base,
  budgets: [
    {id: 'a', category: first, stage, amount: 1_000_00},
    {id: 'b', category: second, stage, amount: 2_000_00},
  ],
  budgetUnits: undefined,
};

// Baseline: both lines follow the project default.
const plain = budgetByUnit(config);
assert.equal(total(config), 3_000_00);
assert.deepEqual(plain, budgetByUnit({...config, budgets: config.budgets}));
const bAlone = budgetByUnit(only(config, 'b'));
const aAlone = budgetByUnit(only(config, 'a'));
assert.equal(plain[common], aAlone[common] + bAlone[common]);

// Aiming line A at the common areas must not change line B at all.
const commonOnly = Object.fromEntries(units.map(u => [u, u === common ? 100 : 0]));
const aimed = budgetLineRateio(config, 'a', commonOnly);
const aimedTotals = budgetByUnit(aimed);
assert.equal(aimedTotals[common], 1_000_00 + bAlone[common], 'áreas comuns recebem toda a linha A mais a parte padrão da linha B');
assert.equal(total(aimed), 3_000_00, 'o total do orçamento não pode mudar');
assert.deepEqual(budgetByUnit(only(aimed, 'b')), bAlone, 'a linha B precisa ficar exatamente igual');

// A second line can be aimed at a studio, independently of the first.
const studioOnly = Object.fromEntries(units.map(u => [u, u === studios[0] ? 100 : 0]));
const independent = budgetLineRateio(aimed, 'b', studioOnly);
const independentTotals = budgetByUnit(independent);
assert.equal(independentTotals[common], 1_000_00, 'áreas comuns mantém apenas a linha A');
assert.equal(independentTotals[studios[0]], 2_000_00, 'a linha B vai inteira para o studio escolhido');
assert.equal(total(independent), 3_000_00);

// The project default is untouched by per-line changes.
assert.deepEqual(unitBudgetShares(independent), unitBudgetShares(config));

// Clearing a line puts it back on the project default.
const cleared = budgetLineRateio(independent, 'a', null);
assert.equal(cleared.budgets.find(b => b.id === 'a').units, undefined);
assert.deepEqual(budgetByUnit(only(cleared, 'a')), aAlone);
assert.equal(budgetByUnit(cleared)[studios[0]], 2_000_00 + aAlone[studios[0]]);

// Changing the global default only affects lines without their own split.
const globalChanged = budgetUnitRateio(independent, studioOnly);
const globalTotals = budgetByUnit(globalChanged);
assert.equal(globalTotals[common], 1_000_00, 'a linha A mantém o rateio próprio');
assert.equal(globalTotals[studios[0]], 2_000_00, 'a linha B também mantém o próprio');
const newLine = {...globalChanged, budgets: [...globalChanged.budgets, {id: 'c', category: first, stage, amount: 500_00}]};
assert.equal(budgetByUnit(newLine)[studios[0]], 2_500_00, 'uma linha nova segue o padrão atualizado');

// Validation rejects a bad split and an unknown line, without mutating input.
const frozen = JSON.stringify(config);
assert.throws(() => budgetLineRateio(config, 'a', {[common]: 50}), /100%/);
assert.throws(() => budgetLineRateio(config, 'inexistente', studioOnly), /não encontrada/);
assert.throws(() => budgetLineRateio(config, 'a', {...studioOnly, 'Loft 99': 0}), /inválida/);
assert.throws(() => budgetLineRateio(config, '', studioOnly), /Selecione a linha/);
assert.equal(JSON.stringify(config), frozen);

// budgetSet keeps the line's own split when only the amount changes.
const raised = budgetSet(independent, first, stage, 1_500_00);
assert.deepEqual(raised.budgets.find(b => b.id === 'a').units, independent.budgets.find(b => b.id === 'a').units);
assert.equal(budgetByUnit(raised)[common], 1_500_00);

// Redistributing a stage by category keeps the split of lines that survive.
const shares = Object.fromEntries(base.categories.map(c => [c, c === first ? 50 : c === second ? 50 : 0]));
const redistributed = budgetRateio(independent, stage, 4_000_00, shares);
assert.deepEqual(redistributed.budgets.find(b => b.category === first).units, independent.budgets.find(b => b.category === first).units);
assert.deepEqual(redistributed.budgets.find(b => b.category === second).units, independent.budgets.find(b => b.category === second).units);
assert.equal(total(redistributed), 4_000_00);

console.log('PASS: rateio por unidade individual — cada linha do orçamento tem o seu, sem alterar as demais.');
