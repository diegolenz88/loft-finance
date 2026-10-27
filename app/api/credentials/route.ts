import {access,failure,sameOrigin} from '@/lib/server';
import {listAccessEmails,normalizeEmail,removeAccess,saveAccess} from '@/lib/credentials';
import {secretProblem} from '@/lib/passwords';
import {authOwner} from '@/lib/identity';
import {mailerStatus} from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// Managing logins is reserved to administrators. The owner email itself is
// always reported so the screen can explain the bootstrap entry.
async function requireAdmin(){
  const a = await access();
  if (a.role !== 'admin') throw new Error('Apenas administradores gerenciam acessos.');
  return a;
}

function ownerEmail(fallback: string){
  return authOwner()?.email ?? normalizeEmail(fallback);
}

export async function GET(){
  try{
    const a = await requireAdmin();
    const emails = await listAccessEmails();
    return Response.json({
      accesses: emails,
      partners: a.ledger?.config.partners.map((p) => ({id:p.id, name:p.name, email:normalizeEmail(p.email), role:p.role, active:p.active})) ?? [],
      owner: ownerEmail(a.user.email),
      mail: mailerStatus(),
    }, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}

export async function POST(req: Request){
  try{
    sameOrigin(req);
    const a = await requireAdmin();
    const body: any = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const plain = typeof body.secret === 'string' ? body.secret : '';

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    const problem = secretProblem(plain);
    if(problem) throw new Error(problem);

    const owner = ownerEmail(a.user.email);
    const partner = a.ledger?.config.partners.find((p) => normalizeEmail(p.email) === email);
    if(email !== owner && !partner) throw new Error('Cadastre o e-mail no sócio antes de criar o acesso.');
    if(partner && !partner.active) throw new Error('Ative o sócio antes de criar o acesso.');

    await saveAccess(email, plain, a.user.email);
    return Response.json({ok:true, email, accesses: await listAccessEmails()}, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}

export async function DELETE(req: Request){
  try{
    sameOrigin(req);
    const a = await requireAdmin();
    const email = normalizeEmail(new URL(req.url).searchParams.get('email'));
    const owner = ownerEmail(a.user.email);
    if(!email) throw new Error('Informe o e-mail do acesso.');
    if(email === owner) throw new Error('O acesso do proprietário não pode ser removido; altere a senha no Worker.');
    const removed = await removeAccess(email);
    if(!removed) throw new Error('Este e-mail não possui acesso cadastrado.');
    return Response.json({ok:true, accesses: await listAccessEmails()}, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}
