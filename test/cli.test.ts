import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type CliIO, main } from "../dist/run.js";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "llm-tally-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

async function cli(args: string[], stdin?: string) {
  let out = "";
  let err = "";
  const io: CliIO = {
    stdout: (t) => {
      out += `${t}\n`;
    },
    stderr: (t) => {
      err += `${t}\n`;
    },
    readStdin: async () => stdin,
  };
  const code = await main(args, io);
  return { code, out, err };
}

describe("cli", () => {
  test("--help and --version", async () => {
    const help = await cli(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.out, /Usage:/);
    assert.match(help.out, /--output-tokens/);
    const version = await cli(["-v"]);
    assert.match(version.out.trim(), /^\d+\.\d+\.\d+$/);
  });

  test("prices text against the default models", async () => {
    const r = await cli(["Write a haiku about autumn", "-o", "50"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /MODEL\s+PROVIDER/);
    assert.match(r.out, /claude-opus-5-5/);
    assert.match(r.out, /gpt-6\.1-sol/);
  });

  test("joins unquoted words into one prompt", async () => {
    const quoted = await cli(["hello big world", "--json", "-m", "gpt-5.5"]);
    const split = await cli(["hello", "big", "world", "--json", "-m", "gpt-5.5"]);
    assert.deepEqual(JSON.parse(quoted.out), JSON.parse(split.out));
  });

  test("repeated and comma-separated --model, k suffix, JSON output", async () => {
    const r = await cli(["hi", "-m", "gpt-5.5,claude-sonnet-5-5", "--model", "gemini-4-argon", "-o", "2k", "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out) as { model: string; outputTokens: number }[];
    assert.equal(data.length, 3);
    assert.ok(data.every((d) => d.outputTokens === 2000));
  });

  test("reads piped stdin, and treats empty stdin as no input", async () => {
    const r = await cli(["-m", "gpt-5.5", "--json"], "some piped text");
    assert.equal(JSON.parse(r.out)[0].inputTokens > 0, true);
    const empty = await cli(["-m", "gpt-5.5"], "  \n");
    assert.equal(empty.code, 2);
    assert.match(empty.err, /No input/);
  });

  test("reads UTF-8 BOM and UTF-16 files like Windows tools write", async () => {
    const text = "Hello from Windows\r\nSecond line";
    const utf8 = join(dir, "bom.txt");
    const utf16 = join(dir, "utf16.txt");
    writeFileSync(utf8, `﻿${text}`, "utf8");
    writeFileSync(utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
    const plain = await cli([text, "-m", "gpt-5.5", "--json"]);
    for (const file of [utf8, utf16]) {
      const r = await cli(["-f", file, "-m", "gpt-5.5", "--json"]);
      assert.equal(r.code, 0, r.err);
      assert.equal(JSON.parse(r.out)[0].inputTokens, JSON.parse(plain.out)[0].inputTokens);
    }
  });

  test("--list, with and without a provider", async () => {
    const all = await cli(["--list"]);
    assert.match(all.out, /gpt-5\.5/);
    assert.match(all.out, /gemini-2\.5-pro/);
    const one = await cli(["--list", "anthropic"]);
    assert.doesNotMatch(one.out, /gpt-5\.5/);
    const bad = await cli(["--list", "nobody"]);
    assert.equal(bad.code, 2);
    assert.match(bad.err, /Try a provider \(openai, anthropic, google, xai, deepseek, mistral\)/);
    const search = await cli(["--list", "sonnet"]);
    assert.match(search.out, /claude-sonnet-5-5\s.*sonnet, claude-sonnet/);
    assert.doesNotMatch(search.out, /opus/);
  });

  test("short names, provider prefixes and new providers", async () => {
    const r = await cli(["hi", "-m", "sonnet,grok,mistral-large-latest,deepseek/deepseek-flash", "--json"]);
    assert.equal(r.code, 0, r.err);
    const models = (JSON.parse(r.out) as { model: string }[]).map((x) => x.model).sort();
    assert.deepEqual(models, ["claude-sonnet-5-5", "deepseek-flash", "grok-4.7", "mistral-large"]);
  });

  test("--provider and --all compare whole providers", async () => {
    const xai = await cli(["hi", "-p", "xai", "--json"]);
    const data = JSON.parse(xai.out) as { provider: string }[];
    assert.ok(data.length >= 5 && data.every((d) => d.provider === "xai"));
    const two = JSON.parse((await cli(["hi", "-p", "deepseek,mistral", "--json"])).out) as { provider: string }[];
    assert.deepEqual(new Set(two.map((d) => d.provider)), new Set(["deepseek", "mistral"]));
    const all = JSON.parse((await cli(["hi", "--all", "--json"])).out) as unknown[];
    assert.ok(all.length > 70);
  });

  test("--requests multiplies the cost and names the cheapest model", async () => {
    const r = await cli(["Hello there", "-m", "gpt-5.5,gpt-6-luna", "-o", "100", "-n", "10k"]);
    assert.match(r.out, /x 10,000 REQUESTS/);
    assert.match(r.out, /Cheapest: gpt-6-luna/);
    const json = JSON.parse((await cli(["Hello", "-m", "gpt-5.5", "-n", "3", "--json"])).out) as {
      totalCost: number;
      totalForRequests: number;
    }[];
    assert.ok(Math.abs(json[0].totalForRequests - json[0].totalCost * 3) < 1e-12);
  });

  test("hints at -o when no reply length is given", async () => {
    assert.match((await cli(["Hello"])).out, /Tip: add -o/);
    assert.doesNotMatch((await cli(["Hello", "-o", "10"])).out, /Tip: add -o/);
  });

  test("user mistakes give one clear line, not a stack trace", async () => {
    const cases: [string[], RegExp, number][] = [
      [[], /No input\.\n.*llm-tally "your prompt text"/s, 2],
      [["hi", "--bogus"], /Unknown option '--bogus'/, 2],
      [["hi", "-o", "lots"], /--output-tokens must be a number/, 2],
      [["hi", "-n", "0"], /--requests must be at least 1/, 2],
      [["hi", "-p", "nobody"], /Unknown provider "nobody"/, 1],
      [["hi", "-m", "gpt-55"], /Unknown model "gpt-55"/, 1],
      [["-f", join(dir, "missing.txt")], /File not found/, 2],
      [["-f", dir], /is a folder/, 2],
      [["text", "-f", join(dir, "x.txt")], /either as text or with --file/, 2],
    ];
    for (const [args, pattern, code] of cases) {
      const r = await cli(args);
      assert.equal(r.code, code, args.join(" "));
      assert.match(r.err, pattern);
      assert.match(r.err, /llm-tally --help/);
      assert.doesNotMatch(r.err, /\n\s+at /);
    }
  });

  test("the real binary runs and pipes stdin", () => {
    const r = spawnSync(process.execPath, [CLI, "-m", "gpt-5.5"], {
      input: "piped from a real process",
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /gpt-5\.5/);
    const bad = spawnSync(process.execPath, [CLI, "--nope"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
  });
});
