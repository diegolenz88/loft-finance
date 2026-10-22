import assert from 'node:assert/strict';
import {apply,demoLedger,emptyLedger,entryBudget,entryBudgetLine,metrics} from '../lib/finance.ts';

const base=emptyLedger(demoLedger().config).config;
const [catA,catB]=base.categories;
const [stageA,stageB]=base.stages;
const config={...base,budgets:[
 {id:'b1',category:catA,stage:stageA,amount:100000,description:'Estrutura'},
 {id:'b2',category:catB,stage:stageB,amount:50000},
]};

const ledger={config,entries:[],moves:[],audit:[]};

const entry=(over={})=>({
 kind:'expense',description:'Compra de chassi',party:'',document:'',
 category:catA,stage:stageA,units:{[config.units[0]]:100},amount:10000,fees:0,
 date:'2026-01-10',due:'2026-02-10',note:'',planned:false,cancelled:false,
 exception:'',attachments:[],...over,
});

// Linking an expense to a concrete budget line persists the budget id.
const linked=apply(ledger,{id:'a1',type:'entry',data:entry({id:undefined,budgetId:'b1'})},'admin@test');
assert.equal(linked.entries.length,1);
assert.equal(linked.entries[0].budgetId,'b1');
assert.equal(entryBudget(linked.config,linked.entries[0]).id,'b1');

// Linking a revenue to a budget is allowed as well.
const revenue=apply(linked,{id:'a2',type:'entry',data:entry({kind:'revenue',budgetId:'b2',category:catB,stage:stageB})},'admin@test');
assert.equal(revenue.entries.length,2);
assert.equal(revenue.entries[1].budgetId,'b2');
assert.equal(entryBudget(revenue.config,revenue.entries[1]).category,catB);

// An unknown budget id is rejected instead of being silently stored.
assert.throws(()=>apply(ledger,{id:'a3',type:'entry',data:entry({budgetId:'missing'})},'admin@test'),/Orçamento vinculado não encontrado/);

// Without a link the legacy category/stage pairing resolves the budget line.
const plain=apply(ledger,{id:'a4',type:'entry',data:entry()},'admin@test');
assert.equal(plain.entries[0].budgetId,undefined);
assert.equal(entryBudget(plain.config,plain.entries[0]),undefined);
assert.equal(entryBudgetLine(plain.config,plain.entries[0]).id,'b1');

// A link to another category/stage wins over the entry's own category/stage.
const cross=apply(ledger,{id:'a5',type:'entry',data:entry({budgetId:'b2'})},'admin@test');
assert.equal(entryBudgetLine(cross.config,cross.entries[0]).id,'b2');

// Editing keeps the link, and clearing it restores the category/stage fallback.
const edited=apply(linked,{id:'a6',type:'entry',data:{...linked.entries[0],budgetId:'b2'}},'admin@test');
assert.equal(edited.entries[0].budgetId,'b2');
const cleared=apply(edited,{id:'a7',type:'entry',data:{...edited.entries[0],budgetId:undefined}},'admin@test');
assert.equal(cleared.entries[0].budgetId,undefined);
assert.equal(entryBudgetLine(cleared.config,cleared.entries[0]).id,'b1');

// A removed budget line must not break the entry: it falls back to category/stage.
const orphan={...cleared.config,budgets:cleared.config.budgets.filter(b=>b.id!=='b1')};
assert.equal(entryBudget(orphan,cleared.entries[0]),undefined);
assert.equal(entryBudgetLine(orphan,cleared.entries[0]),undefined);

// Totals are unchanged by the link (the budget is a view, not a new movement).
assert.equal(metrics(linked).contracted,10000);

console.log('budget-link: ok');
