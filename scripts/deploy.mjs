// Deploy to a standalone Cloudflare Worker.
//
// `pnpm build` regenerates dist/server/wrangler.json with placeholder D1/R2
// values, so the real identifiers must be injected after the build and before
// `wrangler deploy`. This script makes that order reproducible.
//
// Required:
//   D1_ID                 real Cloudflare D1 database id
// Optional:
//   WORKER_NAME           default: loft-finance
//   D1_NAME               default: loft-finance-db
//   R2_NAME               default: loft-finance-files
//   DEPLOY_SECRETS=1      push AUTH_SECRET, APP_PASSWORD, AUTH_OWNER_* first
//   DRY_RUN=1             validate the generated config without deploying
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
const wranglerBin = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function fail(message) {
  console.error(`\n[deploy] ${message}\n`);
  process.exit(1);
}

const workerName = process.env.WORKER_NAME || "loft-finance";
const d1Name = process.env.D1_NAME || "loft-finance-db";
const d1Id = process.env.D1_ID;
const r2Name = process.env.R2_NAME || "loft-finance-files";

if (!d1Id) {
  fail(
    "Defina D1_ID com o id retornado por `npx wrangler d1 create loft-finance-db`.\n" +
      "Exemplo (PowerShell): $env:D1_ID = \"<id>\"; pnpm deploy",
  );
}
if (!/^[0-9a-f-]{32,36}$/i.test(d1Id)) {
  fail(`D1_ID inválido: "${d1Id}". Use o UUID exibido pelo Wrangler.`);
}

console.log("[deploy] 1/4 compilando");
run(process.execPath, ["scripts/run-framework.mjs", "build"]);

if (!existsSync(configPath)) fail("Build não gerou dist/server/wrangler.json.");
if (!existsSync(wranglerBin)) fail("Wrangler não encontrado em node_modules.");

console.log("[deploy] 2/4 ajustando a configuração gerada");
const config = JSON.parse(readFileSync(configPath, "utf8"));
config.name = workerName;

if (!config.d1_databases?.[0]) fail("Build não declarou o binding D1.");
config.d1_databases[0].database_name = d1Name;
config.d1_databases[0].database_id = d1Id;

if (process.env.SKIP_R2 === "1") {
  // R2 must be activated in the Cloudflare dashboard before a bucket can be
  // created. Until then the Worker deploys without the attachment binding.
  config.r2_buckets = [];
} else if (config.r2_buckets?.[0]) {
  config.r2_buckets[0].bucket_name = r2Name;
}

// A generated placeholder id would deploy a Worker bound to a database that
// does not exist, so refuse to continue instead of failing at runtime.
if (config.d1_databases[0].database_id.startsWith("00000000-")) {
  fail("A configuração ainda contém o id de exemplo do D1.");
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[deploy]    worker=${workerName} d1=${d1Name} r2=${r2Name}`);

if (process.env.DEPLOY_SECRETS === "1") {
  console.log("[deploy] 3/4 publicando segredos");
  const secrets = {
    AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(48).toString("base64"),
    APP_PASSWORD: process.env.APP_PASSWORD,
    AUTH_OWNER_EMAIL: process.env.AUTH_OWNER_EMAIL,
    AUTH_OWNER_ID: process.env.AUTH_OWNER_ID || "owner",
  };
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) fail(`DEPLOY_SECRETS=1 exige ${name}.`);
    const result = spawnSync(
      process.execPath,
      [wranglerBin, "secret", "put", name, "--config", configPath],
      { cwd: root, input: `${value}\n`, stdio: ["pipe", "inherit", "inherit"] },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (!process.env.AUTH_SECRET) {
    console.log(
      "\n[deploy] AUTH_SECRET gerado nesta execução. Guarde-o para não invalidar sessões no próximo deploy.\n",
    );
  }
} else {
  console.log("[deploy] 3/4 segredos ignorados (defina DEPLOY_SECRETS=1 para publicá-los)");
}

if (process.env.DRY_RUN === "1") {
  console.log("[deploy] 4/4 DRY_RUN=1: configuração válida, deploy não executado");
  process.exit(0);
}

console.log("[deploy] 4/4 publicando");
run(process.execPath, [wranglerBin, "deploy", "--config", configPath]);
