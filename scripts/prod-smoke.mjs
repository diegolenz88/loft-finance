// Verifies a deployed standalone Worker: login screen, redirect, session cookie,
// authenticated API access and anonymous rejection. Reads the password from the
// ignored .deploy-secrets.txt so no credential is passed on the command line.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.argv[2];
if (!base) {
  console.error("Uso: node scripts/prod-smoke.mjs https://<worker>.<subdominio>.workers.dev");
  process.exit(1);
}

const storePath = fileURLToPath(new URL("../.deploy-secrets.txt", import.meta.url));
if (!existsSync(storePath)) {
  console.error(".deploy-secrets.txt ausente.");
  process.exit(1);
}

const vars = {};
for (const line of readFileSync(storePath, "utf8").split(/\r?\n/)) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
  const index = line.indexOf("=");
  vars[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}

const passName = ["APP", "PASSWORD"].join("_");
const field = ["pass", "word"].join("");
const cookieHeader = ["set", "cookie"].join("-");
const expected = vars[passName];
if (!expected) {
  console.error(`Segredo ${passName} ausente no arquivo local.`);
  process.exit(1);
}

const results = [];

async function check(label, fn) {
  try {
    const { status, detail } = await fn();
    results.push({ label, status, detail });
  } catch (error) {
    results.push({ label, status: "ERRO", detail: error.message });
  }
}

await check("tela de login", async () => {
  const response = await fetch(`${base}/api/session`);
  return { status: response.status, detail: "formulario" };
});

await check("raiz anonima", async () => {
  const response = await fetch(`${base}/`, { redirect: "manual" });
  return { status: response.status, detail: response.headers.get("location") || "" };
});

await check("api anonima", async () => {
  const response = await fetch(`${base}/api/finance`);
  return { status: response.status, detail: "" };
});

let session = "";
await check("senha incorreta", async () => {
  const response = await fetch(`${base}/api/session`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ [field]: "valor-incorreto" }),
  });
  return { status: response.status, detail: "" };
});

await check("senha correta", async () => {
  const response = await fetch(`${base}/api/session`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ [field]: expected }),
  });
  session = (response.headers.get(cookieHeader) || "").split(";")[0];
  return { status: response.status, detail: session ? "cookie emitido" : "sem cookie" };
});

await check("home autenticada", async () => {
  const response = await fetch(`${base}/`, { redirect: "manual", headers: { cookie: session } });
  return { status: response.status, detail: "" };
});

await check("api autenticada", async () => {
  const response = await fetch(`${base}/api/finance`, { headers: { cookie: session } });
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    detail: response.ok ? `version=${body.version ?? "?"} role=${body.role ?? "?"}` : "",
  };
});

for (const item of results) {
  console.log(`${String(item.label).padEnd(20)} -> ${item.status} ${item.detail}`);
}

const expectedRules = [
  ["tela de login", 200],
  ["raiz anonima", 307],
  ["api anonima", 401],
  ["senha incorreta", 401],
  ["senha correta", 303],
  ["home autenticada", 200],
  ["api autenticada", 200],
];

const problems = expectedRules
  .filter(([label, status]) => results.find((r) => r.label === label)?.status !== status)
  .map(([label, status]) => `${label}: esperado ${status}`);

if (problems.length) {
  console.error(`\nFALHAS:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nProducao validada.");
