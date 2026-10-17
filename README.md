# llm-tally

Estimate what a prompt costs on 138 LLMs from 14 providers (OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Qwen, Kimi, GLM, MiniMax, Perplexity, Cohere, Amazon Nova and AI21) in your browser, on the command line, or from code.

- **Reasoning-aware.** Pick a reasoning effort (none → max) and thinking tokens are added only to models that actually reason.
- **Easy names.** API IDs (`claude-sonnet-5-5`), short names (`sonnet`, `grok`, `kimi`, `glm`) or router/cloud IDs (`x-ai/grok-4.7`, `amazon.nova-pro-v1:0`).
- **Zero dependencies, typed, offline.** Runs in Node.js, Bun, Deno and browsers.

## Web calculator

Open **https://acus9345.github.io/llm-tally/**: paste a prompt (or drop a text file), pick a reasoning effort and a number of requests, and compare every model, cheapest first. Nothing you type is uploaded.

The same page works offline from the command line:

```sh
npx llm-tally ui
```

## Install

```sh
npm install llm-tally
```

Run it in your project folder (in a brand-new empty folder, run `npm init -y` first). Requires Node.js 22+, Bun or Deno.

## Command line

```sh
npx llm-tally "Summarize the plot of Hamlet in three sentences." -o 300 -e medium
```

```text
MODEL              PROVIDER   INPUT TOKENS  OUTPUT TOKENS  COST (USD)
qwen3.8-flash      alibaba               9          4,300    $0.00202
gpt-6-luna         openai                9          4,300    $0.00215
claude-haiku-5-5   anthropic            12          4,300    $0.00215
...
kimi-k3            moonshot              9          4,300     $0.0645
claude-opus-5-5    anthropic            12          4,300     $0.0860

Cheapest: qwen3.8-flash ($0.00202), 43x cheaper than claude-opus-5-5.
Token counts are estimates (usually within 15%). Prices as of 2026-10-17.
```

`-o 300` is the visible answer; `-e medium` adds about 4,000 thinking tokens to models that reason.

| Option | Meaning |
| --- | --- |
| `-m, --model <id>` | Model(s) to price, by ID or short name. Repeat or comma-separate. |
| `-p, --provider <name>` | Compare every model from a provider. `--all` compares everything. |
| `-e, --effort <level>` | Reasoning effort: `none` (default), `low`, `medium`, `high`, `max`. |
| `-o, --output-tokens <n>` | Length of the visible answer: `500`, `2k`. Default `0`. |
| `-n, --requests <n>` | Also show the total for this many requests: `10k`, `1m`. |
| `-c, --cached <n>` | Input tokens served from the prompt cache. |
| `-f, --file <path>` | Read the prompt from a file (UTF-8 or UTF-16). Text can also be piped in. |
| `-l, --list [filter]` | List models, prices and short names; filter by provider or name. |
| `--json` | Machine-readable output. |
| `ui` | Open the web calculator (`--no-open` prints its path instead). |

```sh
npx llm-tally -f prompt.txt -m sonnet,gpt-5.5 -e high -o 1k
npx llm-tally -f prompt.txt -p anthropic -e medium -n 10k
Get-Content prompt.txt | npx llm-tally -m kimi,glm,qwen3.8-max   # cat on macOS/Linux
npx llm-tally --list qwen
```

Exit codes: `0` success, `1` unknown model, provider or value, `2` bad command-line usage.

## Library

Save as `tally.mjs` and run `node tally.mjs`:

```js
import { compareCosts, estimateCost, formatUsd } from "llm-tally";

const prompt = "Summarize the plot of Hamlet in three sentences.";

// One model, one line:
console.log(formatUsd(estimateCost(prompt, "sonnet").totalCost));

// Several models: a 300-token answer with medium reasoning effort, cheapest first.
const models = ["gpt-5.5", "sonnet", "gemini-flash", "grok", "deepseek-flash", "kimi", "gpt-4.1"];
for (const c of compareCosts(prompt, { models, outputTokens: 300, effort: "medium" })) {
  console.log(c.model.padEnd(18), formatUsd(c.totalCost));
}
```

```text
$0.0000240
gpt-4.1            $0.00242
deepseek-flash     $0.00516
gemini-3.8-flash   $0.0161
grok-4.7           $0.0258
claude-sonnet-5-5  $0.0430
kimi-k3            $0.0645
gpt-5.5            $0.129
```

`gpt-4.1` doesn't reason, so it only pays for the 300-token answer. CommonJS works too: `const { estimateCost } = require("llm-tally");`

### API

All amounts are US dollars. Token counts from `countTokens`, `estimateCost` and `compareCosts` are estimates; `costFromUsage` is exact because it uses your provider's reported counts.

