// Pure helpers that decide which mail provider is active.
//
// Runtime settings (saved from the app) win over environment variables only when
// the environment does not define a provider, so an operator can always pin the
// configuration with `wrangler secret put`.
export type Provider = 'resend' | 'brevo' | 'mailersend' | 'cloudflare';

export const PROVIDERS: Provider[] = ['resend', 'brevo', 'mailersend'];

export const PROVIDER_LABEL: Record<Provider, string> = {
  resend: 'Resend',
  brevo: 'Brevo',
  mailersend: 'MailerSend',
  cloudflare: 'Cloudflare Email Sending',
};

// Which variable holds the key for each provider, used when reading the Worker
// environment.
export const PROVIDER_ENV: Record<Provider, string> = {
  resend: 'RESEND_API_KEY',
  brevo: 'BREVO_API_KEY',
  mailersend: 'MAILERSEND_API_KEY',
  cloudflare: 'EMAIL',
};

export type StoredMail = {provider: Provider; from: string; key: string};
export type EnvLike = Record<string, unknown>;
export type MailSource = 'environment' | 'app' | 'none';

export type MailConfig = {
  provider: Provider;
  from: string;
  key: string;
  source: MailSource;
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && (PROVIDERS as string[]).includes(value);
}

export function addressOf(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

export function addressProblem(from: unknown): string | null {
  const value = text(from);
  if (!value) return 'Informe o endereço remetente.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addressOf(value))) {
    return 'O remetente precisa ser um e-mail completo, como "Loft Finance <acesso@dominio.com>".';
  }
  return null;
}

// An environment-provided provider is final; otherwise the value saved in the app
// is used. A stored record missing the key or the sender is treated as absent.
export function resolveMail(env: EnvLike, stored: StoredMail | null): MailConfig | null {
  const explicit = text(env.MAIL_PROVIDER).toLowerCase();
  const fromEnv = text(env.MAGIC_LINK_FROM) || text(env.MAIL_FROM);

  if (isProvider(explicit)) {
    const key = text(env[PROVIDER_ENV[explicit]]);
    return key && fromEnv ? {provider: explicit, from: fromEnv, key, source: 'environment'} : null;
  }

  for (const provider of PROVIDERS) {
    const key = text(env[PROVIDER_ENV[provider]]);
    if (key && fromEnv) return {provider, from: fromEnv, key, source: 'environment'};
  }

  // Native binding: declared as `send_email` in the Worker and bound to a domain.
  if (env.EMAIL && fromEnv) return {provider: 'cloudflare', from: fromEnv, key: '', source: 'environment'};

  if (stored && isProvider(stored.provider) && text(stored.key) && !addressProblem(stored.from)) {
    return {provider: stored.provider, from: stored.from.trim(), key: stored.key.trim(), source: 'app'};
  }

  return null;
}

// Never echo the key back to the browser: the admin screen only needs to know
// that it is stored and which provider/sender are active.
export function maskKey(key: string): string {
  const value = key.trim();
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

export type MailStatus = {
  configured: boolean;
  provider: Provider | null;
  label: string | null;
  sender: string | null;
  keyHint: string | null;
  source: MailSource;
  missing: string;
};

export function mailStatusOf(env: EnvLike, stored: StoredMail | null): MailStatus {
  const resolved = resolveMail(env, stored);
  if (resolved) {
    return {
      configured: true,
      provider: resolved.provider,
      label: PROVIDER_LABEL[resolved.provider],
      sender: addressOf(resolved.from),
      keyHint: maskKey(resolved.key),
      source: resolved.source,
      missing: '',
    };
  }

  const provider = isProvider(stored?.provider) ? stored!.provider : isProvider(text(env.MAIL_PROVIDER).toLowerCase()) ? (text(env.MAIL_PROVIDER).toLowerCase() as Provider) : null;
  const sender = text(stored?.from) || text(env.MAGIC_LINK_FROM) || text(env.MAIL_FROM);
  const missing = !provider ? 'provedor' : !sender ? 'remetente' : 'chave de API';
  return {configured: false, provider, label: provider ? PROVIDER_LABEL[provider] : null, sender: sender ? addressOf(sender) : null, keyHint: null, source: 'none', missing};
}
