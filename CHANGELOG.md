# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-17

### Added

- `estimateCost`, `compareCosts` and `costFromUsage` to price requests across OpenAI, Anthropic, Google, xAI, DeepSeek and Mistral models.
- One-line shorthands: `estimateCost(text, "sonnet")`, `countTokens(text, "grok")`, `compareCosts(text, ["gpt-5.5", "sonnet"])`, and `compareCosts(text, { providers: ["anthropic"] })`.
- Short model names (`opus`, `sonnet`, `haiku`, `fable`, `grok`, `gemini-pro`, `gemini-flash`, ...) and support for provider-prefixed and `-latest` IDs used by OpenRouter, LiteLLM, Vertex AI and Bedrock.
- `countTokens`, a zero-dependency token estimator tuned against OpenAI's o200k tokenizer, with per-provider scaling.
- A catalog of 74 models with input, cached-input, output and long-context prices (as of 2026-10-17), plus `getModel`, `findModel`, `listModels` and `registerModel` (with `aliases`).
- `llm-tally` CLI with `--model`, `--provider`, `--all`, `--requests`, `--file`, `--output-tokens`, `--cached`, `--json` and a searchable `--list`; reads piped stdin and UTF-16 files, and names the cheapest model.
- A web calculator: `npx llm-tally ui` opens a self-contained page that works offline, also hosted at https://acus9345.github.io/llm-tally/.
- `LlmTallyError` with error codes and fix-it messages.
- Works in Node.js 22+, Bun, Deno and browsers; CI covers Windows, macOS and Linux.

[0.1.0]: https://github.com/acus9345/llm-tally/releases/tag/v0.1.0
