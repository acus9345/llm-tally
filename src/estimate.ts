import { getModel, listModels } from "./catalog.js";
import { assertTokenCount, describe, LlmTallyError } from "./errors.js";
import { DEFAULT_COMPARE_MODELS, type ModelInfo } from "./models.js";
import { estimateTextTokens } from "./tokenize.js";

/** One part of a multi-part message. Only text parts are counted. */
export interface ContentPart {
  type: string;
  text?: string;
}

/** A chat message in the OpenAI / Anthropic / Gemini-style shape. */
export interface ChatMessage {
  role: string;
  content: string | ContentPart[];
}

/** What you can measure: plain text, or a list of chat messages. */
export type TallyInput = string | readonly ChatMessage[];

/** Options for {@link countTokens}. */
export interface CountOptions {
  /** Model whose tokenizer to imitate. Defaults to OpenAI's o200k (GPT-4o and newer). */
  model?: string;
}

/** Options for {@link estimateCost}. */
export interface EstimateOptions {
  /** Model ID to price, e.g. `"gpt-5.5"` or `"claude-sonnet-5-5"`. */
  model: string;
  /** How many tokens you expect the reply to use (including reasoning). Defaults to 0. */
  outputTokens?: number;
  /** How many of the input tokens are read from the prompt cache. Defaults to 0. */
  cachedInputTokens?: number;
}

/** Options for {@link compareCosts}. */
export interface CompareOptions {
  /** Models to compare. Defaults to a few current models from each provider. */
  models?: readonly string[];
  /** Compare every known model from these providers instead, e.g. `["anthropic", "xai"]`. */
  providers?: readonly string[];
  /** How many tokens you expect the reply to use. Defaults to 0. */
  outputTokens?: number;
  /** How many of the input tokens are read from the prompt cache. Defaults to 0. */
  cachedInputTokens?: number;
}

/** Token counts reported by a provider's API, for exact pricing with {@link costFromUsage}. */
export interface Usage {
  /** Model ID that served the request. */
  model: string;
  /**
   * All input tokens, including any read from cache.
   * (Anthropic reports cache reads separately: pass `input_tokens + cache_read_input_tokens`.)
   */
  inputTokens: number;
  /** Output tokens, including reasoning/thinking tokens. Defaults to 0. */
  outputTokens?: number;
  /** Input tokens served from the prompt cache. Defaults to 0. */
  cachedInputTokens?: number;
}

/** A priced request. All costs are in US dollars. */
export interface CostEstimate {
  /** Model ID as found in the catalog. */
  model: string;
  /** Provider that serves the model. */
  provider: string;
  /** Total input tokens (including cached ones). */
  inputTokens: number;
  /** Input tokens priced at the cache rate. */
  cachedInputTokens: number;
  /** Output tokens. */
  outputTokens: number;
  /** Cost of the uncached input tokens. */
  inputCost: number;
  /** Cost of the cached input tokens. */
  cachedInputCost: number;
  /** Cost of the output tokens. */
  outputCost: number;
  /** `inputCost + cachedInputCost + outputCost`. */
  totalCost: number;
  /** Always `"USD"`. */
  currency: "USD";
  /** `true` when the input token count is an estimate rather than reported by the API. */
  approximate: boolean;
  /** `true` when the long-context price tier was applied. */
  longContext: boolean;
  /** Things worth knowing about this estimate (for example, input larger than the context window). */
  warnings: string[];
}

const MESSAGE_OVERHEAD = 4; // role + separators per message
const REPLY_OVERHEAD = 3; // tokens that prime the assistant's reply

/**
 * Estimates how many tokens `input` uses.
 *
 * @param options A model ID (`"sonnet"`) or `{ model }`. Without a model, counts like GPT-4o and newer.
 * @example
 * countTokens("Hello, world!"); // 4
 * countTokens(messages, "claude-opus-5-5");
 */
