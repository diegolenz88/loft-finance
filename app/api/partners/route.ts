import {bindings,access,failure,sameOrigin} from '@/lib/server';
import {apply,id,ruleAt,today} from '@/lib/finance';
import {isRole,normalizeEmail,saveAccess} from '@/lib/credentials';
import {secretProblem} from '@/lib/passwords';

export const dynamic = 'force-dynamic';

// Rules are immutable, so a new partner enters through a new effective version.
// The date is the first free day at or after today, which keeps every existing
// rule byte-identical.
function nextRuleDate(rules:{from:string}[], start:string): string {
  const used = new Set(rules.map((rule) => rule.from));
  const cursor = new Date(`${start}T12:00:00Z`);
  for (let step = 0; step < 60; step += 1) {
    const candidate = cursor.toISOString().slice(0, 10);
    if (!used.has(candidate)) return candidate;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  throw new Error('Não há data livre para a nova vigência das regras.');
}

// Creates a login and, optionally, the matching partner.
//
// `asPartner: false` creates a standalone account: the person can sign in and use
// the app with the chosen role, without appearing in rateios, extratos or the
// partner lists. That is the case for accountants and assistants who need access
// but hold no share of the project.
export async function POST(req: Request){
  try{
    sameOrigin(req);
    const a = await access();
    if(a.role !== 'admin') throw new Error('Apenas administradores cadastram novos usuários.');
    if(!a.ledger || !a.row) throw new Error('Configure o empreendimento primeiro.');

    const body = (await req.json().catch(() => ({}))) as {name?:string; email?:string; role?:string; secret?:string; asPartner?:boolean};
    const email = normalizeEmail(body?.email);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const role = typeof body?.role === 'string' ? body.role : 'viewer';
    const plain = typeof body?.secret === 'string' ? body.secret : '';
    const asPartner = body?.asPartner !== false;

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    if(!name) throw new Error('Informe o nome do usuário.');
    if(name.length > 120) throw new Error('O nome é muito longo.');
    if(!isRole(role)) throw new Error('Permissão inválida.');
    const problem = secretProblem(plain);
    if(problem) throw new Error(problem);

    const existing = a.ledger.config.partners.find((p) => normalizeEmail(p.email) === email);
    if(existing){
      if(!existing.active) throw new Error('Este e-mail pertence a um sócio inativo. Reative-o antes de criar o acesso.');
      await saveAccess(email, plain, a.user.email);
      return Response.json(
        {ok:true, email, created:false, asPartner:true, partner:{id:existing.id, name:existing.name, role:existing.role}},
        {headers:{'Cache-Control':'no-store'}},
      );
    }

    // Standalone account: no partner row, no rule version. The role lives with
    // the credential and is honoured by `access()`.
    if(!asPartner){
      await saveAccess(email, plain, a.user.email, {name, role});
      return Response.json(
        {ok:true, email, created:true, asPartner:false, access:{name, role}},
        {headers:{'Cache-Control':'no-store'}},
      );
    }

    const partnerId = id();
    const config = structuredClone(a.ledger.config);
    config.partners = [
      ...config.partners,
      {id:partnerId, name, email, active:true, joined:today(), role:role as 'admin'|'editor'|'viewer'},
    ];
    // 0% keeps every rule summing exactly 100%, and a new version leaves the
    // historical rules untouched.
    const current = ruleAt(config, today());
    const from = nextRuleDate(config.rules, today());
    config.rules = [
      ...config.rules,
      {
        id: id(),
        from,
        ownership: {...current.ownership, [partnerId]: 0},
        cost: {...current.cost, [partnerId]: 0},
        revenue: {...current.revenue, [partnerId]: 0},
        base: current.base,
        reserve: current.reserve,
      },
    ];

    const action = {id:id(), type:'config', data:config};
    const ledger = apply(a.ledger, action, a.user.email, true);
    const saved = await bindings().DB
      .prepare('UPDATE finance_project SET data = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(JSON.stringify(ledger), 'main', a.row.version)
      .run();
    if(saved.meta.changes !== 1) throw new Error('Outra alteração foi salva enquanto isso. Recarregue e tente novamente.');

    // The partner's role comes from the ledger, so the credential needs no role.
    await saveAccess(email, plain, a.user.email, {name});
    return Response.json(
      {
        ok:true,
        email,
        created:true,
        asPartner:true,
        version:a.row.version + 1,
        ruleFrom: from,
        partner:{id:partnerId, name, role},
        ledger,
      },
      {headers:{'Cache-Control':'no-store'}},
    );
  }catch(e){return failure(e)}
}
