/**
 * The chat transport: one turn, from request to settled execution.
 *
 *   onRequest → parse → authenticate → rate limit → load the row →
 *   resolveAgent → feature gate → create the row → prepareMessages →
 *   executions.begin() → streamText → settle → persist.
 *
 * Framework-agnostic on the request side: Web `Request` in, `Response`
 * out. A Next.js route file is two lines
 * (`export const { POST, DELETE } = createChatHandler(config)`), and a
 * Hono app or a test calls the same functions. The request's headers
 * reach `requireWorkspace()` through `core/request-context`, bound
 * once by the composition root — never through `next/*` here.
 *
 * Entitlement is decided at `executions.begin()`, after the agent and
 * model are resolved, so the hold matches what will actually run
 * (ADR-0003, ADR-0007). Everything before it is cheaper and answers
 * without opening an execution.
 *
 * Every terminal path settles exactly once: `complete()` is
 * compare-and-swap in the boundary, so whichever of finish, abort or
 * error gets there first wins and the others are no-ops.
 */

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import type { StopCondition, ToolSet, UIMessage } from "ai";

import { requireWorkspace } from "@intelligo-dev/auth";
import {
  checkRateLimit,
  getWorkspaceBilling,
  hasFeature,
} from "@intelligo-dev/billing";
import {
  createConversation,
  deleteConversation,
  deleteTrailingMessages,
  getConversation,
  getMessages,
  isConversationServiceError,
  renameConversation,
  upsertMessages,
} from "@intelligo-dev/core/conversations";
import type { Conversation } from "@intelligo-dev/core/conversations";
import { createLogger } from "@intelligo-dev/core/logger";

import { parseChatBody } from "./body";
import type { ChatErrorCode } from "./client";
import type {
  ChatActor,
  ChatServerConfig,
  ChatTurn,
  ChatTurnContext,
  PreparedTurn,
  RateLimitDecision,
  ResolvedAgent,
} from "./config";
import { CHAT_ERROR_STATUS, DEFAULT_CHAT_MESSAGES, refuse } from "./errors";
import type { ChatMessages } from "./errors";
import { lastUserMessage, toUIMessages } from "./messages";
import { truncateTitle } from "./title";
import { pickUsage, sumStepUsage } from "./usage";
import type { TokenUsage } from "./usage";
import { applyConversationWindow, extractText } from "./windowing";

const log = createLogger("Chat");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_FEATURE_KEY = "chat";
const DEFAULT_CAPABILITY = "chat.message";
const DEFAULT_AGENT_ID = "assistant";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant embedded in a SaaS product. Be concise and direct.";
const DEFAULT_MAX_MESSAGE_LENGTH = 8000;
const DEFAULT_MAX_STEPS = 5;
const DEFAULT_WINDOW = { maxMessages: 40 } as const;

async function defaultAuthenticate(): Promise<ChatActor> {
  const { workspace, user } = await requireWorkspace();
  return { workspaceId: workspace.id, userId: user.id };
}

async function defaultRateLimit(actor: ChatActor): Promise<RateLimitDecision> {
  const billing = await getWorkspaceBilling(actor.workspaceId);
  return checkRateLimit(actor.workspaceId, billing.plan?.slug ?? "free");
}

function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {};
  if (decision.limit !== undefined) {
    headers["X-RateLimit-Limit"] = String(decision.limit);
  }
  if (decision.remaining !== undefined) {
    headers["X-RateLimit-Remaining"] = String(decision.remaining);
  }
  if (decision.resetAt !== undefined) {
    headers["X-RateLimit-Reset"] = String(
      Math.ceil(decision.resetAt.getTime() / 1000)
    );
  }
  if (decision.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }
  return headers;
}

// ---------------------------------------------------------------------------
// createChatHandler
// ---------------------------------------------------------------------------

export type ChatHandler = {
  POST: (request: Request) => Promise<Response>;
  DELETE: (request: Request) => Promise<Response>;
};

