import assert from 'node:assert/strict';
import {budgetUnitRateio,unitBudgetShares,budgetByUnit,equalShares,demoLedger,emptyLedger,metrics,sum} from '../lib/finance.ts';

const base=emptyLedger(demoLedger().config).config;
const units=base.units;
const noBudget={...base,budgets:[]};
const ledger=c=>({config:c,entries:[],moves:[],audit:[]});
const total=c=>sum(c.budgets.map(b=>b.amount));

// The demo fixture already carries a budget, so the shared total is not zero.
assert.equal(total(base),100000000);

// Default distribution is an equal split that always closes at exactly 100%.
const equal=unitBudgetShares(base);
assert.deepEqual(equal,equalShares(units));
assert.equal(Math.round(sum(Object.values(equal))*100),10000);
assert.equal(Object.keys(equal).length,units.length);

// With no budget defined every unit is zero, and nothing is invented.
assert.deepEqual(budgetByUnit(noBudget),Object.fromEntries(units.map(u=>[u,0])));
assert.equal(sum(Object.values(budgetByUnit(noBudget))),0);

// The per-unit budget always adds up to the approved budget, in exact cents,
// for odd totals as well as for the default and custom distributions.
for(const value of [1,7,999,10000,99999999,100000000,1000000000000]){
 const funded={...base,budgets:[{id:'x',category:base.categories[0],stage:base.stages[0],amount:value}]};
 const byUnit=budgetByUnit(funded);
 assert.equal(sum(Object.values(byUnit)),value);
 assert.equal(metrics(ledger(funded)).budget,value);
 assert.equal(Object.keys(byUnit).length,units.length);
 assert.ok(Object.values(byUnit).every(v=>Number.isSafeInteger(v)&&v>=0));
}
// Equal split across the demo units keeps every unit within one basis point
// (0.01%) of the others — the rounding that validShares enforces at 2 decimals.
const spread=Object.values(budgetByUnit(base));
assert.ok(Math.max(...spread)-Math.min(...spread)<=Math.ceil(total(base)/10000));

// A custom distribution routes exactly the intended share to each unit.
const custom=Object.fromEntries(units.map(u=>[u,0]));
custom[units[1]]=50;custom[units[2]]=30;custom[units[3]]=20;
const customCfg=budgetUnitRateio(base,custom);
assert.deepEqual(customCfg.budgetUnits,custom);
const funded=budgetUnitRateio({...base,budgets:[{id:'y',category:base.categories[0],stage:base.stages[0],amount:999999}]},custom);
const fundedByUnit=budgetByUnit(funded);
assert.equal(fundedByUnit[units[1]],499999);
assert.equal(fundedByUnit[units[2]],300000);
assert.equal(fundedByUnit[units[3]],200000);
assert.equal(fundedByUnit[units[0]],0);
assert.equal(sum(Object.values(fundedByUnit)),999999);

// Units kept at zero percent stay at zero without breaking the total.
const rest=equalShares(units.slice(2));
const zeroed=Object.fromEntries(units.map(u=>[u,rest[u]??0]));
assert.equal(Math.round(sum(Object.values(zeroed))*100),10000);
const zeroUnit=budgetByUnit(budgetUnitRateio(base,zeroed));
assert.equal(zeroUnit[units[0]],0);
assert.equal(zeroUnit[units[1]],0);
assert.equal(sum(Object.values(zeroUnit)),total(base));

// Rateio never mutates the input and never drops unrelated configuration.
const snapshot=JSON.stringify(base);
budgetUnitRateio(base,equal);
budgetUnitRateio(base,custom);
assert.equal(JSON.stringify(base),snapshot);
assert.deepEqual(budgetUnitRateio(base,equal).budgets,base.budgets);
assert.deepEqual(budgetUnitRateio(base,equal).rules,base.rules);
assert.deepEqual(budgetUnitRateio(base,equal).partners,base.partners);

// Deterministic and idempotent for the same distribution.
assert.deepEqual(budgetUnitRateio(base,equal).budgetUnits,budgetUnitRateio(base,equal).budgetUnits);
assert.deepEqual(budgetByUnit(budgetUnitRateio(base,equal)),budgetByUnit(budgetUnitRateio(base,equal)));

// Every rejection must be explicit.
for(const bad of [
 ()=>budgetUnitRateio(base,{...equal,[units[0]]:equal[units[0]]+1}),
 ()=>budgetUnitRateio(base,{...equal,'Loft 99':0}),
 ()=>budgetUnitRateio(base,Object.fromEntries(units.map(u=>[u,0]))),
 ()=>budgetUnitRateio(base,{...equal,[units[0]]:equal[units[0]]+0.001,[units[1]]:equal[units[1]]-0.001}),
 ()=>budgetUnitRateio(base,null),
 ()=>budgetUnitRateio(base,{}),
])assert.throws(bad);

console.log('PASS: rateio do orçamento entre unidades, soma exata em centavos, padrão igualitário, percentual zero preservado, determinismo, preservação da configuração e validações.');
