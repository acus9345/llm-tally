/** Machine-readable reason for an {@link LlmTallyError}. */
export type LlmTallyErrorCode = "UNKNOWN_MODEL" | "INVALID_INPUT" | "INVALID_OPTION";

/**
 * The only error type llm-tally throws for caller mistakes.
 *
 * `message` says what went wrong and how to fix it; `code` lets you branch on the cause.
 */
export class LlmTallyError extends Error {
  /** Why the call failed. */
  readonly code: LlmTallyErrorCode;

  constructor(code: LlmTallyErrorCode, message: string) {
    super(message);
    this.name = "LlmTallyError";
    this.code = code;
  }
}

/** Throws unless `value` is a finite number >= 0. */
export function assertTokenCount(name: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new LlmTallyError(
      "INVALID_OPTION",
      `${name} must be a number of tokens >= 0, but got ${describe(value)}. Pass a whole number like 500.`,
    );
  }
}

/** Short, safe description of a value for error messages. */
export function describe(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 40 ? `"${value.slice(0, 40)}…"` : `"${value}"`;
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return String(value);
}