export function createChatHandler(config: ChatServerConfig): ChatHandler {
  const maxMessageLength =
    config.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH;
  const attachments = config.attachments ?? false;
  const authenticate = config.authenticate ?? defaultAuthenticate;
  const rateLimit =
    config.rateLimit === undefined ? defaultRateLimit : config.rateLimit;
  const deriveTitle = config.deriveTitle ?? truncateTitle;
  const events = config.onTurn ?? {};

  /** Telemetry must never fail a turn. */
  async function emit(run: (() => void | Promise<void>) | undefined) {
    if (!run) return;
    try {
      await run();
    } catch (error) {
      log.warn("onTurn hook threw", { error: errorMessage(error) });
    }
  }

  async function messagesFor(request: Request): Promise<ChatMessages> {
    return config.messages ? config.messages(request) : DEFAULT_CHAT_MESSAGES;
  }

  function refusal(
    t: ChatMessages,
    code: ChatErrorCode,
    error: string,
    where: { actor: ChatActor | null; conversationId: string | null },
    extra: { reasonCode?: string; retryAfterSeconds?: number } = {},
    headers: Record<string, string> = {}
  ): Response {
    void emit(() =>
      events.refuse?.({
        ...where,
        code,
        status: CHAT_ERROR_STATUS[code],
        ...(extra.reasonCode ? { reasonCode: extra.reasonCode } : {}),
      })
    );
    void t;
    return refuse(code, error, extra, headers);
  }

  async function resolveAgent(turn: ChatTurnContext): Promise<ResolvedAgent> {
    if (config.resolveAgent) return config.resolveAgent(turn);
    const shorthand = config.agent ?? {};
    const tools =
      typeof shorthand.tools === "function"
        ? await shorthand.tools(turn)
        : shorthand.tools;
    return {
      // A conversation keeps the agent it was created with.
      id: turn.conversation?.agentId ?? shorthand.id ?? DEFAULT_AGENT_ID,
      systemPrompt: shorthand.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      ...(tools ? { tools } : {}),
    };
  }

  async function prepare(
    turn: ChatTurn,
    incoming: UIMessage[]
  ): Promise<PreparedTurn> {
    if (config.prepareMessages) return config.prepareMessages(turn, incoming);
    const windowing =
      config.windowing === undefined ? DEFAULT_WINDOW : config.windowing;
    if (windowing === false) return { messages: incoming };
    return { messages: applyConversationWindow(incoming, windowing).windowed };
  }

  async function loadRow(
    actor: ChatActor,
    id: string
  ): Promise<
    { ok: true; row: Conversation | null } | { ok: false; error: unknown }
  > {
    try {
      return { ok: true, row: await getConversation(actor, id) };
    } catch (error) {
      if (isConversationServiceError(error) && error.code === "not_found") {
        return { ok: true, row: null };
      }
      return { ok: false, error };
    }
  }

  // -------------------------------------------------------------------------
  // POST — stream a reply
  // -------------------------------------------------------------------------

  async function POST(request: Request): Promise<Response> {
    await config.onRequest?.();
    const t = await messagesFor(request);
    const nowhere = { actor: null, conversationId: null };

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return refusal(t, "BAD_REQUEST", t("invalidBody"), nowhere);
    }
    const parsed = parseChatBody(json, { maxMessageLength, attachments });
    if (!parsed.ok) {
      const { key, params } = parsed.rejection;
      return refusal(t, "BAD_REQUEST", t(key, params), nowhere);
    }
    const body = parsed.body;
    const where = { actor: null as ChatActor | null, conversationId: body.id };

    let actor: ChatActor;
    try {
      actor = await authenticate(request);
    } catch {
      return refusal(t, "UNAUTHORIZED", t("unauthorized"), where);
    }
    where.actor = actor;

    let limitHeaders: Record<string, string> = {};
    if (rateLimit !== false) {
      const decision = await rateLimit(actor);
      limitHeaders = rateLimitHeaders(decision);
      if (!decision.allowed) {
        const seconds = decision.retryAfterSeconds ?? 60;
        return refusal(
          t,
          "RATE_LIMITED",
          t("rateLimited", { seconds }),
          where,
          { retryAfterSeconds: seconds },
          limitHeaders
        );
      }
    }

    const loaded = await loadRow(actor, body.id);
    if (!loaded.ok) {
      // `forbidden` is another tenant's id. Answer as if it did not
      // exist rather than confirm that it does.
      if (
        isConversationServiceError(loaded.error) &&
        loaded.error.code === "forbidden"
      ) {
        return refusal(t, "NOT_FOUND", t("notFound"), where);
      }
      log.error("Failed to load conversation", {
        conversationId: body.id,
        error: errorMessage(loaded.error),
      });
      return refusal(t, "INTERNAL", t("internalError"), where);
    }

    const context: ChatTurnContext = {
      ...actor,
      request,
      conversationId: body.id,
      body: body.extra,
      conversation: loaded.row,
      trigger: body.trigger,
    };

    let agent: ResolvedAgent;
    try {
      agent = await resolveAgent(context);
    } catch (error) {
      log.error("resolveAgent failed", {
        conversationId: body.id,
        error: errorMessage(error),
      });
      await emit(() =>
        events.fail?.({ turn: context, error, phase: "unhandled" })
      );
      return refusal(t, "INTERNAL", t("internalError"), where);
    }

    const featureKey =
      agent.featureKey === undefined
        ? config.featureKey === undefined
          ? DEFAULT_FEATURE_KEY
          : config.featureKey
        : agent.featureKey;
    if (featureKey !== null) {
      const allowed = await hasFeature(actor.workspaceId, featureKey);
      if (!allowed) {
        return refusal(t, "FEATURE_GATED", t("featureGated"), where);
      }
    }

    const modelId = agent.modelId ?? config.model.defaultId;
    const capability =
      agent.capability ?? config.capability ?? DEFAULT_CAPABILITY;
    const maxSteps = agent.maxSteps ?? config.maxSteps ?? DEFAULT_MAX_STEPS;

    // A title that resolves later is applied after the stream — a
    // model-written title must not delay the first token.
    let pendingTitle: Promise<string | null> | null = null;

    if (!loaded.row) {
      const opening = body.messages.find((message) => message.role === "user");
      const titled = deriveTitle(
        opening ? extractText(opening.parts) : "",
        context
      );
      let title: string | null = null;
      if (titled instanceof Promise) pendingTitle = titled;
      else title = titled;
      try {
        context.conversation = await createConversation(actor, {
          id: body.id,
          agentId: agent.id,
          modelId,
          title,
        });
      } catch (error) {
        log.error("Failed to create conversation", {
          conversationId: body.id,
          error: errorMessage(error),
        });
        return refusal(t, "INTERNAL", t("internalError"), where);
      }
    } else if (body.trigger === "regenerate-message") {
      // The client dropped the reply it is regenerating; drop what the
      // row holds after the user message that gets a second answer.
      const user = lastUserMessage(body.messages);
      if (user) {
        try {
          await deleteTrailingMessages(actor, { id: user.id });
        } catch (error) {
          // The user message may never have been persisted (a failed
          // first attempt). Regenerating still makes sense.
          log.warn("Could not trim messages before regenerate", {
            conversationId: body.id,
            error: errorMessage(error),
          });
        }
      }
    }

    const turn: ChatTurn = {
      ...context,
      agent,
      history: async () => toUIMessages(await getMessages(actor, body.id)),
    };

    let prepared: PreparedTurn;
    try {
      prepared = await prepare(turn, body.messages);
    } catch (error) {
      log.error("prepareMessages failed", {
        conversationId: body.id,
        error: errorMessage(error),
      });
      await emit(() => events.fail?.({ turn, error, phase: "unhandled" }));
      return refusal(t, "INTERNAL", t("internalError"), where);
    }

    const metadata = {
      conversationId: body.id,
      agentId: agent.id,
      ...(config.metadata ? config.metadata(turn) : {}),
    };

    // Entitlement, decided against the model that is about to run.
    const run = await config.executions.begin({
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      capability,
      model: modelId,
      metadata,
    });

    if (!run.allowed) {
      // 402 for anything the workspace can fix by paying; 503 when this
      // deployment has no billing configured at all.
      const notConfigured = run.code === "billing_not_configured";
      return refusal(
        t,
        notConfigured ? "BILLING_NOT_CONFIGURED" : "QUOTA_EXCEEDED",
        run.reason ??
          t(notConfigured ? "billingNotConfigured" : "quotaExceeded"),
        where,
        { ...(run.code ? { reasonCode: run.code } : {}) },
        limitHeaders
      );
    }

    const model = await config.model.resolve(modelId, context);
    const modelMessages = await convertToModelMessages(prepared.messages);
    const tools: ToolSet | undefined =
      agent.tools && Object.keys(agent.tools).length > 0
        ? agent.tools
        : undefined;
    const stopWhen: StopCondition<ToolSet>[] = [
      stepCountIs(maxSteps),
      ...(Array.isArray(agent.stopWhen)
        ? agent.stopWhen
        : agent.stopWhen
          ? [agent.stopWhen]
          : []),
    ];

    await emit(() =>
      events.start?.({
        turn,
        executionId: run.id,
        requestId: run.requestId,
        modelId,
      })
    );

    // Whole-run usage, captured from streamText's own `onFinish` (which
    // fires when the model run ends, before the UI stream drains) and
    // read back in the outer `onFinish`. `totalUsage`, not `usage`:
    // with tools bound, `usage` is the LAST step only and a five-step
    // turn would be billed for one.
    let captured:
      | {
          usage: TokenUsage;
          finishReason?: string;
          rawFinishReason?: string;
          providerMetadata?: unknown;
          warnings?: unknown[];
        }
      | undefined;

    const settle = async (
      usage: TokenUsage,
      detail: { aborted: boolean } & Record<string, unknown>
    ) => {
      const normalized = config.normalizeUsage
        ? config.normalizeUsage(usage)
        : usage;
      // Settling can throw (unrecorded usage must not be reported as
      // success). Log and continue so a settlement failure does not
      // also cost the user their message history.
      try {
        await run.complete({
          usage: normalized,
          model: modelId,
          metadata: { ...metadata, aborted: detail.aborted },
        });
      } catch (error) {
        log.error("Execution settlement failed", {
          conversationId: body.id,
          executionId: run.id,
          requestId: run.requestId,
          error: errorMessage(error),
        });
        await emit(() => events.fail?.({ turn, error, phase: "settlement" }));
        return;
      }
      await emit(() =>
        events.complete?.({
          turn,
          executionId: run.id,
          modelId,
          usage: normalized,
          aborted: detail.aborted,
          finishReason: captured?.finishReason,
          rawFinishReason: captured?.rawFinishReason,
          providerMetadata: captured?.providerMetadata,
          warnings: captured?.warnings,
        })
      );
    };

    const applyTitle = async () => {
      if (!pendingTitle) return null;
      try {
        const title = await pendingTitle;
        if (!title) return null;
        // Only while still untitled: two first turns racing must not
        // overwrite each other's title.
        const current = await getConversation(actor, body.id);
        if (current.title !== null) return current.title;
        await renameConversation(actor, body.id, title);
        return title;
      } catch (error) {
        log.warn("Deferred title failed", {
          conversationId: body.id,
          error: errorMessage(error),
        });
        await emit(() => events.fail?.({ turn, error, phase: "title" }));
        return null;
      }
    };

    const stream = createUIMessageStream({
      // Without this, `onFinish` sees only the reply and a tool-approval
      // continuation loses its message id. With it, the finished
      // transcript is the prepared messages plus the reply.
      originalMessages: prepared.messages,
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          system: prepared.system ?? agent.systemPrompt,
          messages: modelMessages,
          ...(tools
            ? {
                tools,
                stopWhen,
                ...(agent.activeTools
                  ? {
                      experimental_activeTools: agent.activeTools as Array<
                        keyof typeof tools
                      >,
                    }
                  : {}),
              }
            : {}),
          // Stop the model when the client goes away. Without this the
          // run continues server-side to completion — billed in full
          // for a reply nobody receives — and `onAbort` never fires.
          abortSignal: request.signal,
          onFinish: ({
            totalUsage,
            finishReason,
            rawFinishReason,
            providerMetadata,
            warnings,
          }) => {
            captured = {
              usage: pickUsage(totalUsage),
              finishReason,
              rawFinishReason,
              providerMetadata,
              warnings: warnings as unknown[] | undefined,
            };
          },
          onAbort: async ({ steps }) => {
            await settle(sumStepUsage(steps), { aborted: true });
          },
        });

        writer.merge(
          result.toUIMessageStream({ sendReasoning: config.reasoning ?? false })
        );

        const title = await applyTitle();
        if (title) {
          writer.write({
            type: "data-chat-title",
            data: title,
            transient: true,
          });
        }
      },
      generateId,
      onFinish: async ({ responseMessage, isContinuation }) => {
        if (captured) {
          await settle(captured.usage, { aborted: false });
        } else {
          // The stream closed without the model run reporting usage and
          // without an abort or error having settled it. Failing
          // releases the hold and leaves a `failed` row an operator can
          // see — settling zero tokens as `succeeded` would hide it.
          void run.fail({ error: new Error("stream ended without usage") });
        }

        if (config.persist === false) return;
        const userMessage = lastUserMessage(body.messages);
        try {
          if (config.persist) {
            await config.persist(turn, {
              userMessage,
              responseMessage,
              isContinuation,
            });
          } else {
            await upsertMessages(body.id, [
              ...(userMessage && !isContinuation ? [userMessage] : []),
              responseMessage,
            ]);
          }
        } catch (error) {
          log.error("Message persistence failed", {
            conversationId: body.id,
            error: errorMessage(error),
          });
          await emit(() =>
            events.fail?.({ turn, error, phase: "persistence" })
          );
        }
      },
      onError: (error) => {
        // fail() is a no-op if complete() already won, so a late error
        // after a settled stream cannot corrupt the row. The AI SDK
        // does not await this callback, so nothing here is.
        void run.fail({ error });
        void emit(() => events.fail?.({ turn, error, phase: "stream" }));
        return t("streamError");
      },
    });

    return createUIMessageStreamResponse({ stream, headers: limitHeaders });
  }

  // -------------------------------------------------------------------------
  // DELETE — remove a conversation
  // -------------------------------------------------------------------------

  async function DELETE(request: Request): Promise<Response> {
    await config.onRequest?.();
    const t = await messagesFor(request);

    let id = new URL(request.url).searchParams.get("id");
    if (!id) {
      try {
        const json = (await request.json()) as { id?: unknown };
        if (typeof json.id === "string") id = json.id;
      } catch {
        // No body: the query string was the only place to look.
      }
    }
    if (!id) {
      return refusal(t, "BAD_REQUEST", t("invalidBody"), {
        actor: null,
        conversationId: null,
      });
    }

    let actor: ChatActor;
    try {
      actor = await authenticate(request);
    } catch {
      return refusal(t, "UNAUTHORIZED", t("unauthorized"), {
        actor: null,
        conversationId: id,
      });
    }

    try {
      await deleteConversation(actor, id);
    } catch (error) {
      if (
        isConversationServiceError(error) &&
        (error.code === "not_found" || error.code === "forbidden")
      ) {
        return refusal(t, "NOT_FOUND", t("notFound"), {
          actor,
          conversationId: id,
        });
      }
      log.error("Failed to delete conversation", {
        conversationId: id,
        error: errorMessage(error),
      });
      return refusal(t, "INTERNAL", t("internalError"), {
        actor,
        conversationId: id,
      });
    }
    return Response.json({ success: true });
  }

  return { POST, DELETE };
}
