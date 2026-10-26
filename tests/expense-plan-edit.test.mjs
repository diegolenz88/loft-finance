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

// Partial settlement: the paid part stays as a settled entry and only the
// remaining balance becomes installments. Totals never double count.
const partial=apply(paidLedger,{
 id:'plan-3',type:'expense_plan',
 data:{expense:{...paidLedger.entries[0]},installments:2,replace:originalId},
},'admin@test');
const keptOriginal=partial.entries.find(e=>e.id===originalId);
assert.equal(keptOriginal.cancelled,false,'o original permanece ativo como parte paga');
assert.equal(keptOriginal.amount,20000,'o original fica limitado ao valor já pago');
assert.match(keptOriginal.description,/· parte paga$/);
assert.equal(paid(partial,keptOriginal),20000,'as baixas continuam vinculadas ao original');
const partialRows=partial.entries.filter(e=>e.paymentPlan?.id==='plan-3');
assert.equal(partialRows.length,2);
assert.equal(partialRows.reduce((total,row)=>total+row.amount,0),100000,'restante = 120000 - 20000');
assert.equal(partialRows[0].paymentPlan.paidBefore,20000);
assert.equal(partialRows[0].paymentPlan.total,100000);
assert.equal(metrics(partial).contracted,120000,'contratado preservado: 20000 + 100000');
assert.equal(metrics(partial).payable,100000);

// Fully paid expenses have nothing left to schedule.
const fullyPaid=apply(paidLedger,{id:'p2',type:'move',data:{type:'pay',entry:originalId,date:'2026-02-11',amount:100000,note:'Quitação',account,source:funded.moves[0].id}},'admin@test');
assert.equal(paid(fullyPaid,fullyPaid.entries[0]),120000);
assert.throws(()=>apply(fullyPaid,{
 id:'plan-3b',type:'expense_plan',
 data:{expense:{...fullyPaid.entries[0]},installments:2,replace:originalId},
},'admin@test'),/não cobre o total já pago|não há saldo a parcelar/);

// A new amount below the paid total is rejected instead of shrinking silently.
assert.throws(()=>apply(paidLedger,{
 id:'plan-3c',type:'expense_plan',
 data:{expense:{...paidLedger.entries[0],amount:15000},installments:2,replace:originalId},
},'admin@test'),/não cobre o total já pago/);

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

// Real-world case: R$ 112.000,00 contracted, R$ 70.000,00 already paid,
// so R$ 42.000,00 becomes 6 installments.
const bigLedger=apply(ledger,{id:'big-e1',type:'entry',data:{...expense({amount:11200000,due:'2026-06-10'}),id:undefined}},'admin@test');
const bigId=bigLedger.entries[0].id;
const bigFunded=apply(bigLedger,{id:'big-c1',type:'move',data:{type:'capital',partner:partnerA,account,date:'2026-01-05',amount:11200000,note:'Aporte'}},'admin@test');
const bigPaid=apply(bigFunded,{id:'big-p1',type:'move',data:{type:'pay',entry:bigId,date:'2026-03-10',amount:7000000,note:'Parcela parcial',account,source:bigFunded.moves[0].id}},'admin@test');
assert.equal(paid(bigPaid,bigPaid.entries[0]),7000000);

const bigPlan=apply(bigPaid,{
 id:'big-plan',type:'expense_plan',
 data:{expense:{...bigPaid.entries[0]},installments:6,replace:bigId},
},'admin@test');
const bigOriginal=bigPlan.entries.find(e=>e.id===bigId);
const bigRows=bigPlan.entries.filter(e=>e.paymentPlan?.id==='big-plan');
assert.equal(bigOriginal.amount,7000000,'original fica com o valor pago');
assert.equal(bigRows.length,6);
assert.equal(bigRows.reduce((total,row)=>total+row.amount,0),4200000,'saldo de 42000 em 6 parcelas');
assert.equal(bigRows[0].amount,700000,'6 x 700,00 sem resto');
assert.equal(metrics(bigPlan).contracted,11200000,'contratado inalterado');
assert.equal(metrics(bigPlan).payable,4200000,'a pagar = saldo restante');
assert.equal(metrics(bigPlan).accounts[account],11200000-7000000,'caixa reflete apenas o pagamento efetivo');

// No down payment: the whole balance is split into equal installments.
// Case A — a R$ 70.000,00 expense in 10x with nothing paid.
const seventy=apply(ledger,{id:'n70-e1',type:'entry',data:{...expense({amount:7000000,due:'2026-11-10'}),id:undefined}},'admin@test');
const seventyId=seventy.entries[0].id;
const seventyPlan=apply(seventy,{
 id:'n70-plan',type:'expense_plan',
 data:{expense:{...seventy.entries[0]},installments:10,replace:seventyId},
},'admin@test');
const seventyRows=seventyPlan.entries.filter(e=>e.paymentPlan?.id==='n70-plan');
assert.equal(seventyRows.length,10,'10 parcelas sem entrada');
assert.equal(seventyRows.reduce((total,row)=>total+row.amount,0),7000000);
assert.ok(seventyRows.every(row=>row.amount===700000),'10 x R$ 7.000,00 iguais');
assert.ok(seventyRows.every(row=>row.paymentPlan.kind==='installment'),'nenhuma linha de entrada');
assert.equal(seventyPlan.entries.every(e=>e.paymentPlan?.downPayment!==undefined?e.paymentPlan.downPayment===0:true),true);

