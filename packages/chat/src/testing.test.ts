import { afterEach, describe, expect, it, vi } from "vitest";

import { createStubLanguageModel } from "./testing";

type Streaming = {
  doStream: (options: { prompt: unknown[] }) => Promise<unknown>;
};

const ask = (options: { allowInProduction?: boolean } = {}) =>
  (
    createStubLanguageModel({
      modelId: "google/gemini-2.5-flash",
      reply: () => "hi",
      chunkDelayInMs: 0,
      ...options,
    }) as unknown as Streaming
  ).doStream({
    prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
  });

describe("createStubLanguageModel in a production build", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to reply, naming what to bind", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(ask()).rejects.toThrow(/lib\/chat-model\.ts/);
  });

  it("replies when the deployment opts in, by env or in code", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(ask({ allowInProduction: true })).resolves.toBeDefined();
    vi.stubEnv("INTELLIGO_ALLOW_STUB_MODEL", "1");
    await expect(ask()).resolves.toBeDefined();
  });

  it("replies outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(ask()).resolves.toBeDefined();
  });
});
