import {env} from 'cloudflare:workers';
import {failure,sameOrigin} from '@/lib/server';
import {authOwner,clearedSessionCookie,createSessionToken,sessionCookie,sessionSecret} from '@/lib/identity';

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
main{width:100%;max-width:372px;display:grid;gap:22px}
.brand{display:flex;align-items:center;gap:10px;justify-self:center}
.brand-mark{display:inline-flex;align-items:flex-end;gap:3px;height:20px}
.brand-mark span{width:4px;border-radius:2px;background:var(--primary)}
.brand-mark span:nth-child(1){height:9px;opacity:.55}
.brand-mark span:nth-child(2){height:14px;opacity:.8}
.brand-mark span:nth-child(3){height:20px}
.brand-text{font-size:17px;font-weight:600;letter-spacing:-.4px}
.brand-text small{display:block;font-size:9px;letter-spacing:.14em;color:var(--muted);font-weight:500;margin-top:1px}
form{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:28px 26px;display:grid;gap:14px;
box-shadow:0 18px 44px rgba(11,31,42,.09)}
h1{margin:0;font-size:19px;letter-spacing:-.4px}
.lead{margin:0;font-size:13px;line-height:1.5;color:var(--muted)}
label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.field{position:relative;display:grid;gap:6px}
input{font:inherit;font-size:14px;padding:12px 44px 12px 13px;border-radius:10px;border:1px solid var(--line);
background:transparent;color:inherit;width:100%}
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

function form(message = '', returnTo = '/', notice = ''): string {
  return `${brand}<form method="post">
<h1>Entrar na sua conta</h1>
<p class="lead">Acesso restrito aos sócios do empreendimento.</p>
<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
<div class="field">
<label for="password">Senha de acesso</label>
<input id="password" type="password" name="password" autocomplete="current-password" required autofocus>
<button class="reveal" type="button" id="reveal" aria-label="Mostrar ou ocultar a senha" aria-pressed="false">
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
</button>
</div>
${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ''}
<button type="submit">Entrar</button>
</form>
<p class="foot">A sessão fica salva neste dispositivo por 30 dias.</p>
<script>
(function(){
 var input=document.getElementById('password'),button=document.getElementById('reveal');
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
    if(!secret('APP_PASSWORD') || !authOwner()){
      return page(noticePage('Defina os segredos APP_PASSWORD, AUTH_SECRET, AUTH_OWNER_EMAIL e AUTH_OWNER_ID no Worker.', 'Login não configurado'), 500);
    }
    return page(form('', returnTo, notice));
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
    const expected = secret('APP_PASSWORD');
    const owner = authOwner();
    if(!expected || !owner) throw new Error('Login não configurado. Defina APP_PASSWORD e o proprietário.');

    const data = await req.formData();
    const returnTo = safeReturnTo(String(data.get('return_to') || '/'));
    const received = String(data.get('password') || '');
    // Constant-time comparison keeps the shared password from leaking through
    // response timing.
    let divergence = received.length === expected.length ? 0 : 1;
    for (let index = 0; index < Math.max(received.length, expected.length); index++) {
      divergence |= (received.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
    }
    if(divergence !== 0){
      return page(form('Senha incorreta. Verifique e tente novamente.', returnTo), 401);
    }

    const token = await createSessionToken(owner.email, sessionSecret());
    return new Response(null,{status:303,headers:{Location:returnTo, 'Set-Cookie':sessionCookie(token, secure)}});
  }catch(e){return failure(e)}
}
