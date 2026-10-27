// Configura o envio de e-mail do link mágico e publica os segredos no Worker.
//
// Uso (PowerShell), com os valores na própria sessão do terminal — nada é
// impresso na saída do script:
//
//   $env:MAIL_PROVIDER = "brevo"
//   $env:BREVO_API_KEY = "<chave>"
//   $env:MAGIC_LINK_FROM = "Loft Finance <acesso@seudominio.com>"
//   node scripts/setup-email.mjs
//
// Provedores aceitos: resend, brevo, mailersend.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const store = fileURLToPath(new URL("../.deploy-secrets.txt", import.meta.url));
const config = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

if (!existsSync(config)) {
  console.error("dist/server/wrangler.json ausente: rode `pnpm deploy` ao menos uma vez.");
  process.exit(1);
}

const providers = {
  resend: "RESEND_API_KEY",
  brevo: "BREVO_API_KEY",
  mailersend: "MAILERSEND_API_KEY",
};

const provider = String(process.env.MAIL_PROVIDER || "").trim().toLowerCase();
const sender = String(process.env.MAGIC_LINK_FROM || process.env.MAIL_FROM || "").trim();

if (!providers[provider]) {
  console.error(
    `Defina MAIL_PROVIDER com um destes valores: ${Object.keys(providers).join(", ")}.\n` +
      "Exemplo (PowerShell): $env:MAIL_PROVIDER = \"brevo\"",
  );
  process.exit(1);
}

const keyName = providers[provider];
const key = String(process.env[keyName] || "").trim();
if (!key) {
  console.error(`Defina ${keyName} com a chave do provedor ${provider}.`);
  process.exit(1);
}

if (!sender) {
  console.error("Defina MAGIC_LINK_FROM, por exemplo \"Loft Finance <acesso@seudominio.com>\".");
  process.exit(1);
}

const address = sender.match(/<([^>]+)>/)?.[1] || sender;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
  console.error(`Remetente inválido: "${sender}". Use um e-mail completo.`);
  process.exit(1);
}

function readStore() {
  if (!existsSync(store)) return [];
  return readFileSync(store, "utf8").split(/\r?\n/);
}

// Keeps the existing credentials and replaces only the mail entries.
const managed = new Set(["MAIL_PROVIDER", "MAGIC_LINK_FROM", ...Object.values(providers)]);
const kept = readStore().filter((line) => {
  if (!line.includes("=") || line.trimStart().startsWith("#")) return true;
  const name = line.slice(0, line.indexOf("=")).trim();
  return !managed.has(name);
});

const settings = {
  MAIL_PROVIDER: provider,
  MAGIC_LINK_FROM: sender,
  [keyName]: key,
};

for (const [name, value] of Object.entries(settings)) {
  const result = spawnSync(
    process.execPath,
    [wrangler, "secret", "put", name, "--config", config],
    { cwd: root, input: `${value}\n`, stdio: ["pipe", "inherit", "inherit"] },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`[email] segredo publicado: ${name}`);
}

const next = kept.filter((line) => line.trim() !== "");
while (next.length && next[next.length - 1].trim() === "") next.pop();
for (const [name, value] of Object.entries(settings)) next.push(`${name}=${value}`);
writeFileSync(store, `${next.join("\n")}\n`, { mode: 0o600 });

console.log(`\n[email] provedor ${provider} e remetente ${address} configurados.`);
console.log("[email] Verifique o remetente no painel do provedor e teste em Configurações → Acessos ao sistema.");
