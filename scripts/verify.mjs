// Runs the full financial test suite and the type check, then reports a summary.
import { spawnSync } from "node:child_process";

const tests = [
  "finance",
  "installments",
  "contacts-expenses",
  "finance-client",
  "unit-activity",
  "budget-rateio",
  "budget-units",
  "budget-edit",
  "budget-link",
  "expense-payment-edit",
];

let failed = 0;
for (const name of tests) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", `tests/${name}.test.mjs`],
    { encoding: "utf8" },
  );
  if (result.status === 0) {
    console.log(`ok      ${name}`);
  } else {
    failed++;
    console.log(`FALHOU  ${name}`);
    console.log((result.stdout + result.stderr).split(/\r?\n/).slice(-6).join("\n"));
  }
}

const tsc = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], { encoding: "utf8", shell: true });
const typeOk = tsc.status === 0;
console.log(`${typeOk ? "ok      " : "FALHOU  "}tsc --noEmit`);
if (!typeOk) console.log((tsc.stdout + tsc.stderr).trim());

console.log(failed === 0 && typeOk ? `\n${tests.length} testes + tipagem OK` : "\nHa falhas");
process.exit(failed === 0 && typeOk ? 0 : 1);
