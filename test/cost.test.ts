import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  compareCosts,
  costFromUsage,
  countTokens,
  DEFAULT_COMPARE_MODELS,
  estimateCost,
  findModel,
  formatUsd,
  getModel,
  LlmTallyError,
  listModels,
  PRICES_AS_OF,
  registerModel,
} from "../dist/index.js";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

describe("costFromUsage", () => {
  test("prices input and output per million tokens", () => {
    const c = costFromUsage({ model: "gpt-5.5", inputTokens: 100_000, outputTokens: 1_000_000 });
    close(c.inputCost, 0.5);
    close(c.outputCost, 30);
    close(c.totalCost, 30.5);
    assert.equal(c.longContext, false);
    assert.equal(c.currency, "USD");
    assert.equal(c.approximate, false);
    assert.equal(c.provider, "openai");
  });

  test("cached tokens use the cache rate", () => {
    const c = costFromUsage({ model: "claude-sonnet-5-5", inputTokens: 1000, cachedInputTokens: 800, outputTokens: 0 });
    close(c.inputCost, (200 * 2) / 1e6);
    close(c.cachedInputCost, (800 * 0.2) / 1e6);
  });

  test("long-context tier applies above the threshold", () => {
    const under = costFromUsage({ model: "gemini-3.1-pro-preview", inputTokens: 200_000, outputTokens: 1000 });
    const over = costFromUsage({ model: "gemini-3.1-pro-preview", inputTokens: 200_001, outputTokens: 1000 });
    assert.equal(under.longContext, false);
    assert.equal(over.longContext, true);
    close(over.outputCost, (1000 * 18) / 1e6);
  });

  test("models without a cache price charge full input and warn", () => {
    const c = costFromUsage({ model: "gpt-5.5-pro", inputTokens: 1000, cachedInputTokens: 500 });
    close(c.totalCost, (1000 * 30) / 1e6);
    assert.match(c.warnings.join(), /no cache discount/);
  });

  test("cached tokens are capped at the input size", () => {
    const c = costFromUsage({ model: "gpt-5.5", inputTokens: 100, cachedInputTokens: 500 });
    assert.equal(c.cachedInputTokens, 100);
    assert.equal(c.warnings.length, 1);
  });

  test("warns when input exceeds the context window", () => {
    const c = costFromUsage({ model: "claude-haiku-4-5", inputTokens: 300_000 });
    assert.match(c.warnings.join(), /context window/);
  });

  test("costs have no floating-point noise", () => {
    const c = costFromUsage({ model: "gpt-5.5", inputTokens: 6, outputTokens: 1000 });
    assert.equal(c.totalCost, 0.03003);
    assert.equal(JSON.stringify(c.totalCost), "0.03003");
  });

  test("zero tokens cost nothing", () => {
    assert.equal(costFromUsage({ model: "gpt-5.5", inputTokens: 0 }).totalCost, 0);
  });

  test("rejects bad token counts with a fix-it message", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "100"]) {
      assert.throws(
        () => costFromUsage({ model: "gpt-5.5", inputTokens: bad as number }),
        (e: unknown) =>
          e instanceof LlmTallyError && e.code === "INVALID_OPTION" && /inputTokens must be/.test(e.message),
      );
    }
    assert.throws(() => costFromUsage({ model: "gpt-5.5", inputTokens: 1, outputTokens: -5 }), /outputTokens must be/);
    assert.throws(() => costFromUsage(null as never), /needs an object/);
  });
});

describe("estimateCost", () => {
  test("common case in one line", () => {
    const c = estimateCost("Write a haiku about autumn.", { model: "gpt-5.5", outputTokens: 50 });
    assert.equal(c.approximate, true);
    assert.equal(c.inputTokens, countTokens("Write a haiku about autumn."));
    close(c.totalCost, (c.inputTokens * 5 + 50 * 30) / 1e6);
  });

  test("requires a model", () => {
    assert.throws(() => estimateCost("hi", {} as never), /needs a model/);
    assert.throws(() => estimateCost("hi", undefined as never), /needs a model/);
  });

  test("empty text with output tokens costs only the output", () => {
    const c = estimateCost("", { model: "claude-opus-5-5", outputTokens: 1000 });
    close(c.totalCost, (1000 * 20) / 1e6);
  });
});

