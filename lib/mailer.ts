// Outbound e-mail for the passwordless link.
//
// Four providers are supported through plain HTTPS calls, so any one of them can
// be enabled by pasting a single key. `MAIL_PROVIDER` picks one explicitly; when
// it is absent the first provider with a key configured wins. Without any key the
// feature stays disabled and the screen says so, instead of pretending an e-mail
// was sent.
import {env} from 'cloudflare:workers';

function setting(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export type Provider = 'resend' | 'brevo' | 'mailersend' | 'cloudflare';

export const mailerSender = (): string | undefined => setting('MAGIC_LINK_FROM') || setting('MAIL_FROM');
export const mailerSenderName = (): string => setting('MAIL_FROM_NAME') || 'Loft Finance';

function detectedProvider(): Provider | null {
  const explicit = setting('MAIL_PROVIDER')?.toLowerCase();
  if (explicit && ['resend', 'brevo', 'mailersend', 'cloudflare'].includes(explicit)) return explicit as Provider;
  if (setting('RESEND_API_KEY')) return 'resend';
  if (setting('BREVO_API_KEY')) return 'brevo';
  if (setting('MAILERSEND_API_KEY')) return 'mailersend';
  if ((env as unknown as {EMAIL?: unknown}).EMAIL) return 'cloudflare';
  return null;
}

export const mailerProvider = (): Provider | null => detectedProvider();

// The sender is required by every HTTP provider; Cloudflare also needs the
// address to belong to an onboarded domain.
export const mailerConfigured = (): boolean => Boolean(detectedProvider() && mailerSender());

export function mailerStatus(): {configured: boolean; provider: Provider | null; sender: string | undefined; missing: string} {
  const provider = detectedProvider();
  const sender = mailerSender();
  if (!provider) return {configured: false, provider, sender, missing: 'MAIL_PROVIDER ou uma chave de provedor'};
  if (!sender) return {configured: false, provider, sender, missing: 'MAGIC_LINK_FROM'};
  return {configured: true, provider, sender, missing: ''};
}

type Message = {to: string; subject: string; text: string; html: string};

// Accepts `Nome <email@dominio>` and splits it, because Brevo and MailerSend
// expect the display name in a separate field.
function splitAddress(from: string): {email: string; name?: string} {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return {name: match[1] || undefined, email: match[2].trim()};
  return {email: from.trim()};
}

async function sendResend(key: string, from: string, message: Message): Promise<Response> {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {authorization: `Bearer ${key}`, 'content-type': 'application/json'},
    body: JSON.stringify({from, to: [message.to], subject: message.subject, text: message.text, html: message.html}),
  });
}

async function sendBrevo(key: string, from: string, message: Message): Promise<Response> {
  const sender = splitAddress(from);
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {'api-key': key, 'content-type': 'application/json', accept: 'application/json'},
    body: JSON.stringify({
      sender: {email: sender.email, ...(sender.name ? {name: sender.name} : {})},
      to: [{email: message.to}],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    }),
  });
}

async function sendMailerSend(key: string, from: string, message: Message): Promise<Response> {
  const sender = splitAddress(from);
  return fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {authorization: `Bearer ${key}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      from: {email: sender.email, ...(sender.name ? {name: sender.name} : {})},
      to: [{email: message.to}],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
}

// Cloudflare Email Sending binding: declared as `send_email` in the Worker and
// bound to an onboarded domain.
async function sendCloudflare(from: string, message: Message): Promise<boolean> {
  const binding = (env as unknown as {EMAIL?: {send: (m: unknown) => Promise<unknown>}}).EMAIL;
  if (!binding?.send) throw new Error('Binding EMAIL ausente.');
  const sender = splitAddress(from);
  const raw = [
    `From: ${sender.name ? `${sender.name} <${sender.email}>` : sender.email}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    message.html,
  ].join('\r\n');
  await binding.send({from: sender.email, to: message.to, raw});
  return true;
}

export type MailResult = {sent: boolean; reason?: string};

export async function sendLoginLink(email: string, url: string, minutes: number): Promise<MailResult> {
  const status = mailerStatus();
  if (!status.configured || !status.provider || !status.sender) {
    return {sent: false, reason: `Envio de e-mail não configurado no servidor (falta ${status.missing}).`};
  }

  const message: Message = {
    to: email,
    subject: 'Seu link de acesso ao Loft Finance',
    text: [
      'Recebemos um pedido de acesso ao Loft Finance.',
      '',
      `Abra o endereço abaixo para entrar. O link vale por ${minutes} minutos e só pode ser usado uma vez:`,
      '',
      url,
      '',
      'Se você não pediu este acesso, ignore esta mensagem: nenhuma senha foi alterada.',
    ].join('\n'),
    html: `<div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1b2933">
<p>Recebemos um pedido de acesso ao <strong>Loft Finance</strong>.</p>
<p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#087e78;color:#fff;text-decoration:none;font-weight:600">Entrar agora</a></p>
<p style="font-size:13px;color:#586b73">O link vale por ${minutes} minutos e só pode ser usado uma vez.<br>Se você não pediu este acesso, ignore esta mensagem: nenhuma senha foi alterada.</p>
</div>`,
  };

  try {
    if (status.provider === 'cloudflare') {
      await sendCloudflare(status.sender, message);
      return {sent: true};
    }

    const key =
      status.provider === 'resend' ? setting('RESEND_API_KEY')
      : status.provider === 'brevo' ? setting('BREVO_API_KEY')
      : setting('MAILERSEND_API_KEY');
    if (!key) return {sent: false, reason: 'Chave do provedor de e-mail ausente.'};

    const response =
      status.provider === 'resend' ? await sendResend(key, status.sender, message)
      : status.provider === 'brevo' ? await sendBrevo(key, status.sender, message)
      : await sendMailerSend(key, status.sender, message);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Falha ao enviar o link de acesso', status.provider, response.status, detail.slice(0, 300));
      // Provider errors are surfaced so the admin can fix the key/sender instead
      // of hunting a silent failure.
      const hint = response.status === 401 || response.status === 403
        ? 'A chave do provedor de e-mail foi recusada.'
        : response.status === 422 || response.status === 400
          ? 'O provedor recusou o remetente ou o destinatário.'
          : 'Não foi possível enviar o e-mail agora.';
      return {sent: false, reason: hint};
    }
    return {sent: true};
  } catch (error) {
    console.error('Erro ao enviar o link de acesso', error instanceof Error ? error.message : error);
    return {sent: false, reason: 'Não foi possível enviar o e-mail agora.'};
  }
}
