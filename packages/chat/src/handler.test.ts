/**
 * The transport, end to end, against fakes for what it composes.
 *
 * Every refusal is a typed JSON body with a fixed status; a turn that
 * streams settles exactly once and persists the user's message as
 * well as the reply.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import type { Executions } from "@intelligo-dev/executions";
import {
  DEFAULT_MODELS,
  clearModels,
  registerModel,
} from "@intelligo-dev/executions/pricing";

import { MockLanguageModelV3, simulateReadableStream } from "ai/test";

import { createChatHandler } from "./handler";
import type { ChatServerConfig } from "./config";
import { createStubLanguageModel } from "./testing";

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  getWorkspaceBilling: vi.fn(),
  checkRateLimit: vi.fn(),
  hasFeature: vi.fn(),
  estimateQuota: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@intelligo-dev/auth", () => ({
  requireWorkspace: mocks.requireWorkspace,
}));
vi.mock("@intelligo-dev/billing", () => ({
  getWorkspaceBilling: mocks.getWorkspaceBilling,
  checkRateLimit: mocks.checkRateLimit,
  hasFeature: mocks.hasFeature,
  estimateQuota: mocks.estimateQuota,
}));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.logError,
  }),
}));

type Row = {
  id: string;
  workspaceId: string;
  userId: string;
  agentId: string;
  modelId: string | null;
  title: string | null;
};
type MessageRow = {
  id: string;
  conversationId: string;
  role: string;
  parts: string;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  messages: [] as MessageRow[],
}));

class FakeConversationServiceError extends Error {
  constructor(
    public code: string,
    message = code
  ) {
    super(message);
  }
}

vi.mock("@intelligo-dev/core/conversations", () => ({
  isConversationServiceError: (e: unknown) =>
    e instanceof FakeConversationServiceError,
  createConversation: async (
    actor: { workspaceId: string; userId: string },
    params: Row
  ) => {
    const row = { ...params, ...actor, title: params.title ?? null } as Row;
    store.rows.set(row.id, row);
    return row;
  },
  getConversation: async (actor: { userId: string }, id: string) => {
    const row = store.rows.get(id);
    if (!row) throw new FakeConversationServiceError("not_found");
    if (row.userId !== actor.userId)
      throw new FakeConversationServiceError("forbidden");
    return row;
  },
  getMessages: async (_actor: unknown, id: string) =>
    store.messages.filter((m) => m.conversationId === id),
  upsertMessages: async (
    id: string,
    finished: Array<{ id: string; role: string; parts: unknown[] }>
  ) => {
    for (const m of finished) {
      store.messages = store.messages.filter((row) => row.id !== m.id);
      store.messages.push({
        id: m.id,
        conversationId: id,
        role: m.role,
        parts: JSON.stringify(m.parts),
        createdAt: new Date(),
      });
    }
  },
  deleteTrailingMessages: vi.fn(async () => ({ deletedCount: 0 })),
  deleteConversation: async (actor: { userId: string }, id: string) => {
    const row = store.rows.get(id);
    if (!row) throw new FakeConversationServiceError("not_found");
    if (row.userId !== actor.userId)
      throw new FakeConversationServiceError("forbidden");
    store.rows.delete(id);
  },
  renameConversation: async (_actor: unknown, id: string, title: string) => {
    const row = store.rows.get(id)!;
    row.title = title;
    return row;
  },
  updateConversationMetadata: vi.fn(async () => undefined),
}));

const attachmentRows = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    workspaceId: string;
    storageKey: string;
    filename: string;
    mediaType: string;
    extractedText: string | null;
  }>,
  attached: vi.fn(async () => undefined),
}));

vi.mock("@intelligo-dev/core/attachments", () => ({
  getAttachments: async (actor: { workspaceId: string }, ids: string[]) =>
    attachmentRows.rows.filter(
      (row) => ids.includes(row.id) && row.workspaceId === actor.workspaceId
    ),
  attachToConversation: attachmentRows.attached,
}));

// Signed URLs come back as data URLs so the SDK does not try to fetch
// them for a mock model that declares no URL support.
vi.mock("@intelligo-dev/core/storage", () => ({
  getStorageAdapter: () => ({
    getSignedUrl: async (key: string) =>
      `data:application/pdf;base64,${Buffer.from(`signed:${key}`).toString("base64")}`,
  }),
}));

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

const MODEL_ID = "google/gemini-2.5-flash";
const CONVERSATION_ID = "0f1e2d3c-4b5a-4f6e-8d7c-9b8a7f6e5d4c";

function stub(reply = "hello there") {
  return createStubLanguageModel({
    modelId: MODEL_ID,
    reply: () => reply,
    chunkDelayInMs: 0,
  });
}

/**
 * A model that keeps the provider-level call options it was given.
 *
 * `createStubLanguageModel` destructures `prompt` and nothing else, so
 * it cannot witness what the transport actually sent — which tools
 * survived `activeTools`, which sampling settings arrived. These are
 * the assertions that tell a seam that works from one that only
 * type-checks.
 */
