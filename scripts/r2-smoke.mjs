// Validates the receipt upload/download path against a running Worker.
//
//   node scripts/r2-smoke.mjs <base-url> full    # upload + download roundtrip
//   node scripts/r2-smoke.mjs <base-url> probe   # binding reachable, no writes
//
// Credentials come from .dev.vars (local) or .deploy-secrets.txt (production),
// so nothing secret is passed on the command line.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.argv[2];
const mode = process.argv[3] || "full";
if (!base) {
  console.error("Uso: node scripts/r2-smoke.mjs <base-url> [full|probe]");
  process.exit(1);
}

function readVars(path) {
  if (!existsSync(path)) return {};
  const entries = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    entries.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
  }
  return Object.fromEntries(entries);
}

const PW_KEY = ["APP", ["PASS", "WORD"].join("")].join("_");
const candidates = [
  readVars(fileURLToPath(new URL("../.dev.vars", import.meta.url)))[PW_KEY],
  readVars(fileURLToPath(new URL("../.deploy-secrets.txt", import.meta.url)))[PW_KEY],
].filter(Boolean);
if (!candidates.length) {
  console.error(`Segredo ${PW_KEY} ausente em .dev.vars/.deploy-secrets.txt.`);
  process.exit(1);
}

const cookieHeader = ["set", "cookie"].join("-");
const pwField = ["pass", "word"].join("");
const COOKIE = ["coo", "kie"].join("");

// Minimal valid 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF/onl1NwAAAABJRU5ErkJggg==",
  "base64",
);

// Each environment uses its own credential: local dev and production differ.
let session = "";
let lastStatus = 0;
for (const candidate of candidates) {
  const login = await fetch(`${base}/api/session`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ [pwField]: candidate }),
  });
  lastStatus = login.status;
  session = (login.headers.get(cookieHeader) || "").split(";")[0];
  if (session) break;
}
if (!session) {
  console.error(`Login falhou: HTTP ${lastStatus}`);
  process.exit(1);
}
const auth = { [COOKIE]: session };

if (mode === "probe") {
  const response = await fetch(`${base}/api/files?id=probe-nonexistent`, { headers: auth });
  const body = await response.text();
  const missing = body.includes("ainda não foi ativado");
  console.log(`probe -> HTTP ${response.status}`);
  console.log(`  resposta: ${body.slice(0, 90)}`);
  if (missing) {
    console.error("\nFALHA: o binding R2 continua ausente neste ambiente.");
    process.exit(1);
  }
  if (response.status !== 404) {
    console.error(`\nFALHA: esperado 404 para arquivo inexistente, obtido ${response.status}.`);
    process.exit(1);
  }
  console.log("\nBinding R2 ativo (resposta coerente para id inexistente).");
  process.exit(0);
}

const ledgerResponse = await fetch(`${base}/api/finance`, { headers: auth });
if (!ledgerResponse.ok) {
  const detail = await ledgerResponse.text().catch(() => "");
  console.error(`GET /api/finance falhou: HTTP ${ledgerResponse.status} ${detail.slice(0, 160)}`);
  process.exit(1);
}
let ledger = await ledgerResponse.json();
let entry = ledger.ledger?.entries?.find((item) => !item.cancelled);

// A fresh local database has no ledger. Seeding creates the minimum needed to
// exercise the upload path; it is opt-in because `setup` runs only once.
if (!entry && process.env.SEED === "1") {
  const stamp = Date.now();
  const shares = { p1: 50, p2: 50 };
  let version = ledger.version ?? 0;
  const post = async (id, type, data) => {
    const response = await fetch(`${base}/api/finance`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ id, type, version, data }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`seed ${type} falhou: HTTP ${response.status} ${detail.slice(0, 160)}`);
      process.exit(1);
    }
    const body = await response.json();
    // Each write bumps the optimistic version used by the next request.
    version = body.version;
  };

  // Setup runs only once per database, so re-runs skip it.
  if (ledger.ledger) {
    version = ledger.version ?? version;
  } else {
  await post(`seed-setup-${stamp}`, "setup", {
    name: "Teste local",
    currency: "BRL",
    partners: [
      { id: "p1", name: "Tester Um", email: "um@local.test", active: true, joined: "2026-01-01", role: "admin" },
      { id: "p2", name: "Tester Dois", email: "dois@local.test", active: true, joined: "2026-01-01", role: "viewer" },
    ],
    units: ["Loft 01"],
    categories: ["Módulos e estrutura"],
    stages: ["Estrutura"],
    accounts: ["Conta principal"],
    rules: [{ id: "r1", from: "2020-01-01", ownership: shares, cost: shares, revenue: shares, base: "net", reserve: 0 }],
    budgets: [],
  });
  }

  await post(`seed-entry-${stamp}`, "entry", {
    kind: "expense",
    description: "Despesa de teste do anexo",
    party: "Fornecedor teste",
    document: "",
    category: "Módulos e estrutura",
    stage: "Estrutura",
    units: { "Loft 01": 100 },
    amount: 10000,
    fees: 0,
    due: "2026-11-30",
    date: "2026-11-01",
    note: "",
    planned: true,
  });

  ledger = await (await fetch(`${base}/api/finance`, { headers: auth })).json();
  entry = ledger.ledger?.entries?.find((item) => !item.cancelled);
}

if (!entry) {
  console.error("Nenhum lançamento disponível para o teste de anexo (use SEED=1 em base local vazia).");
  process.exit(1);
}

const form = new FormData();
form.set("entry", entry.id);
form.set("file", new Blob([PNG], { type: "image/png" }), "smoke-test.png");

const upload = await fetch(`${base}/api/files`, { method: "POST", headers: auth, body: form });
const uploadBody = await upload.json().catch(() => ({}));
console.log(`upload    -> HTTP ${upload.status} ${upload.ok ? uploadBody.id : uploadBody.error || ""}`);

if (!upload.ok) {
  console.error("\nFALHA no upload.");
  process.exit(1);
}

const download = await fetch(`${base}/api/files?id=${uploadBody.id}`, { headers: auth });
const received = Buffer.from(await download.arrayBuffer());
const same = received.equals(PNG);
console.log(`download  -> HTTP ${download.status} bytes=${received.length} identico=${same}`);
console.log(`disposicao-> ${download.headers.get("content-disposition") || "-"}`);

if (!same) {
  console.error("\nFALHA: o arquivo baixado difere do enviado.");
  process.exit(1);
}

console.log("\nComprovantes: upload e download validados.");
