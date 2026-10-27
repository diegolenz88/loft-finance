import {access,failure,sameOrigin} from '@/lib/server';
import {currentMailStatus,sendTestMail} from '@/lib/mailer';
import {PROVIDERS,PROVIDER_LABEL,addressProblem,isProvider} from '@/lib/mail-config';
import {readMail,saveMail,clearMail} from '@/lib/settings';
import {createLink} from '@/lib/magic';

export const dynamic = 'force-dynamic';

async function requireAdmin(){
  const a = await access();
  if (a.role !== 'admin') throw new Error('Apenas administradores configuram o envio de e-mail.');
  return a;
}

function providerList(){
  return PROVIDERS.map((value) => ({value, label: PROVIDER_LABEL[value]}));
}

// Reports the state without ever returning the stored key.
export async function GET(){
  try{
    const a = await requireAdmin();
    const status = await currentMailStatus();
    const stored = await readMail().catch(() => null);
    return Response.json(
      {
        ...status,
        editable: status.source !== 'environment',
        from: stored?.from ?? null,
        providers: providerList(),
        owner: a.user.email,
      },
      {headers:{'Cache-Control':'no-store'}},
    );
  }catch(e){return failure(e)}
}

// Saves the provider, sender and key. The key may be omitted to keep the current
// one, which is what the screen does when the admin only changes the sender.
export async function POST(req: Request){
  try{
    sameOrigin(req);
    const a = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {action?:string; provider?:string; from?:string; key?:string};

    if(body?.action === 'test'){
      const status = await currentMailStatus();
      if(!status.configured) throw new Error(`Envio de e-mail não configurado (falta ${status.missing}).`);
      const origin = new URL(req.url).origin;
      const {token} = await createLink(a.user.email);
      const url = new URL('/api/session/magic', origin);
      url.searchParams.set('token', token);
      const result = await sendTestMail(a.user.email, url.toString());
      if(!result.sent) throw new Error(result.reason || 'Não foi possível enviar o e-mail de teste.');
      return Response.json({ok:true, to:a.user.email, provider:status.label}, {headers:{'Cache-Control':'no-store'}});
    }

    if(!isProvider(body?.provider)) throw new Error('Escolha o provedor de e-mail.');
    const problem = addressProblem(body?.from);
    if(problem) throw new Error(problem);

    const previous = await readMail().catch(() => null);
    const incomingKey = typeof body?.key === 'string' ? body.key.trim() : '';
    const key = incomingKey || (previous && previous.provider === body.provider ? previous.key : '');
    if(!key) throw new Error('Informe a chave de API do provedor.');
    if(key.length < 8) throw new Error('A chave de API parece curta demais. Confira no painel do provedor.');

    await saveMail({provider:body.provider, from:String(body.from).trim(), key}, a.user.email);
    return Response.json({ok:true, status: await currentMailStatus()}, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}

export async function DELETE(req: Request){
  try{
    sameOrigin(req);
    await requireAdmin();
    await clearMail();
    return Response.json({ok:true, status: await currentMailStatus()}, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}
