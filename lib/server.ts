import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {currentIdentity} from './identity';
import {readStandaloneRole} from './credentials';
import {type Ledger,withUnitActivity} from './finance';
export function bindings(){return env as unknown as {DB:D1Database;BUCKET:R2Bucket}}
export async function access(){const requestHeaders=await headers();const user=await currentIdentity(requestHeaders.get('cookie'));if(!user)throw new Error('AUTH');const row=await bindings().DB.prepare('SELECT * FROM finance_project WHERE id = ?').bind('main').first<{id:string;owner:string;data:string;version:number}>();if(!row)return{user,row:null,ledger:null,role:'admin'};const ledger=JSON.parse(row.data) as Ledger;const matched=ledger.config.partners.find(p=>p.active&&p.email.toLowerCase()===user.email.toLowerCase());
 // Owner first, then an active partner, then a standalone account — someone who
 // signs in without being a partner still gets the role stored with the login.
 let role: 'admin'|'editor'|'viewer'|undefined=row.owner===user.userId?'admin':matched?.role;
 if(!role)role=(await readStandaloneRole(user.email))??undefined;
 if(!role)throw new Error('FORBIDDEN');ledger.config=withUnitActivity(ledger.config);return{user,row,ledger,role};}
export function failure(e:unknown){const msg=e instanceof Error?e.message:'Não foi possível salvar. Tente novamente.';console.error('Finance request failed',msg);return Response.json({error:msg==='AUTH'?'Entre com sua conta para acessar.':msg==='FORBIDDEN'?'Seu usuário não tem permissão neste empreendimento.':msg},{status:msg==='AUTH'?401:msg==='FORBIDDEN'?403:400,headers:{'Cache-Control':'no-store'}})}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('Origem da requisição inválida.');}
