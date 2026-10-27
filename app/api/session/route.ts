import {env} from 'cloudflare:workers';
import {failure,sameOrigin} from '@/lib/server';
import {authOwner,clearedSessionCookie,createSessionToken,sessionCookie,sessionSecret} from '@/lib/identity';
import {checkAccess,normalizeEmail,sameSecret} from '@/lib/credentials';

export const dynamic = 'force-dynamic';

function secret(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
}

// Only same-site absolute paths are accepted as a post-login destination, so a
// crafted link cannot turn the login form into an open redirect.
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/api/session')) return '/';
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Entrar · Loft Finance</title>
<style>
:root{color-scheme:light dark;--bg:#f3f6f7;--surface:#fff;--fg:#1b2933;--muted:#586b73;--line:#d7e0e2;--primary:#087e78;--primary-fg:#fff;--danger:#a11f31;--ring:rgba(8,126,120,.28)}
@media (prefers-color-scheme:dark){:root{--bg:#0b111b;--surface:#111a26;--fg:#edf2f7;--muted:#9aafc3;--line:#233040;--primary:#63dfd8;--primary-fg:#082725;--danger:#fb919a;--ring:rgba(99,223,216,.3)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;background:var(--bg);color:var(--fg);
font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:376px;display:grid;gap:22px}
.brand{display:flex;align-items:center;gap:10px;justify-self:center}
.brand-mark{display:inline-flex;align-items:flex-end;gap:3px;height:20px}
.brand-mark span{width:4px;border-radius:2px;background:var(--primary)}
.brand-mark span:nth-child(1){height:9px;opacity:.55}
.brand-mark span:nth-child(2){height:14px;opacity:.8}
.brand-mark span:nth-child(3){height:20px}
.brand-text{font-size:17px;font-weight:600;letter-spacing:-.4px}
.brand-text small{display:block;font-size:9px;letter-spacing:.14em;color:var(--muted);font-weight:500;margin-top:1px}
form{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:28px 26px;display:grid;gap:15px;
box-shadow:0 18px 44px rgba(11,31,42,.09)}
h1{margin:0;font-size:19px;letter-spacing:-.4px}
.lead{margin:0;font-size:13px;line-height:1.5;color:var(--muted)}
label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.field{position:relative;display:grid;gap:6px}
input{font:inherit;font-size:14px;padding:12px 13px;border-radius:10px;border:1px solid var(--line);
background:transparent;color:inherit;width:100%}
input#secret{padding-right:44px}
input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--ring)}
.reveal{position:absolute;right:6px;bottom:5px;width:32px;height:32px;display:grid;place-items:center;border:0;
border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;padding:0}
.reveal:hover{background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary)}
button[type=submit]{font:inherit;font-size:14px;font-weight:600;padding:12px;border-radius:10px;border:0;
background:var(--primary);color:var(--primary-fg);cursor:pointer;margin-top:2px}
button[type=submit]:hover{filter:brightness(.94)}
.error{margin:0;font-size:12.5px;color:var(--danger)}
.notice{margin:0;font-size:12.5px;color:var(--muted)}
.foot{justify-self:center;font-size:11.5px;color:var(--muted);text-align:center;line-height:1.5;margin:0}
</style></head><body><main>${body}</main></body></html>`,
    {status, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}},
  );
}

const brand = `<div class="brand"><span class="brand-mark"><span></span><span></span><span></span></span><span class="brand-text">loft<span style="font-weight:300">finance</span><small>GESTÃO DE EMPREENDIMENTOS</small></span></div>`;

type FormState = {email?: string; message?: string; notice?: string; returnTo?: string};

function form({email = '', message = '', notice = '', returnTo = '/'}: FormState): string {
  return `${brand}<form method="post">
<h1>Entrar na sua conta</h1>
<p class="lead">Use o e-mail e a senha cadastrados pelo administrador do empreendimento.</p>
<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
<div class="field">
<label for="email">E-mail</label>
<input id="email" type="email" name="email" autocomplete="username" inputmode="email" required autofocus value="${escapeHtml(email)}">
</div>
<div class="field">
<label for="secret">Senha</label>
<input id="secret" type="password" name="secret" autocomplete="current-password" required>
<button class="reveal" type="button" id="reveal" aria-label="Mostrar ou ocultar a senha" aria-pressed="false">
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
</button>
</div>
${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ''}
<button type="submit">Entrar</button>
</form>
<p class="foot">A sessão fica salva neste dispositivo por 30 dias.<br>Esqueceu a senha? Peça ao administrador para definir uma nova.</p>
<script>
(function(){
 var input=document.getElementById('secret'),button=document.getElementById('reveal');
 button.addEventListener('click',function(){
  var shown=input.type==='text';
  input.type=shown?'password':'text';
  button.setAttribute('aria-pressed',String(!shown));
  input.focus();
 });
})();
</script>`;
}

function noticePage(lead: string, title: string): string {
  return `${brand}<form><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(lead)}</p></form>`;
}

export async function GET(req?: Request){
  try{
    const url = req ? new URL(req.url) : undefined;
    const returnTo = safeReturnTo(url?.searchParams.get('return_to') ?? null);
    const notice = url?.searchParams.get('saiu') === '1' ? 'Você saiu da sua conta.' : '';
    if(secret('ACCESS_REQUIRED')==='1'){
      return page(noticePage('Entre pela política de acesso da organização para continuar.', 'Acesso via Cloudflare Access'));
    }
    if(!authOwner()){
      return page(noticePage('Defina os segredos AUTH_OWNER_EMAIL, AUTH_OWNER_ID e AUTH_SECRET no Worker.', 'Login não configurado'), 500);
    }
    return page(form({returnTo, notice}));
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
    if(wait) return page(form({email, returnTo, message:`Muitas tentativas. Aguarde ${wait} minuto(s) e tente novamente.`}), 429);

    // The owner keeps the Worker secret as a recovery path; every other partner
    // signs in with the credentials created in Configurações → Acessos.
    const ownerMatch = email === owner.email && sameSecret(plain, secret('APP_PASSWORD'));
    const partnerMatch = !ownerMatch && email ? await checkAccess(email, plain) : false;

    if(!ownerMatch && !partnerMatch){
      registerFailure(who);
      return page(form({email, returnTo, message:'E-mail ou senha incorretos.'}), 401);
    }

    attempts.delete(who);
    const token = await createSessionToken(email, sessionSecret());
    return new Response(null,{status:303,headers:{Location:returnTo, 'Set-Cookie':sessionCookie(token, secure)}});
  }catch(e){return failure(e)}
}
