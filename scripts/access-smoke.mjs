// Verifies that forged Cloudflare Access assertions never authenticate.
//
//   node scripts/access-smoke.mjs <base-url>
//
// Run before enabling ACCESS_REQUIRED=1. Every case below must be rejected with
// 401; a 200 would mean the app trusted an unverified identity header.
const base = process.argv[2];
if (!base) {
  console.error("Uso: node scripts/access-smoke.mjs <base-url>");
  process.exit(1);
}

const base64url = (value) => Buffer.from(value).toString("base64url");

const claims = {
  iss: "https://exemplo.cloudflareaccess.com",
  aud: ["aud-exemplo"],
  email: "invasor@exemplo.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

function token(header, payload, signature = "assinatura-falsa") {
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.${base64url(signature)}`;
}

const cases = [
  ["sem cabeçalho", null],
  ["texto arbitrário", "nao-e-um-jwt"],
  ["alg=none", token({ alg: "none", kid: "x" }, claims)],
  ["HS256 em vez de RS256", token({ alg: "HS256", kid: "x" }, claims)],
  ["sem kid", token({ alg: "RS256" }, claims)],
  ["assinatura inválida", token({ alg: "RS256", kid: "kid-inventado" }, claims)],
  ["expirado", token({ alg: "RS256", kid: "kid-inventado" }, { ...claims, exp: Math.floor(Date.now() / 1000) - 60 })],
  ["sem e-mail", token({ alg: "RS256", kid: "kid-inventado" }, { ...claims, email: undefined })],
];

let failures = 0;
const results = [];

for (const [label, value] of cases) {
  const headers = { Accept: "application/json" };
  if (value) headers["Cf-Access-Jwt-Assertion"] = value;
  let status = "ERRO";
  try {
    const response = await fetch(`${base}/api/finance`, { headers, redirect: "manual" });
    status = response.status;
  } catch (error) {
    status = `ERRO ${error.message}`;
  }
  const ok = status === 401 || status === 403;
  if (!ok) failures++;
  results.push(`${ok ? "ok   " : "FALHA"} ${label.padEnd(26)} HTTP ${status}`);
}

console.log(results.join("\n"));
console.log(
  failures
    ? `\n${failures} caso(s) aceitaram identidade não verificada.`
    : "\nNenhuma identidade forjada foi aceita.",
);
process.exit(failures ? 1 : 0);
