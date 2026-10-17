import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { countTokens, LlmTallyError } from "../dist/index.js";

describe("countTokens", () => {
  test("empty input is zero tokens", () => {
    assert.equal(countTokens(""), 0);
    assert.equal(countTokens([]), 0);
  });

  test("short English text is close to the real o200k count", () => {
    // Real o200k counts: "Hello, world!" = 4, the pangram = 10.
    assert.ok(Math.abs(countTokens("Hello, world!") - 4) <= 1);
    assert.ok(Math.abs(countTokens("The quick brown fox jumps over the lazy dog.") - 10) <= 1);
  });

  test("whitespace-only and punctuation-only input still counts", () => {
    assert.ok(countTokens("   \n\n\t") >= 1);
    assert.ok(countTokens("!!!???...") >= 1);
  });

  test("handles CJK, emoji and mixed scripts", () => {
    assert.ok(countTokens("今天天气很好") >= 3);
    assert.ok(countTokens("Привет, мир") >= 2);
    assert.ok(countTokens("🎉🎉🎉") >= 1);
  });

  test("Claude's newer tokenizer counts more tokens than GPT for the same text", () => {
    const text = "Please summarize the following meeting notes into three bullet points.";
    assert.ok(countTokens(text, { model: "claude-opus-5-5" }) > countTokens(text, { model: "gpt-5.5" }));
  });

  test("chat messages add per-message overhead", () => {
    const text = "What is the capital of France?";
    const messages = [{ role: "user", content: text }];
    assert.equal(countTokens(messages), countTokens(text) + 4 + 3);
  });

  test("multi-part message content counts only text parts", () => {
    const tokens = countTokens([
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image." },
          { type: "image", source: "ignored" } as { type: string },
        ],
      },
    ]);
    assert.equal(tokens, countTokens("Describe this image.") + 7);
  });

  test("large input is fast and roughly linear", () => {
    const paragraph = "Large inputs should be counted quickly and without running out of memory. ";
    const big = paragraph.repeat(70_000); // ~5 MB
    const start = performance.now();
    const tokens = countTokens(big);
    const elapsed = performance.now() - start;
    assert.ok(Math.abs(tokens / countTokens(paragraph.repeat(1000)) - 70) < 1);
    assert.ok(elapsed < 5000, `took ${elapsed} ms`);
  });

  test("rejects non-text input with a helpful error", () => {
    for (const bad of [undefined, null, 42, { text: "hi" }]) {
      assert.throws(
        () => countTokens(bad as never),
        (e: unknown) =>
          e instanceof LlmTallyError && e.code === "INVALID_INPUT" && /string or an array/.test(e.message),
      );
    }
  });

  test("rejects malformed messages", () => {
    assert.throws(() => countTokens([null as never]), /Message 0 must be an object/);
    assert.throws(() => countTokens([{ role: "user" } as never]), /Message 0 has no text content/);
  });

  test("unknown tokenizer model is an UNKNOWN_MODEL error", () => {
    assert.throws(
      () => countTokens("hi", { model: "gtp-5.5" }),
      (e: unknown) => e instanceof LlmTallyError && e.code === "UNKNOWN_MODEL" && /gpt-5\.5/.test(e.message),
    );
  });
});
