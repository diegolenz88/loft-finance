import assert from 'node:assert/strict';
import {apply,demoLedger,emptyLedger,metrics,paid,activeMoves} from '../lib/finance.ts';

const base=emptyLedger(demoLedger().config).config;
const [catA]=base.categories;
const [stageA]=base.stages;
const account=base.accounts[0];
const partnerA=base.partners[0].id;

const ledger={config:base,entries:[],moves:[],audit:[]};

const expense=(over={})=>({
 kind:'expense',description:'Chassi modular',party:'Fábrica',document:'NF 1',
 category:catA,stage:stageA,units:{[base.units[0]]:100},amount:100000,fees:0,
 date:'2026-01-10',due:'2026-02-10',note:'',planned:false,cancelled:false,
 exception:'',attachments:[],...over,
});

const created=apply(ledger,{id:'e1',type:'entry',data:{...expense(),id:undefined}},'admin@test');
const entryId=created.entries[0].id;
const funded=apply(created,{id:'c1',type:'move',data:{type:'capital',partner:partnerA,account,date:'2026-01-05',amount:500000,note:'Aporte inicial'}},'admin@test');
const lot=funded.moves[0].id;
const pay1=apply(funded,{id:'p1',type:'move',data:{type:'pay',entry:entryId,date:'2026-02-10',amount:40000,note:'1ª parcela',account,source:lot}},'admin@test');
assert.equal(paid(pay1,pay1.entries[0]),40000);

// Editing descriptive fields with a partial payment is allowed.
const renamed=apply(pay1,{id:'e2',type:'entry',data:{...pay1.entries[0],description:'Chassi modular revisado',note:'Escopo revisado'}},'admin@test');
assert.equal(renamed.entries[0].description,'Chassi modular revisado');
assert.equal(paid(renamed,renamed.entries[0]),40000);

// The value can grow, and may drop only until the amount already paid.
const raised=apply(renamed,{id:'e3',type:'entry',data:{...renamed.entries[0],amount:150000}},'admin@test');
assert.equal(raised.entries[0].amount,150000);
const lowered=apply(raised,{id:'e4',type:'entry',data:{...raised.entries[0],amount:40000}},'admin@test');
assert.equal(lowered.entries[0].amount,40000);
assert.throws(()=>apply(lowered,{id:'e5',type:'entry',data:{...lowered.entries[0],amount:39999}},'admin@test'),/não pode ser menor que o total já pago/);

// Units and partner split are frozen once there is a payment.
assert.throws(()=>apply(lowered,{id:'e6',type:'entry',data:{...lowered.entries[0],units:{[base.units[1]]:100}}},'admin@test'),/unidades não podem mudar/);
assert.throws(()=>apply(lowered,{id:'e7',type:'entry',data:{...lowered.entries[0],shares:{[partnerA]:100}}},'admin@test'),/rateio entre sócios não pode mudar/);

// The kind of a settled entry cannot flip between expense and revenue.
assert.throws(()=>apply(lowered,{id:'e8',type:'entry',data:{...lowered.entries[0],kind:'revenue'}},'admin@test'),/tipo de um lançamento com baixa/);

// Correcting a payment keeps its id, updates the value and the entry balance.
const paymentId=pay1.moves.find(m=>m.type==='pay').id;
const corrected=apply(pay1,{id:'m1',type:'move_edit',data:{id:paymentId,date:'2026-02-12',amount:25000,note:'parcela corrigida',account,source:lot}},'admin@test');
const move=corrected.moves.find(m=>m.type==='pay');
assert.equal(move.id,paymentId);
assert.equal(move.amount,25000);
assert.equal(move.date,'2026-02-12');
assert.equal(move.note,'parcela corrigida');
assert.equal(paid(corrected,corrected.entries[0]),25000);
assert.equal(metrics(corrected).contracted,100000);
assert.equal(corrected.moves.filter(m=>m.type==='pay').length,1);
assert.equal(metrics(corrected).cash,475000);

// A correction cannot exceed the entry balance.
assert.throws(()=>apply(pay1,{id:'m2',type:'move_edit',data:{id:paymentId,date:'2026-02-10',amount:100001,note:'',account,source:lot}},'admin@test'),/Valor superior ao saldo a pagar/);

// Future dates stay blocked on corrections, like on new movements.
assert.throws(()=>apply(pay1,{id:'m3',type:'move_edit',data:{id:paymentId,date:'2099-01-01',amount:1000,note:'',account,source:lot}},'admin@test'),/data futura/);

// Reversed movements cannot be edited; they are already neutralised.
const reversed=apply(pay1,{id:'r1',type:'move',data:{type:'reverse',origin:paymentId,date:'2026-02-11',amount:0,note:'Valor incorreto'}},'admin@test');
assert.throws(()=>apply(reversed,{id:'m4',type:'move_edit',data:{id:paymentId,date:'2026-02-10',amount:1000,note:'',account,source:lot}},'admin@test'),/estornada não pode ser corrigida/);

// Editions are auditable: one new record describing the correction.
const before=pay1.audit.length;
assert.equal(corrected.audit.length,before+1);
assert.match(corrected.audit[0].description,/Movimentação corrigida/);

// Corrections still respect the funding lot balance (limits use the released amount).
const big=apply(funded,{id:'p2',type:'entry',data:{...expense({description:'Obra grande',amount:600000}),id:undefined}},'admin@test');
const bigId=big.entries.find(e=>e.description==='Obra grande').id;
const bigPay=apply(big,{id:'p3',type:'move',data:{type:'pay',entry:bigId,date:'2026-02-10',amount:400000,note:'',account,source:lot}},'admin@test');
const bigPayId=activeMoves(bigPay).find(m=>m.type==='pay').id;
assert.throws(()=>apply(bigPay,{id:'m5',type:'move_edit',data:{id:bigPayId,date:'2026-02-10',amount:550000,note:'',account,source:lot}},'admin@test'),/Saldo disponível do aporte insuficiente/);
const bigFixed=apply(bigPay,{id:'m6',type:'move_edit',data:{id:bigPayId,date:'2026-02-10',amount:500000,note:'',account,source:lot}},'admin@test');
assert.equal(activeMoves(bigFixed).find(m=>m.type==='pay').amount,500000);
assert.equal(metrics(bigFixed).lots[lot],0);

// A revenue receipt can be corrected too, adjusting net/fee/reserve.
const revenue=apply(corrected,{id:'rv1',type:'entry',data:{...expense({kind:'revenue',description:'Venda',amount:50000,fees:1000,due:'2026-03-10'}),id:undefined}},'admin@test');
const revenueId=revenue.entries.find(e=>e.kind==='revenue').id;
const receipt=apply(revenue,{id:'rc1',type:'move',data:{type:'receive',entry:revenueId,date:'2026-03-10',gross:20000,fee:500,reserve:0,amount:19500,note:'',account,source:'project'}},'admin@test');
const receiptId=activeMoves(receipt).find(m=>m.type==='receive').id;
const fixed=apply(receipt,{id:'rc2',type:'move_edit',data:{id:receiptId,date:'2026-03-11',gross:30000,fee:600,reserve:0,amount:29400,note:'depósito completo',account,source:'project'}},'admin@test');
const rec=activeMoves(fixed).find(m=>m.type==='receive');
assert.equal(rec.id,receiptId);
assert.equal(rec.gross,30000);
assert.equal(rec.fee,600);
assert.equal(rec.amount,29400);
assert.equal(paid(fixed,fixed.entries.find(e=>e.id===revenueId)),30000);

console.log('expense-payment-edit: ok');
