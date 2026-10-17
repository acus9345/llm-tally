import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { listModels } from "./catalog.js";
import { LlmTallyError } from "./errors.js";
import { type CostEstimate, compareCosts, formatUsd } from "./estimate.js";
import { EFFORT_REASONING_TOKENS, PRICES_AS_OF, type ReasoningEffort } from "./models.js";

/** Where the CLI reads and writes. Swappable so tests don't touch the real terminal. */
export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Returns piped stdin, or `undefined` when stdin is an interactive terminal. */
  readStdin: () => Promise<string | undefined>;
}

const PROVIDERS = [...new Set(listModels().map((m) => m.provider))].join(", ");

const HELP = `llm-tally - estimate what a prompt costs on ${listModels().length} LLMs from ${PROVIDERS.split(", ").length} providers

Usage:
  llm-tally ui                      Open the calculator in your browser (works offline).
  llm-tally "your prompt text" [options]
  llm-tally --file prompt.txt [options]
  some-command | llm-tally [options]
  llm-tally --list [provider or search]

Options:
  -m, --model <id>          Model to price: an API ID or short name (sonnet, opus, grok, kimi, glm).
                            Repeat or comma-separate for several.
  -p, --provider <name>     Compare every model from a provider. Repeat or comma-separate.
      --all                 Compare every known model.
  -e, --effort <level>      Reasoning effort: none, low, medium, high or max. Adds typical thinking
                            tokens to models that reason. Default: none
  -o, --output-tokens <n>   Length of the visible answer, e.g. 500 or 2k. Default: 0
  -n, --requests <n>        Also show the total for this many requests, e.g. 10k.
  -c, --cached <n>          Input tokens served from the prompt cache. Default: 0
  -f, --file <path>         Read the prompt from a file (UTF-8 or UTF-16).
      --json                Print machine-readable JSON.
      --no-open             With "ui": print the page's location instead of opening it.
  -l, --list                List known models, prices and short names.
  -h, --help                Show this help.
  -v, --version             Show the version.

Providers: ${PROVIDERS}
Without -m, -p or --all it compares a flagship and a budget model from the main providers.

Examples:
  llm-tally ui
  llm-tally "Write a haiku about autumn" -o 50
  llm-tally -f prompt.txt -m sonnet,gpt-5.5 -e medium -o 500
  llm-tally -f prompt.txt -p anthropic -e high -n 10k
  llm-tally --list qwen

Token counts are estimates (usually within 15%). Prices are USD, as of ${PRICES_AS_OF}.`;

const QUICK_USAGE = `Give llm-tally some text to price:
  llm-tally "your prompt text"
  llm-tally --file prompt.txt
  Get-Content prompt.txt | llm-tally     (PowerShell; use cat on macOS/Linux)`;

class UsageError extends Error {}

/** Runs the CLI with the given arguments and returns the process exit code. */
export async function main(argv: readonly string[], io: CliIO = defaultIO()): Promise<number> {
  try {
    return await run(argv, io);
  } catch (error) {
    if (error instanceof UsageError || error instanceof LlmTallyError) {
      io.stderr(`llm-tally: ${error.message}\nRun "llm-tally --help" for usage.`);
      return error instanceof UsageError ? 2 : 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(
      `llm-tally: unexpected error: ${message}\nPlease report it at https://github.com/acus9345/llm-tally/issues`,
    );
    return 1;
  }
}

async function run(argv: readonly string[], io: CliIO): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message.replace(/\. To specify .*$/s, ".") : String(error));
  }
  const { values, positionals } = parsed;

  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout(readVersion());
    return 0;
  }
  if (positionals.length === 1 && positionals[0].toLowerCase() === "ui" && values.file === undefined) {
    return openUi(values["no-open"] === true, io);
  }
  if (values.list) {
    printList(positionals.join(" ") || undefined, values.json === true, io);
    return 0;
  }

  const outputTokens = parseCount("--output-tokens", values["output-tokens"]);
  const effort = parseEffort(values.effort);
  const cachedInputTokens = parseCount("--cached", values.cached);
  const requests = values.requests === undefined ? 1 : parseCount("--requests", values.requests);
  if (requests < 1) throw new UsageError("--requests must be at least 1.");
  const models = splitList(values.model);
  const providers = splitList(values.provider);

  const text = await readInput(values.file, positionals, io);
  const results = compareCosts(text, {
    ...(values.all ? { models: listModels().map((m) => m.id) } : {}),
    ...(models.length > 0 ? { models } : {}),
    ...(providers.length > 0 && models.length === 0 ? { providers } : {}),
    outputTokens,
    cachedInputTokens,
    effort,
  });

  if (values.json) {
    const data =
      requests > 1 ? results.map((r) => ({ ...r, requests, totalForRequests: r.totalCost * requests })) : results;
    io.stdout(JSON.stringify(data, null, 2));
  } else {
    io.stdout(formatTable(results, requests, effort));
  }
  return 0;
}

