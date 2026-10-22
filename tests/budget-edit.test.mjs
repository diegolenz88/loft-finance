import assert from 'node:assert/strict';
import {budgetSet,budgetRemove,demoLedger,emptyLedger,metrics,sum} from '../lib/finance.ts';

const base=emptyLedger(demoLedger().config).config;
const categories=base.categories;
const stages=base.stages;
const ledger=c=>({config:c,entries:[],moves:[],audit:[]});
const total=c=>sum(c.budgets.map(b=>b.amount));
const find=(c,cat,stage)=>c.budgets.find(b=>b.category===cat&&b.stage===stage);
const seed={...base,budgets:[
 {id:'b1',category:categories[0],stage:stages[0],amount:5000,description:'Original'},
 {id:'b2',category:categories[1],stage:stages[1],amount:7000},
]};

// Editing an existing line updates the same row instead of appending a new one.
const upper=budgetSet(seed,categories[0],stages[0],9000,'Revisado');
assert.equal(upper.budgets.length,2);
assert.equal(find(upper,categories[0],stages[0]).id,'b1');
assert.equal(find(upper,categories[0],stages[0]).amount,9000);
assert.equal(find(upper,categories[0],stages[0]).description,'Revisado');
assert.equal(total(upper),16000);
assert.equal(metrics(ledger(upper)).budget,16000);

// The description is replaced as a whole and can be cleared.
assert.equal(find(budgetSet(seed,categories[0],stages[0],5000),categories[0],stages[0]).description,undefined);
assert.equal(find(budgetSet(seed,categories[0],stages[0],5000,'  '),categories[0],stages[0]).description,'  ');

// Adding a new combination appends a row without touching the others.
const added=budgetSet(seed,categories[2],stages[2],1500,'Nova linha');
assert.equal(added.budgets.length,3);
assert.equal(find(added,categories[2],stages[2]).amount,1500);
assert.equal(find(added,categories[2],stages[2]).description,'Nova linha');
assert.equal(find(added,categories[0],stages[0]).description,'Original');
assert.equal(total(added),13500);

// Zero removes the line entirely — no R$ 0,00 row is left behind.
const zeroed=budgetSet(seed,categories[0],stages[0],0);
assert.equal(zeroed.budgets.length,1);
assert.equal(find(zeroed,categories[0],stages[0]),undefined);
assert.equal(find(zeroed,categories[1],stages[1]).amount,7000);
assert.equal(total(zeroed),7000);
assert.throws(()=>budgetSet(seed,categories[5],stages[5],0),/remover/);

// budgetRemove deletes a row and reports when there is nothing to delete.
const removed=budgetRemove(seed,categories[1],stages[1]);
assert.equal(removed.budgets.length,1);
assert.equal(find(removed,categories[1],stages[1]),undefined);
assert.equal(total(removed),5000);
assert.throws(()=>budgetRemove(seed,categories[5],stages[5]),/remover/);
assert.throws(()=>budgetRemove(seed,categories[0],stages[9]),/etapa inválida/i);

// Editing and removing never mutate the input configuration.
const snapshot=JSON.stringify(seed);
budgetSet(seed,categories[0],stages[0],1);
budgetRemove(seed,categories[0],stages[0]);
assert.equal(JSON.stringify(seed),snapshot);

// Round trip: edit down to zero and readd restores an equivalent row.
const step1=budgetSet(seed,categories[0],stages[0],12345,'Nova');
const step2=budgetSet(step1,categories[0],stages[0],0);
const step3=budgetSet(step2,categories[0],stages[0],12345,'Nova');
assert.equal(step3.budgets.length,2);
assert.equal(total(step3),12345+7000);
assert.equal(find(step3,categories[0],stages[0]).description,'Nova');

// Every rejection must be explicit.
for(const bad of [
 ()=>budgetSet(seed,'Categoria fantasma',stages[0],100),
 ()=>budgetSet(seed,categories[0],'Etapa fantasma',100),
 ()=>budgetSet(seed,categories[0],stages[0],-1),
 ()=>budgetSet(seed,categories[0],stages[0],10.5),
 ()=>budgetSet(seed,categories[0],stages[0],100,'x'.repeat(301)),
 ()=>budgetSet(seed,categories[0],stages[0],100,7),
 ()=>budgetRemove(seed,'Categoria fantasma',stages[0]),
 ()=>budgetRemove(seed,categories[0],'Etapa fantasma'),
])assert.throws(bad);

console.log('PASS: edição do orçamento — atualiza a mesma linha, remove com zero, adiciona combinação nova, preserva as demais, sem mutar a entrada e validações.');
