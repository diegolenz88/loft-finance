import type {Ledger,Profile} from './finance';

export type FinanceSnapshot = {ledger:Ledger|null;version:number;role:string;profile?:Profile|null;user?:string};
type Fetcher = typeof fetch;
type Diagnostic = {path:string;method:string;status:number;format:string;requestId:string;reason:string};

export class ApiResponseError extends Error {
  diagnostic:Diagnostic;
  uncertain:boolean;
  constructor(message:string,diagnostic:Diagnostic,uncertain=false){
    super(message);this.name='ApiResponseError';this.diagnostic=diagnostic;this.uncertain=uncertain;
  }
}

// Response bodies may be a sign-in page or an upstream error. Never interpret
// HTML as JSON, inject it into the UI, or include financial payloads in logs.
export async function requestJson(path:string,options:RequestInit={},fetcher:Fetcher=fetch):Promise<any>{
  const method=options.method||'GET';
  let response:Response;
  try{
    response=await fetcher(path,{...options,credentials:'same-origin',redirect:'manual',cache:'no-store',
      headers:{Accept:'application/json',...options.headers}});
  }catch{
    throw new ApiResponseError('A conexão foi interrompida. Seu preenchimento foi mantido. Tente salvar novamente.',
      {path,method,status:0,format:'none',requestId:'',reason:'network'},true);
  }
  const contentType=response.headers.get('content-type')||'';
  const format=contentType.includes('json')?'json':contentType.includes('html')?'html':'other';
  const diagnostic:Diagnostic={path,method,status:response.status,format,
    requestId:(response.headers.get('cf-ray')||response.headers.get('x-request-id')||'').slice(0,100),reason:'response'};
  if(response.type==='opaqueredirect'||response.redirected||(response.status>=300&&response.status<400)){
    throw new ApiResponseError('O acesso foi redirecionado antes de concluir a operação. Abra o sistema em outra aba e entre novamente; o preenchimento permanece nesta aba.',
      {...diagnostic,reason:'redirect'},true);
  }
  let data:any;
  if(format==='json'){
    try{data=await response.json()}catch{
      throw new ApiResponseError('O servidor enviou uma resposta incompleta. Seu preenchimento foi mantido. Tente novamente.',
        {...diagnostic,reason:'invalid-json'},true);
    }
  }else{
    const code=response.status?` (HTTP ${response.status})`:'';
    const message=response.status===401?'Sua sessão expirou. Abra o sistema em outra aba e entre novamente.':
      response.status===403?'O servidor bloqueou a solicitação antes de confirmar a gravação.':
      response.status>=500?'O serviço está temporariamente indisponível.':
      'O servidor devolveu uma página em vez da confirmação da operação.';
    throw new ApiResponseError(message+code+' Seu preenchimento foi mantido.',{...diagnostic,reason:'non-json'},true);
  }
  if(!response.ok){
    throw new ApiResponseError(typeof data?.error==='string'?data.error:`Não foi possível concluir a operação (HTTP ${response.status}).`,diagnostic,response.status>=500);
  }
  if(!data||typeof data!=='object'||Array.isArray(data)){
    throw new ApiResponseError('A resposta do servidor está incompleta. Seu preenchimento foi mantido.',{...diagnostic,reason:'invalid-data'},true);
  }
  return data;
}

export function reportApiError(error:unknown,fetcher:Fetcher=fetch){
  if(!(error instanceof ApiResponseError)||!error.uncertain)return;
  // Bounded metadata only; never transmit the form, response body or credentials.
  void fetcher('/api/diagnostics',{method:'POST',credentials:'same-origin',redirect:'error',
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(error.diagnostic)}).catch(()=>{});
}

function snapshot(value:any):FinanceSnapshot{
  if(!Number.isInteger(value?.version)||typeof value?.role!=='string'||
    !(value.ledger===null||(value.ledger?.config&&Array.isArray(value.ledger.entries)&&Array.isArray(value.ledger.audit)))){
    throw new ApiResponseError('A resposta financeira está incompleta. Seu preenchimento foi mantido.',
      {path:'/api/finance',method:'GET',status:200,format:'json',requestId:'',reason:'invalid-data'},true);
  }
  return value;
}

export async function loadFinance(fetcher:Fetcher=fetch){
  return snapshot(await requestJson('/api/finance',{},fetcher));
}

export async function saveFinance(action:{id:string;type:string;data:any;version:number},fetcher:Fetcher=fetch){
  try{
    const saved=snapshot(await requestJson('/api/finance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)},fetcher));
    if(!saved.ledger)throw new ApiResponseError('O servidor não confirmou a gravação. Seu preenchimento foi mantido.',
      {path:'/api/finance',method:'POST',status:200,format:'json',requestId:'',reason:'invalid-data'},true);
    return saved;
  }catch(error){
    reportApiError(error,fetcher);
    if(error instanceof ApiResponseError&&error.uncertain){
      // A lost response does not mean the write failed. Confirm by operation ID
      // with a read only request; never automatically replay a financial write.
      try{
        const current=await loadFinance(fetcher);
        if(current.ledger?.audit.some(item=>item.id===action.id))return current;
      }catch{/* Keep the original failure and the pending operation ID. */}
    }
    throw error;
  }
}
