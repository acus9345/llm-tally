// Builds dist/ui.html: the web UI with the library inlined, so it works offline from a file:// URL.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

const result = await build({
  entryPoints: [fileURLToPath(new URL("src/index.ts", root))],
  bundle: true,
  format: "iife",
  globalName: "LlmTally",
  target: "es2022",
  minify: true,
  write: false,
  legalComments: "none",
});

const bundle = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
const template = readFileSync(new URL("web/ui.html", root), "utf8");
const html = template.replace("/*__LLM_TALLY_BUNDLE__*/", () => bundle).replaceAll("__VERSION__", version);

writeFileSync(new URL("dist/ui.html", root), html);
console.log(`dist/ui.html written (${(html.length / 1024).toFixed(1)} kB)`);
