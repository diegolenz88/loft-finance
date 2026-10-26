import assert from 'node:assert/strict';
import {apply,demoLedger,emptyLedger,metrics,paymentSchedule,paid} from '../lib/finance.ts';

const base=emptyLedger(demoLedger().config).config;
const [catA]=base.categories;
const [stageA]=base.stages;
const account=base.accounts[0];
const partnerA=base.partners[0].id;
const unit=base.units[0];

const ledger={config:base,entries:[],moves:[],audit:[]};

const expense=(over={})=>({
 kind:'expense',description:'Chassi modular',party:'Fábrica',document:'NF 1',
 category:catA,stage:stageA,units:{[unit]:100},amount:120000,fees:0,
 date:'2026-01-10',due:'2026-03-10',note:'',planned:false,cancelled:false,
 exception:'',attachments:[],...over,
});

const created=apply(ledger,{id:'e1',type:'entry',data:{...expense(),id:undefined}},'admin@test');
const originalId=created.entries[0].id;
assert.equal(created.entries[0].amount,120000);

// Attachments are added by their own action, like the upload route does.
const withFile=apply(created,{id:'a1',type:'attachment',data:{entry:originalId,file:{id:'file-1',name:'orcamento.pdf'}}},'admin@test');
assert.equal(withFile.entries[0].attachments.length,1);

// Converting an unpaid expense replaces it with entrada + installments.
const converted=apply(withFile,{
 id:'plan-1',type:'expense_plan',
 data:{expense:{...withFile.entries[0]},installments:3,downPayment:30000,downPaymentDue:'2026-02-10',replace:originalId},
},'admin@test');

const original=converted.entries.find(e=>e.id===originalId);
assert.ok(original,'o lançamento original deve continuar no histórico');
assert.equal(original.cancelled,true,'o original deve ser cancelado, não apagado');

const rows=converted.entries.filter(e=>e.paymentPlan?.id==='plan-1');
assert.equal(rows.length,4,'entrada + 3 parcelas');
assert.ok(rows.some(r=>r.paymentPlan.kind==='downPayment'));
assert.equal(rows.reduce((total,row)=>total+row.amount,0),120000,'a soma deve igualar o total');
assert.ok(rows.every(r=>r.paymentPlan.total===120000));

// The schedule matches the shared helper, so both paths stay consistent.
const expected=paymentSchedule(120000,3,'2026-03-10',30000,'2026-02-10');
assert.deepEqual(rows.map(r=>({kind:r.paymentPlan.kind,position:r.paymentPlan.position,amount:r.amount,due:r.due})),expected);

// Receipts follow the first row instead of being lost with the cancelled entry.
const first=rows.find(r=>r.paymentPlan.kind==='downPayment');
assert.equal(first.attachments.length,1);
assert.equal(first.attachments[0].id,'file-1');

// Cancelled entries do not affect the totals.
assert.equal(metrics(converted).contracted,120000,'as parcelas substituem o valor cancelado');

// The audit records the replacement and names the original.
const audit=converted.audit.find(item=>item.id==='plan-1');
assert.match(audit.description,/substituiu Chassi modular/);

// Without a down payment the whole amount is split across installments.
const plain=apply(withFile,{
 id:'plan-2',type:'expense_plan',
 data:{expense:{...created.entries[0]},installments:2,replace:originalId},
},'admin@test');
const plainRows=plain.entries.filter(e=>e.paymentPlan?.id==='plan-2');
assert.equal(plainRows.length,2);
assert.equal(plainRows.reduce((total,row)=>total+row.amount,0),120000);

// A settled expense cannot be converted: the money would lose its reference.
const funded=apply(created,{id:'c1',type:'move',data:{type:'capital',partner:partnerA,account,date:'2026-01-05',amount:500000,note:'Aporte'}},'admin@test');
const paidLedger=apply(funded,{id:'p1',type:'move',data:{type:'pay',entry:originalId,date:'2026-02-10',amount:20000,note:'Sinal',account,source:funded.moves[0].id}},'admin@test');
assert.equal(paid(paidLedger,paidLedger.entries[0]),20000);
assert.throws(()=>apply(paidLedger,{
 id:'plan-3',type:'expense_plan',
 data:{expense:{...paidLedger.entries[0]},installments:2,replace:originalId},
},'admin@test'),/Estorne as baixas antes de parcelar/);

// An installment of an existing plan cannot be converted again.
assert.throws(()=>apply(converted,{
 id:'plan-4',type:'expense_plan',
 data:{expense:{...rows[1]},installments:2,replace:rows[1].id},
},'admin@test'),/já faz parte de um parcelamento/);

// Cancelled entries are excluded as well.
const cancelled=apply(created,{id:'x1',type:'cancel',data:{entry:originalId,note:'Duplicidade'}},'admin@test');
assert.throws(()=>apply(cancelled,{
 id:'plan-5',type:'expense_plan',
 data:{expense:{...cancelled.entries[0]},installments:2,replace:originalId},
},'admin@test'),/cancelado não pode ser parcelado/);

// Unknown ids are rejected instead of silently creating a plan.
assert.throws(()=>apply(created,{
 id:'plan-6',type:'expense_plan',
 data:{expense:{...created.entries[0]},installments:2,replace:'missing'},
},'admin@test'),/Lançamento não encontrado/);

// Creating a plan from scratch still requires a new expense.
assert.throws(()=>apply(created,{
 id:'plan-7',type:'expense_plan',
 data:{expense:{...created.entries[0]},installments:2},
},'admin@test'),/criado como uma nova despesa/);

// The API guard rejects a schedule that does not fit the total.
assert.throws(()=>apply(withFile,{
 id:'plan-8',type:'expense_plan',
 data:{expense:{...created.entries[0]},installments:3,downPayment:120000,downPaymentDue:'2026-02-10',replace:originalId},
},'admin@test'),/entrada deve ser menor que o valor total/);

// Idempotency: replaying the same action id does not duplicate the plan.
const replayed=apply(converted,{
 id:'plan-1',type:'expense_plan',
 data:{expense:{...created.entries[0]},installments:3,downPayment:30000,downPaymentDue:'2026-02-10',replace:originalId},
},'admin@test');
assert.equal(replayed.entries.length,converted.entries.length);

console.log('PASS: conversão de despesa em entrada + parcelas, vínculos de comprovante, restrições de baixa, plano existente e cancelamento.');
