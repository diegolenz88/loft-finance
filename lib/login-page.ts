// Shared markup for the sign-in screen, used by both the password route and the
// passwordless link route so the two flows never drift apart.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type LoginMode = 'secret' | 'magic';

export type LoginOptions = {
  mode?: LoginMode;
  email?: string;
  message?: string;
  notice?: string;
  returnTo?: string;
  magicEnabled?: boolean;
  status?: number;
};

const styles = `
:root{color-scheme:light dark;--bg:#f3f6f7;--surface:#fff;--fg:#1b2933;--muted:#586b73;--line:#d7e0e2;--primary:#087e78;--primary-fg:#fff;--danger:#a11f31;--ring:rgba(8,126,120,.28);--chip:#eaf0f1}
@media (prefers-color-scheme:dark){:root{--bg:#0b111b;--surface:#111a26;--fg:#edf2f7;--muted:#9aafc3;--line:#233040;--primary:#63dfd8;--primary-fg:#082725;--danger:#fb919a;--ring:rgba(99,223,216,.3);--chip:#172230}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;background:var(--bg);color:var(--fg);
font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:392px;display:grid;gap:22px}
.brand{display:flex;align-items:center;gap:10px;justify-self:center}
.brand-mark{display:inline-flex;align-items:flex-end;gap:3px;height:20px}
.brand-mark span{width:4px;border-radius:2px;background:var(--primary)}
.brand-mark span:nth-child(1){height:9px;opacity:.55}
.brand-mark span:nth-child(2){height:14px;opacity:.8}
.brand-mark span:nth-child(3){height:20px}
.brand-text{font-size:17px;font-weight:600;letter-spacing:-.4px}
.brand-text small{display:block;font-size:9px;letter-spacing:.14em;color:var(--muted);font-weight:500;margin-top:1px}
form{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:26px 24px;display:grid;gap:15px;
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
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:11px;background:var(--chip);margin-bottom:2px}
.tabs button{font:inherit;font-size:12.5px;font-weight:600;padding:9px 8px;border:0;border-radius:8px;background:transparent;
color:var(--muted);cursor:pointer}
.tabs button[aria-selected=true]{background:var(--surface);color:var(--fg);box-shadow:0 1px 3px rgba(11,31,42,.12)}
[hidden]{display:none!important}
.error{margin:0;font-size:12.5px;color:var(--danger)}
.hint{margin:0;font-size:11px;line-height:1.45;color:var(--muted)}
.notice{margin:0;font-size:12.5px;color:var(--muted);padding:10px 12px;border-radius:9px;background:var(--chip)}
.account{margin:0;font-size:14px;font-weight:600;color:var(--fg);padding:11px 13px;border-radius:10px;background:var(--chip);overflow-wrap:anywhere}
.foot{justify-self:center;font-size:11.5px;color:var(--muted);text-align:center;line-height:1.5;margin:0}
`;

const brand = `<div class="brand"><span class="brand-mark"><span></span><span></span><span></span></span><span class="brand-text">loft<span style="font-weight:300">finance</span><small>GESTÃO DE EMPREENDIMENTOS</small></span></div>`;

function secretPanel({email, message, returnTo}: LoginOptions): string {
  return `<div class="field">
<label for="email">E-mail</label>
<input id="email" type="email" name="email" autocomplete="username" inputmode="email" required autofocus value="${escapeHtml(email ?? '')}">
<small class="hint">Use exatamente o e-mail cadastrado no empreendimento.</small>
</div>
<div class="field">
<label for="secret">Senha</label>
<input id="secret" type="password" name="secret" autocomplete="current-password" required>
<button class="reveal" type="button" id="reveal" aria-label="Mostrar ou ocultar a senha" aria-pressed="false">
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
</button>
</div>
${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}
<input type="hidden" name="return_to" value="${escapeHtml(returnTo ?? '/')}">
<button type="submit">Entrar</button>`;
}

function magicPanel({email, message, returnTo, magicEnabled}: LoginOptions): string {
  return `<p class="lead">Informe seu e-mail e enviaremos um link para entrar sem senha.</p>
<div class="field">
<label for="magic-email">E-mail</label>
<input id="magic-email" type="email" name="email" autocomplete="email" inputmode="email" required value="${escapeHtml(email ?? '')}">
<small class="hint">O link é pessoal e só funciona para este e-mail.</small>
</div>
${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : magicEnabled === false ? '<p class="notice" role="status">O envio automático ainda não está configurado. Peça um link ao administrador do empreendimento.</p>' : ''}
<input type="hidden" name="return_to" value="${escapeHtml(returnTo ?? '/')}">
<button type="submit">Enviar link de acesso</button>`;
}

