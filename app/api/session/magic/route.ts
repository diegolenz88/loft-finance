import {failure,sameOrigin} from '@/lib/server';
import {createSessionToken,sessionCookie,sessionSecret} from '@/lib/identity';
import {mailerConfigured,sendLoginLink} from '@/lib/mailer';
import {LINK_TTL_MINUTES,authorizedEmail,consumeLink,createLink} from '@/lib/magic';
import {renderLogin} from '@/lib/login-page';
import {safeReturnTo} from '@/lib/redirects';

export const dynamic = 'force-dynamic';

// Same best-effort throttle as the password route, keyed by e-mail. A link
// request writes a row and sends an e-mail, so it is worth limiting too.
const requests = new Map<string, {count: number; until: number}>();
const MAX_REQUESTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function blocked(key: string): boolean {
  const entry = requests.get(key);
  if (!entry) return false;
  if (entry.until <= Date.now()) {
    requests.delete(key);
    return false;
  }
  return entry.count >= MAX_REQUESTS;
}

function register(key: string) {
  const entry = requests.get(key);
  if (entry && entry.until > Date.now()) entry.count += 1;
  else requests.set(key, {count: 1, until: Date.now() + WINDOW_MS});
}

function linkUrl(req: Request, token: string, returnTo: string): string {
  const url = new URL('/api/session/magic', req.url);
  url.searchParams.set('token', token);
  if (returnTo !== '/') url.searchParams.set('return_to', returnTo);
  return url.toString();
}

// GET consumes a token and signs the person in. A used, expired or forged token
// lands on the form again with a neutral message — never on an error page.
export async function GET(req: Request){
  try{
    const url = new URL(req.url);
    const secure = url.protocol === 'https:';
    const token = url.searchParams.get('token');
    if(!token){
      return Response.redirect(new URL('/api/session?modo=link', url).toString(), 303);
    }

    const email = await consumeLink(token);
    if(!email){
      return renderLogin({
        mode: 'magic',
        message: 'Este link expirou ou já foi usado. Peça um novo.',
        magicEnabled: await mailerConfigured(),
      });
    }

    const signed = await createSessionToken(email, sessionSecret());
    const returnTo = safeReturnTo(url.searchParams.get('return_to'));
    return new Response(null,{status:303,headers:{Location:returnTo, 'Set-Cookie':sessionCookie(signed, secure)}});
  }catch(e){return failure(e)}
}

export async function POST(req: Request){
  try{
    sameOrigin(req);
    const data = await req.formData();
    const returnTo = safeReturnTo(String(data.get('return_to') || '/'));
    const typed = String(data.get('email') || '').trim().toLowerCase();

    if(!await mailerConfigured()){
      return renderLogin({
        mode: 'magic',
        email: typed,
        returnTo,
        message: 'Envio de e-mail ainda não está configurado neste servidor. Use a senha ou peça um link ao administrador.',
        magicEnabled: false,
      });
    }

    // The same answer is shown whether or not the address is registered, so the
    // screen cannot be used to discover who takes part in the project.
    const notice = 'Se este e-mail tiver acesso, o link chegará em instantes. Confira também a caixa de spam.';
    const email = await authorizedEmail(typed);
    if(!email || blocked(email)){
      return renderLogin({mode: 'magic', email: typed, returnTo, notice, magicEnabled: true});
    }

    register(email);
    const {token} = await createLink(email);
    const result = await sendLoginLink(email, linkUrl(req, token, returnTo), LINK_TTL_MINUTES);
    if(!result.sent){
      return renderLogin({mode: 'magic', email: typed, returnTo, magicEnabled: true, message: result.reason ?? 'Não foi possível enviar o e-mail agora.'});
    }
    return renderLogin({mode: 'magic', email: typed, returnTo, notice, magicEnabled: true});
  }catch(e){return failure(e)}
}
