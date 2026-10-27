export type Partner = {id:string;name:string;email:string;active:boolean;joined:string;role:'admin'|'editor'|'viewer'};
export type Shares = Record<string,number>;
export type Rule = {id:string;from:string;ownership:Shares;cost:Shares;revenue:Shares;base:'net'|'gross';reserve:number};
export type Profile = {name?:string;title?:string;photo?:string;updatedAt?:string};
export type Config = {name:string;currency:string;partners:Partner[];units:string[];inactiveUnits?:string[];categories:string[];stages:string[];accounts:string[];rules:Rule[];budgets:{id:string;category:string;stage:string;amount:number;description?:string}[];budgetUnits?:Shares;profiles?:Record<string,Profile>};
export type Entry = {id:string;kind:'expense'|'revenue';description:string;party:string;contactId?:string;budgetId?:string;plannedSource?:string;document:string;category:string;stage:string;units:Shares;amount:number;fees:number;due:string;date:string;note:string;planned:boolean;cancelled:boolean;shares:Shares;ruleId:string;base:'net'|'gross';reserve:number;exception:string;attachments:{id:string;name:string;kind?:'expense'|'payment';move?:string}[];paymentPlan?:{id:string;total:number;paidBefore?:number;downPayment:number;installments:number;position:number;kind:'downPayment'|'installment';funding?:string}};
export type Movement = {id:string;type:string;date:string;amount:number;entry?:string;partner?:string;account?:string;to?:string;source?:string;origin?:string;fee?:number;reserve?:number;gross?:number;shares?:Shares;note:string;actor:string;at:string};
export type Contact = {id:string;name:string;kind:'supplier'|'customer'|'both';document:string;email:string;phone:string;note:string;active:boolean;createdAt:string;updatedAt:string};
export type Ledger = {contacts?:Contact[];config:Config;entries:Entry[];moves:Movement[];audit:{id:string;at:string;actor:string;action:string;description:string}[]};
export const categories=['Terreno e preparação','Projetos e licenças','Fundações','Módulos e estrutura','Transporte e montagem','Instalações elétricas','Instalações hidráulicas','Isolamento','Revestimentos','Esquadrias','Mão de obra','Mobiliário','Equipamentos','Paisagismo','Administrativo'];
export const stages=['Planejamento','Preparação','Estrutura','Instalações','Acabamentos','Entrega'];
// Compatibility policy requested for the existing twelve-unit project. Explicit
// activity settings (including []) always win, so reactivation is permanent.
const legacyInactiveUnits=['Loft 09','Loft 10','Loft 11','Loft 12'];
export const inactiveUnits=(c:Config):string[]=>c.inactiveUnits??legacyInactiveUnits.filter(u=>c.units.includes(u));
export const activeUnits=(c:Config):string[]=>c.units.filter(u=>!inactiveUnits(c).includes(u));
export const activeStudioCount=(c:Config)=>activeUnits(c).filter(u=>u!=='Áreas comuns').length;
export const unitLabel=(c:Config,u:string)=>u+(inactiveUnits(c).includes(u)?' (inativo)':'');
export const withUnitActivity=(c:Config):Config=>({...c,inactiveUnits:[...inactiveUnits(c)]});
export const entryUnitOptions=(c:Config,previous?:Entry)=>c.units.filter(u=>!inactiveUnits(c).includes(u)||(previous?.units[u]||0)>0);
export function validateEntryUnits(c:Config,units:Shares,previous?:Entry){
 validShares(units,c.units);
 for(const u of inactiveUnits(c))ensure(!units[u]||(previous?.units[u]===units[u]),`${u} está inativo. Use uma unidade ativa ou preserve o percentual do lançamento original.`);
}
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const id=()=>crypto.randomUUID();
export const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
export function cents(value:string|number):number {
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*100):NaN;
 let text=String(value).trim().replace(/^R\$\s*/i,'').replace(/[\s\u00a0]/g,'');
 if(!text)return 0;
 if(text.includes(',')){if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text))return NaN;text=text.replace(/\./g,'').replace(',','.');}
 else if(/^-?\d{1,3}(?:\.\d{3})+$/.test(text)){text=text.replace(/\./g,'');}
 else if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))return NaN;
 const result=Math.round(Number(text)*100);return Number.isSafeInteger(result)?result:NaN;
}
export function normalizeContact(data:any,contactId:string,previous?:Contact):Contact {
 const clean=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
 const name=clean(data?.name,160),kind=data?.kind,document=clean(data?.document,60),email=clean(data?.email,160),phone=clean(data?.phone,50),note=clean(data?.note,1500);
 ensure(name,'Informe o nome ou a razão social.');ensure(['supplier','customer','both'].includes(kind),'Informe se o cadastro é fornecedor, cliente ou ambos.');ensure(!email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Informe um e-mail válido.');
 return{id:contactId,name,kind,document,email,phone,note,active:data?.active!==false,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}

const ensure=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
const amount=(n:number,zero=false)=>ensure(Number.isSafeInteger(n)&&n>=(zero?0:1)&&n<=1e12,'Informe um valor válido em reais e centavos.');
const date=(s:string)=>ensure(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s)),'Informe uma data válida.');
export type PaymentScheduleRow = {kind:'downPayment'|'installment';position:number;amount:number;due:string};
export function monthlyDue(firstDue:string,offset:number):string {
 date(firstDue);ensure(new Date(firstDue+'T12:00:00Z').toISOString().slice(0,10)===firstDue,'Informe uma data válida.');
 const base=new Date(firstDue+'T12:00:00Z');const day=base.getUTCDate();base.setUTCDate(1);base.setUTCMonth(base.getUTCMonth()+offset);
 const lastDay=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();base.setUTCDate(Math.min(day,lastDay));return base.toISOString().slice(0,10);
}
export function paymentSchedule(total:number,installments:number,firstDue:string,downPayment=0,downPaymentDue?:string):PaymentScheduleRow[] {
 amount(total);amount(downPayment,true);ensure(Number.isInteger(installments)&&installments>=1&&installments<=36,'Informe de 1 a 36 parcelas mensais.');
 ensure(downPayment<total,'A entrada deve ser menor que o valor total da despesa.');const balance=total-downPayment;
 ensure(balance>=installments,'O saldo deve permitir ao menos R$ 0,01 por parcela.');monthlyDue(firstDue,0);
 const rows:PaymentScheduleRow[]=[];if(downPayment>0){ensure(downPaymentDue,'Informe o vencimento da entrada.');monthlyDue(downPaymentDue!,0);ensure(downPaymentDue!<=firstDue,'A primeira parcela não pode vencer antes da entrada.');rows.push({kind:'downPayment',position:0,amount:downPayment,due:downPaymentDue!})}
 for(let i=0;i<installments;i++)rows.push({kind:'installment',position:i+1,amount:Math.floor(balance/installments)+(i<balance%installments?1:0),due:monthlyDue(firstDue,i)});
 return rows;
}
export function validShares(s:Shares,keys?:string[]){ensure(s&&typeof s==='object','Informe os percentuais.');const vals=Object.values(s);ensure(vals.length&&vals.every(v=>Number.isFinite(v)&&v>=0&&v<=100&&Math.abs(v*100-Math.round(v*100))<1e-7)&&Math.round(sum(vals)*100)===10000,'Os percentuais devem somar exatamente 100%.');if(keys)ensure(Object.keys(s).every(k=>keys.includes(k)),'Participante ou unidade inválida no rateio.');}
// Largest-remainder allocation, deterministic tie-break by stable ID.
export function allocate(value:number,shares:Shares):Record<string,number>{const rows=Object.entries(shares).map(([k,p])=>{const product=BigInt(value)*BigInt(Math.round(p*100));return{k,v:Number(product/BigInt(10000)),r:Number(product%BigInt(10000))}});let rest=value-sum(rows.map(x=>x.v));rows.sort((a,b)=>b.r-a.r||a.k.localeCompare(b.k));for(let i=0;i<rest;i++)rows[i%rows.length].v++;return Object.fromEntries(rows.map(r=>[r.k,r.v]));}
export function activeMoves(s:Ledger){const reversed=new Set(s.moves.filter(m=>m.type==='reverse').map(m=>m.origin));return s.moves.filter(m=>m.type!=='reverse'&&!reversed.has(m.id));}
export function ruleAt(c:Config,d:string){const r=[...c.rules].filter(r=>r.from<=d).sort((a,b)=>b.from.localeCompare(a.from))[0];ensure(r,'Nenhuma regra de rateio vigente para esta data.');return r;}
export function paid(s:Ledger,e:Entry){return sum(activeMoves(s).filter(m=>m.entry===e.id&&m.type===(e.kind==='expense'?'pay':'receive')).map(m=>e.kind==='expense'?m.amount:m.gross||0));}
export function status(s:Ledger,e:Entry){if(e.cancelled)return 'Cancelado';const p=paid(s,e);if(p>=e.amount)return e.kind==='expense'?'Pago':'Recebido';if(p>0)return 'Parcial';if(e.planned)return 'Previsto';if(e.due<today())return 'Vencido';return 'Em aberto';}
export function metrics(s:Ledger){const moves=activeMoves(s);const ex=s.entries.filter(e=>e.kind==='expense'&&!e.cancelled);const rev=s.entries.filter(e=>e.kind==='revenue'&&!e.cancelled);const accounts:Record<string,number>=Object.fromEntries(s.config.accounts.map(a=>[a,0]));const custody:Record<string,number>=Object.fromEntries(s.config.partners.map(p=>[p.id,0]));const lots:Record<string,number>={};const ps:Record<string,any>=Object.fromEntries(s.config.partners.map(p=>[p.id,{capital:0,advance:0,applied:0,expected:0,available:0,entitlement:0,approved:0,distributed:0,custody:0,returned:0}]));const ent:Record<string,Record<string,number>>={};const approved:Record<string,Record<string,number>>={};const distributed:Record<string,Record<string,number>>={};let operational=0;let reserved=0;
 const acc=(a:string|undefined,n:number)=>{if(a)accounts[a]=(accounts[a]||0)+n};const pp=(p:string|undefined,k:string,n:number)=>{if(p&&ps[p])ps[p][k]+=n};
 for(const m of moves){if(m.type==='capital'||m.type==='advance'){lots[m.id]=(lots[m.id]||0)+m.amount;acc(m.account,m.amount);pp(m.partner,m.type,m.amount)}
 if(m.type==='pay'){if(m.source?.startsWith('direct:')){const[,p,kind]=m.source.split(':');pp(p,kind,m.amount);pp(p,'applied',m.amount)}else if(m.source?.startsWith('custody:')){const p=m.source.slice(8);custody[p]-=m.amount;operational-=m.amount}else{acc(m.account,-m.amount);if(m.source==='project')operational-=m.amount;else if(m.source){lots[m.source]=(lots[m.source]||0)-m.amount;const lot=moves.find(x=>x.id===m.source);pp(lot?.partner,'applied',m.amount)}}}
 if(m.type==='receive'){const net=m.amount;operational+=net;reserved+=m.reserve||0;if(m.source==='project')acc(m.account,net);else if(m.partner)custody[m.partner]+=net;const e=s.entries.find(e=>e.id===m.entry)!;const base=(m.gross||0)-(e.base==='net'?(m.fee||0):0)-(m.reserve||0);const parts=allocate(base,e.shares);ent[e.id]??={};for(const[p,v]of Object.entries(parts)){ent[e.id][p]=(ent[e.id][p]||0)+v;pp(p,'entitlement',v)}}
 if(m.type==='approve'){approved[m.entry!]??={};approved[m.entry!][m.partner!]=(approved[m.entry!][m.partner!]||0)+m.amount;pp(m.partner,'approved',m.amount)}
 if(m.type==='distribute'){distributed[m.entry!]??={};distributed[m.entry!][m.partner!]=(distributed[m.entry!][m.partner!]||0)+m.amount;pp(m.partner,'distributed',m.amount);operational-=m.amount;if(m.source?.startsWith('custody:'))custody[m.source.slice(8)]-=m.amount;else acc(m.account,-m.amount)}
 if(m.type==='custody'){custody[m.partner!]-=m.amount;acc(m.account,m.amount)}
 if(m.type==='return'||m.type==='reimburse'){acc(m.account,-m.amount);pp(m.partner,m.type==='return'?'capital':'advance',-m.amount);if(m.type==='return')pp(m.partner,'returned',m.amount);if(m.origin)lots[m.origin]=(lots[m.origin]||0)-m.amount;else operational-=m.amount;}
 if(m.type==='transfer'){acc(m.account,-m.amount);acc(m.to,m.amount)}
 }
 for(const lot of moves.filter(m=>m.type==='capital'||m.type==='advance'))pp(lot.partner,'available',lots[lot.id]||0);
 for(const e of ex){const em=moves.filter(m=>m.type==='pay'&&m.entry===e.id);const projectPaid=sum(em.filter(m=>m.source==='project'||m.source?.startsWith('custody:')).map(m=>m.amount));const financed=sum(em.filter(m=>m.source!=='project'&&!m.source?.startsWith('custody:')).map(m=>m.amount));const expected=allocate(financed,e.shares);for(const[p,v]of Object.entries(expected))pp(p,'expected',v);}
 for(const p of Object.keys(ps))ps[p].custody=custody[p]||0;
 const contracted=sum(ex.filter(e=>!e.planned).map(e=>e.amount));const out=sum(moves.filter(m=>m.type==='pay').map(m=>m.amount));return{accounts,custody,lots,partners:ps,entitlements:ent,approved,distributed,cash:sum(Object.values(accounts)),operational,reserved,budget:sum(s.config.budgets.map(b=>b.amount)),contracted,paid:out,payable:contracted-sum(ex.filter(e=>!e.planned).map(e=>paid(s,e))),predicted:sum(ex.filter(e=>e.planned).map(e=>e.amount)),receivable:sum(rev.map(e=>e.amount-paid(s,e))),revenueGross:sum(moves.filter(m=>m.type==='receive').map(m=>m.gross||0)),revenueNet:sum(moves.filter(m=>m.type==='receive').map(m=>m.amount)),retained:reserved,unfinanced:sum(ex.map(e=>e.amount-paid(s,e)))};
}
export function validateConfig(c:Config){ensure(c.name?.trim()&&c.name.length<120,'Informe o nome do empreendimento.');ensure(c.currency==='BRL','A moeda desta versão é BRL.');ensure(c.partners.length>=2&&c.partners.length<=30,'Cadastre pelo menos dois sócios.');const ids=c.partners.map(p=>p.id);ensure(new Set(ids).size===ids.length,'Sócios duplicados.');for(const p of c.partners){ensure(p.name?.trim(),'Informe o nome de cada sócio.');ensure(['admin','editor','viewer'].includes(p.role),'Permissão inválida.');if(p.email)ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email),'E-mail inválido.');date(p.joined)}for(const list of [c.units,c.categories,c.stages,c.accounts])ensure(list.length&&list.every(x=>typeof x==='string'&&x.trim())&&new Set(list).size===list.length,'Os cadastros devem ter nomes únicos e não vazios.');const inactive=inactiveUnits(c);ensure(Array.isArray(inactive)&&inactive.every(u=>c.units.includes(u)&&u!=='Áreas comuns')&&new Set(inactive).size===inactive.length,'Unidades inativas inválidas. Preserve as áreas comuns ativas.');ensure(activeStudioCount(c)>0,'Mantenha pelo menos um studio ativo.');ensure(c.rules.length,'Defina as regras de participação.');ensure(new Set(c.rules.map(r=>r.from)).size===c.rules.length,'Já existe uma regra com esta vigência.');for(const r of c.rules){date(r.from);validShares(r.cost,ids);validShares(r.revenue,ids);validShares(r.ownership,ids);ensure(['net','gross'].includes(r.base),'Base inválida.');ensure(Number.isFinite(r.reserve)&&r.reserve>=0&&r.reserve<=100,'Reserva inválida.')}for(const b of c.budgets){amount(b.amount,true);ensure(c.categories.includes(b.category)&&c.stages.includes(b.stage),'Categoria ou etapa inválida no orçamento.');ensure(b.description===undefined||(typeof b.description==='string'&&b.description.length<=300),'Descrição do orçamento muito longa.')}if(c.budgetUnits)validShares(c.budgetUnits,c.units)}
export function emptyLedger(c:Config):Ledger{validateConfig(c);return{config:withUnitActivity(c),entries:[],moves:[],audit:[]}}
// Pro-rates an amount across items by percentage, keeping every value an exact
// integer of cents. Basis points make the split deterministic and reproducible.
export function equalShares(items:string[]):Shares{ensure(items.length,'Informe os itens do rateio.');const n=items.length;const q=Math.floor(10000/n);const r=10000-q*n;return Object.fromEntries(items.map((x,i)=>[x,(q+(i<r?1:0))/100]))}
export function budgetRateio(c:Config,stage:string,total:number,shares:Shares,replaceAll=false,description?:string):Config{ensure(c.stages.includes(stage),'Etapa inválida.');amount(total);validShares(shares,c.categories);ensure(description===undefined||(typeof description==='string'&&description.length<=300),'Descrição do orçamento muito longa.');const parts=allocate(total,shares);const config=structuredClone(c);const kept=replaceAll?[]:config.budgets.filter(b=>b.stage!==stage);config.budgets=kept.concat(c.categories.filter(x=>parts[x]>0).map(x=>({id:id(),category:x,stage,amount:parts[x],...(description?{description}:{})})));validateConfig(config);return config}
// Distribution of the approved budget across units. Absent, it defaults to an
// equal split; the project always has one unambiguous distribution.
export const unitBudgetShares=(c:Config):Shares=>c.budgetUnits??equalShares(c.units);
// A lançamento may be tied to one concrete budget line. Without the link (or
// when that line no longer exists) the category/stage pair keeps the previous
// behavior, so old data and removals stay compatible.
export const entryBudget=(c:Config,e:{budgetId?:string})=>e.budgetId?c.budgets.find(b=>b.id===e.budgetId):undefined;
export const entryBudgetLine=(c:Config,e:{budgetId?:string;category:string;stage:string})=>entryBudget(c,e)??c.budgets.find(b=>b.category===e.category&&b.stage===e.stage);
// A planned funding source records which resource is expected to settle an
// expense: the project's own cash, a partner's contribution lot, a direct
// payment, or revenue kept in custody. It never moves money by itself; the
// payment action still enforces the real balances.
export function validFundingSource(s:Ledger,source:string|undefined){
 if(source===undefined||source==='')return undefined;
 if(source==='project')return source;
 if(source.startsWith('direct:')){const[,p,k]=source.split(':');ensure(s.config.partners.some(x=>x.id===p&&x.active)&&(k==='capital'||k==='advance'),'Fonte de pagamento inválida.');return source}
 if(source.startsWith('custody:')){ensure(s.config.partners.some(x=>x.id===source.slice(8)),'Fonte de pagamento inválida.');return source}
 ensure(activeMoves(s).some(m=>m.id===source&&(m.type==='capital'||m.type==='advance')),'Aporte ou adiantamento não encontrado para a fonte de pagamento.');
 return source;
}
export function budgetByUnit(c:Config):Record<string,number>{const parts=allocate(sum(c.budgets.map(b=>b.amount)),unitBudgetShares(c));return Object.fromEntries(c.units.map(u=>[u,parts[u]||0]))}
// Edits one budget line. A zero value removes the line, so clearing a lançamento
// never leaves a R$ 0,00 row behind; the description is replaced as a whole.
export function budgetSet(c:Config,category:string,stage:string,value:number,description?:string):Config{ensure(c.categories.includes(category)&&c.stages.includes(stage),'Categoria ou etapa inválida.');ensure(Number.isSafeInteger(value)&&value>=0,'Informe um valor válido em reais e centavos.');ensure(description===undefined||(typeof description==='string'&&description.length<=300),'Descrição do orçamento muito longa.');const config=structuredClone(c);const existing=config.budgets.find(b=>b.category===category&&b.stage===stage);if(value===0){ensure(existing,'Não há orçamento para remover nesta categoria e etapa.');config.budgets=config.budgets.filter(b=>b!==existing)}else if(existing){existing.amount=value;existing.description=description||undefined}else config.budgets.push({id:id(),category,stage,amount:value,...(description?{description}:{})});validateConfig(config);return config}
export function budgetRemove(c:Config,category:string,stage:string):Config{ensure(c.categories.includes(category)&&c.stages.includes(stage),'Categoria ou etapa inválida.');const config=structuredClone(c);const before=config.budgets.length;config.budgets=config.budgets.filter(b=>!(b.category===category&&b.stage===stage));ensure(config.budgets.length<before,'Não há orçamento para remover nesta categoria e etapa.');validateConfig(config);return config}
export function budgetUnitRateio(c:Config,shares:Shares):Config{validShares(shares,c.units);const config=structuredClone(c);config.budgetUnits={...shares};validateConfig(config);return config}
export function invariants(s:Ledger){const t=metrics(s);for(const value of [...Object.values(t.accounts),...Object.values(t.custody),...Object.values(t.lots)])ensure(value>=0,'A operação deixaria uma conta, aporte ou saldo sob guarda negativo. Verifique os vínculos.');ensure(t.operational>=0,'Recursos próprios do empreendimento insuficientes. Use um aporte identificado.');for(const p of Object.values(t.partners) as any[])ensure(p.capital>=0&&p.advance>=0&&p.distributed<=p.approved&&p.approved<=p.entitlement,'A operação excede o capital, adiantamento ou direito do sócio.');for(const e of s.entries){ensure(paid(s,e)<=e.amount,'O pagamento/recebimento excede o valor do lançamento.');for(const p of s.config.partners){ensure((t.approved[e.id]?.[p.id]||0)<=(t.entitlements[e.id]?.[p.id]||0),'Aprovação superior à participação recebida.');ensure((t.distributed[e.id]?.[p.id]||0)<=(t.approved[e.id]?.[p.id]||0),'Repasse superior ao valor aprovado.')}}}
export function apply(s0:Ledger,action:any,actor:string,admin=true):Ledger{const s=structuredClone(s0);ensure(typeof action?.id==='string'&&action.id.length<100,'Operação inválida.');if(s.audit.some(a=>a.id===action.id))return s;s.config=withUnitActivity(s.config);
 if(action.type==='expense_plan'){
  const {expense,installments,downPayment=0,downPaymentDue,replace,funding}=action.data||{};
  ensure(expense?.kind==='expense','Apenas despesas podem ser parceladas.');
  const plannedFunding=validFundingSource(s,funding);
  // Two modes: create a new installment plan, or convert an existing expense.
  // A partially paid expense keeps its paid part as a settled entry and only
  // the remaining balance is scheduled, so payments keep their original link.
  const original=replace?s.entries.find(e=>e.id===replace):undefined;
  let paidBefore=0;
  if(replace){
   ensure(original,'Lançamento não encontrado.');
   ensure(!original!.cancelled,'Lançamento cancelado não pode ser parcelado.');
   ensure(!original!.paymentPlan,'Este lançamento já faz parte de um parcelamento.');
   paidBefore=paid(s,original!);
   ensure(paidBefore<expense.amount,`O valor informado (${money(expense.amount)}) não cobre o total já pago (${money(paidBefore)}).`);
  } else ensure(!expense.id,'O parcelamento deve ser criado como uma nova despesa.');
  const remaining=expense.amount-paidBefore;
  const schedule=paymentSchedule(remaining,installments,expense.due,downPayment,downPaymentDue);let result=s;
  // Receipts of an unpaid purchase follow the plan; when part was already
  // paid, they stay with the original entry that documents that payment.
  const carried=original&&paidBefore===0?(original.attachments||[]).slice():[];
  let replaced='';
  if(original){
   if(paidBefore===0){original.cancelled=true;replaced=original.description;}
   else{
    original.amount=paidBefore;
    const suffix=' · parte paga';
    replaced=original.description;
    if(!original.description.endsWith(suffix)&&original.description.length+suffix.length<=300)original.description+=suffix;
   }
  }
  for(const row of schedule){const suffix=row.kind==='downPayment'?'Entrada':`Parcela ${row.position}/${installments}`;const entryId=action.id+':'+row.position;
   result=apply(result,{id:entryId,type:'entry',data:{...expense,id:undefined,amount:row.amount,fees:0,due:row.due,description:expense.description+' · '+suffix,plannedSource:plannedFunding??expense.plannedSource}},actor,admin);
   result.entries[result.entries.length-1].paymentPlan={id:action.id,total:remaining,paidBefore,downPayment,installments,position:row.position,kind:row.kind,...(plannedFunding?{funding:plannedFunding}:{})};
  }
  // Receipts belong to the purchase, so they follow the first row of the plan.
  if(carried.length){const first=result.entries.find(e=>e.id===action.id+':'+schedule[0].position);if(first)first.attachments=carried;}
  result.audit.unshift({id:action.id,at:new Date().toISOString(),actor,action:'expense_plan',description:`Despesa parcelada: ${expense.description} · ${downPayment>0?'entrada + ':''}${installments} parcela(s) · ${money(remaining)}`+(paidBefore>0?` · já pago ${money(paidBefore)}`:'')+(replaced?` · substituiu ${replaced}`:'')});return result;
 }
 if(action.type==='batch'){ensure(Array.isArray(action.data)&&action.data.length>0&&action.data.length<=36&&action.data.every((x:any)=>x.type==='entry'),'Parcelamento inválido.');let result=s;for(const item of action.data)result=apply(result,item,actor,admin);result.audit.unshift({id:action.id,at:new Date().toISOString(),actor,action:'batch',description:'Parcelamento criado: '+action.data.length+' parcelas'});return result;}const t=metrics(s);const a=action.type==='config'?{...action.data,inactiveUnits:action.data?.inactiveUnits??s.config.inactiveUnits}:action.data;let description='';
 if(action.type==='contact'){
  const contacts=s.contacts||[];const previous=a?.id?contacts.find(c=>c.id===a.id):undefined;ensure(!a?.id||previous,'Cadastro não encontrado.');
  const contact=normalizeContact(a,previous?.id||action.id,previous);const key=(v:string)=>v.replace(/[^a-z0-9]/gi,'').toLowerCase();
  ensure(!contacts.some(c=>c.id!==contact.id&&contact.document&&key(c.document)===key(contact.document)),'Já existe um cadastro com este documento. Edite o cadastro existente.');
  if(previous)contacts[contacts.indexOf(previous)]=contact;else contacts.push(contact);s.contacts=contacts;description=(previous?'Cadastro atualizado: ':'Novo fornecedor/cliente: ')+contact.name;
 }else if(action.type==='entry'){const previous=s.entries.find(e=>e.id===a.id);if(previous){const settled=paid(s,previous);ensure(a.kind===previous.kind||settled===0,'Não altere o tipo de um lançamento com baixa registrada.');if(settled>0){ensure(Number.isSafeInteger(a.amount)&&a.amount>=settled,'O valor não pode ser menor que o total já '+(previous.kind==='expense'?'pago':'recebido')+' ('+money(settled)+').');ensure(JSON.stringify(a.units)===JSON.stringify(previous.units),'As unidades não podem mudar depois das baixas. Use estorno para corrigir.');ensure(JSON.stringify(a.shares||previous.shares)===JSON.stringify(previous.shares),'O rateio entre sócios não pode mudar depois das baixas.');}}ensure(a.kind==='expense'||a.kind==='revenue','Tipo inválido.');amount(a.amount);amount(a.fees||0,true);ensure(a.fees<=a.amount,'Taxas superiores ao valor bruto.');ensure(a.description?.trim()&&a.description.length<=300,'Informe uma descrição.');date(a.date);date(a.due);const r=previous?null:ruleAt(s.config,a.date);const shares=previous?.shares||(a.kind==='expense'?r!.cost:r!.revenue);let chosen=shares;if(a.shares&&JSON.stringify(a.shares)!==JSON.stringify(shares)){ensure(admin,'Apenas administradores autorizam exceções.');ensure(a.exception?.trim(),'Justifique a exceção ao rateio.');validShares(a.shares,s.config.partners.map(p=>p.id));chosen=a.shares}validateEntryUnits(s.config,a.units,previous);if(previous&&inactiveUnits(s.config).some(u=>a.units[u]>0))ensure(a.kind===previous.kind,'Preserve o tipo do lançamento de uma unidade inativa.');ensure(s.config.categories.includes(a.category)&&s.config.stages.includes(a.stage),'Categoria ou etapa inválida.');if(a.budgetId)ensure(s.config.budgets.some(b=>b.id===a.budgetId),'Orçamento vinculado não encontrado.');
 let party=typeof a.party==='string'?a.party.trim():'';const contactId=typeof a.contactId==='string'&&a.contactId?a.contactId:undefined;
 if(contactId){const contact=s.contacts?.find(c=>c.id===contactId);ensure(contact,'Fornecedor/cliente não encontrado.');const retained=previous?.contactId===contactId;ensure(retained||contact!.active,'Este fornecedor/cliente está inativo.');ensure(retained||contact!.kind==='both'||contact!.kind===(a.kind==='expense'?'supplier':'customer'),'O cadastro não corresponde ao tipo de lançamento.');party=retained?previous!.party:contact!.name;}
 const entry:Entry={...a,budgetId:typeof a.budgetId==='string'&&a.budgetId?a.budgetId:undefined,plannedSource:validFundingSource(s,a.plannedSource),party,contactId,id:previous?.id||action.id,shares:chosen,ruleId:previous?.ruleId||r!.id,base:previous?.base||r!.base||'net',reserve:previous?.reserve??r!.reserve??0,attachments:previous?.attachments||[],paymentPlan:previous?.paymentPlan,cancelled:false};if(previous)s.entries[s.entries.indexOf(previous)]=entry;else s.entries.push(entry);description=(previous?'Edição: ':'Novo lançamento: ')+a.description;
 }else if(action.type==='cancel'){const e=s.entries.find(e=>e.id===a.entry);ensure(e&&paid(s,e)===0,'Estorne as baixas antes de cancelar.');ensure(a.note?.trim(),'Informe o motivo.');e!.cancelled=true;description='Cancelamento: '+e!.description+' — '+a.note;
 }else if(action.type==='profile'){
  // Cada pessoa edita apenas o próprio perfil; a chave é o e-mail do login.
  const p=action.data&&typeof action.data==='object'?action.data:{};
  const email=String(actor||'').trim().toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Entre com sua conta para editar o perfil.');
  const clean=(value:unknown,max:number,label:string)=>{const text=typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim():'';ensure(text.length<=max,label+' deve ter até '+max+' caracteres.');return text};
  const profiles={...(s.config.profiles||{})};
  const next={...(profiles[email]||{})};
  if(Object.prototype.hasOwnProperty.call(p,'name'))next.name=clean(p.name,80,'O nome');
  if(Object.prototype.hasOwnProperty.call(p,'title'))next.title=clean(p.title,60,'O cargo');
  if(Object.prototype.hasOwnProperty.call(p,'photo')){
   const photo=typeof p.photo==='string'?p.photo.trim():'';
   ensure(!photo||/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(photo),'Foto do perfil inválida.');
   if(photo)next.photo=photo;else delete next.photo;
  }
  if(!next.name&&!next.title&&!next.photo)delete profiles[email];
  else profiles[email]={...next,updatedAt:new Date().toISOString()};
  s.config.profiles=profiles;
  description='Perfil atualizado'+(next.name?' · '+next.name:'');
 }else if(action.type==='config'){ensure(admin,'Apenas administradores alteram configurações.');validateConfig(a);ensure(s.config.partners.every(p=>a.partners.some((x:Partner)=>x.id===p.id)),'Inative sócios; não remova seu histórico.');ensure(s.config.accounts.every(x=>a.accounts.includes(x))&&s.config.units.every(x=>a.units.includes(x)),'Preserve contas e unidades existentes.');ensure(s.config.rules.every(r=>a.rules.some((x:Rule)=>JSON.stringify(x)===JSON.stringify(r))),'Regras anteriores são imutáveis; adicione uma nova vigência.');const before=inactiveUnits(s.config),after=inactiveUnits(a);const deactivated=after.filter(u=>!before.includes(u)),reactivated=before.filter(u=>!after.includes(u));s.config=withUnitActivity({...a,profiles:s.config.profiles});description='Configurações e orçamento atualizados'+(deactivated.length?' · Unidades inativadas: '+deactivated.join(', '):'')+(reactivated.length?' · Unidades reativadas: '+reactivated.join(', '):'');
 }else if(action.type==='attachment'){const e=s.entries.find(e=>e.id===a.entry);ensure(e,'Lançamento não encontrado.');ensure(a.file?.id&&a.file?.name,'Arquivo inválido.');
  // A purchase keeps its own documents (invoice, quote) while each payment may
  // carry its own receipt. Both live on the entry but stay distinguishable.
  const kind=a.file.kind==='payment'?'payment':'expense';
  const move=typeof a.file.move==='string'&&a.file.move?a.file.move:undefined;
  if(move){const m=activeMoves(s).find(x=>x.id===move);ensure(m&&m.entry===e!.id,'Pagamento não encontrado neste lançamento.');ensure(m!.type==='pay'||m!.type==='receive','O comprovante de pagamento precisa estar ligado a um pagamento ou recebimento.');}
  ensure(!move||kind==='payment','Comprovante de pagamento exige a natureza de pagamento.');
  e!.attachments.push({id:a.file.id,name:a.file.name,kind,...(move?{move}:{})});description=(kind==='payment'?'Comprovante de pagamento anexado: ':'Comprovante da despesa anexado: ')+a.file.name;
 }else if(action.type==='move_edit'){
  const data=action.data||{};const original=s.moves.find(m=>m.id===data.id);
  ensure(original,'Movimentação não encontrada.');
  ensure(original!.type!=='reverse','Estornos não podem ser corrigidos; registre a movimentação correta.');
  ensure(activeMoves(s).some(m=>m.id===original!.id),'Movimentação estornada não pode ser corrigida.');
  // The original is released before validating the new values so limits such as
  // "saldo a pagar" reflect the correction instead of the previous amount.
  const probe=structuredClone(s);probe.moves=probe.moves.filter(m=>m.id!==original!.id);
  const probeId=action.id+'-edit';
  const result=apply(probe,{id:probeId,type:'move',data:{...original,...data,type:original!.type,id:undefined}},actor,admin);
  const created=result.moves[result.moves.length-1];created.id=original!.id;
  s.moves=result.moves;s.entries=result.entries;s.audit=result.audit.filter(x=>x.id!==probeId);
  const linked=created.entry?s.entries.find(e=>e.id===created.entry):undefined;
  description='Movimentação corrigida: '+(moveLabels[created.type]||created.type)+(linked?' · '+linked.description:'')+' · '+money(created.amount);
 }else if(action.type==='move'){const m:Movement={...a,id:action.id,actor,at:new Date().toISOString()};date(m.date);ensure(m.date<=today(),'Movimentações realizadas não podem ter data futura.');if(m.type!=='reverse')amount(m.amount);ensure(m.note?.length<=2000,'Observação muito longa.');if(m.account)ensure(s.config.accounts.includes(m.account),'Conta inválida.');if(m.partner)ensure(s.config.partners.some(p=>p.id===m.partner),'Sócio inválido.');const e=s.entries.find(e=>e.id===m.entry);
 switch(m.type){case 'capital':case 'advance':ensure(m.partner&&m.account,'Selecione sócio e conta.');break;
 case 'pay':ensure(e?.kind==='expense'&&!e.cancelled,'Despesa inválida.');ensure(m.amount<=e!.amount-paid(s,e!),'Valor superior ao saldo a pagar.');ensure(!e!.planned,'Confirme a contratação antes de pagar.');if(m.source?.startsWith('direct:')){const[,p,k]=m.source.split(':');ensure(s.config.partners.some(x=>x.id===p&&x.active)&&['capital','advance'].includes(k),'Origem inválida.');delete m.account}else if(m.source?.startsWith('custody:')){ensure((t.custody[m.source.slice(8)]||0)>=m.amount,'Saldo sob guarda insuficiente.');delete m.account}else{ensure(m.account,'Selecione a conta pagadora.');if(m.source!=='project')ensure((t.lots[m.source!]||0)>=m.amount,'Saldo disponível do aporte insuficiente.');}break;
 case 'receive':ensure(e?.kind==='revenue'&&!e.cancelled,'Receita inválida.');amount(m.gross!);amount(m.fee||0,true);amount(m.reserve||0,true);ensure(m.gross!+paid(s,e!)<=e!.amount,'Recebimento superior ao saldo bruto.');ensure(m.fee!<=m.gross!,'Taxas superiores à parcela bruta.');const previousFees=sum(activeMoves(s).filter(x=>x.entry===e!.id&&x.type==='receive').map(x=>x.fee||0));ensure(previousFees+(m.fee||0)<=e!.fees,'Taxas superiores às previstas no lançamento.');m.amount=m.gross!-(m.fee||0);ensure(m.amount>=(m.reserve||0),'Reserva superior ao depósito líquido.');ensure(m.source==='project'?!!m.account:!!m.partner,'Informe quem recebeu.');break;
 case 'approve':ensure(admin,'Apenas administradores aprovam distribuições.');ensure(e?.kind==='revenue'&&!e.cancelled&&m.partner,'Receita ou sócio inválido.');ensure(m.note?.trim(),'Registre a justificativa da aprovação.');ensure(t.cash+sum(Object.values(t.custody))-sum(Object.values(t.partners).map((p:any)=>p.approved-p.distributed))>=m.amount,'Disponibilidade financeira insuficiente para aprovar.');break;
 case 'distribute':ensure(e?.kind==='revenue'&&m.partner,'Informe receita e sócio.');ensure(m.source?.startsWith('custody:')||m.account,'Informe a origem do repasse.');break;
 case 'custody':ensure(m.partner&&m.account,'Informe sócio e conta de destino.');break;
 case 'reimburse':case 'return':ensure(admin,'Apenas administradores autorizam devoluções.');ensure(m.partner&&m.account&&m.note?.trim(),'Informe sócio, conta e justificativa.');if(m.origin){const lot=activeMoves(s).find(x=>x.id===m.origin);ensure(lot&&lot.partner===m.partner&&lot.type===(m.type==='return'?'capital':'advance'),'Origem da devolução inválida.');ensure((t.lots[m.origin]||0)>=m.amount,'Saldo não utilizado da origem insuficiente.')}break;
 case 'transfer':ensure(m.account&&m.to&&m.account!==m.to&&s.config.accounts.includes(m.to),'Selecione duas contas diferentes.');break;
 case 'reverse':ensure(admin,'Apenas administradores autorizam estornos.');const original=activeMoves(s).find(x=>x.id===m.origin);ensure(original,'Movimentação já estornada ou inexistente.');ensure(m.note?.trim(),'Informe o motivo do estorno.');m.amount=0;break;
 default:throw new Error('Movimentação inválida.');}s.moves.push(m);description=(moveLabels[m.type]||m.type)+(e?' · '+e.description:'')+' · '+money(m.amount);
 }else throw new Error('Operação não reconhecida.');
 invariants(s);s.audit.unshift({id:action.id,at:new Date().toISOString(),actor,action:action.type,description});return s;
}
export const moveLabels:Record<string,string>={capital:'Aporte em caixa',advance:'Adiantamento em caixa',pay:'Pagamento',receive:'Recebimento',approve:'Distribuição aprovada',distribute:'Repasse ao sócio',custody:'Prestação de contas',return:'Devolução de aporte',reimburse:'Reembolso',transfer:'Transferência',reverse:'Estorno'};
export function demoLedger():Ledger{const c:Config={name:'Doze Studios',currency:'BRL',partners:[{id:'a',name:'Sócio A',email:'',active:true,joined:'2026-01-01',role:'admin'},{id:'b',name:'Sócio B',email:'',active:true,joined:'2026-01-01',role:'editor'}],units:['Áreas comuns',...Array.from({length:12},(_,i)=>`Loft ${String(i+1).padStart(2,'0')}`)],categories,stages,accounts:['Conta principal'],rules:[{id:'r1',from:'2026-01-01',ownership:{a:60,b:40},cost:{a:60,b:40},revenue:{a:60,b:40},base:'net',reserve:10}],budgets:[{id:'b1',category:'Módulos e estrutura',stage:'Estrutura',amount:42000000},{id:'b2',category:'Fundações',stage:'Preparação',amount:12000000},{id:'b3',category:'Instalações elétricas',stage:'Instalações',amount:9500000},{id:'b4',category:'Revestimentos',stage:'Acabamentos',amount:18000000},{id:'b5',category:'Projetos e licenças',stage:'Planejamento',amount:6500000},{id:'b6',category:'Mobiliário',stage:'Entrega',amount:12000000}]};let s=emptyLedger(c);const add=(type:string,data:any,k:string)=>{s=apply(s,{id:k,type,data},'Demonstração')};const tx=(data:any,k:string)=>add('move',{note:'Exemplo ilustrativo',date:'2026-09-15',...data},k);tx({type:'capital',partner:'a',account:'Conta principal',amount:22000000,date:'2026-08-01'},'ca');tx({type:'capital',partner:'b',account:'Conta principal',amount:13000000,date:'2026-08-02'},'cb');const rows=[['Módulos estruturais · lote 01','Modular Brasil','Módulos e estrutura','Estrutura',21000000,'2026-09-10'],['Fundação e base de concreto','Base Engenharia','Fundações','Preparação',7800000,'2026-09-20'],['Projeto arquitetônico executivo','Estúdio Arquitetura','Projetos e licenças','Planejamento',3200000,'2026-08-15'],['Instalações elétricas · etapa 01','Eletro Obras','Instalações elétricas','Instalações',2850000,'2026-10-10'],['Revestimentos dos banheiros','Casa Acabamentos','Revestimentos','Acabamentos',1860000,'2026-10-15'],['Mobiliário sob medida','Ateliê Modular','Mobiliário','Entrega',3600000,'2026-10-23']];rows.forEach((r,i)=>add('entry',{kind:'expense',description:r[0],party:r[1],category:r[2],stage:r[3],amount:r[4],due:r[5],date:'2026-08-01',units:{'Áreas comuns':100},fees:0,note:'Dados de demonstração',document:`NF ${1021+i}`,planned:false},'e'+i));tx({type:'pay',entry:'e0',source:'ca',account:'Conta principal',amount:15000000,date:'2026-08-20'},'p0');tx({type:'pay',entry:'e0',source:'cb',account:'Conta principal',amount:6000000,date:'2026-08-20'},'p1');tx({type:'pay',entry:'e1',source:'ca',account:'Conta principal',amount:4000000,date:'2026-09-08'},'p2');tx({type:'pay',entry:'e1',source:'cb',account:'Conta principal',amount:3800000,date:'2026-09-08'},'p3');tx({type:'pay',entry:'e2',source:'direct:a:capital',amount:3200000,date:'2026-08-15'},'p4');tx({type:'pay',entry:'e3',source:'cb',account:'Conta principal',amount:1000000,date:'2026-09-25'},'p5');add('entry',{kind:'revenue',description:'Reserva antecipada · lofts 01 a 04',party:'Reservas diretas',category:'Administrativo',stage:'Entrega',amount:1200000,fees:120000,date:'2026-09-01',due:'2026-10-10',units:{'Loft 01':25,'Loft 02':25,'Loft 03':25,'Loft 04':25},note:'Receita ilustrativa',document:'',planned:false},'r0');tx({type:'receive',entry:'r0',source:'project',account:'Conta principal',gross:600000,fee:60000,reserve:54000,amount:540000,date:'2026-09-28'},'rc0');return s;}