/**
 * Turns repeated and comma-separated flag values into one clean list. Spaces also separate,
 * because PowerShell can pass `-m a,b` through npx as the single argument "a b".
 */
function splitList(values: string[] | undefined): string[] {
  return (values ?? [])
    .flatMap((v) => v.split(/[\s,]+/))
    .map((v) => v.trim())
    .filter(Boolean);
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      model: { type: "string", short: "m", multiple: true },
      provider: { type: "string", short: "p", multiple: true },
      all: { type: "boolean" },
      requests: { type: "string", short: "n" },
      file: { type: "string", short: "f" },
      "output-tokens": { type: "string", short: "o" },
      effort: { type: "string", short: "e" },
      cached: { type: "string", short: "c" },
      json: { type: "boolean" },
      "no-open": { type: "boolean" },
      list: { type: "boolean", short: "l" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}

/** Parses "500", "2k", "1.5m" into a count. */
function parseCount(flag: string, raw: string | undefined): number {
  if (raw === undefined) return 0;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([km]?)\s*$/i.exec(raw.replace(/[,_]/g, ""));
  if (!match) throw new UsageError(`${flag} must be a number like 500, 2k or 1.5m, but got "${raw}".`);
  const unit = match[2].toLowerCase();
  const scale = unit === "k" ? 1e3 : unit === "m" ? 1e6 : 1;
  return Math.round(Number(match[1]) * scale);
}

async function readInput(file: string | undefined, positionals: string[], io: CliIO): Promise<string> {
  if (file !== undefined) {
    if (positionals.length > 0) {
      throw new UsageError("Give the prompt either as text or with --file, not both.");
    }
    return readTextFile(file);
  }
  if (positionals.length > 0) return positionals.join(" ");
  const piped = await io.readStdin();
  if (piped === undefined || piped.trim() === "") {
    throw new UsageError(`No input.\n${QUICK_USAGE}`);
  }
  return piped;
}

/** Reads a text file, handling the UTF-8 BOM and UTF-16 files that Windows tools often write. */
export function readTextFile(path: string): string {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT")
      throw new UsageError(`File not found: ${path}. Check the path, or put it in quotes if it has spaces.`);
    if (code === "EISDIR") throw new UsageError(`${path} is a folder. Pass a file instead.`);
    throw new UsageError(`Can't read ${path} (${code ?? "unknown error"}).`);
  }
  return decode(bytes);
}

