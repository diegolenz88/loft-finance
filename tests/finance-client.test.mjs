import assert from 'node:assert/strict';
import {ApiResponseError,loadFinance,requestJson,saveFinance} from '../lib/finance-client.ts';
import {apply,emptyLedger,demoLedger} from '../lib/finance.ts';

const ledger=emptyLedger(demoLedger().config);
const action={id:'expense-retry-1',type:'expense_plan',version:1,data:{
  expense:{kind:'expense',description:'Móveis',amount:2000000,fees:0,date:'2026-10-06',due:'2026-11-06',
    category:ledger.config.categories[0],stage:ledger.config.stages[0],
    units:Object.fromEntries(Array.from({length:8},(_,i)=>['Loft '+String(i+1).padStart(2,'0'),12.5])),note:''},
  installments:3,downPayment:500000,downPaymentDue:'2026-10-06'
}};
const saved=apply(ledger,action,'test@example.com');
assert.equal(saved.entries.length,4);
assert.deepEqual(apply(saved,action,'test@example.com'),saved,'Same operation must not duplicate installments');
const state=JSON.parse(JSON.stringify({ledger:saved,version:2,role:'admin'}));
let requests=[];
const transport=(post,readState=state)=>async(path,options={})=>{
  requests.push({path,options});
  assert.equal(options.credentials,'same-origin');
  if(path==='/api/diagnostics')return Response.json({received:true});
  assert.equal(options.redirect,'manual','Never follow sign-in redirects in fetch');
  assert.equal(new Headers(options.headers).get('Accept'),'application/json');
  if(options.method==='POST')return post();
  return Response.json(readState);
};

assert.deepEqual(await saveFinance(action,transport(()=>Response.json(state))),state);
assert.equal(requests.filter(r=>r.options.method==='POST').length,1);

// The exact screenshot failure: a POST returns an HTML page. If it was saved,
// confirmation comes from a GET; no second financial POST is sent.
requests=[];
assert.deepEqual(await saveFinance(action,transport(()=>new Response('<!DOCTYPE html><html>Gateway error</html>',
  {status:502,headers:{'Content-Type':'text/html','cf-ray':'trace-123'}}))),state);
assert.equal(requests.filter(r=>r.path==='/api/finance'&&r.options.method==='POST').length,1);
const diagnostic=JSON.parse(requests.find(r=>r.path==='/api/diagnostics').options.body);
assert.deepEqual(diagnostic,{path:'/api/finance',method:'POST',status:502,format:'html',requestId:'trace-123',reason:'non-json'});
assert.ok(!JSON.stringify(diagnostic).includes('Móveis'));

requests=[];
await assert.rejects(()=>saveFinance(action,transport(()=>new Response('<!DOCTYPE html>Access denied',
  {status:403,headers:{'Content-Type':'text/html'}}),{ledger,version:1,role:'admin'})),error=>{
  assert.ok(error instanceof ApiResponseError);assert.ok(error.message.includes('HTTP 403'));
  assert.ok(!error.message.includes('Unexpected token'));assert.equal(error.uncertain,true);return true;
});
assert.equal(requests.filter(r=>r.path==='/api/finance'&&r.options.method==='POST').length,1);

requests=[];
await assert.rejects(()=>saveFinance(action,transport(()=>Response.json({error:'Os percentuais devem somar 100%.'},{status:400}))),
  /Os percentuais devem somar 100%/);
assert.equal(requests.length,1,'Validation failures must not replay writes or read the ledger');

requests=[];
assert.deepEqual(await saveFinance(action,transport(()=>{throw new TypeError('Failed to fetch')})),state);
assert.equal(requests.filter(r=>r.path==='/api/finance'&&r.options.method==='POST').length,1);
await assert.rejects(()=>requestJson('/api/finance',{},async()=>new Response('',{status:302,headers:{location:'/signin-with-chatgpt'}})),/redirecionado/);
await assert.rejects(()=>requestJson('/api/finance',{},async()=>new Response('<!DOCTYPE html>',{status:200,headers:{'Content-Type':'text/html'}})),/página em vez/);
await assert.rejects(()=>requestJson('/api/finance',{},async()=>new Response('{',{headers:{'Content-Type':'application/json'}})),/resposta incompleta/);
await assert.rejects(()=>loadFinance(async()=>Response.json({ok:true})),/incompleta/);
console.log('PASS: HTML/redirect/network handling, read-only save confirmation, safe diagnostics, no automatic write replay, and 8-unit installment retry without duplicates.');
