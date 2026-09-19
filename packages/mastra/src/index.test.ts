/**
 * The bridge exists to make the easy-to-forget parts unforgettable: a
 * refusal must be impossible to mistake for an empty result, a thrown
 * run must still release the hold, and usage must be read from
 * whichever field the provider actually populated.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ExecutionRefusedError,
  readModel,
  readUsage,
  runWithExecution,
  streamWithExecution,
} from "./index";
import type { Executions } from "@intelligo-dev/executions";

function fakeExecutions(overrides: Record<string, unknown> = {}) {
  const complete = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn().mockResolvedValue(undefined);
  const begin = vi.fn().mockResolvedValue({
    id: "e-1",
    requestId: "req-1",
    allowed: true,
    usingTrialCredits: false,
    complete,
    fail,
    ...overrides,
  });
  return {
    executions: { begin } as unknown as Executions,
    begin,
    complete,
    fail,
  };
}

const base = {
  workspaceId: "ws-1",
  userId: "u-1",
  capability: "support.reply",
};

beforeEach(() => vi.clearAllMocks());

describe("readUsage", () => {
  it("prefers totalUsage — `usage` is only the last step of a run", () => {
    // Mastra sets both. A five-call tool loop reports the fifth call in
    // `usage`; billing that instead of `totalUsage` under-charges every
    // agentic run.
    expect(
      readUsage({
        usage: { inputTokens: 10, outputTokens: 20 },
        totalUsage: { inputTokens: 900, outputTokens: 300 },
      })
    ).toEqual({ inputTokens: 900, outputTokens: 300, totalTokens: 1200 });
  });

  it("falls back to usage when the result reports one call only", () => {
    expect(readUsage({ usage: { inputTokens: 4, outputTokens: 6 } })).toEqual({
      inputTokens: 4,
      outputTokens: 6,
      totalTokens: 10,
    });
  });

  it("reads the standard field names", () => {
    expect(readUsage({ usage: { inputTokens: 10, outputTokens: 20 } })).toEqual(
      {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      }
    );
  });

  it("accepts the prompt/completion spelling other providers use", () => {
    expect(
      readUsage({ usage: { promptTokens: 5, completionTokens: 7 } })
    ).toEqual({ inputTokens: 5, outputTokens: 7, totalTokens: 12 });
  });

  it("prefers an explicit total over the derived sum", () => {
    expect(
      readUsage({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 99 } })
    ).toMatchObject({ totalTokens: 99 });
  });

  it("returns zeros when nothing was reported — the floor is billing policy", () => {
    expect(readUsage(undefined)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    expect(readUsage({})).toMatchObject({ totalTokens: 0 });
  });
});

describe("readModel", () => {
  it("reads a plain string", () => {
    expect(readModel({ model: "anthropic/claude-sonnet-4-6" })).toBe(
      "anthropic/claude-sonnet-4-6"
    );
  });

  it("reads modelId off a model object", () => {
    expect(readModel({ model: { modelId: "gpt-5" } })).toBe("gpt-5");
  });

  it("returns undefined when the provider says nothing", () => {
    expect(readModel({})).toBeUndefined();
    expect(readModel(undefined)).toBeUndefined();
  });
});

describe("runWithExecution", () => {
  it("returns the native result untouched", async () => {
    const { executions } = fakeExecutions();
    const native = {
      text: "hello",
      usage: { inputTokens: 1, outputTokens: 2 },
    };

    const result = await runWithExecution(
      { ...base, executions },
      async () => native
    );

    expect(result).toBe(native);
  });

  it("settles usage and model read from the result", async () => {
    const { executions, complete } = fakeExecutions();

    await runWithExecution({ ...base, executions }, async () => ({
      usage: { inputTokens: 100, outputTokens: 250 },
      model: { modelId: "anthropic/claude-sonnet-4-6" },
    }));

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { inputTokens: 100, outputTokens: 250, totalTokens: 350 },
        model: "anthropic/claude-sonnet-4-6",
      })
    );
  });

  it("falls back to the requested model when the result omits one", async () => {
    const { executions, complete } = fakeExecutions();

    await runWithExecution(
      { ...base, executions, model: "google/gemini-2.5-flash" },
      async () => ({ usage: { totalTokens: 5 } })
    );

    expect(complete.mock.calls[0]![0]!.model).toBe("google/gemini-2.5-flash");
  });

  it("throws ExecutionRefusedError instead of running when entitlement refuses", async () => {
    const { executions, complete } = fakeExecutions({
      allowed: false,
      reason: "Out of credits",
    });
    const run = vi.fn();

    await expect(
      runWithExecution({ ...base, executions }, run)
    ).rejects.toBeInstanceOf(ExecutionRefusedError);
    expect(run).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("records the failure and rethrows the native error unchanged", async () => {
    const { executions, fail } = fakeExecutions();
    const nativeError = new Error("model timeout");

    await expect(
      runWithExecution({ ...base, executions }, async () => {
        throw nativeError;
      })
    ).rejects.toBe(nativeError);
    expect(fail).toHaveBeenCalledWith({ error: nativeError });
  });

  it("passes capability, model, and metadata through to begin", async () => {
    const { executions, begin } = fakeExecutions();

    await runWithExecution(
      {
        ...base,
        executions,
        model: "gpt-5",
        requestId: "req-9",
        metadata: { conversationId: "c-1" },
      },
      async () => ({})
    );

    expect(begin).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "u-1",
      capability: "support.reply",
      requestId: "req-9",
      model: "gpt-5",
      metadata: { conversationId: "c-1" },
    });
  });
});

describe("streamWithExecution", () => {
  it("hands back the native stream plus settle/abort and the ids", async () => {
    const { executions } = fakeExecutions();
    const native = { textStream: {} };

    const handle = await streamWithExecution(
      { ...base, executions },
      async () => native
    );

    expect(handle.stream).toBe(native);
    expect(handle.executionId).toBe("e-1");
    expect(handle.requestId).toBe("req-1");
  });

  it("settles from the finished result when one is supplied", async () => {
    const { executions, complete } = fakeExecutions();
    const handle = await streamWithExecution(
      { ...base, executions },
      async () => ({})
    );

    await handle.settle({ usage: { totalTokens: 42 }, model: "gpt-5" });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({ totalTokens: 42 }),
        model: "gpt-5",
      })
    );
  });

  it("falls back to the stream object's own usage when settle gets nothing", async () => {
    const { executions, complete } = fakeExecutions();
    const handle = await streamWithExecution(
      { ...base, executions },
      async () => ({
        usage: { totalTokens: 7 },
      })
    );

    await handle.settle();

    expect(complete.mock.calls[0]![0]!.usage.totalTokens).toBe(7);
  });

  it("abort records a failure", async () => {
    const { executions, fail } = fakeExecutions();
    const handle = await streamWithExecution(
      { ...base, executions },
      async () => ({})
    );
    const error = new Error("client disconnected");

    await handle.abort(error);

    expect(fail).toHaveBeenCalledWith({ error });
  });

  it("abort without an error still records something recognizable", async () => {
    const { executions, fail } = fakeExecutions();
    const handle = await streamWithExecution(
      { ...base, executions },
      async () => ({})
    );

    await handle.abort();

    expect((fail.mock.calls[0]![0]!.error as Error).message).toBe(
      "Stream aborted"
    );
  });

  it("releases the hold when the stream fails to start", async () => {
    const { executions, fail } = fakeExecutions();

    await expect(
      streamWithExecution({ ...base, executions }, async () => {
        throw new Error("provider unreachable");
      })
    ).rejects.toThrow("provider unreachable");
    expect(fail).toHaveBeenCalled();
  });

  it("refuses before starting the stream, with the refusal code", async () => {
    const { executions } = fakeExecutions({
      allowed: false,
      reason: "nope",
      code: "insufficient_credits",
    });
    const start = vi.fn();

    const refused = streamWithExecution({ ...base, executions }, start);
    await expect(refused).rejects.toBeInstanceOf(ExecutionRefusedError);
    await expect(refused).rejects.toMatchObject({
      reasonCode: "insufficient_credits",
    });
    expect(start).not.toHaveBeenCalled();
  });
});
