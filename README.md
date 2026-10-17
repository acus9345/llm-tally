# llm-tally

Estimate tokens and API cost for OpenAI, Anthropic (Claude) and Google (Gemini) models, from code or the command line.

- **Zero dependencies.** Small, fast, works offline (no tokenizer vocabularies to download).
- **One price table, three providers.** 56 models, with cache and long-context prices.
- **Typed.** Written in TypeScript, ships its own type definitions.
- **CLI included.** `npx llm-tally "your prompt"` compares models in one line.

## Install

```sh
npm install llm-tally
```

Run it in your project folder. In a brand-new empty folder, run `npm init -y` first; otherwise npm installs into the nearest parent folder that has a `package.json`.

Requires Node.js 22 or newer. The CLI also works without installing, through `npx`.

## Quick start

### Command line

```sh
npx llm-tally "Summarize the plot of Hamlet in three sentences." -o 200
```

```text
MODEL              PROVIDER   INPUT TOKENS  OUTPUT TOKENS  COST (USD)
gpt-6-luna         openai                9            200   $0.000101
claude-haiku-5-5   anthropic            12            200   $0.000101
gemini-3.8-flash   google                9            200   $0.000757
gemini-4-argon     google                9            200    $0.00202
gpt-6.1-sol        openai                9            200    $0.00202
claude-sonnet-5-5  anthropic            12            200    $0.00202
claude-opus-5-5    anthropic            12            200    $0.00405

Token counts are estimates (usually within 15%). Prices as of 2026-10-17.
```

`-o 200` says you expect a 200-token reply. Leave it out to price the input only.

### Library

Save this as `tally.mjs` and run `node tally.mjs`:

```js
import { estimateCost, compareCosts, formatUsd } from "llm-tally";

const prompt = "Summarize the plot of Hamlet in three sentences.";

const cost = estimateCost(prompt, { model: "gpt-5.5", outputTokens: 200 });
console.log(`${cost.inputTokens} input tokens, about ${formatUsd(cost.totalCost)}`);

for (const c of compareCosts(prompt, { outputTokens: 200 })) {
  console.log(c.model.padEnd(18), formatUsd(c.totalCost));
}
```

```text
9 input tokens, about $0.00605
gpt-6-luna         $0.000101
claude-haiku-5-5   $0.000101
...
```

CommonJS works too on Node 22+: `const { estimateCost } = require("llm-tally");`

## CLI

```text
llm-tally "your prompt text" [options]
llm-tally --file prompt.txt [options]
some-command | llm-tally [options]
llm-tally --list [provider]
```

| Option | Meaning |
| --- | --- |
| `-m, --model <id>` | Model to price. Repeat it or comma-separate for several. Default: a few current models from each provider. |
| `-f, --file <path>` | Read the prompt from a file (UTF-8, or UTF-16 as written by Windows PowerShell). |
| `-o, --output-tokens <n>` | Expected reply length in tokens: `500`, `2k`, `1.5m`. Default `0`. |
| `-c, --cached <n>` | How many input tokens are served from the prompt cache. Default `0`. |
| `--json` | Machine-readable output. |
| `-l, --list [provider]` | List known models and their prices (`openai`, `anthropic` or `google`). |
| `-h, --help` / `-v, --version` | Help and version. |

More examples (`prompt.txt` is any text file of yours):

```sh
npx llm-tally -f prompt.txt -m gpt-5.5 -m claude-sonnet-5-5
npx llm-tally "Translate this paragraph into French." -m gpt-5.5,gemini-4-argon -o 1k --json
npx llm-tally --list anthropic
```

Piping text in:

```sh
# PowerShell
Get-Content prompt.txt | npx llm-tally -m gpt-5.5
# cmd.exe
type prompt.txt | npx llm-tally -m gpt-5.5
# macOS / Linux
cat prompt.txt | npx llm-tally -m gpt-5.5
```

Exit codes: `0` success, `1` unknown model or invalid value, `2` bad command-line usage.

## API

All prices are US dollars. Token counts from `countTokens`, `estimateCost` and `compareCosts` are **estimates**; `costFromUsage` is exact because it uses the counts your provider returned.

### `estimateCost(input, { model, outputTokens?, cachedInputTokens? })`

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

### `compareCosts(input, { models?, outputTokens?, cachedInputTokens? })`

Prices the same request on several models and returns the `CostEstimate`s cheapest first. Without `models` it uses `DEFAULT_COMPARE_MODELS`.

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

### `countTokens(input, { model? })`

Estimated token count. With `model`, it imitates that provider's tokenizer (Claude's newer tokenizer uses about 30% more tokens than GPT's for the same English text). Without it, it uses OpenAI's o200k tokenizer (GPT-4o and newer).

### Models

- `getModel(id)`: price and metadata for a model. Accepts provider prefixes (`openai/gpt-5.5`, `models/gemini-2.5-pro`), Bedrock IDs (`anthropic.claude-opus-5-5`) and dated snapshots (`gpt-4o-2024-08-06`). Throws with suggestions if the model is unknown.
- `findModel(id)`: the same, but returns `undefined` instead of throwing.
- `listModels(provider?)`: all known models.
- `registerModel({ id, provider, input, output, cachedInput?, longContext?, contextWindow?, tokenizer? })`: add a model, or override a built-in price (for example a negotiated discount). Prices are USD per 1M tokens.
- `PRICES_AS_OF`: the date the built-in prices were checked.

```js
import { registerModel, estimateCost } from "llm-tally";

registerModel({ id: "my-finetune", provider: "openai", input: 3, output: 12 });
estimateCost("Hello", { model: "my-finetune" });
```

### `formatUsd(amount)`

`$12.50` for normal amounts and three significant digits for tiny ones (`$0.000123`).

### Errors

Mistakes throw an `LlmTallyError` with a `code` (`UNKNOWN_MODEL`, `INVALID_INPUT` or `INVALID_OPTION`) and a message that says how to fix it:

```text
LlmTallyError: Unknown model "gpt-55". Did you mean "gpt-5.5", "gpt-5", "gpt-5.4"? Run `npx llm-tally --list` to see all models, or add your own with registerModel().
```

## How accurate is it?

- **Prices** come from each provider's public pricing page (Standard tier, as of `PRICES_AS_OF`). Batch, priority and regional pricing, cache-write surcharges and per-image/audio pricing are not included.
- **Token counts** are estimated with rules tuned against OpenAI's real o200k tokenizer: usually within about 10% for English prose, code and JSON, and within about 20% for other languages. Counts for Claude and Gemini are scaled from that. For exact counts, use your provider's token-counting endpoint, then pass the numbers to `costFromUsage`.

## Troubleshooting

- **`Unknown model "..."`**: check the spelling against `npx llm-tally --list`. New models appear in new versions of llm-tally; until then add them with `registerModel()`.
- **`No input`**: pass the prompt in quotes, use `--file`, or pipe text in.
- **Text with `$` in PowerShell**: PowerShell expands `$name` inside double quotes. Use single quotes (`'costs $5'`) or `--file`.
- **Non-English text piped in Windows PowerShell 5.1 turns into `?`**: older PowerShell pipes text to programs as ASCII. Use `--file prompt.txt`, or run `$OutputEncoding = [Text.Encoding]::UTF8` first.
- **`ERR_REQUIRE_ESM` or syntax errors**: you are on Node.js older than 22. Upgrade Node.
- **`npx llm-tally` is slow the first time**: npx downloads the package once. Install it (`npm install -g llm-tally`) to skip that.

## License

[MIT](LICENSE)
