/**
 * Built-in model catalog: prices in USD per 1 million tokens.
 *
 * Sources (checked 2026-10-17):
 * - OpenAI:     https://developers.openai.com/api/docs/pricing (Standard tier)
 * - Anthropic:  Claude API pricing docs (first-party API rates)
 * - Google:     https://ai.google.dev/gemini-api/docs/pricing (paid tier, Standard)
 * - xAI:        https://docs.x.ai/docs/models
 * - DeepSeek:   https://api-docs.deepseek.com/quick_start/pricing (peak-hour rates; off-peak is half)
 * - Mistral:    https://docs.mistral.ai/inference/pricing
 * - Alibaba:    https://www.alibabacloud.com/help/en/model-studio/model-pricing (International / Singapore)
 * - Moonshot:   https://platform.kimi.ai/docs/pricing/chat
 * - Z.ai:       https://docs.z.ai/guides/overview/pricing
 * - MiniMax:    https://platform.minimax.io/docs/guides/pricing (Standard tier)
 * - Perplexity: https://docs.perplexity.ai/getting-started/pricing (low search-context request fee)
 * - Cohere:     https://cohere.com/pricing
 * - Amazon:     Amazon Bedrock on-demand pricing (Nova)
 * - AI21:       https://www.ai21.com/pricing/
 */

/** Provider that serves a model. Custom models may use any string. */
export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "deepseek"
  | "mistral"
  | "alibaba"
  | "moonshot"
  | "zai"
  | "minimax"
  | "perplexity"
  | "cohere"
  | "amazon"
  | "ai21"
  | (string & {});

/**
 * Tokenizer family used to estimate token counts.
 *
 * - `openai-o200k`: GPT-4o and newer, o-series, GPT-5/6 (the baseline).
 * - `openai-cl100k`: GPT-4, GPT-4 Turbo, GPT-3.5.
 * - `anthropic`: Claude Opus 4.7 and newer (uses noticeably more tokens).
 * - `anthropic-legacy`: Claude 4.6 and older, Haiku 4.5.
 * - `google`: Gemini.
 * - `xai`, `deepseek`, `mistral`: those providers' own tokenizers (rougher estimates).
 * - `generic`: everything else (rough estimate).
 */
export type TokenizerFamily =
  | "openai-o200k"
  | "openai-cl100k"
  | "anthropic"
  | "anthropic-legacy"
  | "google"
  | "xai"
  | "deepseek"
  | "mistral"
  | "generic";

/**
 * How hard a reasoning model thinks before answering.
 * Each level adds an estimated number of thinking tokens, billed as output (see {@link EFFORT_REASONING_TOKENS}).
 */
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "max";

/**
 * Typical thinking tokens per request at each effort level. Real usage varies a lot with the task;
 * pass `reasoningTokens` instead when you know your numbers.
 */
export const EFFORT_REASONING_TOKENS: Readonly<Record<ReasoningEffort, number>> = {
  none: 0,
  low: 1_000,
  medium: 4_000,
  high: 12_000,
  max: 32_000,
};

/** Higher prices that apply when a request's input is larger than `threshold` tokens. */
export interface LongContextPricing {
  /** Input size (in tokens) above which the whole request uses these prices. */
  threshold: number;
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens, if the provider lists one. */
  cachedInput?: number;
}

/** Pricing and metadata for one model. */
export interface ModelInfo {
  /** Model ID exactly as you pass it to the provider's API, e.g. `"gpt-5.5"`. */
  id: string;
  /** Who serves the model, e.g. `"openai"`. */
  provider: Provider;
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens (includes reasoning/thinking tokens). */
  output: number;
  /** USD per 1M input tokens read from the prompt cache. Omitted when the provider lists no cache price. */
  cachedInput?: number;
  /** Long-context surcharge tier, if any. */
  longContext?: LongContextPricing;
  /** Fixed USD fee per request on top of tokens (for example Perplexity's search fee). */
  requestFee?: number;
  /** `false` for models that never think, so reasoning effort adds nothing. Defaults to `true`. */
  reasoning?: boolean;
  /** Maximum input tokens, when known. Used only to add a warning. */
  contextWindow?: number;
  /** Which tokenizer to imitate when estimating tokens. Defaults to `openai-o200k`. */
  tokenizer?: TokenizerFamily;
  /** Other names that resolve to this model, e.g. `["sonnet"]` or a dated API ID. */
  aliases?: readonly string[];
}

