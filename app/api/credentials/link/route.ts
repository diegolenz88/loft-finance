import {access,failure,sameOrigin} from '@/lib/server';
import {normalizeEmail} from '@/lib/credentials';
import {LINK_TTL_MINUTES,authorizedInLedger,createLink} from '@/lib/magic';

export const dynamic = 'force-dynamic';

// Administrators can generate a link and hand it over directly. This keeps the
// passwordless flow usable before an e-mail provider is configured, and gives a
// way to unblock a partner whose inbox is not receiving the message.
export async function POST(req: Request){
  try{
    sameOrigin(req);
    const a = await access();
    if(a.role !== 'admin') throw new Error('Apenas administradores geram links de acesso.');

    const body: any = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if(!email) throw new Error('Informe o e-mail do acesso.');

    const authorized = authorizedInLedger(email, a.ledger);
    if(!authorized) throw new Error('Este e-mail não pertence a um sócio ativo.');

    const {token, expiresAt} = await createLink(email);
    const origin = new URL(req.url).origin;
    const url = new URL('/api/session/magic', origin);
    url.searchParams.set('token', token);
    return Response.json(
      {ok: true, email, url: url.toString(), expiresAt: expiresAt.toISOString(), hint: `Válido por ${LINK_TTL_MINUTES} minutos e de uso único.`},
      {headers:{'Cache-Control':'no-store'}},
    );
  }catch(e){return failure(e)}
}
