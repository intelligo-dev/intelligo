import fc from "fast-check";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { _createLoggerWithStream } from "./logger";

function logged(data: Record<string, unknown>): Record<string, unknown> {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on("data", (chunk) => chunks.push(chunk.toString()));
  _createLoggerWithStream("Property", stream).info("event", data);
  return JSON.parse(chunks.join("").trim());
}

const casing = fc.constantFrom("token", "Token", "TOKEN");
const affix = fc.stringMatching(/^[a-z_]{0,8}$/);

describe("logger redaction", () => {
  it("redacts any string under a key containing 'token'", () => {
    fc.assert(
      fc.property(
        affix,
        casing,
        affix,
        fc.string(),
        (pre, frag, post, value) => {
          const key = `${pre}${frag}${post}`;
          expect(logged({ [key]: value })[key]).toBe("[REDACTED]");
        }
      )
    );
  });

  it("keeps a finite number under a token-count key", () => {
    fc.assert(
      fc.property(
        affix,
        fc.constantFrom("Tokens", "_tokens", "tokenCount", "token_count"),
        fc.integer({ min: 0, max: 10_000_000 }),
        (pre, suffix, count) => {
          const key = `${pre}${suffix}`;
          expect(logged({ [key]: count })[key]).toBe(count);
        }
      )
    );
  });
});
