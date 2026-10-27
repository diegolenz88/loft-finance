import {access,failure,sameOrigin} from '@/lib/server';
import {normalizeEmail} from '@/lib/credentials';
import {LINK_TTL_MINUTES,hasAccess,createLink} from '@/lib/magic';

export const dynamic = 'force-dynamic';

// Administrators can generate a link and hand it over directly. This keeps the
// passwordless flow usable before an e-mail provider is configured, and gives a
// way to unblock anyone whose inbox is not receiving the message.
//
// The link is bound to the requested e-mail: the same rule used by the "request a
// link" form decides who may receive one, so a standalone account works here too.
export async function POST(req: Request){
  try{
    sameOrigin(req);
    const a = await access();
    if(a.role !== 'admin') throw new Error('Apenas administradores geram links de acesso.');

    const body = (await req.json().catch(() => ({}))) as {email?:string};
    const email = normalizeEmail(body.email);
    if(!email) throw new Error('Informe o e-mail do acesso.');

    if(!(await hasAccess(email))) throw new Error('Este e-mail não tem acesso ao sistema.');

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
