/**
 * The eve binding, pinned: every event kind in eve's stream maps to
 * the AI SDK chunks the chat renders, duplicates are dropped, and the
 * turn round-trips through a fake eve over HTTP.
 */

import { describe, expect, it, vi } from "vitest";
import type { UIMessage, UIMessageChunk } from "ai";

import {
  approvalResponsesFrom,
  createEveEventMapper,
  eveStreamTurn,
  userContentFrom,
  type EveEvent,
} from "../base/chat-eve/lib/chat-eve";

const ev = (
  type: string,
  data: Record<string, unknown>,
  id?: string
): EveEvent => ({
  type,
  data: { turnId: "turn_1", sequence: 1, stepIndex: 0, ...data },
  meta: {
    id: id ?? `${type}-${JSON.stringify(data)}`,
    at: "2026-09-13T00:00:00Z",
  },
});

function mapAll(events: EveEvent[]): UIMessageChunk[] {
  const mapper = createEveEventMapper();
  return events.flatMap((event) => mapper.map(event));
}

describe("createEveEventMapper", () => {
  it("frames text, reasoning and steps", () => {
    const chunks = mapAll([
      ev("step.started", { modelId: "openai/gpt-5-mini" }),
      ev("reasoning.appended", { reasoningDelta: "Let me " }),
      ev("reasoning.appended", { reasoningDelta: "think" }, "r2"),
      ev("reasoning.completed", { reasoning: "Let me think" }),
      ev("message.appended", { messageDelta: "Hello" }),
      ev("message.appended", { messageDelta: " there" }, "m2"),
      ev("message.completed", { message: "Hello there", finishReason: "stop" }),
      ev("step.completed", {
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 2 },
      }),
      ev("turn.completed", {}),
    ]);
    expect(chunks.map((c) => c.type)).toEqual([
      "start-step",
      "reasoning-start",
      "reasoning-delta",
      "reasoning-delta",
      "reasoning-end",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish-step",
    ]);
    expect(
      chunks
        .filter((c) => c.type === "text-delta")
        .map((c) => (c as { delta: string }).delta)
    ).toEqual(["Hello", " there"]);
  });

  it("maps tool calls, partial and final results, failures and denials", () => {
    const chunks = mapAll([
      ev("action.input.appended", {
        callId: "c1",
        toolName: "search",
        inputTextDelta: '{"q":',
      }),
      ev("actions.requested", {
        actions: [
          {
            kind: "tool-call",
            callId: "c1",
            toolName: "search",
            input: { q: "eve" },
          },
        ],
      }),
      ev("action.partial", {
        result: {
          kind: "tool-result",
          callId: "c1",
          toolName: "search",
          output: { hits: 1 },
        },
      }),
      ev("action.result", {
        status: "completed",
        result: {
          kind: "tool-result",
          callId: "c1",
          toolName: "search",
          output: { hits: 3 },
        },
      }),
      ev("action.result", {
        status: "failed",
        error: { message: "boom" },
        result: {
          kind: "tool-result",
          callId: "c2",
          toolName: "x",
          output: "",
        },
      }),
      ev("action.result", {
        status: "rejected",
        result: {
          kind: "tool-result",
          callId: "c3",
          toolName: "x",
          output: "",
        },
      }),
    ]);
    expect(chunks.map((c) => c.type)).toEqual([
      "tool-input-start",
      "tool-input-delta",
      "tool-input-available",
      "tool-output-available",
      "tool-output-available",
      "tool-output-error",
      "tool-output-denied",
    ]);
    expect(chunks[3]).toMatchObject({ toolCallId: "c1", preliminary: true });
    expect(chunks[4]).toMatchObject({ toolCallId: "c1", output: { hits: 3 } });
    expect(chunks[5]).toMatchObject({ toolCallId: "c2", errorText: "boom" });
  });

  it("turns an approval request into the SDK's approval and a question into a data part", () => {
    const mapper = createEveEventMapper();
    const chunks = mapper.map(
      ev("input.requested", {
        requests: [
          {
            requestId: "req_A",
            kind: "tool-approval",
            prompt: "Delete rows?",
            options: [
              { id: "approve", label: "Approve" },
              { id: "reject", label: "Reject" },
            ],
            action: {
              kind: "tool-call",
              callId: "c9",
              toolName: "deleteRows",
              input: { table: "users" },
            },
          },
          {
            requestId: "req_Q",
            kind: "question",
            prompt: "Which region?",
            options: [
              { id: "eu", label: "Europe" },
              { id: "us", label: "US" },
            ],
            allowFreeform: true,
          },
        ],
      })
    );
    expect(chunks.map((c) => c.type)).toEqual([
      "tool-input-available",
      "tool-approval-request",
      "data-chat-question",
    ]);
    expect(chunks[1]).toMatchObject({ approvalId: "req_A", toolCallId: "c9" });
    expect(chunks[2]).toMatchObject({
      id: "req_Q",
      data: { prompt: "Which region?", allowFreeform: true },
    });
    expect(mapper.state.pendingQuestion).toEqual({
      requestId: "req_Q",
      options: [
        { id: "eu", label: "Europe" },
        { id: "us", label: "US" },
      ],
    });
  });

  it("maps subagents, authorization, results, failures and cancellation", () => {
    const chunks = mapAll([
      ev("subagent.called", {
        callId: "s1",
        childSessionId: "wrun_x",
        subagentName: "researcher",
      }),
      ev("subagent.completed", {
        callId: "s1",
        subagentName: "researcher",
        output: "done",
      }),
      ev("authorization.required", {
        name: "github",
        description: "Sign in",
        attemptId: "a1",
        authorization: { url: "https://x", instructions: "Open the link" },
      }),
      ev("authorization.completed", {
        name: "github",
        attemptId: "a1",
        outcome: "authorized",
      }),
      ev("result.completed", { result: { ok: true } }),
      ev("turn.cancelled", {}),
    ]);
    expect(chunks.map((c) => c.type)).toEqual([
      "data-chat-agent",
      "data-chat-agent",
      "data-chat-authorization",
      "data-chat-authorization",
      "data-chat-result",
      "abort",
    ]);
    expect(chunks[1]).toMatchObject({
      data: { status: "completed", summary: "done" },
    });
    expect(chunks[2]).toMatchObject({
      data: { url: "https://x", status: "required" },
    });

    const failed = createEveEventMapper();
    expect(
      failed.map(ev("turn.failed", { code: "x", message: "It broke" }))
    ).toEqual([{ type: "error", errorText: "It broke" }]);
    expect(failed.state.failed).toBe("It broke");
  });

  it("drops a replayed event by its id and sums usage across steps", () => {
    const mapper = createEveEventMapper();
    const first = ev("message.appended", { messageDelta: "a" }, "same");
    expect(mapper.map(first)).toHaveLength(2);
    expect(mapper.map(first)).toHaveLength(0);
    mapper.map(
      ev(
        "step.completed",
        {
          finishReason: "tool-calls",
          usage: { inputTokens: 1, outputTokens: 1 },
        },
        "s1"
      )
    );
    mapper.map(
      ev(
        "step.completed",
        { finishReason: "stop", usage: { inputTokens: 2, outputTokens: 3 } },
        "s2"
      )
    );
    expect(mapper.state.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
    expect(mapper.state.finishReason).toBe("stop");
  });
});

