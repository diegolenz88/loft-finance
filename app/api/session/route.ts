import {env} from 'cloudflare:workers';
import {failure,sameOrigin} from '@/lib/server';
import {authOwner,clearedSessionCookie,createSessionToken,sessionCookie,sessionSecret} from '@/lib/identity';
import {checkAccess,normalizeEmail,sameSecret} from '@/lib/credentials';
import {mailerConfigured} from '@/lib/mailer';
import {renderLogin,renderNotice} from '@/lib/login-page';
import {safeReturnTo} from '@/lib/redirects';

export const dynamic = 'force-dynamic';

export {safeReturnTo};

function secret(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
}

// Best-effort throttle per isolate: enough to stop a script from guessing the
// shared secret, without adding a table just for counters.
const attempts = new Map<string, {count: number; until: number}>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function blocked(key: string): number {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (entry.until <= Date.now()) {
    attempts.delete(key);
    return 0;
  }
  return entry.count >= MAX_ATTEMPTS ? Math.ceil((entry.until - Date.now()) / 60000) : 0;
}

function registerFailure(key: string) {
  const entry = attempts.get(key);
  if (entry && entry.until > Date.now()) entry.count += 1;
  else attempts.set(key, {count: 1, until: Date.now() + WINDOW_MS});
}

const magicEnabled = () => mailerConfigured();

export async function GET(req?: Request){
  try{
    const url = req ? new URL(req.url) : undefined;
    const returnTo = safeReturnTo(url?.searchParams.get('return_to') ?? null);
    const notice = url?.searchParams.get('saiu') === '1' ? 'Você saiu da sua conta.' : '';
    if(secret('ACCESS_REQUIRED')==='1'){
      return renderNotice('Entre pela política de acesso da organização para continuar.', 'Acesso via Cloudflare Access');
    }
    if(!authOwner()){
      return renderNotice('Defina os segredos AUTH_OWNER_EMAIL, AUTH_OWNER_ID e AUTH_SECRET no Worker.', 'Login não configurado', 500);
    }
    return renderLogin({
      mode: url?.searchParams.get('modo') === 'link' ? 'magic' : 'secret',
      returnTo,
      notice,
      magicEnabled: magicEnabled(),
    });
  }catch(e){return failure(e)}
}

export async function POST(req: Request){
  try{
    sameOrigin(req);
    const url = new URL(req.url);
    const secure = url.protocol === 'https:';
    if(url.searchParams.get('acao') === 'sair'){
      return new Response(null,{status:303,headers:{Location:'/api/session?saiu=1','Set-Cookie':clearedSessionCookie(secure)}});
    }

    const data = await req.formData();
    const returnTo = safeReturnTo(String(data.get('return_to') || '/'));
    const email = normalizeEmail(data.get('email'));
    const plain = String(data.get('secret') || '');
    const owner = authOwner();
    if(!owner) throw new Error('Login não configurado. Defina o proprietário no Worker.');

    const who = email || 'sem-email';
    const wait = blocked(who);
    if(wait) return renderLogin({email, returnTo, message:`Muitas tentativas. Aguarde ${wait} minuto(s) e tente novamente.`, magicEnabled: magicEnabled(), status: 429});

    // The owner keeps the Worker secret as a recovery path; every other partner
    // signs in with the credentials created in Configurações → Acessos.
    const ownerMatch = email === owner.email && sameSecret(plain, secret('APP_PASSWORD'));
    const partnerMatch = !ownerMatch && email ? await checkAccess(email, plain) : false;

    if(!ownerMatch && !partnerMatch){
      registerFailure(who);
      return renderLogin({email, returnTo, message:'E-mail ou senha incorretos.', magicEnabled: magicEnabled(), status: 401});
    }

    attempts.delete(who);
    const token = await createSessionToken(email, sessionSecret());
    return new Response(null,{status:303,headers:{Location:returnTo, 'Set-Cookie':sessionCookie(token, secure)}});
  }catch(e){return failure(e)}
}
