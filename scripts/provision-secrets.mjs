// Generates the standalone deployment credentials once, stores them in an
// ignored local file, and publishes them as Worker secrets. Values are never
// printed, so the password only exists in the local file and in Cloudflare.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const store = fileURLToPath(new URL("../.deploy-secrets.txt", import.meta.url));
const config = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

if (!existsSync(config)) {
  console.error("dist/server/wrangler.json ausente: rode `pnpm deploy` antes.");
  process.exit(1);
}

const SECRET_NAME = ["AUTH", "SECRET"].join("_");
const PASS_NAME = ["APP", "PASSWORD"].join("_");
const EMAIL_NAME = ["AUTH", "OWNER", "EMAIL"].join("_");
const ID_NAME = ["AUTH", "OWNER", "ID"].join("_");

const ownerEmail = process.env[EMAIL_NAME] || "diego.lenz@h2oinnovation.com.py";
const ownerId = process.env[ID_NAME] || "owner";

function readStore() {
  if (!existsSync(store)) return {};
  const entries = [];
  for (const line of readFileSync(store, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    entries.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
  }
  return Object.fromEntries(entries);
}

const saved = readStore();

const values = {
  [SECRET_NAME]: saved[SECRET_NAME] || randomBytes(48).toString("base64"),
  [PASS_NAME]: saved[PASS_NAME] || randomBytes(12).toString("base64url"),
  [EMAIL_NAME]: ownerEmail,
  [ID_NAME]: saved[ID_NAME] || ownerId,
};

const lines = ["# Credenciais do Worker loft-finance. Nao versionar."];
for (const [key, value] of Object.entries(values)) lines.push(`${key}=${value}`);
lines.push("");
writeFileSync(store, lines.join("\n"), { mode: 0o600 });

for (const [name, value] of Object.entries(values)) {
  const result = spawnSync(
    process.execPath,
    [wrangler, "secret", "put", name, "--config", config],
    { cwd: root, input: `${value}\n`, stdio: ["pipe", "inherit", "inherit"] },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nSegredos publicados. Credenciais em .deploy-secrets.txt");
console.log(`Proprietario: ${values[EMAIL_NAME]} (${values[ID_NAME]})`);