function recordingModel() {
  return new MockLanguageModelV3({
    provider: "recording",
    modelId: MODEL_ID,
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 0,
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "1" },
          { type: "text-delta", id: "1", delta: "ok" },
          { type: "text-end", id: "1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 1,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
          },
        ] as never[],
      }),
    }),
  });
}

function baseConfig(
  executions: Executions,
  extra: Partial<ChatServerConfig> = {}
): ChatServerConfig {
  return {
    executions,
    model: { defaultId: MODEL_ID, resolve: () => stub() },
    ...extra,
  };
}

function userMessage(text: string, id = "m-user-1"): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function post(body: unknown, init: RequestInit = {}): Request {
  return new Request("http://app.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

function turn(text = "hi", extra: Record<string, unknown> = {}) {
  return post({ id: CONVERSATION_ID, messages: [userMessage(text)], ...extra });
}

beforeEach(() => {
  store.rows.clear();
  store.messages = [];
  attachmentRows.rows = [];
  mocks.requireWorkspace.mockResolvedValue({
    workspace: { id: "ws-1" },
    user: { id: "u-1" },
  });
  mocks.getWorkspaceBilling.mockResolvedValue({ plan: { slug: "free" } });
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    limit: 10,
    remaining: 9,
    resetAt: new Date(0),
  });
  mocks.hasFeature.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  clearModels();
});

describe("POST refusals", () => {
  it("answers 400 to a body that is not a chat turn", async () => {
    const { POST } = createChatHandler(baseConfig(fakeExecutions().executions));
    const response = await POST(post("not json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid request body.",
      code: "BAD_REQUEST",
    });
  });

  it("answers 400 with the limit when the message is too long", async () => {
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, { maxMessageLength: 5 })
    );
    const response = await POST(turn("far too long"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Message is too long (max 5 characters)."
    );
  });

  it("answers 401 when there is no session", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("No active workspace"));
    const { POST } = createChatHandler(baseConfig(fakeExecutions().executions));
    const response = await POST(turn());
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("UNAUTHORIZED");
  });

  it("answers 429 with Retry-After when the plan's limit is hit", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: new Date(60_000),
      retryAfterSeconds: 42,
    });
    const { POST } = createChatHandler(baseConfig(fakeExecutions().executions));
    const response = await POST(turn());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(await response.json()).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 42,
    });
  });

  it("answers 403 when the plan lacks the feature", async () => {
    mocks.hasFeature.mockResolvedValue(false);
    const { POST } = createChatHandler(baseConfig(fakeExecutions().executions));
    const response = await POST(turn());
    expect(response.status).toBe(403);
    expect(mocks.hasFeature).toHaveBeenCalledWith("ws-1", "chat");
  });

  it("skips the gate when featureKey is null", async () => {
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, { featureKey: null })
    );
    const response = await POST(turn());
    expect(response.status).toBe(200);
    expect(mocks.hasFeature).not.toHaveBeenCalled();
    await response.text();
  });

  it("answers 402 with the entitlement code when admission refuses", async () => {
    const refused = fakeExecutions({
      allowed: false,
      code: "insufficient_credits",
      reason: "Not enough credit for one more turn.",
    });
    const refuse = vi.fn();
    const { POST } = createChatHandler(
      baseConfig(refused.executions, { onTurn: { refuse } })
    );
    const response = await POST(turn());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: "Not enough credit for one more turn.",
      code: "QUOTA_EXCEEDED",
      reasonCode: "insufficient_credits",
    });
    await vi.waitFor(() =>
      expect(refuse).toHaveBeenCalledWith(
        expect.objectContaining({ code: "QUOTA_EXCEEDED", status: 402 })
      )
    );
  });

  it("answers 503 when the deployment has no billing configured", async () => {
    const refused = fakeExecutions({
      allowed: false,
      code: "billing_not_configured",
    });
    const { POST } = createChatHandler(baseConfig(refused.executions));
    const response = await POST(turn());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("BILLING_NOT_CONFIGURED");
  });

  it("answers 503 with neutral copy when the model has no registered price", async () => {
    const refused = fakeExecutions({
      allowed: false,
      code: "unknown_model",
      reason: 'Model "acme/ghost" is not registered.',
    });
    const refuse = vi.fn();
    const { POST } = createChatHandler(
      baseConfig(refused.executions, {
        onTurn: { refuse },
        model: {
          defaultId: "acme/ghost",
          resolve: () => stub(),
        },
      })
    );
    const response = await POST(turn());
    expect(response.status).toBe(503);
    // The engine's reason names the registry; the reader never sees it.
    expect(await response.json()).toEqual({
      error: "Chat is temporarily unavailable. Please try again later.",
      code: "MODEL_UNAVAILABLE",
      reasonCode: "unknown_model",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "Model has no registered price",
      expect.objectContaining({ modelId: "acme/ghost" })
    );
    await vi.waitFor(() =>
      expect(refuse).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "MODEL_UNAVAILABLE",
          status: 503,
          reasonCode: "unknown_model",
        })
      )
    );
  });

  it("does not confirm another tenant's conversation exists", async () => {
    store.rows.set(CONVERSATION_ID, {
      id: CONVERSATION_ID,
      workspaceId: "ws-2",
      userId: "u-2",
      agentId: "assistant",
      modelId: null,
      title: null,
    });
    const { POST } = createChatHandler(baseConfig(fakeExecutions().executions));
    const response = await POST(turn());
    expect(response.status).toBe(404);
  });

  it("rejects file parts unless a policy accepts them", async () => {
    const withFile = {
      id: CONVERSATION_ID,
      messages: [
        {
          id: "m-1",
          role: "user",
          parts: [
            { type: "text", text: "look" },
            {
              type: "file",
              mediaType: "image/png",
              url: "data:image/png;base64,AAAA",
            },
          ],
        },
      ],
    };
    const closed = createChatHandler(baseConfig(fakeExecutions().executions));
    expect((await closed.POST(post(withFile))).status).toBe(400);

    const open = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        attachments: { accept: ["image/png"] },
      })
    );
    const response = await open.POST(post(withFile));
    expect(response.status).toBe(200);
    await response.text();
  });

  it("uses the bound translator for refusal copy", async () => {
    mocks.hasFeature.mockResolvedValue(false);
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        messages: () => (key) => `mn:${key}`,
      })
    );
    expect((await (await POST(turn())).json()).error).toBe("mn:featureGated");
  });
});