export function renderLogin(o: LoginOptions = {}): Response {  const mode: LoginMode = o.mode === 'magic' ? 'magic' : 'secret';
  const magicEnabled = o.magicEnabled !== false;
  const panel = mode === 'magic' ? magicPanel(o) : secretPanel(o);
  const action = mode === 'magic' ? '/api/session/magic' : '/api/session';
  const tabs = `<div class="tabs" role="tablist" aria-label="Forma de acesso">
<button type="button" role="tab" data-mode="secret" aria-selected="${mode === 'secret'}">Senha</button>
<button type="button" role="tab" data-mode="magic" aria-selected="${mode === 'magic'}">Link mágico</button>
</div>`;

  const head = mode === 'magic'
    ? '<h1>Entrar com link</h1>'
    : '<h1>Entrar na sua conta</h1>';

  const foot = mode === 'magic'
    ? 'O link vale por 15 minutos e só pode ser usado uma vez.'
    : 'A sessão fica salva neste dispositivo por 30 dias.<br>Esqueceu a senha? Peça ao administrador para definir uma nova.';

  return html(`${brand}<form method="post" action="${action}">
${head}
${tabs}
${!magicEnabled && mode === 'magic' ? '' : ''}
<div class="panel" data-panel="${mode}">${panel}</div>
${o.notice ? `<p class="notice" role="status">${escapeHtml(o.notice)}</p>` : ''}
</form>
<p class="foot">${foot}</p>
${tabsScript(magicEnabled)}`, o.status ?? 200);
}

export function renderNotice(lead: string, title: string, status = 200): Response {
  return html(`${brand}<form><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(lead)}</p></form>`, status);
}

// The link page. It only confirms who the link belongs to and asks for a click:
// the token is spent on the POST, so a messenger or antivirus that fetches the
// URL cannot consume it before the person gets there.
export function renderMagicConfirm(o: {email: string; token: string; returnTo?: string}): Response {
  return html(`${brand}<form method="post" action="/api/session/magic">
<h1>Entrar com link</h1>
<p class="lead">Este link pertence a</p>
<p class="account">${escapeHtml(o.email)}</p>
<input type="hidden" name="token" value="${escapeHtml(o.token)}">
<input type="hidden" name="return_to" value="${escapeHtml(o.returnTo ?? '/')}">
<button type="submit">Entrar agora</button>
</form>
<p class="foot">O link vale por 15 minutos e só pode ser usado uma vez.<br>Se você não pediu este acesso, ignore esta página.</p>`, 200);
}

const tabsScript = (magicEnabled: boolean) => `<script>
(function(){
 var tabs=document.querySelectorAll('.tabs button');
 if(!tabs.length)return;
 var form=document.querySelector('form'),panel=document.querySelector('.panel');
 var magicMarkup=${JSON.stringify(magicPanel({magicEnabled}))};
 var secretMarkup=${JSON.stringify(secretPanel({}))};
 function bindReveal(){
  var reveal=document.getElementById('reveal'),input=document.getElementById('secret');
  if(!reveal||!input)return;
  reveal.addEventListener('click',function(){
   var shown=input.type==='text';input.type=shown?'password':'text';
   reveal.setAttribute('aria-pressed',String(!shown));input.focus();
  });
 }
 tabs.forEach(function(tab){
  tab.addEventListener('click',function(){
   var mode=tab.getAttribute('data-mode');
   tabs.forEach(function(other){other.setAttribute('aria-selected',String(other===tab))});
   if(mode==='magic'){
    form.setAttribute('action','/api/session/magic');
    panel.innerHTML=magicMarkup;
    panel.setAttribute('data-panel','magic');
    form.querySelector('h1').textContent='Entrar com link';
   }else{
    form.setAttribute('action','/api/session');
    panel.innerHTML=secretMarkup;
    panel.setAttribute('data-panel','secret');
    form.querySelector('h1').textContent='Entrar na sua conta';
    bindReveal();
   }
   var first=panel.querySelector('input');if(first)first.focus();
  });
 });
 bindReveal();
})();
</script>`;

function html(body: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Entrar · Loft Finance</title>
<style>${styles}</style></head><body><main>${body}</main></body></html>`,
    {status, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}},
  );
}
