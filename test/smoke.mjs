// Runtime smoke test: run with Node, Bun or Deno against the built package.
//   node test/smoke.mjs | bun test/smoke.mjs | deno run test/smoke.mjs
import { compareCosts, countTokens, estimateCost, getModel } from "../dist/index.js";

const checks = [
  ["countTokens", countTokens("Hello, world!") > 0],
  ["estimateCost shorthand", estimateCost("Hello", "sonnet").model === "claude-sonnet-5-5"],
  ["aliases", getModel("x-ai/grok-4.7").id === "grok-4.7"],
  ["compareCosts", compareCosts("Hello", ["gpt-5.5", "deepseek-flash", "mistral-small"]).length === 3],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length > 0) {
  console.error(`smoke test failed: ${failed.join(", ")}`);
  throw new Error("smoke test failed");
}
console.log(`smoke test passed (${checks.length} checks)`);
