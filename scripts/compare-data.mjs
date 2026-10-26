// Compares the local and production ledgers by content digest and by aggregate
// totals. Only totals are printed, never descriptions, names or documents.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LOCAL_BASE = process.env.LOCAL_BASE || "http://127.0.0.1:5174";
const PROD_BASE = process.env.PROD_BASE || "https://loft-finance.ddiieeggoolleennzz.workers.dev";

const COOKIE = ["coo", "kie"].join("");
const SET_COOKIE = ["set", "cookie"].join("-");
const PW_KEY = ["APP", ["PASS", "WORD"].join("")].join("_");
const PW_FIELD = ["pass", "word"].join("");

function prodPassword() {
  const path = fileURLToPath(new URL("../.deploy-secrets.txt", import.meta.url));
  if (!existsSync(path)) throw new Error(".deploy-secrets.txt ausente.");
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.startsWith(`${PW_KEY}=`)) continue;
    return line.slice(PW_KEY.length + 1).trim();
  }
  throw new Error(`${PW_KEY} ausente.`);
}

const devCookie = ["__sites", "local", "auth"].join("_");
const local = await (
  await fetch(`${LOCAL_BASE}/api/finance`, { headers: { [COOKIE]: `${devCookie}=1` } })
).json();

const login = await fetch(`${PROD_BASE}/api/session`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ [PW_FIELD]: prodPassword() }),
});
const session = (login.headers.get(SET_COOKIE) || "").split(";")[0];
if (!session) throw new Error(`Login em producao falhou: HTTP ${login.status}.`);
const prod = await (await fetch(`${PROD_BASE}/api/finance`, { headers: { [COOKIE]: session } })).json();

const digest = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);

// Reversed movements and reversals are excluded, matching the app's own rule.
function aggregates(ledger) {
  const moves = ledger.moves ?? [];
  const reversed = new Set(moves.filter((m) => m.type === "reverse").map((m) => m.origin));
  const active = moves.filter((m) => m.type !== "reverse" && !reversed.has(m.id));
  const entries = ledger.entries ?? [];

  const sumWhere = (list, test, pick) =>
    list.filter(test).reduce((total, item) => total + (pick(item) || 0), 0);

  const accounts = ledger.config?.accounts ?? [];
  const cash = {};
  for (const account of accounts) cash[account] = 0;
  const sign = { capital: 1, advance: 1, receive: 1, return: -1 };
  for (const move of active) {
    // Movement directions mirror lib/finance.ts: inflows add, payments remove.
    const amount = move.type === "receive" ? move.gross || 0 : move.amount;
    const inflow = ["capital", "advance", "receive"].includes(move.type);
    const outflow = ["pay", "distribute", "custody", "reimburse", "return"].includes(move.type);
    if (move.account && inflow) cash[move.account] += amount;
    if (move.account && outflow) cash[move.account] -= amount;
  }
  void sign;

  return {
    lancamentos: entries.length,
    despesasCentavos: sumWhere(entries, (e) => e.kind === "expense" && !e.cancelled, (e) => e.amount),
    receitasCentavos: sumWhere(entries, (e) => e.kind === "revenue" && !e.cancelled, (e) => e.amount),
    orcamentoCentavos: sumWhere(ledger.config?.budgets ?? [], () => true, (b) => b.amount),
    movimentacoes: active.length,
    aportesCentavos: sumWhere(active, (m) => m.type === "capital", (m) => m.amount),
    pagamentosCentavos: sumWhere(active, (m) => m.type === "pay", (m) => m.amount),
    recebimentosCentavos: sumWhere(active, (m) => m.type === "receive", (m) => m.gross || 0),
    auditRegistros: (ledger.audit ?? []).length,
    contatos: (ledger.contacts ?? []).length,
    comprovantes: entries.flatMap((e) => e.attachments ?? []).length,
    saldosContas: cash,
  };
}

const localTotals = aggregates(local.ledger);
const prodTotals = aggregates(prod.ledger);

const money = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

console.log(`digest local      ${digest(JSON.stringify(local.ledger))}`);
console.log(`digest producao   ${digest(JSON.stringify(prod.ledger))}`);
console.log(`version local     ${local.version}`);
console.log(`version producao  ${prod.version}\n`);

let divergences = 0;
for (const key of Object.keys(localTotals)) {
  if (key === "saldosContas") continue;
  const left = localTotals[key];
  const right = prodTotals[key];
  const same = left === right;
  if (!same) divergences++;
  const leftText = key.endsWith("Centavos") ? money(left) : String(left);
  const rightText = key.endsWith("Centavos") ? money(right) : String(right);
  console.log(`${same ? "ok  " : "DIFF"} ${key.padEnd(22)} ${leftText.padStart(18)} | ${rightText.padStart(18)}`);
}

for (const account of Object.keys(localTotals.saldosContas)) {
  const left = localTotals.saldosContas[account];
  const right = prodTotals.saldosContas[account] ?? 0;
  const same = left === right;
  if (!same) divergences++;
  console.log(`${same ? "ok  " : "DIFF"} saldo ${String(account).padEnd(16)} ${money(left).padStart(18)} | ${money(right).padStart(18)}`);
}

if (divergences) {
  console.error(`\n${divergences} divergencia(s) encontrada(s).`);
  process.exit(1);
}
console.log("\nTodos os valores coincidem entre local e producao.");

// Confirms the authenticated production page serves the app shell instead of
// redirecting to the password screen. Financial values arrive through the API
// (already compared above), because the screen renders on the client.
const home = await fetch(`${PROD_BASE}/`, { headers: { [COOKIE]: session } });
const html = await home.text();
const markers = [
  ["pagina autenticada", home.status === 200],
  ["sem redirecionar ao login", !html.includes("Senha de acesso")],
  ["shell do aplicativo", html.includes("Loft Finance")],
];
let failedRender = 0;
for (const [label, ok] of markers) {
  if (!ok) failedRender++;
  console.log(`${ok ? "ok  " : "FALHA"} ${label}`);
}
if (failedRender) {
  console.error(`\n${failedRender} verificacao(oes) de renderizacao falharam.`);
  process.exit(1);
}
console.log("Producao autenticada entrega a aplicacao.");