describe("POST streaming", () => {
  it("creates the row, streams, settles once and persists both turns", async () => {
    const fake = fakeExecutions();
    const start = vi.fn();
    const complete = vi.fn();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, { onTurn: { start, complete } })
    );

    const response = await POST(turn("What is the capital of France?"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    const text = await response.text();
    expect(text).toContain("hello");

    // Entitlement was decided against the model that ran.
    expect(fake.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        userId: "u-1",
        capability: "chat.message",
        model: MODEL_ID,
        metadata: expect.objectContaining({
          conversationId: CONVERSATION_ID,
          agentId: "assistant",
        }),
      })
    );

    await vi.waitFor(() => expect(fake.complete).toHaveBeenCalledTimes(1));
    expect(fake.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL_ID,
        usage: expect.objectContaining({ outputTokens: 2 }),
      })
    );
    expect(fake.fail).not.toHaveBeenCalled();

    // The row, titled from the opening message.
    expect(store.rows.get(CONVERSATION_ID)).toMatchObject({
      agentId: "assistant",
      modelId: MODEL_ID,
      title: "What is the capital of France?",
    });

    // Both turns — the user's message and the reply — not just the reply.
    await vi.waitFor(() => expect(store.messages.length).toBe(2));
    expect(store.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(store.messages[0]!.id).toBe("m-user-1");
    expect(JSON.parse(store.messages[1]!.parts)).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text" })])
    );

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "e-1", modelId: MODEL_ID })
    );
    await vi.waitFor(() =>
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ aborted: false, finishReason: "stop" })
      )
    );
  });

  it("hands resolveAgent the transport's extra fields and the existing row", async () => {
    store.rows.set(CONVERSATION_ID, {
      id: CONVERSATION_ID,
      workspaceId: "ws-1",
      userId: "u-1",
      agentId: "support",
      modelId: MODEL_ID,
      title: "Earlier",
    });
    const resolveAgent = vi.fn(async () => ({
      id: "support",
      systemPrompt: "You are support.",
      featureKey: "support",
      capability: "support.reply",
    }));
    const fake = fakeExecutions();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, { resolveAgent })
    );

    const response = await POST(turn("help", { agentId: "support" }));
    expect(response.status).toBe(200);
    await response.text();

    expect(resolveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { agentId: "support" },
        conversation: expect.objectContaining({ agentId: "support" }),
        conversationId: CONVERSATION_ID,
      })
    );
    expect(mocks.hasFeature).toHaveBeenCalledWith("ws-1", "support");
    expect(fake.begin).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "support.reply" })
    );
  });

  it("lets prepareMessages decide what the model sees, including the system prompt", async () => {
    const seen: string[] = [];
    const fake = fakeExecutions();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, {
        model: {
          defaultId: MODEL_ID,
          resolve: () =>
            createStubLanguageModel({
              modelId: MODEL_ID,
              chunkDelayInMs: 0,
              reply: (_text, prompt) => {
                seen.push(JSON.stringify(prompt));
                return "ok";
              },
            }),
        },
        prepareMessages: async (t, incoming) => ({
          messages: incoming.slice(-1),
          system: `Summary so far. ${t.agent.systemPrompt}`,
        }),
      })
    );
    const response = await POST(
      post({
        id: CONVERSATION_ID,
        messages: [
          userMessage("first", "m-1"),
          {
            id: "m-2",
            role: "assistant",
            parts: [{ type: "text", text: "a" }],
          },
          userMessage("second", "m-3"),
        ],
      })
    );
    await response.text();
    expect(seen[0]).toContain("Summary so far.");
    expect(seen[0]).toContain("second");
    expect(seen[0]).not.toContain("first");
  });

  it("windows a long transcript by default", async () => {
    const seen: string[] = [];
    const fake = fakeExecutions();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, {
        windowing: { maxMessages: 2 },
        model: {
          defaultId: MODEL_ID,
          resolve: () =>
            createStubLanguageModel({
              modelId: MODEL_ID,
              chunkDelayInMs: 0,
              reply: (_t, prompt) => {
                seen.push(JSON.stringify(prompt));
                return "ok";
              },
            }),
        },
      })
    );
    const messages: UIMessage[] = [];
    for (let i = 0; i < 6; i++) {
      messages.push(
        i % 2 === 0
          ? userMessage(`u${i}`, `m-${i}`)
          : {
              id: `m-${i}`,
              role: "assistant",
              parts: [{ type: "text", text: `a${i}` }],
            }
      );
    }
    messages.push(userMessage("last", "m-last"));
    await (await POST(post({ id: CONVERSATION_ID, messages }))).text();
    expect(seen[0]).toContain("last");
    expect(seen[0]).not.toContain("u0");
  });

  it("trims what the row holds after the user turn being regenerated", async () => {
    const conversations = await import("@intelligo-dev/core/conversations");
    store.rows.set(CONVERSATION_ID, {
      id: CONVERSATION_ID,
      workspaceId: "ws-1",
      userId: "u-1",
      agentId: "assistant",
      modelId: MODEL_ID,
      title: "t",
    });
    const { POST } = createChatHandler(baseConfig(fakeExecutions().executions));
    const response = await POST(
      post({
        id: CONVERSATION_ID,
        messages: [userMessage("again", "m-u")],
        trigger: "regenerate-message",
        messageId: "m-a",
      })
    );
    await response.text();
    expect(conversations.deleteTrailingMessages).toHaveBeenCalledWith(
      { workspaceId: "ws-1", userId: "u-1" },
      { id: "m-u" }
    );
  });

  it("applies a deferred title after the stream and tells the client", async () => {
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        deriveTitle: async () => "A model-written title",
      })
    );
    const response = await POST(turn("hi"));
    const text = await response.text();
    expect(text).toContain("data-chat-title");
    expect(text).toContain("A model-written title");
    await vi.waitFor(() =>
      expect(store.rows.get(CONVERSATION_ID)?.title).toBe(
        "A model-written title"
      )
    );
  });

  it("runs the agent's tools and settles whole-run usage", async () => {
    const executed = vi.fn(async () => ({ ok: true }));
    const { jsonSchema, tool } = await import("ai");
    const fake = fakeExecutions();
    let calls = 0;
    const { POST } = createChatHandler(
      baseConfig(fake.executions, {
        agent: {
          systemPrompt: "Use tools.",
          tools: {
            ping: tool({
              description: "ping",
              inputSchema: jsonSchema<{ n: number }>({
                type: "object",
                properties: { n: { type: "number" } },
                required: ["n"],
              }),
              execute: executed,
            }),
          },
        },
        model: {
          defaultId: MODEL_ID,
          resolve: () =>
            createStubLanguageModel({
              modelId: MODEL_ID,
              chunkDelayInMs: 0,
              reply: () => "calling",
              toolCall: () =>
                calls++ === 0 ? { toolName: "ping", input: { n: 1 } } : null,
            }),
        },
      })
    );
    const response = await POST(turn("ping please"));
    await response.text();
    expect(executed).toHaveBeenCalledWith({ n: 1 }, expect.anything());
    await vi.waitFor(() => expect(fake.complete).toHaveBeenCalledTimes(1));
    // Two steps' worth, not the last step only.
    const usage = (
      fake.complete.mock.calls[0]![0] as { usage: { outputTokens: number } }
    ).usage;
    expect(usage.outputTokens).toBe(2);
  });

  it("limits the model to the tools activeTools names", async () => {
    const { jsonSchema, tool } = await import("ai");
    const model = recordingModel();
    const anyTool = (description: string) =>
      tool({
        description,
        inputSchema: jsonSchema<{ n: number }>({
          type: "object",
          properties: { n: { type: "number" } },
          required: ["n"],
        }),
        execute: async () => ({ ok: true }),
      });

    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        resolveAgent: async () => ({
          id: "assistant",
          systemPrompt: "Use tools.",
          tools: { ping: anyTool("ping"), pong: anyTool("pong") },
          activeTools: ["ping"],
        }),
        model: { defaultId: MODEL_ID, resolve: () => model },
      })
    );
    await (await POST(turn("go"))).text();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]!.tools?.map((t) => t.name)).toEqual(["ping"]);
  });

  it("hands the agent's generation settings to the model", async () => {
    const model = recordingModel();
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        agent: {
          systemPrompt: "Be brief.",
          generation: {
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 256,
            seed: 11,
            stopSequences: ["STOP"],
            headers: { "x-trace": "abc" },
          },
        },
        model: { defaultId: MODEL_ID, resolve: () => model },
      })
    );
    await (await POST(turn("go"))).text();

    expect(model.doStreamCalls[0]).toMatchObject({
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 256,
      seed: 11,
      stopSequences: ["STOP"],
      headers: { "x-trace": "abc" },
    });
  });

  it("caps a step at the registered model's output ceiling by default", async () => {
    registerModel({
      ...DEFAULT_MODELS[0]!,
      id: MODEL_ID,
      maxOutputTokens: 4_000,
    });
    const model = recordingModel();
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        agent: { systemPrompt: "Be brief.", generation: { temperature: 0.2 } },
        model: { defaultId: MODEL_ID, resolve: () => model },
      })
    );
    await (await POST(turn("go"))).text();

    // The figure admission sized its hold with.
    expect(model.doStreamCalls[0]!.maxOutputTokens).toBe(4_000);
    expect(model.doStreamCalls[0]!.temperature).toBe(0.2);
  });

  it("lets the agent's own output ceiling replace the registered one", async () => {
    registerModel({
      ...DEFAULT_MODELS[0]!,
      id: MODEL_ID,
      maxOutputTokens: 4_000,
    });
    const model = recordingModel();
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        agent: {
          systemPrompt: "Be brief.",
          generation: { maxOutputTokens: 256 },
        },
        model: { defaultId: MODEL_ID, resolve: () => model },
      })
    );
    await (await POST(turn("go"))).text();

    expect(model.doStreamCalls[0]!.maxOutputTokens).toBe(256);
  });

  it("sets no output ceiling for a model the registry does not hold", async () => {
    const model = recordingModel();
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        model: { defaultId: MODEL_ID, resolve: () => model },
      })
    );
    await (await POST(turn("go"))).text();

    expect(model.doStreamCalls[0]!.maxOutputTokens).toBeUndefined();
  });

  it("does not let a generation setting displace the transport's own", async () => {
    // What a consumer would have to write to try: the type forbids
    // these, so reaching them at all means casting past it. Settlement
    // depends on both — the abort signal stops a run nobody is reading,
    // and the finish handler is where whole-run usage is captured.
    const foreign = new AbortController();
    const onFinish = vi.fn();
    const model = recordingModel();
    const fake = fakeExecutions();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, {
        agent: {
          systemPrompt: "Be brief.",
          generation: {
            temperature: 0.4,
            abortSignal: foreign.signal,
            onFinish,
          } as unknown as NonNullable<ChatServerConfig["agent"]>["generation"],
        },
        model: { defaultId: MODEL_ID, resolve: () => model },
      })
    );
    await (await POST(turn("go"))).text();

    // The allowlisted neighbour arrived; the two forbidden ones did not.
    expect(model.doStreamCalls[0]!.temperature).toBe(0.4);
    expect(model.doStreamCalls[0]!.abortSignal).not.toBe(foreign.signal);
    expect(onFinish).not.toHaveBeenCalled();

    // And the turn still settled exactly once, through the transport.
    await vi.waitFor(() => expect(fake.complete).toHaveBeenCalledTimes(1));
    expect(fake.fail).not.toHaveBeenCalled();
  });

  it("carries every field of the one-agent shorthand, not just four", async () => {
    const fake = fakeExecutions();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, {
        agent: {
          systemPrompt: "Be brief.",
          modelId: MODEL_ID,
          maxSteps: 3,
          capability: "support.reply",
          featureKey: null,
        },
      })
    );
    const response = await POST(turn("go"));
    expect(response.status).toBe(200);
    await response.text();

    expect(mocks.hasFeature).not.toHaveBeenCalled();
    expect(fake.begin).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "support.reply", model: MODEL_ID })
    );
  });

  it("runs a tool-less turn in one step, whatever stopWhen says", async () => {
    // The SDK consults `stopWhen` only "when there are tool results in
    // the last step". With no tools there never are, so the condition
    // is not reached — pinned here so a reader does not take its
    // absence from the call for a bug and "fix" it.
    const { stepCountIs } = await import("ai");
    const model = recordingModel();
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        agent: { systemPrompt: "Be brief.", stopWhen: stepCountIs(9) },
        model: { defaultId: MODEL_ID, resolve: () => model },
      })
    );
    await (await POST(turn("go"))).text();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]!.tools).toBeUndefined();
  });

  it("does not persist when persist is false", async () => {
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, { persist: false })
    );
    await (await POST(turn())).text();
    await new Promise((r) => setTimeout(r, 10));
    expect(store.messages).toEqual([]);
  });
});

