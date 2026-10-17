/**
 * Built-in model catalog: prices in USD per 1 million tokens.
 *
 * Sources (checked 2026-10-17):
 * - OpenAI:    https://developers.openai.com/api/docs/pricing (Standard tier)
 * - Anthropic: Claude API pricing docs (first-party API rates)
 * - Google:    https://ai.google.dev/gemini-api/docs/pricing (paid tier, Standard)
 */

/** Provider that serves a model. Custom models may use any string. */
export type Provider = "openai" | "anthropic" | "google" | (string & {});

/**
 * Tokenizer family used to estimate token counts.
 *
 * - `openai-o200k`: GPT-4o and newer, o-series, GPT-5/6 (the baseline).
 * - `openai-cl100k`: GPT-4, GPT-4 Turbo, GPT-3.5.
 * - `anthropic`: Claude Opus 4.7 and newer (uses noticeably more tokens).
 * - `anthropic-legacy`: Claude 4.6 and older, Haiku 4.5.
 * - `google`: Gemini.
 */
export type TokenizerFamily = "openai-o200k" | "openai-cl100k" | "anthropic" | "anthropic-legacy" | "google";

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
  /** Maximum input tokens, when known. Used only to add a warning. */
  contextWindow?: number;
  /** Which tokenizer to imitate when estimating tokens. Defaults to `openai-o200k`. */
  tokenizer?: TokenizerFamily;
}

/** Date the built-in prices were last checked against the providers' pricing pages. */
export const PRICES_AS_OF = "2026-10-17";

const openaiLong = (input: number, output: number, cachedInput?: number): LongContextPricing => ({
  threshold: 272_000,
  input,
  output,
  ...(cachedInput === undefined ? {} : { cachedInput }),
});

const openai = (
  id: string,
  input: number,
  cachedInput: number | undefined,
  output: number,
  extra: Partial<ModelInfo> = {},
): ModelInfo => ({
  id,
  provider: "openai",
  input,
  output,
  ...(cachedInput === undefined ? {} : { cachedInput }),
  tokenizer: "openai-o200k",
  ...extra,
});

const anthropic = (
  id: string,
  input: number,
  cachedInput: number,
  output: number,
  extra: Partial<ModelInfo> = {},
): ModelInfo => ({
  id,
  provider: "anthropic",
  input,
  output,
  cachedInput,
  contextWindow: 1_000_000,
  tokenizer: "anthropic",
  ...extra,
});

const google = (
  id: string,
  input: number,
  cachedInput: number,
  output: number,
  extra: Partial<ModelInfo> = {},
): ModelInfo => ({
  id,
  provider: "google",
  input,
  output,
  cachedInput,
  tokenizer: "google",
  ...extra,
});

