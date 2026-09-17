/**
 * The allowlist, proved rather than promised.
 *
 * Two claims matter here and they pull in opposite directions: every
 * settlement-neutral option a product sets has to reach the model, and
 * every settlement-critical one has to be impossible to set — including
 * by a consumer who casts their way past the type. The second set is
 * the reason this module exists, so it is tested by name, one case per
 * forbidden key.
 */

import { describe, expect, it } from "vitest";

import {
  GENERATION_KEYS,
  pickGenerationOptions,
  type ChatGenerationOptions,
} from "./generation";

/** One value per allowlisted key, so a dropped key fails deep equality. */
const everything: ChatGenerationOptions = {
  maxOutputTokens: 512,
  temperature: 0.3,
  topP: 0.9,
  topK: 40,
  presencePenalty: 0.1,
  frequencyPenalty: 0.2,
  stopSequences: ["END"],
  seed: 7,
  reasoning: "none",
  maxRetries: 1,
  headers: { "x-trace": "abc" },
  toolChoice: "required",
  prepareStep: () => ({}),
  telemetry: { isEnabled: false },
  experimental_transform: () => new TransformStream(),
  onStepEnd: async () => {},
};

/**
 * The options whose behaviour settlement depends on. Each is handed in
 * through a cast, the way a consumer would get past the type, and must
 * not survive the pick. `stopWhen` and `tools` are here too: they are
 * seams on the agent, and a second source would desynchronise the tool
 * set from the message conversion.
 */
const FORBIDDEN = [
  "abortSignal",
  "timeout",
  "onFinish",
  "onEnd",
  "onAbort",
  "onError",
  "model",
  "system",
  "instructions",
  "prompt",
  "messages",
  "tools",
  "activeTools",
  "stopWhen",
  "_internal",
] as const;

describe("pickGenerationOptions", () => {
  it("carries every allowlisted option through unchanged", () => {
    expect(pickGenerationOptions(everything)).toEqual(everything);
  });

  it("copies nothing else, whatever the caller passes", () => {
    expect(Object.keys(pickGenerationOptions(everything)).sort()).toEqual(
      [...GENERATION_KEYS].sort()
    );
  });

  it.each(FORBIDDEN)("drops %s, even when cast past the type", (key) => {
    const smuggled = {
      temperature: 0.5,
      [key]: "whatever this is",
    } as unknown as ChatGenerationOptions;

    const picked = pickGenerationOptions(smuggled);

    expect(Object.prototype.hasOwnProperty.call(picked, key)).toBe(false);
    // The legitimate neighbour still arrives, so this is a filter and
    // not a refusal.
    expect(picked.temperature).toBe(0.5);
  });

  it("returns nothing for an unset seam", () => {
    expect(pickGenerationOptions(undefined)).toEqual({});
  });

  it("leaves an unset option absent rather than explicitly undefined", () => {
    // The result is spread into `streamText`, where a present-but-
    // undefined key overrides the SDK's own default.
    const picked = pickGenerationOptions({ temperature: 0.2 });
    expect(Object.prototype.hasOwnProperty.call(picked, "topP")).toBe(false);
    expect(Object.keys(picked)).toEqual(["temperature"]);
  });

  it("names exactly these keys", () => {
    // Written out so that removing an element — the mutation a picker
    // like this invites — fails here rather than silently narrowing
    // what a product may set.
    expect([...GENERATION_KEYS]).toEqual([
      "maxOutputTokens",
      "temperature",
      "topP",
      "topK",
      "presencePenalty",
      "frequencyPenalty",
      "stopSequences",
      "seed",
      "reasoning",
      "maxRetries",
      "headers",
      "toolChoice",
      "prepareStep",
      "telemetry",
      "experimental_transform",
      "onStepEnd",
    ]);
  });
});