describe("DELETE", () => {
  function del(id: string | null) {
    return new Request(`http://app.test/api/chat${id ? `?id=${id}` : ""}`, {
      method: "DELETE",
    });
  }

  it("removes the caller's conversation", async () => {
    store.rows.set(CONVERSATION_ID, {
      id: CONVERSATION_ID,
      workspaceId: "ws-1",
      userId: "u-1",
      agentId: "assistant",
      modelId: null,
      title: null,
    });
    const { DELETE } = createChatHandler(
      baseConfig(fakeExecutions().executions)
    );
    const response = await DELETE(del(CONVERSATION_ID));
    expect(response.status).toBe(200);
    expect(store.rows.has(CONVERSATION_ID)).toBe(false);
  });

  it("answers 404 for a missing or foreign conversation, 400 for no id", async () => {
    const { DELETE } = createChatHandler(
      baseConfig(fakeExecutions().executions)
    );
    expect((await DELETE(del(CONVERSATION_ID))).status).toBe(404);
    expect((await DELETE(del(null))).status).toBe(400);
  });

  it("answers 401 without a session", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("No active workspace"));
    const { DELETE } = createChatHandler(
      baseConfig(fakeExecutions().executions)
    );
    expect((await DELETE(del(CONVERSATION_ID))).status).toBe(401);
  });
});

