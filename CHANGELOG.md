# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-17

### Added

- `estimateCost`, `compareCosts` and `costFromUsage` to price requests across OpenAI, Anthropic and Google models.
- `countTokens`, a zero-dependency token estimator tuned against OpenAI's o200k tokenizer, with per-provider scaling.
- A catalog of 56 models with input, cached-input, output and long-context prices (as of 2026-10-17), plus `getModel`, `findModel`, `listModels` and `registerModel`.
- `llm-tally` CLI with `--model`, `--file`, `--output-tokens`, `--cached`, `--json` and `--list`; reads piped stdin and UTF-16 files.
- `LlmTallyError` with error codes and fix-it messages.

[0.1.0]: https://github.com/acus9345/llm-tally/releases/tag/v0.1.0
