/**
 * The Mastra binding, pinned against a real Mastra agent on a mock
 * model: a tool loop settles every step's usage, a stopped turn
 * settles the steps that finished, memory sends the new message under
 * the workspace and the user, and the transport's options win.
 */

import { describe, expect, it } from "vitest";
import { Agent, type AgentExecutionOptions } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import type { UIMessage, UIMessageChunk } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";

import type { ChatTurn, PreparedTurn } from "@intelligo-dev/chat";

import {
  chatActorOf,
  mastraStreamTurn,
} from "../base/chat-mastra/lib/chat-mastra";

type Part = Record<string, unknown>;

const usage = (
  input: number,
  output: number,
  cache: { read?: number; write?: number } = {}
) => ({
  inputTokens: {
    total: input,
    noCache: undefined,
    cacheRead: cache.read,
    cacheWrite: cache.write,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

const toolStep = (input: number, output: number): Part[] => [
  { type: "stream-start", warnings: [] },
  {
    type: "tool-call",
    toolCallId: "call-1",
    toolName: "lookup",
    input: JSON.stringify({ q: "rates" }),
  },
  {
    type: "finish",
    finishReason: { unified: "tool-calls", raw: undefined },
    usage: usage(input, output),
  },
];

const textStep = (text: string, input: number, output: number): Part[] => [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  {
    type: "finish",
    finishReason: { unified: "stop", raw: undefined },
    usage: usage(input, output),
  },
];

function streamOf(parts: Part[]): ReadableStream<Part> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

/** A model answering each call with the next of `steps`; a missing one never ends. */
function modelOf(steps: Part[][]) {
  let call = 0;
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-model",
    doStream: async ({ abortSignal }) => {
      const parts = steps[call++];
      const stream = parts
        ? streamOf(parts)
        : new ReadableStream<Part>({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              abortSignal?.addEventListener("abort", () =>
                controller.error(new DOMException("aborted", "AbortError"))
              );
            },
          });
      return { stream } as never;
    },
  });
}

const lookup = createTool({
  id: "lookup",
  description: "Looks something up.",
  inputSchema: z.object({ q: z.string() }),
  execute: async () => ({ rate: 42 }),
});

function agentOf(steps: Part[][]) {
  return new Agent({
    id: "assistant",
    name: "assistant",
    instructions: "You help.",
    model: modelOf(steps),
    tools: { lookup },
  });
}

const user = (text: string, id = "u1"): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const turn = {
  conversationId: "conv-1",
  workspaceId: "ws-1",
  userId: "user-1",
} as unknown as ChatTurn;

function context(
  signal = new AbortController().signal,
  allow: { reasoning?: boolean; sources?: boolean } = {}
) {
  return {
    modelId: "mock/mock-model",
    abortSignal: signal,
    writer: {} as never,
    reasoning: allow.reasoning ?? false,
    sources: allow.sources ?? false,
  };
}

