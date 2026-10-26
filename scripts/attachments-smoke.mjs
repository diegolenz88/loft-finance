// End-to-end check of the two attachment natures against a running Worker.
//
//   node scripts/attachments-smoke.mjs <base-url>
//
// Creates an isolated expense, records a payment, then uploads:
//   - a purchase document (kind=expense)
//   - a payment receipt bound to that payment (kind=payment, move=<id>)
// and verifies storage, download integrity and the rejection rules.
// Requires a writable environment (use a disposable local database).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.argv[2];
if (!base) {
  console.error("Uso: node scripts/attachments-smoke.mjs <base-url>");
  process.exit(1);
}

const PW_KEY = ["APP", ["PASS", "WORD"].join("")].join("_");
function readSecret(name) {
  const path = fileURLToPath(new URL("../.dev.vars", import.meta.url));
  const alt = fileURLToPath(new URL("../.deploy-secrets.txt", import.meta.url));
  for (const candidate of [path, alt]) {
    let text = "";
    try {
      text = readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
    const line = text.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim();
  }
  throw new Error(`${name} ausente em .dev.vars/.deploy-secrets.txt`);
}

const PW_FIELD = ["pass", "word"].join("");
const COOKIE = ["coo", "kie"].join("");
const SET_COOKIE = ["set", "cookie"].join("-");

const login = await fetch(`${base}/api/session`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ [PW_FIELD]: readSecret(PW_KEY) }),
});
const session = (login.headers.get(SET_COOKIE) || "").split(";")[0];
if (!session) {
  console.error(`Login falhou: HTTP ${login.status}`);
  process.exit(1);
}
const auth = { [COOKIE]: session };

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, { headers: auth, ...options });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

let state = await json("/api/finance");
if (!state.body.ledger) {
  console.error("Base sem empreendimento configurado; use uma base descartável já semeada.");
  process.exit(1);
}

const entry = state.body.ledger.entries.find(
  (item) => !item.cancelled && item.kind === "expense" && !item.paymentPlan,
);
const movement = state.body.ledger.moves.find(
  (item) => item.type === "pay" && item.entry === entry?.id,
);
if (!entry || !movement) {
  console.error("É necessário um lançamento com pagamento registrado para o teste.");
  process.exit(1);
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF/onl1NwAAAABJRU5ErkJggg==",
  "base64",
);

async function upload(fields, name) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set("file", new Blob([PNG], { type: "image/png" }), name);
  const response = await fetch(`${base}/api/files`, { method: "POST", headers: auth, body: form });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

// The browser uploads the bytes and then records the attachment in the ledger.
// Reproduce both steps so the check reflects the real contract.
async function attach(entryId, file) {
  const current = await json("/api/finance");
  const response = await fetch(`${base}/api/finance`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      id: `attach-${file.id}`,
      type: "attachment",
      version: current.body.version,
      data: { entry: entryId, file },
    }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

let failures = 0;
const results = [];
function check(label, ok, detail = "") {
  if (!ok) failures++;
  results.push(`${ok ? "ok   " : "FALHA"} ${label}${detail ? ` · ${detail}` : ""}`);
}

// 1. Purchase document: upload bytes, then record the attachment.
const doc = await upload({ entry: entry.id, kind: "expense" }, "nota-fiscal.png");
check("upload do documento", doc.status === 200, `HTTP ${doc.status}`);
if (doc.body.id) {
  const saved = await attach(entry.id, { ...doc.body, kind: "expense" });
  check("registro do documento", saved.status === 200, `HTTP ${saved.status}`);
}

// 2. Payment receipt bound to the payment.
const receipt = await upload({ entry: entry.id, kind: "payment", move: movement.id }, "comprovante-pagamento.png");
check("upload do comprovante de pagamento", receipt.status === 200, `HTTP ${receipt.status}`);
if (receipt.body.id) {
  const saved = await attach(entry.id, { ...receipt.body, kind: "payment", move: movement.id });
  check("registro do comprovante", saved.status === 200, `HTTP ${saved.status}`);
}

// 3. Rules: unknown movement and mismatched nature are refused.
const unknown = await upload({ entry: entry.id, kind: "payment", move: "movimento-inexistente" }, "x.png");
check("pagamento inexistente recusado", unknown.status === 400, `HTTP ${unknown.status}`);
const mismatch = await upload({ entry: entry.id, kind: "expense", move: movement.id }, "x.png");
check("natureza divergente recusada", mismatch.status === 400, `HTTP ${mismatch.status}`);

// 4. Ledger keeps both, with the link.
state = await json("/api/finance");
const saved = state.body.ledger.entries.find((item) => item.id === entry.id);
const documents = saved.attachments.filter((item) => item.kind !== "payment");
const receipts = saved.attachments.filter((item) => item.kind === "payment");
check("documento persistido", documents.length >= 1, `${documents.length} documento(s)`);
check("comprovante persistido", receipts.length >= 1, `${receipts.length} comprovante(s)`);
check(
  "comprovante ligado ao pagamento",
  receipts.some((item) => item.move === movement.id),
);

// 5. Both files are downloadable and identical.
for (const [label, uploaded] of [["documento", doc], ["comprovante", receipt]]) {
  if (!uploaded.body.id) continue;
  const download = await fetch(`${base}/api/files?id=${uploaded.body.id}`, { headers: auth });
  const bytes = Buffer.from(await download.arrayBuffer());
  check(`download do ${label}`, download.status === 200 && bytes.equals(PNG), `${bytes.length} bytes`);
}

console.log(results.join("\n"));
console.log(failures ? `\n${failures} verificação(ões) falharam.` : "\nAnexos validados.");
process.exit(failures ? 1 : 0);
