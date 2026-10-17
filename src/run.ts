import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { listModels } from "./catalog.js";
import { LlmTallyError } from "./errors.js";
import { type CostEstimate, compareCosts, formatUsd } from "./estimate.js";
import { DEFAULT_COMPARE_MODELS, PRICES_AS_OF } from "./models.js";

/** Where the CLI reads and writes. Swappable so tests don't touch the real terminal. */
export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Returns piped stdin, or `undefined` when stdin is an interactive terminal. */
  readStdin: () => Promise<string | undefined>;
}

const HELP = `llm-tally - estimate tokens and API cost for OpenAI, Anthropic and Google models

Usage:
  llm-tally "your prompt text" [options]
  llm-tally --file prompt.txt [options]
  some-command | llm-tally [options]
  llm-tally --list [provider]

Options:
  -m, --model <id>          Model to price. Repeat or comma-separate for several.
                            Default: ${DEFAULT_COMPARE_MODELS.join(", ")}
  -f, --file <path>         Read the prompt from a file (UTF-8 or UTF-16).
  -o, --output-tokens <n>   Expected reply length in tokens, e.g. 500 or 2k. Default: 0
  -c, --cached <n>          Input tokens served from the prompt cache. Default: 0
      --json                Print machine-readable JSON.
  -l, --list                List known models and prices (optionally for one provider).
  -h, --help                Show this help.
  -v, --version             Show the version.

Examples:
  llm-tally "Write a haiku about autumn" -o 50
  llm-tally -f prompt.txt -m gpt-5.5 -m claude-sonnet-5-5
  llm-tally -f prompt.txt -m gpt-5.5,gemini-4-argon -o 1k --json
  llm-tally --list anthropic

Token counts are estimates (usually within 15%). Prices are USD, as of ${PRICES_AS_OF}.`;

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
  if (values.list) {
    printList(positionals[0], values.json === true, io);
    return 0;
  }

  const outputTokens = parseCount("--output-tokens", values["output-tokens"]);
  const cachedInputTokens = parseCount("--cached", values.cached);
  const models = values.model
    ?.flatMap((m) => m.split(","))
    .map((m) => m.trim())
    .filter(Boolean);

  const text = await readInput(values.file, positionals, io);
  const results = compareCosts(text, {
    ...(models && models.length > 0 ? { models } : {}),
    outputTokens,
    cachedInputTokens,
  });

  if (values.json) {
    io.stdout(JSON.stringify(results, null, 2));
  } else {
    io.stdout(formatTable(results, outputTokens));
  }
  return 0;
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      model: { type: "string", short: "m", multiple: true },
      file: { type: "string", short: "f" },
      "output-tokens": { type: "string", short: "o" },
      cached: { type: "string", short: "c" },
      json: { type: "boolean" },
      list: { type: "boolean", short: "l" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}

/** Parses "500", "2k", "1.5m" into a token count. */
function parseCount(flag: string, raw: string | undefined): number {
  if (raw === undefined) return 0;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([km]?)\s*$/i.exec(raw.replace(/[,_]/g, ""));
  if (!match) throw new UsageError(`${flag} must be a token count like 500, 2k or 1.5m, but got "${raw}".`);
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
  if (piped === undefined) {
    throw new UsageError('No input. Pass text in quotes (llm-tally "Hello"), use --file <path>, or pipe text in.');
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

function formatTable(results: CostEstimate[], outputTokens: number): string {
  const rows = results.map((r) => [
    r.model,
    r.provider,
    r.inputTokens.toLocaleString("en-US"),
    outputTokens.toLocaleString("en-US"),
    formatUsd(r.totalCost),
  ]);
  const header = ["MODEL", "PROVIDER", "INPUT TOKENS", "OUTPUT TOKENS", "COST (USD)"];
  const lines = renderTable(header, rows);
  const warnings = results.flatMap((r) => r.warnings.map((w) => `warning: ${w}`));
  const note = `Token counts are estimates (usually within 15%). Prices as of ${PRICES_AS_OF}.`;
  return [...lines, "", note, ...warnings].join("\n");
}

function printList(provider: string | undefined, json: boolean, io: CliIO): void {
  const models = listModels(provider);
  if (models.length === 0) {
    const providers = [...new Set(listModels().map((m) => m.provider))].join(", ");
    throw new UsageError(`No models for provider "${provider}". Known providers: ${providers}.`);
  }
  if (json) {
    io.stdout(JSON.stringify(models, null, 2));
    return;
  }
  const header = ["MODEL", "PROVIDER", "INPUT $/1M", "CACHED $/1M", "OUTPUT $/1M"];
  const rows = models.map((m) => [
    m.id,
    m.provider,
    String(m.input),
    m.cachedInput === undefined ? "-" : String(m.cachedInput),
    String(m.output),
  ]);
  const lines = renderTable(header, rows);
  io.stdout([...lines, "", `Prices in USD per 1M tokens, as of ${PRICES_AS_OF}.`].join("\n"));
}

/** Left-aligns the first two columns, right-aligns the numeric ones. */
function renderTable(header: string[], rows: string[][]): string[] {
  const table = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...table.map((row) => row[col].length)));
  return table.map((row) =>
    row
      .map((cell, col) => (col >= 2 ? cell.padStart(widths[col]) : cell.padEnd(widths[col])))
      .join("  ")
      .trimEnd(),
  );
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