function uiChunks(chunks: unknown[]): ReadableStream<never> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk as never);
      controller.close();
    },
  });
}

describe("streamTurn", () => {
  it("refuses a config with neither a model nor a runtime", () => {
    expect(() =>
      createChatHandler({
        executions: fakeExecutions().executions,
        model: { defaultId: MODEL_ID },
      })
    ).toThrow(/model\.resolve.*streamTurn/);
  });

  it("frames the runtime's chunks, settles once from its usage and persists both turns", async () => {
    const fake = fakeExecutions();
    const streamTurn = vi.fn(async () => ({
      stream: uiChunks([
        { type: "start", messageId: "runtime-picked-this" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "from the runtime" },
        { type: "text-end", id: "t1" },
        { type: "finish" },
      ]),
      usage: Promise.resolve({
        inputTokens: 7,
        outputTokens: 3,
        totalTokens: 10,
        modelId: "runtime/model",
        finishReason: "stop",
      }),
    }));
    const { POST } = createChatHandler({
      executions: fake.executions,
      model: { defaultId: MODEL_ID },
      streamTurn,
    });

    const response = await POST(turn("hello runtime"));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("from the runtime");
    // The runtime's own frames are dropped; the transport's carry the id.
    expect(text).not.toContain("runtime-picked-this");
    expect(streamTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID }),
      expect.objectContaining({ messages: expect.any(Array) }),
      expect.objectContaining({ modelId: MODEL_ID })
    );

    await vi.waitFor(() => expect(fake.complete).toHaveBeenCalledTimes(1));
    expect(fake.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "runtime/model",
        usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
      })
    );
    expect(fake.fail).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(store.messages.length).toBe(2));
    const reply = JSON.parse(store.messages[1]!.parts) as unknown[];
    expect(reply).toEqual([
      expect.objectContaining({ type: "text", text: "from the runtime" }),
    ]);
    // Message metadata rode on the finish frame.
    expect(text).toContain('"messageMetadata"');
    expect(text).toContain('"modelId":"runtime/model"');
  });

  it("lets a tool write parts mid-turn and drops writes outside the stream", async () => {
    const fake = fakeExecutions();
    let captured: import("./config").ChatTurn | null = null;
    const { POST } = createChatHandler({
      executions: fake.executions,
      model: { defaultId: MODEL_ID },
      streamTurn: async (t) => {
        captured = t;
        t.write({ type: "data-chat-status", data: { label: "Working" } });
        return {
          stream: uiChunks([
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "ok" },
            { type: "text-end", id: "t1" },
          ]),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
        };
      },
    });
    const text = await (await POST(turn())).text();
    expect(text).toContain('"data-chat-status"');
    expect(text).toContain("Working");
    await vi.waitFor(() => expect(fake.complete).toHaveBeenCalledTimes(1));
    // After the stream: silently ignored, never thrown.
    expect(() =>
      captured!.write({ type: "data-chat-status", data: { label: "late" } })
    ).not.toThrow();
  });

  it("fails the execution when the runtime's usage rejects", async () => {
    const fake = fakeExecutions();
    const { POST } = createChatHandler({
      executions: fake.executions,
      model: { defaultId: MODEL_ID },
      streamTurn: async () => ({
        stream: uiChunks([]),
        usage: Promise.reject(new Error("runtime exploded")),
      }),
    });
    const response = await POST(turn());
    await response.text();
    await vi.waitFor(() => expect(fake.fail).toHaveBeenCalled());
    expect(fake.complete).not.toHaveBeenCalled();
  });
});