export function countTokens(input: TallyInput, options: CountOptions | string = {}): number {
  const opts = typeof options === "string" ? { model: options } : (options ?? {});
  const family = opts.model === undefined ? undefined : getModel(opts.model).tokenizer;
  if (typeof input === "string") return estimateTextTokens(input, family);
  if (!Array.isArray(input)) throw invalidInput(input);
  if (input.length === 0) return 0;
  let tokens = REPLY_OVERHEAD;
  input.forEach((message, i) => {
    tokens += MESSAGE_OVERHEAD + estimateTextTokens(messageText(message, i), family);
  });
  return tokens;
}

/**
 * Estimates what sending `input` to `model` costs, in US dollars.
 *
 * @param options A model ID (`"gpt-5.5"`, `"sonnet"`) or `{ model, outputTokens?, cachedInputTokens? }`.
 * @example
 * estimateCost("Summarize this article...", "gpt-5.5").totalCost;
 * estimateCost("Summarize this article...", { model: "sonnet", outputTokens: 300 });
 */
export function estimateCost(input: TallyInput, options: EstimateOptions | string): CostEstimate {
  if (typeof options === "string") options = { model: options };
  if (options === null || typeof options !== "object" || options.model === undefined) {
    throw new LlmTallyError(
      "INVALID_OPTION",
      'estimateCost() needs a model, e.g. estimateCost(text, { model: "gpt-5.5" }). Use compareCosts() to price several models.',
    );
  }
  const model = getModel(options.model);
  const inputTokens = countTokens(input, { model: model.id });
  return price(model, inputTokens, options.outputTokens ?? 0, options.cachedInputTokens ?? 0, true);
}

/**
 * Prices the same request on several models, cheapest first.
 *
 * @param options A list of model IDs, or `{ models?, providers?, outputTokens?, cachedInputTokens? }`.
 * @example
 * compareCosts(prompt, ["gpt-5.5", "sonnet", "grok"]);
 * compareCosts(prompt, { providers: ["anthropic"], outputTokens: 500 });
 */
export function compareCosts(input: TallyInput, options: CompareOptions | readonly string[] = {}): CostEstimate[] {
  const opts: CompareOptions = Array.isArray(options) ? { models: options } : ((options as CompareOptions) ?? {});
  const ids = opts.models ?? (opts.providers === undefined ? DEFAULT_COMPARE_MODELS : providerModels(opts.providers));
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new LlmTallyError(
      "INVALID_OPTION",
      'compareCosts(): "models" must be a non-empty array of model IDs, e.g. ["gpt-5.5", "claude-sonnet-5-5"].',
    );
  }
  const { outputTokens, cachedInputTokens } = opts;
  const seen = new Set<string>(); // "sonnet" and "claude-sonnet-5-5" are the same model
  return ids
    .map((id) => estimateCost(input, { model: id, outputTokens, cachedInputTokens }))
    .filter((estimate) => !seen.has(estimate.model) && seen.add(estimate.model) !== undefined)
    .sort((a, b) => a.totalCost - b.totalCost || a.model.localeCompare(b.model));
}

/**
 * Exact cost of a finished request, from the token counts in the API response.
 *
 * @example
 * costFromUsage({ model: "gpt-5.5", inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens });
 */
export function costFromUsage(usage: Usage): CostEstimate {
  if (usage === null || typeof usage !== "object") {
    throw new LlmTallyError(
      "INVALID_INPUT",
      `costFromUsage() needs an object like { model: "gpt-5.5", inputTokens: 1200, outputTokens: 300 }, but got ${describe(usage)}.`,
    );
  }
  assertTokenCount("inputTokens", usage.inputTokens);
  return price(getModel(usage.model), usage.inputTokens, usage.outputTokens ?? 0, usage.cachedInputTokens ?? 0, false);
}

