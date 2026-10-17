# llm-tally

Estimate tokens and API cost for OpenAI, Anthropic (Claude), Google (Gemini), xAI (Grok), DeepSeek and Mistral models, from code or the command line.

- **Six providers, one price table.** 74 models, with cache and long-context prices.
- **Easy names.** Use API IDs (`claude-sonnet-5-5`), short names (`sonnet`, `grok`, `gemini-flash`) or router IDs (`x-ai/grok-4.7`, `mistral-large-latest`).
- **Zero dependencies.** Small, fast, works offline (no tokenizer vocabularies to download).
- **Runs anywhere.** Node.js, Bun, Deno and browsers; CLI tested on Windows, macOS and Linux.
- **Typed.** Written in TypeScript, ships its own type definitions.
- **Web calculator.** Paste a prompt and compare every model in your browser, no code needed.

## Web calculator

The easiest way to use llm-tally: open **https://acus9345.github.io/llm-tally/**, paste a prompt (or drop a text file), pick the reply length and number of requests, and compare costs across all providers. Everything runs in your browser; nothing is uploaded.

Or open the same page offline from the command line:

```sh
npx llm-tally ui
```

## Install

```sh
npm install llm-tally
```

Run it in your project folder. In a brand-new empty folder, run `npm init -y` first; otherwise npm installs into the nearest parent folder that has a `package.json`.

Requires Node.js 22 or newer (or Bun / Deno). The CLI also works without installing, through `npx`.

## Quick start

### Command line

```sh
npx llm-tally "Summarize the plot of Hamlet in three sentences." -o 200
```

```text
MODEL              PROVIDER   INPUT TOKENS  OUTPUT TOKENS  COST (USD)
gpt-6-luna         openai                9            200   $0.000101
claude-haiku-5-5   anthropic            12            200   $0.000101
mistral-small      mistral              10            200   $0.000121
deepseek-flash     deepseek              9            200   $0.000243
mistral-large      mistral              10            200   $0.000425
gemini-3.8-flash   google                9            200   $0.000757
deepseek-v4-pro    deepseek              9            200   $0.000804
grok-4.7           xai                   9            200    $0.00122
gemini-4-argon     google                9            200    $0.00202
gpt-6.1-sol        openai                9            200    $0.00202
claude-sonnet-5-5  anthropic            12            200    $0.00202
claude-opus-5-5    anthropic            12            200    $0.00405

Cheapest: gpt-6-luna ($0.000101), 40x cheaper than claude-opus-5-5.
Token counts are estimates (usually within 15%). Prices as of 2026-10-17.
```

`-o 200` says you expect a 200-token reply. Add `-n 10k` to see the total for 10,000 requests.

### Library

Save this as `tally.mjs` and run `node tally.mjs`:

```js
import { compareCosts, estimateCost, formatUsd } from "llm-tally";

const prompt = "Summarize the plot of Hamlet in three sentences.";

// One model, one line:
console.log(formatUsd(estimateCost(prompt, "sonnet").totalCost));

// Several models with a 200-token reply, cheapest first:
const models = ["gpt-5.5", "sonnet", "gemini-flash", "grok", "deepseek-flash", "mistral-large"];
for (const c of compareCosts(prompt, { models, outputTokens: 200 })) {
  console.log(c.model.padEnd(18), formatUsd(c.totalCost));
}
```

```text
$0.0000240
deepseek-flash     $0.000243
mistral-large      $0.000425
gemini-3.8-flash   $0.000757
grok-4.7           $0.00122
claude-sonnet-5-5  $0.00202
gpt-5.5            $0.00605
```

CommonJS works too on Node 22+: `const { estimateCost } = require("llm-tally");`

## Supported providers and short names

| Provider | Models | Short names |
| --- | --- | --- |
| OpenAI | 34 (GPT-6, GPT-5.x, GPT-4.x, o-series) | — use the API ID, e.g. `gpt-5.5` |
| Anthropic | 12 (Claude Fable, Opus, Sonnet, Haiku) | `fable`, `opus`, `sonnet`, `haiku` |
| Google | 10 (Gemini 4, 3.x, 2.5) | `gemini-pro`, `gemini-flash`, `gemini-flash-lite` |
| xAI | 8 (Grok 4.x) | `grok` |
| DeepSeek | 2 (V4 Pro, Flash) | `deepseek-pro`, `deepseek-v4-flash` |
| Mistral | 8 (Large, Medium, Small, Ministral, Codestral) | `mistral-large-latest` and other `-latest` IDs |