describe("approvalResponsesFrom / userContentFrom", () => {
  it("answers eve with the option the reader's decision means", () => {
    const messages: UIMessage[] = [
      { id: "u", role: "user", parts: [{ type: "text", text: "go" }] },
      {
        id: "a",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "deleteRows",
            toolCallId: "c9",
            state: "approval-responded",
            input: {},
            approval: { id: "req_A", approved: false, reason: "no" },
            callProviderMetadata: {
              eve: {
                inputRequest: {
                  requestId: "req_A",
                  options: [
                    { id: "approve", label: "Approve" },
                    { id: "reject", label: "Reject" },
                  ],
                },
              },
            },
          } as unknown as UIMessage["parts"][number],
        ],
      },
    ];
    expect(approvalResponsesFrom(messages)).toEqual([
      { requestId: "req_A", optionId: "reject" },
    ]);
  });

  it("sends text alone as a string and files as parts", () => {
    expect(
      userContentFrom({
        id: "u",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      })
    ).toBe("hi");
    expect(
      userContentFrom({
        id: "u",
        role: "user",
        parts: [
          { type: "text", text: "see" },
          {
            type: "file",
            mediaType: "image/png",
            url: "https://x/a.png",
            filename: "a.png",
          },
        ],
      })
    ).toEqual([
      { type: "text", text: "see" },
      {
        type: "file",
        data: "https://x/a.png",
        mediaType: "image/png",
        filename: "a.png",
      },
    ]);
  });
});