describe("model choice", () => {
  const models = {
    options: [
      { id: MODEL_ID, label: "Fast" },
      {
        id: "anthropic/claude-sonnet-4-6",
        label: "Smart",
        featureKey: "pro-models",
      },
    ],
  };

  it("runs the requested model when it is on the list", async () => {
    const fake = fakeExecutions();
    const { POST } = createChatHandler(baseConfig(fake.executions, { models }));
    mocks.hasFeature.mockResolvedValue(true);
    const response = await POST(
      turn("hi", { modelId: "anthropic/claude-sonnet-4-6" })
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.hasFeature).toHaveBeenCalledWith("ws-1", "pro-models");
    expect(fake.begin).toHaveBeenCalledWith(
      expect.objectContaining({ model: "anthropic/claude-sonnet-4-6" })
    );
  });

  it("refuses a model off the list or behind a feature the plan lacks", async () => {
    const fake = fakeExecutions();
    const { POST } = createChatHandler(baseConfig(fake.executions, { models }));

    const unknown = await POST(turn("hi", { modelId: "openai/o4-mini" }));
    expect(unknown.status).toBe(403);
    expect(await unknown.json()).toMatchObject({
      code: "FEATURE_GATED",
      reasonCode: "model_not_allowed",
    });

    mocks.hasFeature.mockImplementation(
      async (_ws: string, key: string) => key !== "pro-models"
    );
    const gated = await POST(
      turn("hi", { modelId: "anthropic/claude-sonnet-4-6" })
    );
    expect(gated.status).toBe(403);
    expect(fake.begin).not.toHaveBeenCalled();
  });

  it("ignores a requested model when no list is configured", async () => {
    const fake = fakeExecutions();
    const { POST } = createChatHandler(baseConfig(fake.executions));
    await (await POST(turn("hi", { modelId: "openai/o4-mini" }))).text();
    expect(fake.begin).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL_ID })
    );
  });
});

