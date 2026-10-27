// Outbound e-mail for the passwordless link.
//
// Resend is used when RESEND_API_KEY is configured. Without it the link is not
// sent; the request fails with a clear message instead of silently pretending
// the e-mail went out. Administrators can still copy a link from the access
// screen, which keeps the feature usable before a provider is set up.
import {env} from 'cloudflare:workers';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function setting(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
}

export const mailerConfigured = (): boolean => Boolean(setting('RESEND_API_KEY'));
export const mailerSender = (): string | undefined => setting('MAGIC_LINK_FROM') || setting('MAIL_FROM');

export type MailResult = {sent: boolean; reason?: string};

export async function sendLoginLink(email: string, url: string, minutes: number): Promise<MailResult> {
  const key = setting('RESEND_API_KEY');
  const from = mailerSender();
  if (!key) return {sent: false, reason: 'Envio de e-mail não configurado no servidor.'};
  if (!from) return {sent: false, reason: 'Remetente do e-mail não configurado (MAGIC_LINK_FROM).'};

  const text = [
    'Recebemos um pedido de acesso ao Loft Finance.',
    '',
    `Abra o endereço abaixo para entrar. O link vale por ${minutes} minutos e só pode ser usado uma vez:`,
    '',
    url,
    '',
    'Se você não pediu este acesso, ignore esta mensagem: nenhuma senha foi alterada.',
  ].join('\n');

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {authorization: `Bearer ${key}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Seu link de acesso ao Loft Finance',
      text,
      html: `<div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1b2933">
<p>Recebemos um pedido de acesso ao <strong>Loft Finance</strong>.</p>
<p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#087e78;color:#fff;text-decoration:none;font-weight:600">Entrar agora</a></p>
<p style="font-size:13px;color:#586b73">O link vale por ${minutes} minutos e só pode ser usado uma vez.<br>Se você não pediu este acesso, ignore esta mensagem: nenhuma senha foi alterada.</p>
</div>`,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Falha ao enviar o link de acesso', response.status, detail.slice(0, 300));
    return {sent: false, reason: 'Não foi possível enviar o e-mail agora.'};
  }
  return {sent: true};
}
