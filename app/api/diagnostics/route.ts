import {access,failure,sameOrigin} from '@/lib/server';
export const dynamic='force-dynamic';

export async function POST(req:Request){
  try{
    sameOrigin(req);await access();
    if(Number(req.headers.get('content-length'))>2000)throw new Error('Solicitação muito grande.');
    const raw=await req.text();if(raw.length>2000)throw new Error('Solicitação muito grande.');
    const data=JSON.parse(raw);
    if(!['/api/finance','/api/files'].includes(data.path)||!['GET','POST'].includes(data.method)||
      !Number.isInteger(data.status)||data.status<0||data.status>599||
      !['json','html','other','none'].includes(data.format)||
      !['network','redirect','non-json','invalid-json','invalid-data','response'].includes(data.reason))throw new Error('Diagnóstico inválido.');
    console.error('Finance client response failure',JSON.stringify({path:data.path,method:data.method,status:data.status,
      format:data.format,reason:data.reason,requestId:typeof data.requestId==='string'?data.requestId.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100):''}));
    return Response.json({received:true},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}