describe("cross-origin, resumption and continuation", () => {
  it("answers CORS headers only for a listed origin", async () => {
    const { POST, OPTIONS, GET } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        cors: { origins: ["https://widget.example"] },
      })
    );
    const preflight = await OPTIONS(
      new Request("http://app.test/api/chat", {
        method: "OPTIONS",
        headers: { origin: "https://widget.example" },
      })
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://widget.example"
    );
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );

    const stranger = await OPTIONS(
      new Request("http://app.test/api/chat", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example" },
      })
    );
    expect(stranger.headers.get("Access-Control-Allow-Origin")).toBeNull();

    const streamed = await POST(turn("hi", {}));
    expect(streamed.headers.get("Access-Control-Allow-Origin")).toBeNull();
    await streamed.text();

    const resume = await GET(
      new Request(`http://app.test/api/chat?chatId=${CONVERSATION_ID}`, {
        headers: { origin: "https://widget.example" },
      })
    );
    expect(resume.status).toBe(204);
    expect(resume.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://widget.example"
    );
  });

  it("reports approval answers from a continuation to the audit hook", async () => {
    const approval = vi.fn();
    const fake = fakeExecutions();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, { onTurn: { approval } })
    );
    store.rows.set(CONVERSATION_ID, {
      id: CONVERSATION_ID,
      workspaceId: "ws-1",
      userId: "u-1",
      agentId: "assistant",
      modelId: MODEL_ID,
      title: "t",
    });
    const assistant: UIMessage = {
      id: "m-assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-deleteRows",
          toolCallId: "call-1",
          state: "approval-responded",
          input: { table: "users" },
          approval: { id: "appr-1", approved: false, reason: "not now" },
        } as unknown as UIMessage["parts"][number],
      ],
    };
    const response = await POST(
      post({
        id: CONVERSATION_ID,
        messages: [userMessage("delete them"), assistant],
        trigger: "submit-message",
        messageId: "m-assistant-1",
      })
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(approval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "deleteRows",
        toolCallId: "call-1",
        approvalId: "appr-1",
        approved: false,
        reason: "not now",
      })
    );
  });
});

