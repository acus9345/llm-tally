import { describe, LlmTallyError } from "./errors.js";
import { BUILTIN_MODELS, type ModelInfo, type Provider } from "./models.js";

const registry = new Map<string, ModelInfo>();
for (const model of BUILTIN_MODELS) registry.set(model.id, model);

// Prefixes that other platforms put in front of the same model ID.
const PREFIXES = [
  /^models\//,
  /^(openai|anthropic|google|gemini|vertex_ai|bedrock)\//,
  /^(us\.|eu\.|apac\.|global\.)?anthropic\./,
];
// Dated snapshots: "gpt-4o-2024-08-06", "claude-haiku-4-5-20251001", "claude-opus-4-5@20251101", "-latest".
const SUFFIXES = [/-\d{4}-\d{2}-\d{2}$/, /[-@]\d{8}$/, /-latest$/, /-v\d+(:\d+)?$/, /-preview-\d{2}-\d{4}$/];

function normalize(id: string): string {
  let key = id.trim().toLowerCase();
  for (const prefix of PREFIXES) key = key.replace(prefix, "");
  return key;
}

/**
 * Looks up a model by ID. Accepts provider prefixes (`openai/gpt-5.5`, `models/gemini-2.5-pro`),
 * Bedrock IDs (`anthropic.claude-opus-5-5`) and dated snapshots (`gpt-4o-2024-08-06`).
 *
 * @throws {LlmTallyError} `UNKNOWN_MODEL` with the closest known IDs when nothing matches.
 */
export function getModel(id: string): ModelInfo {
  if (typeof id !== "string" || id.trim() === "") {
    throw new LlmTallyError(
      "INVALID_OPTION",
      `model must be a model ID string like "gpt-5.5", but got ${describe(id)}. Run \`npx llm-tally --list\` to see known models.`,
    );
  }
  const found = findModel(id);
  if (found) return found;
  const suggestions = closestIds(normalize(id), 3);
  throw new LlmTallyError(
    "UNKNOWN_MODEL",
    `Unknown model "${id}". Did you mean ${suggestions.map((s) => `"${s}"`).join(", ")}? ` +
      "Run `npx llm-tally --list` to see all models, or add your own with registerModel().",
  );
}

/** Like {@link getModel} but returns `undefined` instead of throwing. */
export function findModel(id: string): ModelInfo | undefined {
  if (typeof id !== "string") return undefined;
  const exact = registry.get(id);
  if (exact) return exact;
  let key = normalize(id);
  const direct = registry.get(key);
  if (direct) return direct;
  // Strip one suffix at a time ("...-20240620-v1:0" needs two passes) until something matches.
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SUFFIXES) {
      const stripped = key.replace(suffix, "");
      if (stripped !== key) {
        key = stripped;
        changed = true;
        const hit = registry.get(key);
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

/** Lists known models, optionally only those from one provider. */
export function listModels(provider?: Provider): ModelInfo[] {
  const all = [...registry.values()];
  return provider === undefined ? all : all.filter((m) => m.provider === provider.toLowerCase());
}

/**
 * Adds a model or replaces a built-in one (for example to apply a negotiated discount).
 * Prices are USD per 1 million tokens.
 *
 * @example
 * registerModel({ id: "my-finetune", provider: "openai", input: 3, output: 12 });
 */
export function registerModel(model: ModelInfo): void {
  if (model === null || typeof model !== "object") {
    throw new LlmTallyError("INVALID_INPUT", `registerModel() needs a model object, but got ${describe(model)}.`);
  }
  if (typeof model.id !== "string" || model.id.trim() === "") {
    throw new LlmTallyError("INVALID_OPTION", 'registerModel(): "id" must be a non-empty string, e.g. "my-model".');
  }
  if (typeof model.provider !== "string" || model.provider === "") {
    throw new LlmTallyError(
      "INVALID_OPTION",
      `registerModel("${model.id}"): "provider" must be a string, e.g. "openai".`,
    );
  }
  for (const field of ["input", "output", "cachedInput"] as const) {
    const value = model[field];
    if (value === undefined && field === "cachedInput") continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new LlmTallyError(
        "INVALID_OPTION",
        `registerModel("${model.id}"): "${field}" must be a price in USD per 1M tokens (a number >= 0), but got ${describe(value)}.`,
      );
    }
  }
  registry.set(model.id, { ...model, provider: model.provider.toLowerCase() });
}

function closestIds(key: string, count: number): string[] {
  return [...registry.keys()]
    .map((id) => ({ id, d: distance(key, id) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.id);
}

/** Levenshtein edit distance. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
