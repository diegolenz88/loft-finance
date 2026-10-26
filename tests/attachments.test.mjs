import assert from 'node:assert/strict';
import {apply,demoLedger,emptyLedger,paid} from '../lib/finance.ts';

const base=emptyLedger(demoLedger().config).config;
const [catA]=base.categories;
const [stageA]=base.stages;
const account=base.accounts[0];
const partnerA=base.partners[0].id;
const unit=base.units[0];

const ledger={config:base,entries:[],moves:[],audit:[]};

const expense=(over={})=>({
 kind:'expense',description:'Chassi modular',party:'Fábrica',document:'NF 1',
 category:catA,stage:stageA,units:{[unit]:100},amount:100000,fees:0,
 date:'2026-01-10',due:'2026-02-10',note:'',planned:false,cancelled:false,
 exception:'',attachments:[],...over,
});

const created=apply(ledger,{id:'e1',type:'entry',data:{...expense(),id:undefined}},'admin@test');
const entryId=created.entries[0].id;
const funded=apply(created,{id:'c1',type:'move',data:{type:'capital',partner:partnerA,account,date:'2026-01-05',amount:500000,note:'Aporte'}},'admin@test');
const lot=funded.moves[0].id;
const paidLedger=apply(funded,{id:'p1',type:'move',data:{type:'pay',entry:entryId,date:'2026-02-10',amount:40000,note:'1ª parcela',account,source:lot}},'admin@test');
const payId=paidLedger.moves.find(m=>m.type==='pay').id;
assert.equal(paid(paidLedger,paidLedger.entries[0]),40000);

// A purchase document and a payment receipt coexist on the same entry.
const withDoc=apply(paidLedger,{id:'a1',type:'attachment',data:{entry:entryId,file:{id:'doc-1',name:'nota-fiscal.pdf',kind:'expense'}}},'admin@test');
assert.equal(withDoc.entries[0].attachments.length,1);
assert.equal(withDoc.entries[0].attachments[0].kind,'expense');

const withReceipt=apply(withDoc,{id:'a2',type:'attachment',data:{entry:entryId,file:{id:'pay-1',name:'comprovante-pix.pdf',kind:'payment',move:payId}}},'admin@test');
const attachments=withReceipt.entries[0].attachments;
assert.equal(attachments.length,2,'documento e comprovante de pagamento convivem');
assert.equal(attachments.filter(f=>f.kind==='expense').length,1);
assert.equal(attachments.filter(f=>f.kind==='payment').length,1);
assert.equal(attachments.find(f=>f.kind==='payment').move,payId,'comprovante ligado ao pagamento');
assert.equal(withReceipt.entries.length,paidLedger.entries.length,'anexar não cria lançamento');
assert.equal(paid(withReceipt,withReceipt.entries[0]),40000,'anexar não altera baixas');

// Legacy attachments without a kind stay readable and are treated as documents.
const legacy=apply(created,{id:'a0',type:'attachment',data:{entry:entryId,file:{id:'old-1',name:'orcamento.pdf'}}},'admin@test');
assert.equal(legacy.entries[0].attachments[0].kind,'expense','sem natureza assume documento');
assert.equal(legacy.entries[0].attachments[0].move,undefined);

// A payment receipt must point to a real payment of this entry.
assert.throws(()=>apply(withDoc,{id:'a3',type:'attachment',data:{entry:entryId,file:{id:'x',name:'x.pdf',kind:'payment',move:'nao-existe'}}},'admin@test'),/Pagamento não encontrado neste lançamento/);

// A contribution (not a payment) cannot receive a payment receipt.
assert.throws(()=>apply(withDoc,{id:'a4',type:'attachment',data:{entry:entryId,file:{id:'x',name:'x.pdf',kind:'payment',move:lot}}},'admin@test'),/Pagamento não encontrado neste lançamento/);

// Declaring a payment move without the payment nature is rejected.
assert.throws(()=>apply(withDoc,{id:'a5',type:'attachment',data:{entry:entryId,file:{id:'x',name:'x.pdf',kind:'expense',move:payId}}},'admin@test'),/natureza de pagamento/);

// A receipt for a reversed payment is refused, mirroring the active-move rule.
const reversed=apply(paidLedger,{id:'r1',type:'move',data:{type:'reverse',origin:payId,note:'Estorno por erro',date:'2026-02-11'}},'admin@test');
assert.throws(()=>apply(reversed,{id:'a6',type:'attachment',data:{entry:entryId,file:{id:'x',name:'x.pdf',kind:'payment',move:payId}}},'admin@test'),/Pagamento não encontrado neste lançamento/);

// The audit distinguishes both natures.
const auditDoc=withDoc.audit.find(a=>a.id==='a1');
const auditPay=withReceipt.audit.find(a=>a.id==='a2');
assert.match(auditDoc.description,/Comprovante da despesa anexado/);
assert.match(auditPay.description,/Comprovante de pagamento anexado/);

// Revenue entries follow the same rule for receipts.
const revenue=apply(created,{id:'rv1',type:'entry',data:{...expense({kind:'revenue',amount:200000}),id:undefined}},'admin@test');
const revenueId=revenue.entries.find(e=>e.kind==='revenue').id;
const received=apply(revenue,{id:'rc1',type:'move',data:{type:'receive',entry:revenueId,partner:partnerA,date:'2026-02-12',gross:200000,fee:0,reserve:0,amount:200000,note:'Recebimento'}},'admin@test');
const receiveId=received.moves.find(m=>m.type==='receive').id;
const revenueWithReceipt=apply(received,{id:'a7',type:'attachment',data:{entry:revenueId,file:{id:'r-1',name:'comprovante.pdf',kind:'payment',move:receiveId}}},'admin@test');
assert.equal(revenueWithReceipt.entries.find(e=>e.id===revenueId).attachments.length,1);

console.log('PASS: comprovante da despesa e comprovante de pagamento separados, com vínculo ao pagamento e regras de integridade.');
