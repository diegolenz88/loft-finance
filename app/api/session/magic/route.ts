import {failure,sameOrigin} from '@/lib/server';
import {createSessionToken,sessionCookie,sessionSecret} from '@/lib/identity';
import {mailerConfigured,sendLoginLink} from '@/lib/mailer';
import {LINK_TTL_MINUTES,authorizedEmail,consumeLink,createLink,peekLink} from '@/lib/magic';
import {renderLogin,renderMagicConfirm} from '@/lib/login-page';
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

const expiredMessage = 'Este link expirou, já foi usado ou o acesso foi removido. Peça um novo.';

// GET only inspects the token. Opening the link is a two-step flow because
// messengers, e-mail clients and antivirus fetch URLs automatically: if the GET
// consumed the token, the link would be spent before the person clicked it.
export async function GET(req: Request){
  try{
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if(!token){
      return Response.redirect(new URL('/api/session?modo=link', url).toString(), 303);
    }

    const email = await peekLink(token);
    if(!email){
      return renderLogin({
        mode: 'magic',
        message: expiredMessage,
        magicEnabled: await mailerConfigured(),
      });
    }

    return renderMagicConfirm({
      email,
      token,
      returnTo: safeReturnTo(url.searchParams.get('return_to')),
    });
  }catch(e){return failure(e)}
}

export async function POST(req: Request){
  try{
    sameOrigin(req);
    const data = await req.formData();

    // Confirmation of an existing link: spend the token and sign in.
    const token = String(data.get('token') || '');
    if(token){
      const email = await consumeLink(token);
      if(!email){
        return renderLogin({
          mode: 'magic',
          message: expiredMessage,
          magicEnabled: await mailerConfigured(),
        });
      }
      const signed = await createSessionToken(email, sessionSecret());
      const secure = new URL(req.url).protocol === 'https:';
      const returnTo = safeReturnTo(String(data.get('return_to') || '/'));
      return new Response(null,{status:303,headers:{Location:returnTo, 'Set-Cookie':sessionCookie(signed, secure)}});
    }

    // Request a new link by e-mail.
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
    const {token: issued} = await createLink(email);
    const result = await sendLoginLink(email, linkUrl(req, issued, returnTo), LINK_TTL_MINUTES);
    if(!result.sent){
      return renderLogin({mode: 'magic', email: typed, returnTo, magicEnabled: true, message: result.reason ?? 'Não foi possível enviar o e-mail agora.'});
    }
    return renderLogin({mode: 'magic', email: typed, returnTo, notice, magicEnabled: true});
  }catch(e){return failure(e)}
}