function decode(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Validates --effort. */
function parseEffort(raw: string | undefined): ReasoningEffort {
  if (raw === undefined) return "none";
  const level = raw.trim().toLowerCase();
  if (level in EFFORT_REASONING_TOKENS) return level as ReasoningEffort;
  throw new UsageError(`--effort must be one of ${Object.keys(EFFORT_REASONING_TOKENS).join(", ")}, but got "${raw}".`);
}

function formatTable(results: CostEstimate[], requests: number, effort: ReasoningEffort): string {
  const many = requests > 1;
  const header = ["MODEL", "PROVIDER", "INPUT TOKENS", "OUTPUT TOKENS", "COST (USD)"];
  if (many) header.push(`x ${requests.toLocaleString("en-US")} REQUESTS`);
  const rows = results.map((r) => {
    const row = [
      r.model,
      r.provider,
      r.inputTokens.toLocaleString("en-US"),
      r.outputTokens.toLocaleString("en-US"),
      formatUsd(r.totalCost),
    ];
    if (many) row.push(formatUsd(r.totalCost * requests));
    return row;
  });
  const lines = renderTable(header, rows);
  const summary: string[] = [];
  if (results.length > 1) {
    const cheapest = results[0];
    const priciest = results[results.length - 1];
    const ratio = cheapest.totalCost > 0 ? priciest.totalCost / cheapest.totalCost : 0;
    summary.push(
      `Cheapest: ${cheapest.model} (${formatUsd(cheapest.totalCost * requests)})` +
        (ratio >= 1.5 ? `, ${Math.round(ratio)}x cheaper than ${priciest.model}.` : "."),
    );
  }
  if (results.every((r) => r.outputTokens === 0)) {
    summary.push("Tip: add -o 500 for the answer and -e medium for thinking, to include the reply.");
  } else if (effort !== "none" && results.some((r) => r.reasoningTokens === 0)) {
    summary.push(
      `Output includes ~${EFFORT_REASONING_TOKENS[effort].toLocaleString("en-US")} thinking tokens on models that reason.`,
    );
  }
  const warnings = results.flatMap((r) => r.warnings.map((w) => `warning: ${w}`));
  const note = `Token counts are estimates (usually within 15%). Prices as of ${PRICES_AS_OF}.`;
  return [...lines, "", ...summary, note, ...warnings].join("\n");
}

function printList(filter: string | undefined, json: boolean, io: CliIO): void {
  const all = listModels();
  const query = filter?.trim().toLowerCase();
  const byProvider = query === undefined ? [] : listModels(query);
  const models =
    query === undefined
      ? all
      : byProvider.length > 0
        ? byProvider
        : all.filter((m) => [m.id, ...(m.aliases ?? [])].some((name) => name.toLowerCase().includes(query)));
  if (models.length === 0) {
    const providers = [...new Set(all.map((m) => m.provider))].join(", ");
    throw new UsageError(`No models match "${filter}". Try a provider (${providers}) or part of a model name.`);
  }
  if (json) {
    io.stdout(JSON.stringify(models, null, 2));
    return;
  }
  const header = ["MODEL", "PROVIDER", "INPUT $/1M", "CACHED $/1M", "OUTPUT $/1M", "ALSO KNOWN AS"];
  const rows = models.map((m) => [
    m.id,
    m.provider,
    String(m.input),
    m.cachedInput === undefined ? "-" : String(m.cachedInput),
    String(m.output),
    (m.aliases ?? []).join(", "),
  ]);
  const lines = renderTable(header, rows);
  io.stdout([...lines, "", `${models.length} models. Prices in USD per 1M tokens, as of ${PRICES_AS_OF}.`].join("\n"));
}

/** Left-aligns text columns (the first two and "ALSO KNOWN AS"), right-aligns the numbers. */
function renderTable(header: string[], rows: string[][]): string[] {
  const table = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...table.map((row) => row[col].length)));
  const isText = (col: number) => col < 2 || header[col] === "ALSO KNOWN AS";
  return table.map((row) =>
    row
      .map((cell, col) => (isText(col) ? cell.padEnd(widths[col]) : cell.padStart(widths[col])))
      .join("  ")
      .trimEnd(),
  );
}

/** Opens the bundled single-file web UI (dist/ui.html) in the default browser. */
function openUi(noOpen: boolean, io: CliIO): number {
  const page = fileURLToPath(new URL("./ui.html", import.meta.url));
  if (!existsSync(page)) {
    throw new UsageError(
      `The web UI file is missing (${page}). Reinstall llm-tally, or run "npm run build" in a checkout.`,
    );
  }
  if (noOpen) {
    io.stdout(page);
    return 0;
  }
  const [command, args] =
    process.platform === "win32"
      ? ["explorer.exe", [page]]
      : process.platform === "darwin"
        ? ["open", [page]]
        : ["xdg-open", [page]];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () =>
      io.stderr(`Couldn't open a browser automatically. Open this file in any browser:\n${page}`),
    );
    child.unref();
  } catch {
    io.stderr(`Couldn't open a browser automatically. Open this file in any browser:\n${page}`);
    return 0;
  }
  io.stdout(`Opening the llm-tally calculator in your browser...\n${page}`);
  return 0;
}

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

function defaultIO(): CliIO {
  return {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
    readStdin: async () => {
      if (process.stdin.isTTY) return undefined;
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return decode(Buffer.concat(chunks));
    },
  };
}
