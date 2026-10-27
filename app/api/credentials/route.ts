import {access,failure,sameOrigin} from '@/lib/server';
import {isRole,listAccesses,normalizeEmail,removeAccess,saveAccess,saveAccessMeta} from '@/lib/credentials';
import {secretProblem} from '@/lib/passwords';
import {authOwner} from '@/lib/identity';
import {currentMailStatus} from '@/lib/mailer';

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
    const rows = await listAccesses();
    const partners = a.ledger?.config.partners.map((p) => ({id:p.id, name:p.name, email:normalizeEmail(p.email), role:p.role, active:p.active})) ?? [];
    const partnerEmails = new Set(partners.map((p) => p.email));
    return Response.json({
      accesses: rows.map((r) => r.email),
      // Accounts with a role but no partner record are standalone users.
      standalone: rows.filter((r) => !partnerEmails.has(r.email) && r.role).map((r) => ({email:r.email, name:r.name, role:r.role})),
      partners,
      owner: ownerEmail(a.user.email),
      mail: await currentMailStatus(),
    }, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}

export async function POST(req: Request){
  try{
    sameOrigin(req);
    const a = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {email?:string; secret?:string; name?:string; role?:string};
    const email = normalizeEmail(body.email);
    const plain = typeof body.secret === 'string' ? body.secret : '';

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    if(body.role !== undefined && !isRole(body.role)) throw new Error('Permissão inválida.');

    const owner = ownerEmail(a.user.email);
    const partner = a.ledger?.config.partners.find((p) => normalizeEmail(p.email) === email);
    const standalone = !partner && email !== owner && (await listAccesses()).some((r) => r.email === email && r.role);

    // A standalone account may have its role changed without a new password.
    if(!plain && standalone){
      await saveAccessMeta(email, {name: body.name ?? null, role: body.role ?? null}, a.user.email);
      return Response.json({ok:true, email, accesses: (await listAccesses()).map((row) => row.email)}, {headers:{'Cache-Control':'no-store'}});
    }

    const problem = secretProblem(plain);
    if(problem) throw new Error(problem);

    if(email !== owner && !partner && !standalone) throw new Error('Cadastre o usuário antes de criar o acesso.');
    if(partner && !partner.active) throw new Error('Ative o sócio antes de criar o acesso.');

    // The role is only meaningful for standalone accounts; for partners and for
    // the owner it always comes from the ledger or the Worker secrets.
    await saveAccess(email, plain, a.user.email, standalone ? {role: isRole(body.role) ? body.role : undefined} : {});
    return Response.json({ok:true, email, accesses: (await listAccesses()).map((row) => row.email)}, {headers:{'Cache-Control':'no-store'}});
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
    return Response.json({ok:true, accesses: (await listAccesses()).map((row) => row.email)}, {headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}


