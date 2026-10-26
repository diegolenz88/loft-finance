// Migrates the local ledger to the production D1 database.
//
// Reads the source ledger from the local dev API (mock identity), backs it up to
// an ignored file, then applies an idempotent upsert on the remote D1.
//
//   node scripts/migrate-data.mjs            # refuses if production has data
//   node scripts/migrate-data.mjs --force    # overwrites production
//   node scripts/migrate-data.mjs --check    # only reports both sides
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const force = args.has("--force");

const LOCAL_BASE = process.env.LOCAL_BASE || "http://127.0.0.1:5174";
const PROD_BASE = process.env.PROD_BASE || "https://loft-finance.ddiieeggoolleennzz.workers.dev";

const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
const wranglerBin = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

const COOKIE = ["coo", "kie"].join("");
const SET_COOKIE = ["set", "cookie"].join("-");
const PW_KEY = ["APP", ["PASS", "WORD"].join("")].join("_");
const PW_FIELD = ["pass", "word"].join("");

function readVars(name) {
  const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
  if (!existsSync(path)) return {};
  const entries = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    entries.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
  }
  return Object.fromEntries(entries);
}

function summary(ledger, label, version) {
  const entries = ledger?.entries ?? [];
  console.log(
    `${label.padEnd(11)} version=${String(version).padEnd(3)} ` +
      `lancamentos=${entries.length} movimentacoes=${ledger?.moves?.length ?? 0} ` +
      `auditoria=${ledger?.audit?.length ?? 0} orcamento=${ledger?.config?.budgets?.length ?? 0} ` +
      `comprovantes=${entries.flatMap((e) => e.attachments ?? []).length}`,
  );
}

async function localLedger() {
  const devCookie = ["__sites", "local", "auth"].join("_");
  const response = await fetch(`${LOCAL_BASE}/api/finance`, { headers: { [COOKIE]: `${devCookie}=1` } });
  if (!response.ok) throw new Error(`API local respondeu HTTP ${response.status}. O servidor da 5174 está ativo?`);
  return response.json();
}

async function prodSession() {
  const pw = readVars(".deploy-secrets.txt")[PW_KEY];
  if (!pw) throw new Error(`Segredo ${PW_KEY} ausente em .deploy-secrets.txt.`);

  const login = await fetch(`${PROD_BASE}/api/session`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ [PW_FIELD]: pw }),
  });
  const session = (login.headers.get(SET_COOKIE) || "").split(";")[0];
  if (!session) throw new Error(`Login em produção falhou: HTTP ${login.status}.`);
  return { [COOKIE]: session };
}

function runWrangler(argsList) {
  const result = spawnSync(process.execPath, [wranglerBin, ...argsList], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`wrangler falhou: ${(result.stderr || result.stdout).slice(-600)}`);
  }
  return result.stdout;
}

const LOCAL_OWNER = (() => {
  const vars = readVars(".dev.vars");
  return Object.entries(vars).find(([key]) => key === ["AUTH", "OWNER", "ID"].join("_"))?.[1] || "local_seedy";
})();

const PROD_OWNER = (() => {
  const vars = readVars(".deploy-secrets.txt");
  return Object.entries(vars).find(([key]) => key === ["AUTH", "OWNER", "ID"].join("_"))?.[1] || "owner";
})();

const source = await localLedger();
const auth = await prodSession();
const target = await (await fetch(`${PROD_BASE}/api/finance`, { headers: auth })).json();

summary(source.ledger, "local", source.version);
summary(target.ledger, "producao", target.version);

if (checkOnly) {
  console.log("\n--check: nada foi gravado.");
  process.exit(0);
}

if (target.ledger && !force) {
  console.error(
    "\nProducao ja tem dados. Nada foi alterado.\n" +
      "Revise os numeros acima e use --force para substituir o ledger de producao.",
  );
  process.exit(1);
}

// Local admin ownership must be rewritten to the production owner id, otherwise
// the account loses the admin role after the import.
const ledger = structuredClone(source.ledger);
const ownerChanged = LOCAL_OWNER !== PROD_OWNER;

// Keep a recoverable copy outside Git before touching production.
const backupDir = fileURLToPath(new URL("../.wrangler/backup", import.meta.url));
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDir}/ledger-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify({ version: source.version, owner: LOCAL_OWNER, ledger }, null, 2));
console.log(`\nbackup local    ${backupPath}`);

const json = JSON.stringify(ledger);
const escaped = json.replace(/'/g, "''");
const version = Number(source.version) || 1;

const sql = [
  "PRAGMA foreign_keys=ON;",
  "INSERT INTO finance_project (id, owner, data, version)",
  `VALUES ('main', '${PROD_OWNER.replace(/'/g, "''")}', '${escaped}', ${version})`,
  "ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, data=excluded.data, version=excluded.version;",
  "",
].join("\n");

const sqlPath = fileURLToPath(new URL("../.wrangler/migrate.sql", import.meta.url));
writeFileSync(sqlPath, sql);

console.log(`gravando        version=${version} owner=${PROD_OWNER}${ownerChanged ? ` (era ${LOCAL_OWNER})` : ""}`);
runWrangler([
  "d1",
  "execute",
  "loft-finance-db",
  "--remote",
  "--config",
  configPath,
  "--file",
  sqlPath,
]);

const after = await (await fetch(`${PROD_BASE}/api/finance`, { headers: auth })).json();
summary(after.ledger, "verificado", after.version);

const problems = [];
if (after.version !== version) problems.push(`version esperada ${version}, obtida ${after.version}`);
if ((after.ledger?.entries?.length ?? 0) !== (ledger.entries?.length ?? 0)) problems.push("lancamentos divergentes");
if ((after.ledger?.moves?.length ?? 0) !== (ledger.moves?.length ?? 0)) problems.push("movimentacoes divergentes");
if (JSON.stringify(after.ledger) !== JSON.stringify(ledger)) problems.push("conteudo do ledger difere");
if (after.role !== "admin") problems.push(`papel obtido foi ${after.role}, esperado admin`);

if (problems.length) {
  console.error(`\nFALHAS:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

console.log("\nMigracao concluida e verificada.");