/** Date the built-in prices were last checked against the providers' pricing pages. */
export const PRICES_AS_OF = "2026-10-17";

type Extra = Partial<ModelInfo>;

/** Builds a model entry: `m(provider, tokenizer)(id, input, cachedInput, output, extra)`. */
const m =
  (provider: Provider, tokenizer: TokenizerFamily, defaults: Extra = {}) =>
  (id: string, input: number, cachedInput: number | undefined, output: number, extra: Extra = {}): ModelInfo => ({
    id,
    provider,
    input,
    output,
    ...(cachedInput === undefined ? {} : { cachedInput }),
    tokenizer,
    ...defaults,
    ...extra,
  });

const NO_THINKING: Extra = { reasoning: false };

/** A price tier for prompts above `threshold` input tokens. */
const above = (threshold: number, input: number, output: number, cachedInput?: number): Extra => ({
  longContext: { threshold, input, output, ...(cachedInput === undefined ? {} : { cachedInput }) },
});

const openai = m("openai", "openai-o200k");
const openaiLegacy = m("openai", "openai-cl100k", NO_THINKING);
const anthropic = m("anthropic", "anthropic", { contextWindow: 1_000_000 });
const anthropicLegacy = m("anthropic", "anthropic-legacy", { contextWindow: 200_000 });
const google = m("google", "google");
const xai = m("xai", "xai");
const deepseek = m("deepseek", "deepseek", { contextWindow: 1_000_000 });
const mistral = m("mistral", "mistral");
const alibaba = m("alibaba", "generic");
const moonshot = m("moonshot", "generic");
const zai = m("zai", "generic");
const minimax = m("minimax", "generic");
const perplexity = m("perplexity", "generic");
const cohere = m("cohere", "generic", NO_THINKING);
const amazon = m("amazon", "generic", NO_THINKING);
const ai21 = m("ai21", "generic", NO_THINKING);

/** OpenAI charges more for the whole request once the prompt is over 272k tokens. */
const openaiLong = (input: number, output: number, cachedInput?: number) => above(272_000, input, output, cachedInput);
/** xAI doubles every price once the prompt reaches 200k tokens. */
const xaiLong = (input: number, cachedInput: number, output: number) =>
  above(199_999, input * 2, output * 2, cachedInput * 2);

