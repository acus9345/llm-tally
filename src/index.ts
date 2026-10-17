/**
 * llm-tally: estimate tokens and API cost across OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Qwen,
 * Kimi, GLM, MiniMax, Perplexity, Cohere, Amazon Nova and AI21 models.
 *
 * @example
 * import { estimateCost, formatUsd } from "llm-tally";
 * const cost = estimateCost("Write a haiku about autumn.", { model: "gpt-5.5", outputTokens: 50 });
 * console.log(formatUsd(cost.totalCost));
 *
 * @packageDocumentation
 */

export { findModel, getModel, listModels, registerModel } from "./catalog.js";
export { LlmTallyError, type LlmTallyErrorCode } from "./errors.js";
export {
  type ChatMessage,
  type CompareOptions,
  type ContentPart,
  type CostEstimate,
  type CountOptions,
  compareCosts,
  costFromUsage,
  countTokens,
  type EstimateOptions,
  estimateCost,
  formatUsd,
  type ReplyOptions,
  type TallyInput,
  type Usage,
} from "./estimate.js";
export {
  DEFAULT_COMPARE_MODELS,
  EFFORT_REASONING_TOKENS,
  type LongContextPricing,
  type ModelInfo,
  PRICES_AS_OF,
  type Provider,
  type ReasoningEffort,
  type TokenizerFamily,
} from "./models.js";