/**
 * Formats a dollar amount for display: cents from $1 up, three significant digits below,
 * so small costs stay comparable ($0.0100 vs $0.0201).
 *
 * @example
 * formatUsd(12.5);     // "$12.50"
 * formatUsd(0.010048); // "$0.0100"
 * formatUsd(0.000123); // "$0.000123"
 */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$?";
  if (amount === 0) return "$0.00";
  const rounded = Number(amount.toPrecision(3));
  if (Math.abs(rounded) >= 1) return `$${amount.toFixed(2)}`;
  const digits = Math.min(20, 2 - Math.floor(Math.log10(Math.abs(rounded))));
  return `$${rounded.toFixed(digits)}`;
}

function price(
  model: ModelInfo,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
  approximate: boolean,
): CostEstimate {
  assertTokenCount("outputTokens", outputTokens);
  assertTokenCount("cachedInputTokens", cachedInputTokens);
  const warnings: string[] = [];
  let cached = cachedInputTokens;
  if (cached > inputTokens) {
    warnings.push(`cachedInputTokens (${cached}) is more than the input (${inputTokens}); used ${inputTokens}.`);
    cached = inputTokens;
  }

  const long = model.longContext !== undefined && inputTokens > model.longContext.threshold;
  const rates = long && model.longContext ? model.longContext : model;
  let cachedRate = rates.cachedInput;
  if (cachedRate === undefined) {
    if (cached > 0) warnings.push(`${model.id} has no cache discount; cached tokens are priced as normal input.`);
    cachedRate = rates.input;
  }
  if (model.contextWindow !== undefined && inputTokens > model.contextWindow) {
    warnings.push(
      `Input (${inputTokens} tokens) is larger than ${model.id}'s ${model.contextWindow}-token context window.`,
    );
  }

  const inputCost = usd((inputTokens - cached) * rates.input);
  const cachedInputCost = usd(cached * cachedRate);
  const outputCost = usd(outputTokens * rates.output);
  return {
    model: model.id,
    provider: model.provider,
    inputTokens,
    cachedInputTokens: cached,
    outputTokens,
    inputCost,
    cachedInputCost,
    outputCost,
    totalCost: roundUsd(inputCost + cachedInputCost + outputCost),
    currency: "USD",
    approximate,
    longContext: long,
    warnings,
  };
}

/** Converts tokens × (USD per 1M tokens) to dollars. */
function usd(tokensTimesRate: number): number {
  return roundUsd(tokensTimesRate / 1e6);
}

/** Drops floating-point noise (0.030029999999999998 → 0.03003) while keeping tiny amounts exact. */
function roundUsd(amount: number): number {
  return Math.round(amount * 1e12) / 1e12;
}

function providerModels(providers: readonly string[]): string[] {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new LlmTallyError(
      "INVALID_OPTION",
      'compareCosts(): "providers" must be a non-empty array, e.g. ["anthropic"].',
    );
  }
  const known = [...new Set(listModels().map((m) => m.provider))];
  return providers.flatMap((p) => {
    const models = listModels(p);
    if (models.length === 0) {
      throw new LlmTallyError("INVALID_OPTION", `Unknown provider "${p}". Known providers: ${known.join(", ")}.`);
    }
    return models.map((m) => m.id);
  });
}

function messageText(message: ChatMessage, index: number): string {
  if (message === null || typeof message !== "object") {
    throw new LlmTallyError(
      "INVALID_INPUT",
      `Message ${index} must be an object like { role: "user", content: "Hi" }, but got ${describe(message)}.`,
    );
  }
  const { content } = message;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part !== null && typeof part === "object" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  throw new LlmTallyError(
    "INVALID_INPUT",
    `Message ${index} has no text content. Give it content: "some text" or content: [{ type: "text", text: "..." }].`,
  );
}

function invalidInput(input: unknown): LlmTallyError {
  return new LlmTallyError(
    "INVALID_INPUT",
    `Input must be a string or an array of chat messages, but got ${describe(input)}. Example: countTokens("Hello") or countTokens([{ role: "user", content: "Hello" }]).`,
  );
}