async function readAll(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

describe("mastraStreamTurn", () => {
  it("renders a tool loop and settles every step's usage, not the last", async () => {
    const streamTurn = mastraStreamTurn({
      agent: agentOf([toolStep(10, 3), textStep("The rate is 42.", 20, 5)]),
      maxSteps: 4,
    });
    const produced = await streamTurn(
      turn,
      { messages: [user("What is the rate?")] },
      context()
    );
    const chunks = await readAll(produced.stream);

    const types = chunks.map((c) => c.type);
    expect(types).toContain("tool-input-available");
    expect(types).toContain("tool-output-available");
    expect(
      chunks
        .filter((c) => c.type === "text-delta")
        .map((c) => (c as { delta: string }).delta)
        .join("")
    ).toBe("The rate is 42.");
    await expect(produced.usage).resolves.toEqual({
      inputTokens: 30,
      outputTokens: 8,
      totalTokens: 38,
    });
  });

  it("gives a tool the turn's actor", async () => {
    const seen: unknown[] = [];
    const whoAmI = createTool({
      id: "lookup",
      description: "Looks something up.",
      inputSchema: z.object({ q: z.string() }),
      execute: async (_input, toolContext) => {
        seen.push(chatActorOf(toolContext));
        return { ok: true };
      },
    });
    const agent = new Agent({
      id: "assistant",
      name: "assistant",
      instructions: "You help.",
      model: modelOf([toolStep(1, 1), textStep("Done.", 1, 1)]),
      tools: { lookup: whoAmI },
    });
    const produced = await mastraStreamTurn({ agent, maxSteps: 3 })(
      turn,
      { messages: [user("Who am I?")] },
      context()
    );
    await readAll(produced.stream);
    expect(seen).toEqual([
      { workspaceId: "ws-1", userId: "user-1", conversationId: "conv-1" },
    ]);
  });

  it("refuses a tool call with no actor in its context", () => {
    expect(() => chatActorOf({})).toThrow(/mastraStreamTurn/);
    const partial = new RequestContext();
    partial.set("workspaceId", "ws-1");
    expect(() => chatActorOf({ requestContext: partial })).toThrow();
    const noConversation = new RequestContext();
    noConversation.set("workspaceId", "ws-1");
    noConversation.set("userId", "user-1");
    expect(chatActorOf({ requestContext: noConversation })).toEqual({
      workspaceId: "ws-1",
      userId: "user-1",
    });
  });

  it("renders reasoning only when the transport allows it", async () => {
    const reasoningStep: Part[] = [
      { type: "stream-start", warnings: [] },
      { type: "reasoning-start", id: "r" },
      { type: "reasoning-delta", id: "r", delta: "Thinking it over." },
      { type: "reasoning-end", id: "r" },
      ...textStep("Done.", 4, 2).slice(1),
    ];
    const typesWith = async (reasoning: boolean) => {
      const produced = await mastraStreamTurn({
        agent: agentOf([reasoningStep]),
      })(turn, { messages: [user("Hi")] }, context(undefined, { reasoning }));
      return (await readAll(produced.stream)).map((c) => c.type);
    };
    expect(await typesWith(true)).toContain("reasoning-delta");
    expect(await typesWith(false)).not.toContain("reasoning-delta");
  });

  it("settles the prompt-cache counts Mastra reports", async () => {
    const cachedText: Part[] = [
      ...textStep("Hi.", 0, 0).slice(0, -1),
      {
        type: "finish",
        finishReason: { unified: "stop", raw: undefined },
        usage: usage(100, 5, { read: 70, write: 20 }),
      },
    ];
    const produced = await mastraStreamTurn({ agent: agentOf([cachedText]) })(
      turn,
      { messages: [user("Hi")] },
      context()
    );
    await readAll(produced.stream);
    await expect(produced.usage).resolves.toMatchObject({
      inputTokens: 100,
      outputTokens: 5,
      cacheReadTokens: 70,
      cacheWriteTokens: 20,
    });
  });

  it("settles the finished steps of a turn the reader stopped", async () => {
    const controller = new AbortController();
    const streamTurn = mastraStreamTurn({
      // The second model call never ends on its own.
      agent: agentOf([toolStep(10, 3)]),
      maxSteps: 4,
    });
    const produced = await streamTurn(
      turn,
      { messages: [user("What is the rate?")] },
      context(controller.signal)
    );
    // Stopped while the second model call runs: the first step, its
    // tool included, has finished.
    const reader = produced.stream.getReader();
    for (;;) {
      const { value } = await reader.read();
      if (value?.type === "finish-step") break;
    }
    controller.abort();
    await reader.cancel();

    await expect(produced.usage).resolves.toEqual({
      inputTokens: 10,
      outputTokens: 3,
      totalTokens: 13,
    });
  });

  it("fails a turn that spent nothing", async () => {
    const agent = new Agent({
      id: "assistant",
      name: "assistant",
      instructions: "You help.",
      model: new MockLanguageModelV3({
        doStream: async () => {
          throw new Error("provider down");
        },
      }),
    });
    const produced = await mastraStreamTurn({ agent })(
      turn,
      { messages: [user("Hi")] },
      context()
    );
    await readAll(produced.stream).catch(() => []);
    await expect(produced.usage).rejects.toThrow();
  });

  describe("what agent.stream is given", () => {
    function capture() {
      const calls: { messages: unknown; options: AgentExecutionOptions }[] = [];
      const real = agentOf([textStep("Hello.", 1, 1)]);
      const agent = {
        stream: (messages: unknown, options: AgentExecutionOptions) => {
          calls.push({ messages, options });
          return real.stream(messages as never, options as never);
        },
      } as unknown as Agent;
      return { agent, calls };
    }

    const prepared: PreparedTurn = {
      messages: [
        user("First", "u1"),
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Reply" }],
        },
        user("Second", "u2"),
      ],
      system: "Summary so far: …",
    };

    it("puts the turn's actor in the request context, over the product's own values", async () => {
      const { agent, calls } = capture();
      const own = new RequestContext();
      own.set("plan", "pro");
      own.set("workspaceId", "ws-forged");
      const produced = await mastraStreamTurn({
        agent,
        streamOptions: () => ({ requestContext: own }),
      })(turn, prepared, context());
      await readAll(produced.stream);
      const sent = calls[0]!.options.requestContext as RequestContext;
      expect(sent.get("plan")).toBe("pro");
      expect(chatActorOf({ requestContext: sent })).toEqual({
        workspaceId: "ws-1",
        userId: "user-1",
        conversationId: "conv-1",
      });
      expect(JSON.parse(JSON.stringify(sent.toJSON()))).toMatchObject({
        workspaceId: "ws-1",
        userId: "user-1",
        conversationId: "conv-1",
      });
    });

    it("sends every message without memory, and the prepared system prompt", async () => {
      const { agent, calls } = capture();
      const produced = await mastraStreamTurn({ agent })(
        turn,
        prepared,
        context()
      );
      await readAll(produced.stream);
      expect(calls[0]!.messages).toHaveLength(3);
      expect(calls[0]!.options.instructions).toBe("Summary so far: …");
      expect(calls[0]!.options.memory).toBeUndefined();
    });

    it("with memory, sends the new message under the workspace and the user", async () => {
      const { agent, calls } = capture();
      const produced = await mastraStreamTurn({ agent, memory: true })(
        turn,
        prepared,
        context()
      );
      await readAll(produced.stream);
      expect(calls[0]!.messages).toEqual([prepared.messages[2]]);
      expect(calls[0]!.options.memory).toEqual({
        thread: "conv-1",
        resource: "ws-1:user-1",
      });
    });

    it("keeps the abort signal and the step cap its own", async () => {
      const { agent, calls } = capture();
      const signal = new AbortController().signal;
      const produced = await mastraStreamTurn({
        agent: async () => agent,
        maxSteps: 3,
        streamOptions: () =>
          ({
            abortSignal: new AbortController().signal,
            maxSteps: 99,
            toolChoice: "none",
          }) as never,
      })(turn, { messages: [user("Hi")] }, context(signal));
      await readAll(produced.stream);
      expect(calls[0]!.options.abortSignal).toBe(signal);
      expect(calls[0]!.options.maxSteps).toBe(3);
      expect(calls[0]!.options.toolChoice).toBe("none");
    });
  });
});