describe("eveStreamTurn", () => {
  function fakeEve(events: EveEvent[]) {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (url.endsWith("/eve/v1/session") && init?.method === "POST") {
          return Response.json({ sessionId: "wrun_1" }, { status: 202 });
        }
        if (url.includes("/stream")) {
          const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
          return new Response(body, {
            status: 200,
            headers: { "content-type": "application/x-ndjson" },
          });
        }
        if (url.endsWith("/cancel"))
          return Response.json({ status: "accepted" });
        if (/\/session\/[^/]+$/.test(url))
          return Response.json({ sessionId: "wrun_1" }, { status: 202 });
        return new Response(null, { status: 404 });
      }
    );
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
  }

  function turn(metadata: Record<string, unknown> | null = null) {
    const updateMetadata = vi.fn(async () => undefined);
    return {
      turn: {
        workspaceId: "ws",
        userId: "u",
        request: new Request("http://app.test/api/chat"),
        conversationId: "c-1",
        body: {},
        conversation: metadata ? ({ metadata } as never) : null,
        trigger: undefined,
        write: () => {},
        updateMetadata,
        agent: { id: "eve", systemPrompt: "" },
        history: async () => [],
      },
      updateMetadata,
    };
  }

  async function drain(stream: ReadableStream<UIMessageChunk>) {
    const out: UIMessageChunk[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
    }
    return out;
  }

  it("creates a session, streams the turn, settles usage and stores the cursor", async () => {
    const { fetchImpl, calls } = fakeEve([
      ev("message.appended", { messageDelta: "hi" }),
      ev("step.completed", {
        finishReason: "stop",
        usage: { inputTokens: 4, outputTokens: 1 },
      }),
      ev("turn.completed", {}),
      ev("session.waiting", {}),
    ]);
    const { turn: t, updateMetadata } = turn();
    const run = eveStreamTurn({
      baseUrl: "https://eve.test",
      fetch: fetchImpl,
    });
    const produced = await run(
      t as never,
      {
        messages: [
          { id: "u", role: "user", parts: [{ type: "text", text: "hello" }] },
        ],
      },
      {
        modelId: "m",
        abortSignal: new AbortController().signal,
        writer: {} as never,
      }
    );
    const chunks = await drain(produced.stream);
    expect(chunks.map((c) => c.type)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
      "finish-step",
    ]);
    await expect(produced.usage).resolves.toEqual({
      inputTokens: 4,
      outputTokens: 1,
      totalTokens: 5,
      finishReason: "stop",
    });
    expect(calls[0]).toMatchObject({
      url: "https://eve.test/eve/v1/session",
      method: "POST",
      body: { message: "hello" },
    });
    expect(calls[1]!.url).toBe(
      "https://eve.test/eve/v1/session/wrun_1/stream?startIndex=0"
    );
    expect(updateMetadata).toHaveBeenCalledWith({
      eve: { sessionId: "wrun_1", streamIndex: 3 },
    });
  });

  it("continues a stored session and answers approvals with input responses", async () => {
    const { fetchImpl, calls } = fakeEve([ev("turn.completed", {})]);
    const { turn: t } = turn({ eve: { sessionId: "wrun_1", streamIndex: 7 } });
    const run = eveStreamTurn({
      baseUrl: "https://eve.test/",
      agent: "support",
      fetch: fetchImpl,
    });
    const produced = await run(
      t as never,
      {
        messages: [
          { id: "u", role: "user", parts: [{ type: "text", text: "go" }] },
          {
            id: "a",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "deleteRows",
                toolCallId: "c9",
                state: "approval-responded",
                input: {},
                approval: { id: "req_A", approved: true },
              } as unknown as UIMessage["parts"][number],
            ],
          },
        ],
      },
      {
        modelId: "m",
        abortSignal: new AbortController().signal,
        writer: {} as never,
      }
    );
    await drain(produced.stream);
    await produced.usage;
    expect(calls[0]).toMatchObject({
      url: "https://eve.test/eve/agents/support/eve/v1/session/wrun_1",
      body: { inputResponses: [{ requestId: "req_A", text: "approve" }] },
    });
    expect(calls[1]!.url).toContain("startIndex=7");
  });

  it("fails the turn when eve fails it", async () => {
    const { fetchImpl } = fakeEve([
      ev("turn.failed", { code: "x", message: "It broke" }),
    ]);
    const { turn: t } = turn();
    const run = eveStreamTurn({
      baseUrl: "https://eve.test",
      fetch: fetchImpl,
    });
    const produced = await run(
      t as never,
      {
        messages: [
          { id: "u", role: "user", parts: [{ type: "text", text: "hello" }] },
        ],
      },
      {
        modelId: "m",
        abortSignal: new AbortController().signal,
        writer: {} as never,
      }
    );
    const chunks = await drain(produced.stream);
    expect(chunks).toEqual([{ type: "error", errorText: "It broke" }]);
    await expect(produced.usage).rejects.toThrow("It broke");
  });
});
