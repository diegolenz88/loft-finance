import {access,failure,sameOrigin} from '@/lib/server';
import {mailerStatus,sendLoginLink} from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// Lets an administrator confirm the e-mail setup without waiting for a partner to
// report that the link never arrived. The test message is a real login link sent
// to the administrator's own address.
export async function GET(){
  try{
    await access();
    return Response.json(mailerStatus(), {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}

export async function POST(req: Request){
  try{
    sameOrigin(req);
    const a = await access();
    if(a.role !== 'admin') throw new Error('Apenas administradores testam o envio de e-mail.');

    const status = mailerStatus();
    if(!status.configured) throw new Error(`Envio de e-mail não configurado (falta ${status.missing}).`);

    // Reuses the login mail so the test proves the whole path, not just the API key.
    const origin = new URL(req.url).origin;
    const result = await sendLoginLink(
      a.user.email,
      `${origin}/api/session?modo=link`,
      15,
    );
    if(!result.sent) throw new Error(result.reason || 'Não foi possível enviar o e-mail de teste.');
    return Response.json({ok:true, provider:status.provider, to:a.user.email}, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}
