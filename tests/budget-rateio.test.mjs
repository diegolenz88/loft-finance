import assert from 'node:assert/strict';
import {budgetRateio,equalShares,demoLedger,emptyLedger,metrics,sum} from '../lib/finance.ts';

const base=emptyLedger(demoLedger().config).config;
const categories=base.categories;
const stages=base.stages;
const stage=stages[2];
const total=100000000;
const ledger=c=>({config:c,entries:[],moves:[],audit:[]});
const stageRows=(c,s=stage)=>c.budgets.filter(b=>b.stage===s);
const others=(c)=>sum(c.budgets.filter(b=>b.stage!==stage).map(b=>b.amount));

// Equal split always sums to exactly 100% with at most two decimals.
for(const n of [1,2,3,7,15,16,100]){
 const items=Array.from({length:n},(_,i)=>'item-'+i);
 const shares=equalShares(items);
 assert.equal(Math.round(sum(Object.values(shares))*100),10000);
 assert.ok(Object.values(shares).every(v=>Number.isFinite(v)&&v>=0&&v<=100&&Math.abs(v*100-Math.round(v*100))<1e-7));
}
assert.throws(()=>equalShares([]));

// Rateio replaces only the chosen stage and preserves every other row.
const equal=equalShares(categories);
const rateado=budgetRateio(base,stage,total,equal);
assert.equal(stageRows(rateado).length,categories.length);
assert.equal(sum(stageRows(rateado).map(b=>b.amount)),total);
assert.equal(others(rateado),others(base));
assert.equal(metrics(ledger(rateado)).budget,others(base)+total);
assert.ok(rateado.budgets.every(b=>Number.isSafeInteger(b.amount)&&b.amount>0));
assert.deepEqual(stageRows(rateado).map(b=>b.category),categories);

// Deterministic: the same inputs always produce the same amounts.
assert.deepEqual(budgetRateio(base,stage,total,equal).budgets.map(b=>b.amount),rateado.budgets.map(b=>b.amount));

// Reapplying a smaller total overwrites the stage instead of accumulating.
const again=budgetRateio(rateado,stage,50000000,equal);
assert.equal(stageRows(again).length,categories.length);
assert.equal(sum(stageRows(again).map(b=>b.amount)),50000000);
assert.equal(others(again),others(rateado));
assert.equal(metrics(ledger(again)).budget,others(base)+50000000);

// replaceAll clears every stage, so a new value never carries the previous
// lançamento's rateio along with it.
const mixed=budgetRateio(base,stages[1],10000000,equal);
assert.ok(mixed.budgets.some(b=>b.stage===stage));
const replaced=budgetRateio(mixed,stage,total,equal,true);
assert.equal(sum(replaced.budgets.map(b=>b.amount)),total);
assert.equal(others(replaced),0);
assert.ok(replaced.budgets.every(b=>b.stage===stage));
assert.equal(metrics(ledger(replaced)).budget,total);
assert.equal(stageRows(replaced).length,categories.length);
assert.deepEqual(budgetRateio(mixed,stage,total,equal,true).budgets.map(b=>b.amount),replaced.budgets.map(b=>b.amount));
const mixedSnapshot=JSON.stringify(mixed);
budgetRateio(mixed,stage,total,equal,true);
assert.equal(JSON.stringify(mixed),mixedSnapshot);
// Without replaceAll the other stages are intentionally preserved.
assert.ok(others(budgetRateio(mixed,stage,total,equal))>0);

// The description travels with the rateio rows and never invents one.
const withDesc=budgetRateio(base,stage,total,equal,false,'Contrato firmado com fornecedor X');
assert.equal(stageRows(withDesc).length,categories.length);
assert.ok(stageRows(withDesc).every(b=>b.description==='Contrato firmado com fornecedor X'));
assert.equal(sum(stageRows(withDesc).map(b=>b.amount)),total);
assert.ok(stageRows(budgetRateio(base,stage,total,equal)).every(b=>b.description===undefined));
// A replaceAll rateio applies the same description to every stage.
const allDesc=budgetRateio(mixed,stage,total,equal,true,'Orçamento revisado 2026');
assert.ok(allDesc.budgets.every(b=>b.description==='Orçamento revisado 2026'));
// Existing description on an untouched stage survives a rateio elsewhere.
const carry=structuredClone(base);
carry.budgets=[{id:'k1',category:categories[0],stage:stages[4],amount:5000,description:'Manter esta nota'}];
const afterRateio=budgetRateio(carry,stage,total,equal);
assert.equal(afterRateio.budgets.find(b=>b.stage===stages[4]).description,'Manter esta nota');
// Description limits are enforced explicitly.
assert.throws(()=>budgetRateio(base,stage,total,equal,false,'x'.repeat(301)));
assert.throws(()=>budgetRateio(base,stage,total,equal,false,42));
assert.throws(()=>{const bad=structuredClone(base);bad.budgets=[{id:'k2',category:categories[0],stage:stages[0],amount:100,description:'x'.repeat(301)}];emptyLedger(bad)});
assert.throws(()=>{const bad=structuredClone(base);bad.budgets=[{id:'k3',category:categories[0],stage:stages[0],amount:100,description:7}];emptyLedger(bad)});

// Categories with no percentage do not create empty budget rows.
const custom=Object.fromEntries(categories.map(c=>[c,0]));
custom[categories[0]]=33.33;custom[categories[1]]=33.33;custom[categories[2]]=33.34;
const three=budgetRateio(base,stage,10000,custom);
assert.deepEqual(stageRows(three).map(b=>b.category),[categories[0],categories[1],categories[2]]);
assert.equal(sum(stageRows(three).map(b=>b.amount)),10000);

// Cent precision: an odd total never loses or invents cents.
for(const value of [1,7,999,10000,99999999,1000000000000]){
 const result=budgetRateio(base,stage,value,equal);
 assert.equal(sum(stageRows(result).map(b=>b.amount)),value);
}
assert.equal(stageRows(budgetRateio(base,stage,1,equal)).length,1);

// Every rejection must be explicit.
for(const bad of [
 ()=>budgetRateio(base,'Etapa inexistente',total,equal),
 ()=>budgetRateio(base,stage,0,equal),
 ()=>budgetRateio(base,stage,-1,equal),
 ()=>budgetRateio(base,stage,10.5,equal),
 ()=>budgetRateio(base,stage,total,{...equal,[categories[0]]:equal[categories[0]]+1}),
 ()=>budgetRateio(base,stage,total,{...equal,'Categoria fantasma':0}),
 ()=>budgetRateio(base,stage,total,Object.fromEntries(categories.map(c=>[c,0]))),
 ()=>budgetRateio(base,stage,total,{...equal,[categories[0]]:equal[categories[0]]+0.001,[categories[1]]:equal[categories[1]]-0.001}),
])assert.throws(bad);

// The original configuration is never mutated.
const snapshot=JSON.stringify(base);
budgetRateio(base,stage,total,equal);
assert.equal(JSON.stringify(base),snapshot);

console.log('PASS: rateio do orçamento por percentual, soma exata em centavos, substituição por etapa, preservação das demais etapas, determinismo e validações.');