describe("compareCosts", () => {
  test("defaults to a model per provider, cheapest first", () => {
    const results = compareCosts("Hello there", { outputTokens: 100 });
    assert.equal(results.length, DEFAULT_COMPARE_MODELS.length);
    for (let i = 1; i < results.length; i++) assert.ok(results[i - 1].totalCost <= results[i].totalCost);
    assert.deepEqual(new Set(results.map((r) => r.provider)), new Set(["openai", "anthropic", "google"]));
  });

  test("accepts an explicit model list", () => {
    const results = compareCosts("Hi", { models: ["gpt-5.5", "claude-haiku-5-5"] });
    assert.deepEqual(results.map((r) => r.model).sort(), ["claude-haiku-5-5", "gpt-5.5"]);
  });

  test("rejects an empty model list", () => {
    assert.throws(() => compareCosts("Hi", { models: [] }), /non-empty array/);
  });
});

describe("model catalog", () => {
  test("every built-in model has sane prices", () => {
    const models = listModels();
    assert.ok(models.length > 40);
    for (const m of models) {
      assert.ok(m.input >= 0 && m.output >= m.input * 0.5, m.id);
      if (m.cachedInput !== undefined) assert.ok(m.cachedInput <= m.input, m.id);
      if (m.longContext) assert.ok(m.longContext.input >= m.input, m.id);
    }
    assert.equal(new Set(models.map((m) => m.id)).size, models.length);
    assert.match(PRICES_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("filters by provider", () => {
    assert.ok(listModels("anthropic").every((m) => m.provider === "anthropic"));
    assert.ok(listModels("Google").length > 0);
    assert.equal(listModels("nobody").length, 0);
  });

  test("resolves prefixes, Bedrock IDs, dated snapshots and case", () => {
    assert.equal(getModel("openai/gpt-5.5").id, "gpt-5.5");
    assert.equal(getModel("models/gemini-2.5-pro").id, "gemini-2.5-pro");
    assert.equal(getModel("anthropic.claude-opus-5-5").id, "claude-opus-5-5");
    assert.equal(getModel("us.anthropic.claude-haiku-4-5-20251001-v1:0").id, "claude-haiku-4-5");
    assert.equal(getModel("gpt-4o-2024-08-06").id, "gpt-4o");
    assert.equal(getModel("GPT-5.5").id, "gpt-5.5");
    assert.equal(getModel(" claude-sonnet-5-5 ").id, "claude-sonnet-5-5");
  });

  test("unknown models suggest close matches", () => {
    assert.throws(
      () => getModel("claude-sonet-5-5"),
      (e: unknown) =>
        e instanceof LlmTallyError &&
        e.code === "UNKNOWN_MODEL" &&
        e.message.includes('"claude-sonnet-5-5"') &&
        e.message.includes("--list"),
    );
    assert.equal(findModel("does-not-exist"), undefined);
    assert.throws(() => getModel(""), /model must be a model ID/);
  });

  test("registerModel adds and overrides models", () => {
    registerModel({ id: "my-finetune", provider: "OpenAI", input: 3, output: 12 });
    const m = getModel("my-finetune");
    assert.equal(m.provider, "openai");
    close(costFromUsage({ model: "my-finetune", inputTokens: 1e6 }).totalCost, 3);
    const long = costFromUsage({ model: "gpt-5.5", inputTokens: 1_000_000 });
    assert.equal(long.longContext, true);
    close(long.totalCost, 10);
    assert.throws(() => registerModel({ id: "x", provider: "p", input: -1, output: 1 }), /"input" must be a price/);
    assert.throws(() => registerModel({ id: "", provider: "p", input: 1, output: 1 }), /"id" must be/);
    assert.throws(() => registerModel(null as never), /needs a model object/);
  });
});

describe("formatUsd", () => {
  test("keeps cents for normal amounts and significant digits for tiny ones", () => {
    assert.equal(formatUsd(0), "$0.00");
    assert.equal(formatUsd(12.5), "$12.50");
    assert.equal(formatUsd(0.01), "$0.01");
    assert.equal(formatUsd(0.0042), "$0.0042");
    assert.equal(formatUsd(0.000123), "$0.000123");
    assert.equal(formatUsd(1234.567), "$1234.57");
    assert.equal(formatUsd(Number.NaN), "$?");
  });
});
