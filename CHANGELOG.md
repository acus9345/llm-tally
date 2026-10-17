# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-17

### Added

- Prices for 138 models from 14 providers: OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Alibaba Qwen, Moonshot Kimi, Z.ai GLM, MiniMax, Perplexity, Cohere, Amazon Nova and AI21, with cache, long-prompt and per-request prices (as of 2026-10-17).
- Reasoning effort (`none`, `low`, `medium`, `high`, `max`) in the library (`effort`, `reasoningTokens`), the CLI (`--effort`) and the web calculator; models that don't reason are not charged thinking tokens.
- `estimateCost`, `compareCosts`, `costFromUsage` and `countTokens`, with one-line shorthands such as `estimateCost(text, "sonnet")`.
- Short model names (`opus`, `sonnet`, `grok`, `kimi`, `glm`, ...) and support for router, cloud and dated IDs (`x-ai/grok-4.7`, `amazon.nova-pro-v1:0`, `mistral-large-latest`).
- `llm-tally` CLI with `--model`, `--provider`, `--all`, `--effort`, `--output-tokens`, `--requests`, `--cached`, `--file`, `--json` and a searchable `--list`.
- A web calculator: `npx llm-tally ui` opens a self-contained page that works offline, also hosted at https://acus9345.github.io/llm-tally/.
- `LlmTallyError` with error codes and fix-it messages.
- Works in Node.js 22+, Bun, Deno and browsers; CI covers Windows, macOS and Linux.

[0.1.0]: https://github.com/acus9345/llm-tally/releases/tag/v0.1.0
