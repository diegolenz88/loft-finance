// Outbound e-mail for the passwordless link.
//
// The active provider comes from the Worker environment when present, otherwise
// from the settings saved in the app. Both paths end in a plain HTTPS call, so a
// key can be added from the interface without a redeploy.
import {env} from 'cloudflare:workers';
import {readMail} from './settings';
import {
  type EnvLike,
  type MailConfig,
  type MailStatus,
  addressOf,
  mailStatusOf,
  resolveMail,
} from './mail-config';

type Message = {to: string; subject: string; text: string; html: string};

// `Nome <email@dominio>` is split because Brevo and MailerSend take the display
// name in a separate field.
function splitAddress(from: string): {email: string; name?: string} {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return {name: match[1] || undefined, email: match[2].trim()};
  return {email: from.trim()};
}

export async function currentMail(): Promise<MailConfig | null> {
  const stored = await readMail().catch(() => null);
  return resolveMail(env as unknown as EnvLike, stored);
}

export async function currentMailStatus(): Promise<MailStatus> {
  const stored = await readMail().catch(() => null);
  return mailStatusOf(env as unknown as EnvLike, stored);
}

export const mailerConfigured = async (): Promise<boolean> => Boolean(await currentMail());

async function sendResend(config: MailConfig, message: Message): Promise<Response> {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {authorization: `Bearer ${config.key}`, 'content-type': 'application/json'},
    body: JSON.stringify({from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html}),
  });
}

async function sendBrevo(config: MailConfig, message: Message): Promise<Response> {
  const sender = splitAddress(config.from);
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {'api-key': config.key, 'content-type': 'application/json', accept: 'application/json'},
    body: JSON.stringify({
      sender: {email: sender.email, ...(sender.name ? {name: sender.name} : {})},
      to: [{email: message.to}],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    }),
  });
}

async function sendMailerSend(config: MailConfig, message: Message): Promise<Response> {
  const sender = splitAddress(config.from);
  return fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {authorization: `Bearer ${config.key}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      from: {email: sender.email, ...(sender.name ? {name: sender.name} : {})},
      to: [{email: message.to}],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
}

async function sendCloudflare(config: MailConfig, message: Message): Promise<void> {
  const binding = (env as unknown as {EMAIL?: {send: (value: unknown) => Promise<unknown>}}).EMAIL;
  if (!binding?.send) throw new Error('Binding EMAIL ausente.');
  const sender = splitAddress(config.from);
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
}

export type MailResult = {sent: boolean; reason?: string};

function messageFor(email: string, url: string, minutes: number): Message {
  return {
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
}

export async function sendLoginLink(email: string, url: string, minutes: number): Promise<MailResult> {
  const status = await currentMailStatus();
  const config = await currentMail();
  if (!config) {
    return {sent: false, reason: `Envio de e-mail não configurado no servidor (falta ${status.missing}).`};
  }

  const message = messageFor(email, url, minutes);
  try {
    if (config.provider === 'cloudflare') {
      await sendCloudflare(config, message);
      return {sent: true};
    }

    const response =
      config.provider === 'resend' ? await sendResend(config, message)
      : config.provider === 'brevo' ? await sendBrevo(config, message)
      : await sendMailerSend(config, message);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Falha ao enviar o link de acesso', config.provider, response.status, detail.slice(0, 300));
      // Provider errors are surfaced so the admin fixes the key or sender instead
      // of chasing a silent failure.
      const hint = response.status === 401 || response.status === 403
        ? 'A chave do provedor de e-mail foi recusada.'
        : response.status === 422 || response.status === 400
          ? `O provedor recusou o remetente ${addressOf(config.from)} ou o destinatário.`
          : 'Não foi possível enviar o e-mail agora.';
      return {sent: false, reason: hint};
    }
    return {sent: true};
  } catch (error) {
    console.error('Erro ao enviar o link de acesso', error instanceof Error ? error.message : error);
    return {sent: false, reason: 'Não foi possível enviar o e-mail agora.'};
  }
}

// Sends a real message to the administrator so the setup can be proven before a
// partner depends on it.
export async function sendTestMail(to: string, link: string): Promise<MailResult> {
  const result = await sendLoginLink(to, link, 15);
  return result;
}
