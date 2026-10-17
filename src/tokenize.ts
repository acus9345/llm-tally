import type { TokenizerFamily } from "./models.js";

/**
 * How many tokens each family uses for the same text, relative to OpenAI's o200k tokenizer.
 * Rough averages over English prose, code and JSON.
 */
const FAMILY_FACTOR: Record<TokenizerFamily, number> = {
  "openai-o200k": 1,
  "openai-cl100k": 1.05,
  anthropic: 1.3,
  "anthropic-legacy": 1.1,
  google: 1,
  // Not measured against the real tokenizers yet; treat as rough.
  xai: 1,
  deepseek: 1.05,
  mistral: 1.1,
  generic: 1.05,
};

// One alternative per kind of text piece; the capture group that matches tells us which kind it is.
const PIECE =
  /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])|(\p{Script=Hangul}+)|([A-Za-z]+)|([\p{L}\p{M}]+)|(\p{N}+)|(\s+)|([^\s\p{L}\p{N}]+)/gu;
const CAMEL_BOUNDARY = /(?<=[a-z])(?=[A-Z])/;

/**
 * Estimates o200k tokens for plain text without loading a vocabulary.
 * Each kind of piece (word, number, whitespace, punctuation, CJK) gets its own rule,
 * tuned against the real tokenizer on prose, code, JSON and non-English text.
 */
function baseTokens(text: string): number {
  let tokens = 0;
  for (const m of text.matchAll(PIECE)) {
    if (m[1] !== undefined) {
      tokens += 0.75; // Chinese / Japanese character
    } else if (m[2] !== undefined) {
      tokens += m[2].length * 0.75; // Korean syllables
    } else if (m[3] !== undefined) {
      // ASCII word: common words up to ~9 letters are one token; camelCase parts count separately.
      for (const part of m[3].split(CAMEL_BOUNDARY)) {
        tokens += part.length <= 9 ? 1 : 1 + (part.length - 9) / 4;
      }
    } else if (m[4] !== undefined) {
      const n = m[4].length; // accented or non-Latin word
      tokens += n <= 6 ? 1 : 1 + (n - 6) / 4;
    } else if (m[5] !== undefined) {
      tokens += Math.ceil(m[5].length / 3); // digits are split into groups of up to 3
    } else if (m[6] !== undefined) {
      const ws = m[6];
      // A single space merges into the next word; newlines and longer runs (indentation) cost a token.
      if (ws.length > 1 || ws !== " ") tokens += newlineGroups(ws);
    } else if (m[7] !== undefined) {
      tokens += Math.ceil(m[7].length / 2); // punctuation and symbols
    }
  }
  return tokens;
}

function newlineGroups(ws: string): number {
  // "\n", "\n\n" and "\n    " are each a single token; longer blank-line runs add up.
  return Math.max(1, Math.ceil((ws.split("\n").length - 1) / 2));
}

/** Estimates how many tokens `text` uses for the given tokenizer family. Returns 0 for "". */
export function estimateTextTokens(text: string, family: TokenizerFamily = "openai-o200k"): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.round(baseTokens(text) * FAMILY_FACTOR[family]));
}
