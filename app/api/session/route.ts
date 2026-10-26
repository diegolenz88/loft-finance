import {env} from 'cloudflare:workers';
import {failure,sameOrigin} from '@/lib/server';
import {authOwner,clearedSessionCookie,createSessionToken,sessionCookie,sessionSecret} from '@/lib/identity';

export const dynamic = 'force-dynamic';

function secret(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
}

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Entrar · Loft Finance</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0b0d10;color:#e8eaed;
display:grid;place-items:center;min-height:100vh;margin:0;padding:1.5rem}
form{background:#15181d;border:1px solid #23282f;padding:2rem;border-radius:16px;display:grid;gap:.85rem;
width:100%;max-width:340px;box-shadow:0 18px 50px rgba(0,0,0,.45)}
h1{font-size:1.15rem;margin:0 0 .35rem}
p{margin:0;font-size:.85rem;color:#9aa3ad}
label{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#8b949e}
input{font:inherit;padding:.72rem .9rem;border-radius:10px;border:1px solid #2b3038;background:#0b0d10;color:inherit}
input:focus{outline:2px solid #3b82f6;outline-offset:1px}
button{font:inherit;font-weight:650;padding:.75rem;border-radius:10px;border:0;background:#3b82f6;
color:#fff;cursor:pointer;margin-top:.35rem}
button:hover{background:#2f74e0}
.error{color:#f87171}
</style></head><body>${body}</body></html>`,
    {status, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}},
  );
}

function form(message = ''): string {
  return `<form method="post">
<h1>Loft Finance</h1>
<p>Acesso restrito ao responsável pelo empreendimento.</p>
<label for="password">Senha de acesso</label>
<input id="password" type="password" name="password" autocomplete="current-password" required autofocus>
<button type="submit">Entrar</button>
${message ? `<p class="error">${message}</p>` : ''}
</form>`;
}

export async function GET(){
  try{
    if(!secret('APP_PASSWORD') || !authOwner()){
      return page(`<form><h1>Login não configurado</h1>
<p>Defina os segredos APP_PASSWORD, AUTH_SECRET, AUTH_OWNER_EMAIL e AUTH_OWNER_ID no Worker.</p></form>`, 500);
    }
    return page(form());
  }catch(e){return failure(e)}
}

export async function POST(req: Request){
  try{
    sameOrigin(req);
    const url = new URL(req.url);
    const secure = url.protocol === 'https:';
    if(url.searchParams.get('acao') === 'sair'){
      return new Response(null,{status:303,headers:{Location:'/api/session','Set-Cookie':clearedSessionCookie(secure)}});
    }
    const expected = secret('APP_PASSWORD');
    const owner = authOwner();
    if(!expected || !owner) throw new Error('Login não configurado. Defina APP_PASSWORD e o proprietário.');

    const received = String((await req.formData()).get('password') || '');
    if(received.length !== expected.length || received !== expected){
      return page(form('Senha incorreta.'), 401);
    }

    const token = await createSessionToken(owner.email, sessionSecret());
    return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':sessionCookie(token, secure)}});
  }catch(e){return failure(e)}
}