// Case B — R$ 112.000,00 with R$ 70.000,00 paid: only the R$ 42.000,00
// balance is split in 10x without a new down payment.
const balancePlan=apply(bigPaid,{
 id:'n42-plan',type:'expense_plan',
 data:{expense:{...bigPaid.entries[0]},installments:10,replace:bigId},
},'admin@test');
const balanceRows=balancePlan.entries.filter(e=>e.paymentPlan?.id==='n42-plan');
assert.equal(balanceRows.length,10);
assert.equal(balanceRows.reduce((total,row)=>total+row.amount,0),4200000,'70000 pagos + 42000 parcelados');
assert.deepEqual([...new Set(balanceRows.map(row=>row.amount))],[420000],'todas as 10 parcelas com R$ 4.200,00');
assert.ok(balanceRows.every(row=>row.paymentPlan.kind==='installment'),'sem entrada');
assert.equal(metrics(balancePlan).contracted,11200000,'contratado preservado');

// Installments must remain whole cents even when the balance does not divide.
const odd=apply(ledger,{id:'odd-e1',type:'entry',data:{...expense({amount:100000,due:'2026-11-10'}),id:undefined}},'admin@test');
const oddPlan=apply(odd,{
 id:'odd-plan',type:'expense_plan',
 data:{expense:{...odd.entries[0]},installments:3,replace:odd.entries[0].id},
},'admin@test');
const oddRows=oddPlan.entries.filter(e=>e.paymentPlan?.id==='odd-plan');
assert.equal(oddRows.reduce((total,row)=>total+row.amount,0),100000,'soma exata');
assert.deepEqual(oddRows.map(row=>row.amount),[33334,33333,33333],'resto vai para a primeira parcela');

// Funding allocation: a plan can be tied to a contribution lot, so each
// installment already records which resource is expected to settle it.
const fundedLedger=apply(ledger,{id:'f-e1',type:'entry',data:{...expense({amount:7000000,due:'2026-11-10'}),id:undefined}},'admin@test');
const fundedId=fundedLedger.entries[0].id;
const withLot=apply(fundedLedger,{id:'f-c1',type:'move',data:{type:'capital',partner:partnerA,account,date:'2026-10-01',amount:7000000,note:'Aporte para a compra'}},'admin@test');
const lotId=withLot.moves[0].id;

const allocated=apply(withLot,{
 id:'f-plan',type:'expense_plan',
 data:{expense:{...withLot.entries[0]},installments:10,replace:fundedId,funding:lotId},
},'admin@test');
const allocatedRows=allocated.entries.filter(e=>e.paymentPlan?.id==='f-plan');
assert.equal(allocatedRows.length,10);
assert.ok(allocatedRows.every(row=>row.plannedSource===lotId),'todas as parcelas apontam para o aporte');
assert.ok(allocatedRows.every(row=>row.paymentPlan.funding===lotId));
assert.equal(allocated.moves.length,withLot.moves.length,'a alocação não cria pagamentos sozinha');
assert.equal(metrics(allocated).lots[lotId],7000000,'o saldo do aporte não é consumido no planejamento');

// Paying an installment from that lot consumes only that installment.
const firstInstallment=allocatedRows[0];
const paidOne=apply(allocated,{id:'f-p1',type:'move',data:{type:'pay',entry:firstInstallment.id,date:'2026-10-25',amount:firstInstallment.amount,note:'Parcela 1',account,source:lotId}},'admin@test');
assert.equal(metrics(paidOne).lots[lotId],7000000-firstInstallment.amount);
assert.equal(paid(paidOne,paidOne.entries.find(e=>e.id===firstInstallment.id)),700000);

// Direct partner payment and project cash are also valid sources.
const direct=apply(withLot,{
 id:'f-plan-2',type:'expense_plan',
 data:{expense:{...withLot.entries[0]},installments:2,replace:fundedId,funding:`direct:${partnerA}:capital`},
},'admin@test');
assert.equal(direct.entries.find(e=>e.paymentPlan?.id==='f-plan-2').plannedSource,`direct:${partnerA}:capital`);

// Unknown or invalid sources are rejected instead of storing a dangling link.
assert.throws(()=>apply(withLot,{
 id:'f-plan-3',type:'expense_plan',
 data:{expense:{...withLot.entries[0]},installments:2,replace:fundedId,funding:'aporte-inexistente'},
},'admin@test'),/Aporte ou adiantamento não encontrado/);
assert.throws(()=>apply(withLot,{
 id:'f-plan-4',type:'expense_plan',
 data:{expense:{...withLot.entries[0]},installments:2,replace:fundedId,funding:'direct:ninguem:capital'},
},'admin@test'),/Fonte de pagamento inválida/);

// A plain expense can carry the planned source without being parceled.
const planned=apply(withLot,{id:'f-e2',type:'entry',data:{...withLot.entries[0],plannedSource:lotId}},'admin@test');
assert.equal(planned.entries.find(e=>e.id===fundedId).plannedSource,lotId);
assert.throws(()=>apply(withLot,{id:'f-e3',type:'entry',data:{...withLot.entries[0],plannedSource:'nao-existe'}},'admin@test'),/Aporte ou adiantamento não encontrado/);
// Clearing the field removes the link.
const cleared=apply(planned,{id:'f-e4',type:'entry',data:{...planned.entries.find(e=>e.id===fundedId),plannedSource:undefined}},'admin@test');
assert.equal(cleared.entries.find(e=>e.id===fundedId).plannedSource,undefined);

console.log('PASS: conversão de despesa em entrada + parcelas, vínculos de comprovante, restrições de baixa, plano existente e cancelamento.');