/** Every model llm-tally knows about out of the box. */
export const BUILTIN_MODELS: readonly ModelInfo[] = [
  // OpenAI
  openai("gpt-6-astra", 10, 1, 50, openaiLong(20, 75, 2)),
  openai("gpt-6.1-sol", 2, 0.1, 10, openaiLong(4, 15, 0.2)),
  openai("gpt-6-sol", 2, 0.2, 10, openaiLong(4, 15, 0.4)),
  openai("gpt-6-luna", 0.1, 0.01, 0.5, openaiLong(0.2, 0.75, 0.02)),
  openai("gpt-5.6-sol", 4, 0.4, 20, openaiLong(8, 30, 0.8)),
  openai("gpt-5.6-terra", 2, 0.2, 12, openaiLong(4, 18, 0.4)),
  openai("gpt-5.6-luna", 0.2, 0.02, 1.2, openaiLong(0.4, 1.8, 0.04)),
  openai("gpt-5.5", 5, 0.5, 30, openaiLong(10, 45, 1)),
  openai("gpt-5.5-pro", 30, undefined, 180, openaiLong(60, 270)),
  openai("gpt-5.4", 2.5, 0.25, 15, openaiLong(5, 22.5, 0.5)),
  openai("gpt-5.4-mini", 0.75, 0.075, 4.5),
  openai("gpt-5.4-nano", 0.2, 0.02, 1.25),
  openai("gpt-5.4-pro", 30, undefined, 180, openaiLong(60, 270)),
  openai("gpt-5.3-codex", 1.75, 0.175, 14),
  openai("gpt-5.2", 1.75, 0.175, 14),
  openai("gpt-5.2-pro", 21, undefined, 168),
  openai("gpt-5.1", 1.25, 0.125, 10),
  openai("gpt-5", 1.25, 0.125, 10),
  openai("gpt-5-mini", 0.25, 0.025, 2),
  openai("gpt-5-nano", 0.05, 0.005, 0.4),
  openai("gpt-5-pro", 15, undefined, 120),
  openai("gpt-5-search-api", 1.25, 0.125, 10),
  openai("chat-latest", 5, 0.5, 30),
  openai("gpt-4.1", 2, 0.5, 8, NO_THINKING),
  openai("gpt-4.1-mini", 0.4, 0.1, 1.6, NO_THINKING),
  openai("gpt-4.1-nano", 0.1, 0.025, 0.4, NO_THINKING),
  openai("gpt-4o", 2.5, 1.25, 10, NO_THINKING),
  openai("gpt-4o-2024-05-13", 5, undefined, 15, NO_THINKING),
  openai("gpt-4o-mini", 0.15, 0.075, 0.6, NO_THINKING),
  openai("o3-pro", 20, undefined, 80),
  openai("o3", 2, 0.5, 8),
  openai("o4-mini", 1.1, 0.275, 4.4),
  openai("o3-mini", 1.1, 0.55, 4.4),
  openai("o1", 15, 7.5, 60),
  openai("o1-pro", 150, undefined, 600),
  openaiLegacy("gpt-4-turbo", 10, undefined, 30),
  openaiLegacy("gpt-4", 30, undefined, 60, { aliases: ["gpt-4-0613"] }),
  openaiLegacy("gpt-3.5-turbo", 0.5, undefined, 1.5),
  openaiLegacy("gpt-3.5-turbo-instruct", 1.5, undefined, 2),
  openaiLegacy("davinci-002", 2, undefined, 2),
  openaiLegacy("babbage-002", 0.4, undefined, 0.4),

  // Anthropic
  anthropic("claude-fable-5-1", 10, 0.25, 50, { aliases: ["fable", "claude-fable"] }),
  anthropic("claude-fable-5", 10, 1, 50),
  anthropic("claude-opus-5-5", 4, 0.2, 20, { aliases: ["opus", "claude-opus"] }),
  anthropic("claude-opus-5", 5, 0.5, 25),
  anthropic("claude-opus-4-8", 5, 0.5, 25),
  anthropic("claude-opus-4-7", 5, 0.5, 25),
  anthropic("claude-opus-4-6", 5, 0.5, 25, { tokenizer: "anthropic-legacy" }),
  anthropic("claude-sonnet-5-5", 2, 0.2, 10, { aliases: ["sonnet", "claude-sonnet"] }),
  anthropic("claude-sonnet-5", 2, 0.2, 10),
  anthropic("claude-sonnet-4-6", 3, 0.3, 15, { tokenizer: "anthropic-legacy" }),
  anthropic("claude-haiku-5-5", 0.1, 0.01, 0.5, {
    aliases: ["haiku", "claude-haiku"],
    ...above(100_000, 0.5, 2.5, 0.05),
  }),
  anthropicLegacy("claude-haiku-4-5", 1, 0.1, 5),
  anthropicLegacy("claude-opus-4-5", 5, 0.5, 25),
  anthropicLegacy("claude-sonnet-4-5", 3, 0.3, 15),
  anthropicLegacy("claude-sonnet-4-0", 3, 0.3, 15, { aliases: ["claude-sonnet-4"] }),
  anthropicLegacy("claude-opus-4-0", 15, 1.5, 75, { aliases: ["claude-opus-4"] }),

  // Google
  google("gemini-4-argon", 2, 0.1, 10),
  google("gemini-3.8-flash", 0.75, 0.075, 3.75, { aliases: ["gemini-flash"] }),
  google("gemini-3.6-flash", 0.75, 0.075, 3.75),
  google("gemini-3.5-flash-lite", 0.3, 0.03, 2.5, { aliases: ["gemini-flash-lite"] }),
  google("gemini-3.1-pro-preview", 2, 0.2, 12, {
    aliases: ["gemini-pro", "gemini-3.1-pro"],
    ...above(200_000, 4, 18, 0.4),
  }),
  google("gemini-3.1-flash-lite", 0.25, 0.025, 1.5),
  google("gemini-3-flash-preview", 0.5, 0.05, 3),
  google("gemini-2.5-pro", 1.25, 0.125, 10, above(200_000, 2.5, 15, 0.25)),
  google("gemini-2.5-flash", 0.3, 0.03, 2.5),
  google("gemini-2.5-flash-lite", 0.1, 0.01, 0.4),

  // xAI
  xai("grok-4.7", 2, 0.5, 6, { contextWindow: 500_000, aliases: ["grok"], ...xaiLong(2, 0.5, 6) }),
  xai("grok-4.6", 2, 0.5, 6, { contextWindow: 500_000, ...xaiLong(2, 0.5, 6) }),
  xai("grok-4.5", 2, 0.3, 6, { contextWindow: 500_000, ...xaiLong(2, 0.3, 6) }),
  xai("grok-4.3", 1.25, 0.2, 2.5, { contextWindow: 1_000_000, ...xaiLong(1.25, 0.2, 2.5) }),
  xai("grok-4.20-0309-reasoning", 1.25, 0.2, 2.5, { contextWindow: 1_000_000, ...xaiLong(1.25, 0.2, 2.5) }),
  xai("grok-4.20-0309-non-reasoning", 1.25, 0.2, 2.5, {
    contextWindow: 1_000_000,
    reasoning: false,
    ...xaiLong(1.25, 0.2, 2.5),
  }),
  xai("grok-4.20-multi-agent-0309", 1.25, 0.2, 2.5, { contextWindow: 1_000_000, ...xaiLong(1.25, 0.2, 2.5) }),
  xai("grok-build-0.1", 1, 0.2, 2, { contextWindow: 256_000, ...xaiLong(1, 0.2, 2) }),

  // DeepSeek (peak-hour list prices; off-peak hours cost half)
  deepseek("deepseek-v4-pro", 1.32, 0.044, 3.96, { aliases: ["deepseek-pro"] }),
  deepseek("deepseek-flash", 0.3, 0.006, 1.2, { aliases: ["deepseek-v4-flash"] }),

  // Mistral ("-latest" IDs such as mistral-large-latest resolve to these)
  mistral("mistral-large", 0.68, 0.07, 2.09, { contextWindow: 1_000_000, aliases: ["mistral-large-4"] }),
  mistral("mistral-large-2512", 0.5, 0.05, 1.5, { aliases: ["mistral-large-3"], reasoning: false }),
  mistral("mistral-medium", 1.5, 0.15, 7.5, { aliases: ["mistral-medium-2604", "mistral-medium-3.5"] }),
  mistral("mistral-small", 0.15, 0.015, 0.6, {
    contextWindow: 256_000,
    aliases: ["mistral-small-2603", "mistral-small-4"],
  }),
  mistral("ministral-14b", 0.2, 0.02, 0.2, { aliases: ["ministral-14b-2512", "ministral-3-14b"], reasoning: false }),
  mistral("ministral-8b", 0.15, 0.015, 0.15, { aliases: ["ministral-8b-2512", "ministral-3-8b"], reasoning: false }),
  mistral("ministral-3b", 0.1, 0.01, 0.1, { aliases: ["ministral-3b-2512", "ministral-3-3b"], reasoning: false }),
  mistral("codestral", 0.3, 0.03, 0.9, { aliases: ["codestral-2508"], reasoning: false }),

  // Alibaba Qwen (International region; cache prices not listed)
  alibaba("qwen3.8-max", 2, undefined, 6, { aliases: ["qwen3.8-max-0902"] }),
  alibaba("qwen3.7-max", 2.5, undefined, 7.5),
  alibaba("qwen-max", 1.6, undefined, 6.4, NO_THINKING),
  alibaba("qwen3.7-plus", 0.4, undefined, 1.6, above(256_000, 1.2, 4.8)),
  alibaba("qwen3.6-plus", 0.5, undefined, 3, above(256_000, 2, 6)),
  alibaba("qwen3.5-plus", 0.4, undefined, 2.4, above(256_000, 0.5, 3)),
  alibaba("qwen-plus", 0.4, undefined, 1.2, above(256_000, 1.2, 3.6)),
  alibaba("qwen3.8-flash", 0.15, undefined, 0.47),
  alibaba("qwen3.7-flash", 0.03, undefined, 0.13, above(32_000, 0.1, 0.4)),
  alibaba("qwen3.6-flash", 0.25, undefined, 1.5, above(256_000, 1, 4)),
  alibaba("qwen3.5-flash", 0.1, undefined, 0.4),
  alibaba("qwen-flash", 0.05, undefined, 0.4, above(256_000, 0.25, 2)),
  alibaba("qwen3-coder-flash", 0.3, undefined, 1.5, { ...above(32_000, 0.5, 2.5), reasoning: false }),

  // Moonshot Kimi
  moonshot("kimi-k3", 3, 0.3, 15, { contextWindow: 1_048_576, aliases: ["kimi"] }),
  moonshot("kimi-k2.7-code", 0.95, 0.19, 4, { contextWindow: 262_144 }),
  moonshot("kimi-k2.7-code-highspeed", 1.9, 0.38, 8, { contextWindow: 262_144 }),
  moonshot("kimi-k2.6", 0.95, 0.16, 4, { contextWindow: 262_144 }),

  // Z.ai GLM
  zai("glm-5.3", 1.4, 0.26, 4.4, { aliases: ["glm"] }),
  zai("glm-5.3-flashx", 0.37, 0.075, 1.25),
  zai("glm-5.3-flash", 0.15, 0.03, 0.5),
  zai("glm-5.2", 1.4, 0.26, 4.4),
  zai("glm-5.1", 1.4, 0.26, 4.4),
  zai("glm-5", 1, 0.2, 3.2),
  zai("glm-4.7", 0.6, 0.11, 2.2),
  zai("glm-4.7-flashx", 0.07, 0.01, 0.4),
  zai("glm-4.7-flash", 0, 0, 0),
  zai("glm-4.6", 0.6, 0.11, 2.2),
  zai("glm-4.5", 0.6, 0.11, 2.2),
  zai("glm-4.5-x", 2.2, 0.45, 8.9),
  zai("glm-4.5-air", 0.2, 0.03, 1.1),
  zai("glm-4.5-airx", 1.1, 0.22, 4.5),
  zai("glm-4.5-flash", 0, 0, 0),
  zai("glm-4-32b-0414-128k", 0.1, undefined, 0.1, NO_THINKING),

  // MiniMax (Standard tier)
  minimax("MiniMax-M3", 0.3, 0.06, 1.2, { aliases: ["minimax"], ...above(512_000, 0.6, 2.4, 0.12) }),
  minimax("MiniMax-M2.7", 0.3, 0.06, 1.2),
  minimax("MiniMax-M2.7-highspeed", 0.6, 0.06, 2.4),
  minimax("MiniMax-M2.5", 0.3, 0.03, 1.2),
  minimax("MiniMax-M2.1", 0.3, 0.03, 1.2),
  minimax("MiniMax-M2", 0.3, 0.03, 1.2),

  // Perplexity (search fee per request at low search context)
  perplexity("sonar", 1, undefined, 1, { requestFee: 0.005, reasoning: false }),
  perplexity("sonar-pro", 3, undefined, 15, { requestFee: 0.006, reasoning: false }),
  perplexity("sonar-reasoning-pro", 2, undefined, 8, { requestFee: 0.006 }),

  // Cohere
  cohere("command-a-03-2025", 2.5, undefined, 10, { contextWindow: 256_000, aliases: ["command-a"] }),
  cohere("command-r-plus-08-2024", 2.5, undefined, 10, { contextWindow: 128_000, aliases: ["command-r-plus"] }),
  cohere("command-r-08-2024", 0.15, undefined, 0.6, { contextWindow: 128_000, aliases: ["command-r"] }),
  cohere("command-r7b-12-2024", 0.0375, undefined, 0.15, { contextWindow: 128_000, aliases: ["command-r7b"] }),

  // Amazon Nova (Bedrock IDs such as amazon.nova-pro-v1:0 resolve to these)
  amazon("nova-2-lite", 0.3, undefined, 2.5, { reasoning: true }),
  amazon("nova-premier", 2.5, undefined, 12.5),
  amazon("nova-pro", 0.8, undefined, 3.2),
  amazon("nova-lite", 0.06, undefined, 0.24),
  amazon("nova-micro", 0.035, undefined, 0.14),

  // AI21
  ai21("jamba-large", 2, undefined, 8),
  ai21("jamba-mini", 0.2, undefined, 0.4),
];

/** Models compared by default when you don't name any (CLI and `compareCosts`). */
export const DEFAULT_COMPARE_MODELS: readonly string[] = [
  "gpt-6.1-sol",
  "gpt-6-luna",
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "gemini-4-argon",
  "gemini-3.8-flash",
  "grok-4.7",
  "deepseek-v4-pro",
  "deepseek-flash",
  "mistral-large",
  "mistral-small",
  "qwen3.8-max",
  "qwen3.8-flash",
  "kimi-k3",
  "glm-5.3",
  "MiniMax-M3",
];