Short names point at the newest model in that line. Run `npx llm-tally --list` for every model and name, or `npx llm-tally --list sonnet` to search.

Model IDs are also accepted with provider prefixes as used by OpenRouter, LiteLLM, Vertex AI and Bedrock (`openai/gpt-5.5`, `x-ai/grok-4.7`, `mistralai/mistral-small-2603`, `models/gemini-2.5-pro`, `anthropic.claude-opus-5-5`) and with date suffixes (`gpt-4o-2024-08-06`).

## CLI

```text
llm-tally ui
llm-tally "your prompt text" [options]
llm-tally --file prompt.txt [options]
some-command | llm-tally [options]
llm-tally --list [provider or search]
```

| Option | Meaning |
| --- | --- |
| `-m, --model <id>` | Model to price, by API ID or short name. Repeat it or comma-separate for several. |
| `-p, --provider <name>` | Compare every model from a provider (`openai`, `anthropic`, `google`, `xai`, `deepseek`, `mistral`). |
| `--all` | Compare every known model. |
| `-o, --output-tokens <n>` | Expected reply length in tokens: `500`, `2k`, `1.5m`. Default `0`. |
| `-c, --cached <n>` | How many input tokens are served from the prompt cache. Default `0`. |
| `-n, --requests <n>` | Also show the total for this many requests: `100`, `10k`, `1m`. |
| `-f, --file <path>` | Read the prompt from a file (UTF-8, or UTF-16 as written by Windows PowerShell). |
| `--json` | Machine-readable output. |
| `-l, --list [filter]` | List models, prices and short names; filter by provider or part of a name. |
| `--no-open` | With `ui`: print the page's file path instead of opening a browser. |
| `-h, --help` / `-v, --version` | Help and version. |

Without `-m`, `-p` or `--all`, it compares a current flagship and a budget model from each provider.

More examples (`prompt.txt` is any text file of yours):

```sh
npx llm-tally -f prompt.txt -m sonnet -m gpt-5.5
npx llm-tally -f prompt.txt -p anthropic -o 1k -n 10k
npx llm-tally "Translate this paragraph into French." -m grok,deepseek-flash,mistral-large -o 1k --json
npx llm-tally --list mistral
```

Piping text in:

```sh
# PowerShell
Get-Content prompt.txt | npx llm-tally -m sonnet
# cmd.exe
type prompt.txt | npx llm-tally -m sonnet
# macOS / Linux
cat prompt.txt | npx llm-tally -m sonnet
```

Exit codes: `0` success, `1` unknown model, provider or invalid value, `2` bad command-line usage.

## API

All prices are US dollars. Token counts from `countTokens`, `estimateCost` and `compareCosts` are **estimates**; `costFromUsage` is exact because it uses the counts your provider returned.

### `estimateCost(input, model)` / `estimateCost(input, { model, outputTokens?, cachedInputTokens? })`

Prices one request. `input` is a string or an array of chat messages (`{ role, content }`, where `content` is a string or an array of `{ type: "text", text }` parts). Returns a `CostEstimate`:

```ts
{
  model: "gpt-5.5", provider: "openai",
  inputTokens: 9, cachedInputTokens: 0, outputTokens: 200,
  inputCost: 0.000045, cachedInputCost: 0, outputCost: 0.006, totalCost: 0.006045,
  currency: "USD",
  approximate: true,   // input tokens were estimated
  longContext: false,  // true when the long-context price tier applied
  warnings: [],        // e.g. input larger than the model's context window
}
```

### `compareCosts(input, models?)` / `compareCosts(input, { models?, providers?, outputTokens?, cachedInputTokens? })`

Prices the same request on several models and returns the `CostEstimate`s cheapest first.

```js
compareCosts(prompt, ["gpt-5.5", "sonnet", "grok"]);
compareCosts(prompt, { providers: ["anthropic", "mistral"], outputTokens: 500 });
```

Without `models` or `providers` it uses `DEFAULT_COMPARE_MODELS`.

### `costFromUsage({ model, inputTokens, outputTokens?, cachedInputTokens? })`

Exact cost of a finished request from the usage numbers in the API response:

```js
import { costFromUsage } from "llm-tally";

// OpenAI Responses API: response.usage
const cost = costFromUsage({
  model: "gpt-5.5",
  inputTokens: 1200,       // usage.input_tokens
  cachedInputTokens: 1000, // usage.input_tokens_details.cached_tokens
  outputTokens: 350,       // usage.output_tokens
});
console.log(cost.totalCost);
```

`inputTokens` is the **total** input, including cached tokens. Anthropic reports cache reads separately, so pass `input_tokens + cache_read_input_tokens` as `inputTokens` and `cache_read_input_tokens` as `cachedInputTokens`.

### `countTokens(input, model?)`

Estimated token count. With a model, it imitates that provider's tokenizer (Claude's newer tokenizer uses about 30% more tokens than GPT's for the same English text). Without one, it uses OpenAI's o200k tokenizer (GPT-4o and newer).

### Models

- `getModel(id)`: price and metadata for a model, by ID, short name or prefixed ID. Throws with suggestions if the model is unknown.
- `findModel(id)`: the same, but returns `undefined` instead of throwing.
- `listModels(provider?)`: all known models, or one provider's.
- `registerModel({ id, provider, input, output, cachedInput?, longContext?, contextWindow?, tokenizer?, aliases? })`: add a model, or override a built-in price (for example a negotiated discount). Prices are USD per 1M tokens.
- `PRICES_AS_OF`: the date the built-in prices were checked.

```js
import { estimateCost, registerModel } from "llm-tally";

registerModel({ id: "my-finetune", provider: "openai", input: 3, output: 12, aliases: ["mine"] });
estimateCost("Hello", "mine");
```

### `formatUsd(amount)`

Cents from $1 up (`$12.50`) and three significant digits below, so small costs stay comparable (`$0.0100`, `$0.000123`).

### Errors

Mistakes throw an `LlmTallyError` with a `code` (`UNKNOWN_MODEL`, `INVALID_INPUT` or `INVALID_OPTION`) and a message that says how to fix it:

```text
LlmTallyError: Unknown model "gpt-55". Did you mean "gpt-5.5", "gpt-5", "gpt-5.4"? Run `npx llm-tally --list` to see all models, or add your own with registerModel().
```

## Other runtimes

The library has no Node-specific code, so it runs in Bun, Deno and browsers as well. CI checks Node 22/24/26 on Windows, macOS and Linux, plus Bun and Deno.

```sh
bun add llm-tally
bunx llm-tally "Hello" -m sonnet
```

```js
// Deno
import { estimateCost } from "npm:llm-tally";
// Browser (no build step)
import { estimateCost } from "https://esm.sh/llm-tally";
```

## How accurate is it?

- **Prices** come from each provider's public pricing page (standard tier, as of `PRICES_AS_OF`). Batch, priority and regional pricing, cache-write surcharges and per-image/audio pricing are not included.
  - **DeepSeek** prices are the peak-hour rates; off-peak hours cost half.
  - **Mistral Large** uses the current sale price.
- **Token counts** are estimated with rules tuned against OpenAI's real o200k tokenizer: usually within about 10% for English prose, code and JSON, and within about 20% for other languages. Counts for other providers are scaled from that, and the xAI, DeepSeek and Mistral scaling is rougher. For exact counts, use your provider's token-counting endpoint, then pass the numbers to `costFromUsage`.

## Troubleshooting

- **`Unknown model "..."`**: check the spelling against `npx llm-tally --list` (or search, e.g. `--list grok`). New models appear in new versions of llm-tally; until then add them with `registerModel()`.
- **`No input`**: pass the prompt in quotes, use `--file`, or pipe text in.
- **Text with `$` in PowerShell**: PowerShell expands `$name` inside double quotes. Use single quotes (`'costs $5'`) or `--file`.
- **Non-English text piped in Windows PowerShell 5.1 turns into `?`**: older PowerShell pipes text to programs as ASCII. Use `--file prompt.txt`, or run `$OutputEncoding = [Text.Encoding]::UTF8` first.
- **`ERR_REQUIRE_ESM` or syntax errors**: you are on Node.js older than 22. Upgrade Node.
- **`npx llm-tally` is slow the first time**: npx downloads the package once. Install it (`npm install -g llm-tally`) to skip that.

## License

[MIT](LICENSE)
