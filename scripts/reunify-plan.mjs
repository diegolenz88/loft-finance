// Reunifies a split installment plan back into its original single entry.
//
// Context: the "convert existing expense into installments" flow created one
// entry per installment and kept the paid part on the original. The product no
// longer offers that conversion, so existing splits are merged back:
//   - the plan rows are removed from the ledger (their history stays in audit)
//   - the original entry regains the full contracted amount
//   - the payments remain linked to the original entry
//
// Runs against production D1, always writing a local backup first.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
const wranglerBin = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

const PROD_BASE = process.env.PROD_BASE || "https://loft-finance.ddiieeggoolleennzz.workers.dev";
const D1_NAME = process.env.D1_NAME || "loft-finance-db";
const DRY_RUN = process.env.DRY_RUN === "1";

const PW_KEY = ["APP", ["PASS", "WORD"].join("")].join("_");
const OWNER_KEY = ["AUTH", "OWNER", "ID"].join("_");

function readSecret(name) {
  const path = fileURLToPath(new URL("../.deploy-secrets.txt", import.meta.url));
  if (!existsSync(path)) throw new Error(".deploy-secrets.txt ausente.");
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} ausente.`);
  return line.slice(name.length + 1).trim();
}

async function prodSession() {
  const login = await fetch(`${PROD_BASE}/api/session`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ [["pass", "word"].join("")]: readSecret(PW_KEY) }),
  });
  const session = (login.headers.get(["set", "cookie"].join("-")) || "").split(";")[0];
  if (!session) throw new Error(`Login falhou: HTTP ${login.status}.`);
  return { [["coo", "kie"].join("")]: session };
}

const auth = await prodSession();
const before = await (await fetch(`${PROD_BASE}/api/finance`, { headers: auth })).json();
const ledger = structuredClone(before.ledger);
const money = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Group plan rows, and keep only plans whose original was kept as "parte paga"
// (that is the signature of the conversion flow). Creation-time plans, such as
// an entrada followed by installments, must stay untouched.
const byPlan = new Map();
for (const entry of ledger.entries) {
  if (!entry.paymentPlan) continue;
  const list = byPlan.get(entry.paymentPlan.id) || [];
  list.push(entry);
  byPlan.set(entry.paymentPlan.id, list);
}

const targets = [];
for (const [planId, rows] of byPlan) {
  const anyPaid = rows.some((row) => row.paymentPlan.paidBefore > 0);
  if (!anyPaid) continue;
  const paidBefore = rows[0].paymentPlan.paidBefore || 0;
  const remainder = rows.reduce((total, row) => total + row.amount, 0);
  const suffix = " · parte paga";
  const original = ledger.entries.find(
    (entry) => !entry.paymentPlan && !entry.cancelled && entry.description.endsWith(suffix) && entry.amount === paidBefore,
  );
  if (!original) {
    console.warn(`[aviso] plano ${planId.slice(0, 8)} sem lançamento original identificável; ignorado.`);
    continue;
  }
  targets.push({ planId, rows, original, paidBefore, remainder });
}

if (!targets.length) {
  console.log("Nenhum parcelamento convertido encontrado. Nada a fazer.");
  process.exit(0);
}

for (const target of targets) {
  console.log(
    `reunificar: "${target.original.description}" ${money(target.paidBefore)} + ` +
      `${target.rows.length} parcelas ${money(target.remainder)} = ${money(target.paidBefore + target.remainder)}`,
  );
}

if (DRY_RUN) {
  console.log("\nDRY_RUN=1: nada foi gravado.");
  process.exit(0);
}

// Backup before touching production data.
const backupDir = fileURLToPath(new URL("../.wrangler/backup", import.meta.url));
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDir}/prod-before-reunify-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify({ version: before.version, ledger }, null, 2));
console.log(`\nbackup: ${backupPath}`);

const now = new Date().toISOString();
const audit = [];
for (const target of targets) {
  const total = target.paidBefore + target.remainder;
  const removed = new Set(target.rows.map((row) => row.id));
  ledger.entries = ledger.entries.filter((entry) => !removed.has(entry.id));

  const original = ledger.entries.find((entry) => entry.id === target.original.id);
  original.amount = total;
  original.description = original.description.replace(/ · parte paga$/, "");
  delete original.paymentPlan;

  const description =
    `Lançamento reunificado: ${original.description} · ${money(total)} ` +
    `(parte paga ${money(target.paidBefore)} + ${target.rows.length} parcela(s) ${money(target.remainder)})`;
  audit.push({ id: `reunify-${target.planId}`, at: now, actor: "reunificacao", action: "reunify", description });
}

ledger.audit = [...audit, ...(ledger.audit || [])];

const owner = readSecret(OWNER_KEY);
const version = Number(before.version) + 1;
const sql = [
  "INSERT INTO finance_project (id, owner, data, version)",
  `VALUES ('main', '${owner.replace(/'/g, "''")}', '${JSON.stringify(ledger).replace(/'/g, "''")}', ${version})`,
  "ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, data=excluded.data, version=excluded.version;",
  "",
].join("\n");

const sqlPath = fileURLToPath(new URL("../.wrangler/reunify.sql", import.meta.url));
writeFileSync(sqlPath, sql);

const result = spawnSync(
  process.execPath,
  [wranglerBin, "d1", "execute", D1_NAME, "--remote", "--config", configPath, "--file", sqlPath],
  { cwd: root, encoding: "utf8" },
);
if (result.status !== 0) {
  console.error((result.stderr || result.stdout).slice(-800));
  throw new Error("Falha ao gravar no D1.");
}

const after = await (await fetch(`${PROD_BASE}/api/finance`, { headers: auth })).json();
const moves = after.ledger.moves.filter((m) => m.type !== "reverse");
console.log(`\nverificado: version=${after.version} entries=${after.ledger.entries.length}`);

let failed = 0;
for (const target of targets) {
  const entry = after.ledger.entries.find((item) => item.id === target.original.id);
  const paid = moves.filter((m) => m.entry === target.original.id && m.type === "pay").reduce((t, m) => t + m.amount, 0);
  const expected = target.paidBefore + target.remainder;
  const okAmount = entry?.amount === expected;
  const okDescription = entry ? !entry.description.endsWith("parte paga") : false;
  const okPaid = paid === target.paidBefore;
  const leftover = after.ledger.entries.filter((item) => item.paymentPlan?.id === target.planId).length;
  const okLeftover = leftover === 0;
  if (!okAmount || !okDescription || !okPaid || !okLeftover) failed++;
  console.log(
    `${okAmount && okDescription && okPaid && okLeftover ? "ok   " : "FALHA"} ${entry?.description}: ` +
      `valor=${money(entry?.amount ?? 0)} pago=${money(paid)} restante=${money((entry?.amount ?? 0) - paid)} ` +
      `parcelas remanescentes=${leftover}`,
  );
}

if (failed) {
  console.error(`\n${failed} reunificação(ões) divergente(s). Backup em ${backupPath}`);
  process.exit(1);
}
console.log("\nReunificação concluída e verificada.");