describe("stored attachments", () => {
  const policy = {
    accept: ["image/png", "application/pdf"],
    mode: "stored" as const,
  };

  it("signs the file for the model, persists the app URL and ties the row to the conversation", async () => {
    attachmentRows.rows = [
      {
        id: "att-1",
        workspaceId: "ws-1",
        storageKey: "ws/ws-1/att/att-1",
        filename: "q3.pdf",
        mediaType: "application/pdf",
        extractedText: "Revenue grew 12%",
      },
    ];
    const seen: unknown[] = [];
    const fake = fakeExecutions();
    const { POST } = createChatHandler(
      baseConfig(fake.executions, {
        attachments: policy,
        model: {
          defaultId: MODEL_ID,
          resolve: () =>
            createStubLanguageModel({
              modelId: MODEL_ID,
              chunkDelayInMs: 0,
              reply: (_text, prompt) => {
                seen.push(...prompt);
                return "read it";
              },
            }),
        },
      })
    );
    const message: UIMessage = {
      id: "m-user-1",
      role: "user",
      parts: [
        { type: "text", text: "Summarise" },
        {
          type: "file",
          mediaType: "application/pdf",
          filename: "q3.pdf",
          url: "/api/chat/attachments/att-1",
        },
      ],
    };
    const response = await POST(
      post({ id: CONVERSATION_ID, messages: [message] })
    );
    expect(response.status).toBe(200);
    await response.text();

    const prompt = JSON.stringify(seen);
    expect(prompt).toContain(
      Buffer.from("signed:ws/ws-1/att/att-1").toString("base64")
    );
    expect(prompt).toContain("Revenue grew 12%");

    await vi.waitFor(() => expect(store.messages.length).toBe(2));
    const persisted = store.messages[0]!.parts;
    expect(persisted).toContain("/api/chat/attachments/att-1");
    expect(persisted).not.toContain("base64");
    await vi.waitFor(() =>
      expect(attachmentRows.attached).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1" }),
        { ids: ["att-1"], conversationId: CONVERSATION_ID }
      )
    );
  });

  it("rejects a data URL in stored mode and a URL of another tenant's file", async () => {
    attachmentRows.rows = [
      {
        id: "att-2",
        workspaceId: "ws-2",
        storageKey: "ws/ws-2/att/att-2",
        filename: "secret.png",
        mediaType: "image/png",
        extractedText: null,
      },
    ];
    const seen: unknown[] = [];
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, {
        attachments: policy,
        model: {
          defaultId: MODEL_ID,
          resolve: () =>
            createStubLanguageModel({
              modelId: MODEL_ID,
              chunkDelayInMs: 0,
              reply: (_t, prompt) => {
                seen.push(...prompt);
                return "ok";
              },
            }),
        },
      })
    );
    const inline = await POST(
      post({
        id: CONVERSATION_ID,
        messages: [
          {
            id: "m",
            role: "user",
            parts: [
              {
                type: "file",
                mediaType: "image/png",
                url: "data:image/png;base64,AAAA",
              },
            ],
          },
        ],
      })
    );
    expect(inline.status).toBe(400);

    const foreign = await POST(
      post({
        id: CONVERSATION_ID,
        messages: [
          {
            id: "m",
            role: "user",
            parts: [
              { type: "text", text: "look" },
              {
                type: "file",
                mediaType: "image/png",
                url: "/api/chat/attachments/att-2",
              },
            ],
          },
        ],
      })
    );
    expect(foreign.status).toBe(200);
    await foreign.text();
    expect(JSON.stringify(seen)).not.toContain("att-2");
  });
});
