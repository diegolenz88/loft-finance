// `wrangler dev --config dist/server/wrangler.json` resolves `.dev.vars`
// relative to the config directory, not the repository root. Copy the local
// secrets file next to the generated config so `pnpm start` can exercise the
// standalone login. The copy lives under the ignored dist/ directory.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../.dev.vars", import.meta.url));
const target = fileURLToPath(new URL("../dist/server/.dev.vars", import.meta.url));

if (!existsSync(source)) {
  console.log("[dev-vars] .dev.vars ausente; seguindo sem login por senha local.");
  process.exit(0);
}

if (!existsSync(fileURLToPath(new URL("../dist/server", import.meta.url)))) {
  console.log("[dev-vars] dist/server ausente; rode `pnpm build` antes de `pnpm start`.");
  process.exit(0);
}

copyFileSync(source, target);
console.log("[dev-vars] .dev.vars copiado para dist/server.");
