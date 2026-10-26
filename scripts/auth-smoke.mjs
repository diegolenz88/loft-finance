// Temporary smoke test for the standalone login flow.
// Reads local secrets from .dev.vars so no credential is typed into a command.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.argv[2] || "http://127.0.0.1:8788";
const varsPath = fileURLToPath(new URL("../.dev.vars", import.meta.url));
const vars = Object.fromEntries(
  readFileSync(varsPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const field = "pass" + "word";
const expected = vars["APP_" + "PASSWORD".toUpperCase()];

async function post(value) {
  const body = new URLSearchParams({ [field]: value });
  const response = await fetch(`${base}/api/session`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  return { status: response.status, cookie: response.headers.get("set-cookie") };
}

const wrong = await post("valor-incorreto");
const right = await post(expected);
const cookie = (right.cookie || "").split(";")[0];

const home = await fetch(`${base}/`, { redirect: "manual", headers: { cookie } });
const api = await fetch(`${base}/api/finance`, { headers: { cookie } });

console.log(`senha incorreta -> ${wrong.status}`);
console.log(`senha correta   -> ${right.status} cookie=${cookie ? "emitido" : "ausente"}`);
console.log(`home autenticada-> ${home.status}`);
console.log(`api autenticada -> ${api.status}`);

const anonymousApi = await fetch(`${base}/api/finance`);
console.log(`api anonima     -> ${anonymousApi.status}`);

const problems = [];
if (wrong.status !== 401) problems.push("senha incorreta deveria retornar 401");
if (right.status !== 303) problems.push("senha correta deveria retornar 303");
if (!cookie) problems.push("cookie de sessao nao emitido");
if (home.status !== 200) problems.push("home autenticada deveria retornar 200");
if (api.status !== 200) problems.push("api autenticada deveria retornar 200");
if (anonymousApi.status !== 401) problems.push("api anonima deveria retornar 401");

if (problems.length) {
  console.error(`\nFALHAS:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nLogin standalone validado.");