/** Every model llm-tally knows about out of the box. */
export const BUILTIN_MODELS: readonly ModelInfo[] = [
  // OpenAI
  openai("gpt-6-astra", 10, 1, 50, { longContext: openaiLong(20, 75, 2) }),
  openai("gpt-6.1-sol", 2, 0.1, 10, { longContext: openaiLong(4, 15, 0.2) }),
  openai("gpt-6-sol", 2, 0.2, 10, { longContext: openaiLong(4, 15, 0.4) }),
  openai("gpt-6-luna", 0.1, 0.01, 0.5, { longContext: openaiLong(0.2, 0.75, 0.02) }),
  openai("gpt-5.6-sol", 4, 0.4, 20, { longContext: openaiLong(8, 30, 0.8) }),
  openai("gpt-5.6-terra", 2, 0.2, 12, { longContext: openaiLong(4, 18, 0.4) }),
  openai("gpt-5.6-luna", 0.2, 0.02, 1.2, { longContext: openaiLong(0.4, 1.8, 0.04) }),
  openai("gpt-5.5", 5, 0.5, 30, { longContext: openaiLong(10, 45, 1) }),
  openai("gpt-5.5-pro", 30, undefined, 180, { longContext: openaiLong(60, 270) }),
  openai("gpt-5.4", 2.5, 0.25, 15, { longContext: openaiLong(5, 22.5, 0.5) }),
  openai("gpt-5.4-mini", 0.75, 0.075, 4.5),
  openai("gpt-5.4-nano", 0.2, 0.02, 1.25),
  openai("gpt-5.4-pro", 30, undefined, 180, { longContext: openaiLong(60, 270) }),
  openai("gpt-5.3-codex", 1.75, 0.175, 14),
  openai("gpt-5.2", 1.75, 0.175, 14),
  openai("gpt-5.2-pro", 21, undefined, 168),
  openai("gpt-5.1", 1.25, 0.125, 10),
  openai("gpt-5", 1.25, 0.125, 10),
  openai("gpt-5-mini", 0.25, 0.025, 2),
  openai("gpt-5-nano", 0.05, 0.005, 0.4),
  openai("gpt-5-pro", 15, undefined, 120),
  openai("gpt-4.1", 2, 0.5, 8),
  openai("gpt-4.1-mini", 0.4, 0.1, 1.6),
  openai("gpt-4.1-nano", 0.1, 0.025, 0.4),
  openai("gpt-4o", 2.5, 1.25, 10),
  openai("gpt-4o-mini", 0.15, 0.075, 0.6),
  openai("o3-pro", 20, undefined, 80),
  openai("o3", 2, 0.5, 8),
  openai("o4-mini", 1.1, 0.275, 4.4),
  openai("o3-mini", 1.1, 0.55, 4.4),
  openai("o1", 15, 7.5, 60),
  openai("o1-pro", 150, undefined, 600),
  openai("gpt-4-turbo", 10, undefined, 30, { tokenizer: "openai-cl100k" }),
  openai("gpt-3.5-turbo", 0.5, undefined, 1.5, { tokenizer: "openai-cl100k" }),

  // Anthropic
  anthropic("claude-fable-5-1", 10, 0.25, 50),
  anthropic("claude-fable-5", 10, 1, 50),
  anthropic("claude-opus-5-5", 4, 0.2, 20),
  anthropic("claude-opus-5", 5, 0.5, 25),
  anthropic("claude-opus-4-8", 5, 0.5, 25),
  anthropic("claude-opus-4-7", 5, 0.5, 25),
  anthropic("claude-opus-4-6", 5, 0.5, 25, { tokenizer: "anthropic-legacy" }),
  anthropic("claude-sonnet-5-5", 2, 0.2, 10),
  anthropic("claude-sonnet-5", 2, 0.2, 10),
  anthropic("claude-sonnet-4-6", 3, 0.3, 15, { tokenizer: "anthropic-legacy" }),
  anthropic("claude-haiku-5-5", 0.1, 0.01, 0.5, {
    longContext: { threshold: 100_000, input: 0.5, output: 2.5, cachedInput: 0.05 },
  }),
  anthropic("claude-haiku-4-5", 1, 0.1, 5, { contextWindow: 200_000, tokenizer: "anthropic-legacy" }),

  // Google
  google("gemini-4-argon", 2, 0.1, 10),
  google("gemini-3.8-flash", 0.75, 0.075, 3.75),
  google("gemini-3.6-flash", 0.75, 0.075, 3.75),
  google("gemini-3.5-flash-lite", 0.3, 0.03, 2.5),
  google("gemini-3.1-pro-preview", 2, 0.2, 12, {
    longContext: { threshold: 200_000, input: 4, output: 18, cachedInput: 0.4 },
  }),
  google("gemini-3.1-flash-lite", 0.25, 0.025, 1.5),
  google("gemini-3-flash-preview", 0.5, 0.05, 3),
  google("gemini-2.5-pro", 1.25, 0.125, 10, {
    longContext: { threshold: 200_000, input: 2.5, output: 15, cachedInput: 0.25 },
  }),
  google("gemini-2.5-flash", 0.3, 0.03, 2.5),
  google("gemini-2.5-flash-lite", 0.1, 0.01, 0.4),
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
];
