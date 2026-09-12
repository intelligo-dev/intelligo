/**
 * The transport, end to end, against fakes for what it composes.
 *
 * Every refusal is a typed JSON body with a fixed status; a turn that
 * streams settles exactly once and persists the user's message as
 * well as the reply — the route this package replaced silently
 * dropped the user turn.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import type { Executions } from "@intelligo-dev/executions";

import { createChatHandler } from "./handler";
import type { ChatServerConfig } from "./config";
import { createStubLanguageModel } from "./testing";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  getWorkspaceBilling: vi.fn(),
  checkRateLimit: vi.fn(),
  hasFeature: vi.fn(),
  estimateQuota: vi.fn(),
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
    error: vi.fn(),
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

afterEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// A turn that streams
// ---------------------------------------------------------------------------

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

  it("does not persist when persist is false", async () => {
    const { POST } = createChatHandler(
      baseConfig(fakeExecutions().executions, { persist: false })
    );
    await (await POST(turn())).text();
    await new Promise((r) => setTimeout(r, 10));
    expect(store.messages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

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