- **`estimateCost(input, model | options)`**: price one request. `input` is a string or chat messages (`{ role, content }`). Options: `model`, `outputTokens` (answer length), `effort` (`"none"`…`"max"`) or `reasoningTokens` (exact), `cachedInputTokens`. Returns `{ model, provider, inputTokens, outputTokens, reasoningTokens, inputCost, cachedInputCost, outputCost, requestCost, totalCost, longContext, warnings, ... }`.
- **`compareCosts(input, models | options)`**: the same for several models, cheapest first. Options add `models` or `providers`.
- **`costFromUsage({ model, inputTokens, outputTokens?, cachedInputTokens? })`**: exact cost from an API response's usage numbers. `inputTokens` is the total input including cached tokens (for Anthropic: `input_tokens + cache_read_input_tokens`).
- **`countTokens(input, model?)`**: estimated tokens, imitating that model's tokenizer.
- **`getModel(id)`**, **`findModel(id)`**, **`listModels(provider?)`**: look up prices and metadata (`reasoning: false` marks models that never think).
- **`registerModel({ id, provider, input, output, cachedInput?, reasoning?, requestFee?, aliases?, ... })`**: add a model or override a price (USD per 1M tokens).
- **`EFFORT_REASONING_TOKENS`**, **`PRICES_AS_OF`**, **`formatUsd(amount)`**.

Mistakes throw an `LlmTallyError` with a `code` (`UNKNOWN_MODEL`, `INVALID_INPUT`, `INVALID_OPTION`) and a message that says how to fix it, e.g. `Unknown model "gpt-55". Did you mean "gpt-5.5", "gpt-5", "gpt-5.4"?`.

## Providers and short names

| Provider | Models | Short names |
| --- | --- | --- |
| OpenAI | 41 (GPT-6, GPT-5.x, GPT-4.x, o-series, legacy) | — use the API ID, e.g. `gpt-5.5` |
| Anthropic | 16 (Claude Fable, Opus, Sonnet, Haiku) | `fable`, `opus`, `sonnet`, `haiku` |
| Google | 10 (Gemini 4, 3.x, 2.5) | `gemini-pro`, `gemini-flash`, `gemini-flash-lite` |
| xAI | 8 (Grok 4.x) | `grok` |
| DeepSeek | 2 (V4 Pro, Flash) | `deepseek-pro` |
| Mistral | 8 (Large, Medium, Small, Ministral, Codestral) | `mistral-large-latest` and other `-latest` IDs |
| Alibaba Qwen | 13 (Qwen 3.x Max, Plus, Flash, Coder) | — |
| Moonshot Kimi | 4 (K3, K2.x) | `kimi` |
| Z.ai GLM | 16 (GLM-5.x, GLM-4.x) | `glm` |
| MiniMax | 6 (M3, M2.x) | `minimax` |
| Perplexity | 3 (Sonar, Sonar Pro, Sonar Reasoning Pro) | — |
| Cohere | 4 (Command A, Command R) | `command-a`, `command-r` |
| Amazon | 5 (Nova 2 Lite, Premier, Pro, Lite, Micro) | Bedrock IDs like `amazon.nova-pro-v1:0` |
| AI21 | 2 (Jamba Large, Mini) | — |

Short names point at the newest model in that line. `npx llm-tally --list` shows everything. IDs with provider prefixes (OpenRouter, LiteLLM, Vertex AI, Bedrock) and date suffixes (`gpt-4o-2024-08-06`, `claude-sonnet-4-5-20250929`) also work.

## How accurate is it?

- **Prices** come from each provider's public pricing page (standard tier, as of `PRICES_AS_OF`), including long-prompt tiers. Not included: batch discounts, cache-write surcharges, image/audio pricing. DeepSeek uses peak-hour rates (off-peak is half), Mistral Large its current sale price, Qwen the International region, Perplexity the low search-context request fee.
- **Thinking tokens** per effort level are typical values (low 1k, medium 4k, high 12k, max 32k); real usage varies a lot by task. Pass `reasoningTokens` when you know yours.
- **Token counts** are tuned against OpenAI's o200k tokenizer: usually within ~10% for English, code and JSON, ~20% for other languages, and rougher for providers other than OpenAI, Anthropic and Google. For exact counts, use your provider's token-counting endpoint and `costFromUsage`.

## Troubleshooting

- **`Unknown model "..."`**: check `npx llm-tally --list <part of the name>`. New models arrive in new versions; until then use `registerModel()`.
- **`No input`**: pass the prompt in quotes, use `--file`, or pipe text in.
- **`$` in PowerShell text**: use single quotes (`'costs $5'`) or `--file`.
- **Non-English text piped in Windows PowerShell 5.1 becomes `?`**: use `--file`, or run `$OutputEncoding = [Text.Encoding]::UTF8` first.
- **`ERR_REQUIRE_ESM` or syntax errors**: upgrade to Node.js 22 or newer.

## License

[MIT](LICENSE)
