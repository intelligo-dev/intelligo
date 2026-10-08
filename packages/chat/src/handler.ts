/**
 * The chat transport: one turn, from request to settled execution.
 *
 *   onRequest → parse → authenticate → rate limit → load the row →
 *   resolveAgent → feature gate → model gate → create the row →
 *   prepareMessages → executions.begin() → streamText | streamTurn →
 *   settle → persist.
 *
 * Web `Request` in, `Response` out; request headers reach
 * `requireWorkspace()` through `core/request-context`, never `next/*`.
 *
 * Entitlement is decided at `executions.begin()`, after the agent and
 * model are resolved, so the hold matches what will actually run.
 * Everything before it is cheaper and answers without opening an execution.
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
import type {
  ActiveTools,
  InferUIMessageChunk,
  StopCondition,
  ToolSet,
  UIMessage,
  UIMessageChunk,
  UIMessageStreamWriter,
} from "ai";

import { requireWorkspace } from "@intelligo-dev/auth";
import {
  checkRateLimit,
  getWorkspaceBilling,
  hasFeature,
} from "@intelligo-dev/billing";
import {
  attachToConversation,
  getAttachments,
} from "@intelligo-dev/core/attachments";
import {
  createConversation,
  deleteConversation,
  deleteTrailingMessages,
  getConversation,
  getMessage,
  getMessages,
  getMessagesByIds,
  isConversationServiceError,
  renameConversation,
  updateConversationMetadata,
  upsertMessages,
} from "@intelligo-dev/core/conversations";
import type { Conversation } from "@intelligo-dev/core/conversations";
import { createLogger } from "@intelligo-dev/core/logger";
import { getStorageAdapter } from "@intelligo-dev/core/storage";
import {
  UnknownModelError,
  getModelPricing,
  isModelRegistered,
  registeredModelIds,
} from "@intelligo-dev/executions/pricing";

import {
  ATTACHMENT_MAX_BYTES,
  attachmentIdFromUrl,
  fileAccepted,
  parseChatBody,
} from "./body";
import { readJsonUpTo } from "./read-body";
import type { ChatAttachmentPolicy } from "./body";
import type { ChatErrorCode, ChatModelOption } from "./client";
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
import { pickGenerationOptions } from "./generation";
import { hasElidedFile } from "./elide";
import { trustedContinuation } from "./continuation";
import { lastUserMessage, restoreElidedFiles, toUIMessages } from "./messages";
import type {
  ChatDataChunk,
  ChatMessageMetadata,
  ChatUIMessage,
} from "./parts";
import { truncateTitle } from "./title";
import { inFlightTracker, pickUsage, sumUsage } from "./usage";
import type { TokenUsage } from "./usage";
import {
  applyConversationWindow,
  estimateConversationTokens,
  estimateTokenCount,
  extractText,
} from "./windowing";

const log = createLogger("Chat");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_FEATURE_KEY = "chat";
const DEFAULT_CAPABILITY = "chat.message";
/** Capability of the execution recording a turn's embedding-model usage. */
const EMBEDDING_CAPABILITY = "chat.embedding";
const DEFAULT_AGENT_ID = "assistant";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant embedded in a SaaS product. Be concise and direct.";
const DEFAULT_MAX_MESSAGE_LENGTH = 8000;
const DEFAULT_MAX_STEPS = 5;
/**
 * Admission holds the price of a 16K-token input; the history is kept
 * under 12K of it, leaving the rest to the system prompt and tools.
 */
const DEFAULT_WINDOW = { maxMessages: 40, maxTokens: 12_000 } as const;
const MODEL_URL_SECONDS = 900;
/** The transcript `useChat` resends each turn: text and tool payloads. */
const TRANSCRIPT_BODY_BYTES = 8 * 1024 * 1024;
/** Inline files one request may carry at the policy's size. */
const INLINE_FILES_PER_BODY = 4;
/** A DELETE body names one id. */
const DELETE_BODY_BYTES = 16 * 1024;

/** `maxBodyBytes` when the config names none. */
function defaultBodyLimit(policy: ChatAttachmentPolicy | false): number {
  if (policy === false || policy.mode === "stored") {
    return TRANSCRIPT_BODY_BYTES;
  }
  // A data URL carries its bytes as base64: four characters per three.
  const encoded = Math.ceil((policy.maxBytes ?? ATTACHMENT_MAX_BYTES) / 3) * 4;
  return TRANSCRIPT_BODY_BYTES + INLINE_FILES_PER_BODY * encoded;
}

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

/**
 * The `start` and `finish` frames are the transport's: it writes them
 * around whatever a `streamTurn` produces, so the response id and the
 * message metadata are its own. A runtime whose adapter frames the
 * message itself is not asked to strip anything.
 */
function withoutFrames<CHUNK extends { type: string }>(
  stream: ReadableStream<CHUNK>
): ReadableStream<CHUNK> {
  return stream.pipeThrough(
    new TransformStream<CHUNK, CHUNK>({
      transform(chunk, controller) {
        if (chunk.type !== "start" && chunk.type !== "finish") {
          controller.enqueue(chunk);
        }
      },
    })
  );
}

type ApprovalAnswer = {
  toolName: string;
  toolCallId: string;
  approvalId: string;
  approved: boolean;
  reason?: string;
};

/** The approval answers a continuation carries, from the last assistant message. */
function approvalAnswers(messages: ReadonlyArray<UIMessage>): ApprovalAnswer[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return [];
  const answers: ApprovalAnswer[] = [];
  for (const raw of last.parts) {
    const part = raw as unknown as Record<string, unknown>;
    if (part.state !== "approval-responded") continue;
    const approval = part.approval as
      { id?: unknown; approved?: unknown; reason?: unknown } | undefined;
    if (
      !approval ||
      typeof approval.id !== "string" ||
      typeof approval.approved !== "boolean"
    ) {
      continue;
    }
    const toolName =
      part.type === "dynamic-tool" && typeof part.toolName === "string"
        ? part.toolName
        : typeof part.type === "string" && part.type.startsWith("tool-")
          ? part.type.slice("tool-".length)
          : "";
    answers.push({
      toolName,
      toolCallId: typeof part.toolCallId === "string" ? part.toolCallId : "",
      approvalId: approval.id,
      approved: approval.approved,
      ...(typeof approval.reason === "string"
        ? { reason: approval.reason }
        : {}),
    });
  }
  return answers;
}

/** The stored attachment ids a transcript's file parts name. */
function storedAttachmentIds(
  messages: ReadonlyArray<UIMessage>,
  policy: ChatAttachmentPolicy
): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "file") continue;
      const id = attachmentIdFromUrl(policy, part.url);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export type ChatHandler = {
  POST: (request: Request) => Promise<Response>;
  DELETE: (request: Request) => Promise<Response>;
  /** Stream resumption. Answers 204: no turn is resumable on this transport. */
  GET: (request: Request) => Promise<Response>;
  /** The CORS preflight, when `cors` is configured; 204 otherwise. */
  OPTIONS: (request: Request) => Promise<Response>;
};

export function createChatHandler(config: ChatServerConfig): ChatHandler {
  if (!config.model.resolve && !config.streamTurn) {
    throw new Error(
      "createChatHandler: set model.resolve (a model for streamText) or streamTurn (a runtime binding); the transport cannot guess the model."
    );
  }

  const maxMessageLength =
    config.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH;
  const attachments = config.attachments ?? false;
  const maxBodyBytes = config.maxBodyBytes ?? defaultBodyLimit(attachments);
  const authenticate = config.authenticate ?? defaultAuthenticate;
  const rateLimit =
    config.rateLimit === undefined ? defaultRateLimit : config.rateLimit;
  const deriveTitle = config.deriveTitle;
  const events = config.onTurn ?? {};
  const withMetadata = config.messageMetadata ?? true;
  const allowedOrigins = new Set(config.cors?.origins ?? []);

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

  /**
   * Headers that let an embedded widget on another origin call this
   * route with its cookies. Only for an origin the deployment listed;
   * everyone else gets no header and the browser refuses the response.
   */
  function corsHeaders(request: Request): Record<string, string> {
    if (allowedOrigins.size === 0) return {};
    const origin = request.headers.get("origin");
    if (!origin || !allowedOrigins.has(origin)) return {};
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Expose-Headers":
        "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
      Vary: "Origin",
    };
  }

  function refusal(
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
    return refuse(code, error, extra, headers);
  }

  async function resolveAgent(turn: ChatTurnContext): Promise<ResolvedAgent> {
    if (config.resolveAgent) return config.resolveAgent(turn);
    const shorthand = config.agent ?? {};
    const tools =
      typeof shorthand.tools === "function"
        ? await shorthand.tools(turn)
        : shorthand.tools;
    // Everything the shorthand carries beyond the three fields the
    // transport decides for itself. Spread rather than enumerated:
    // `ChatAgentConfig` is `Omit<ResolvedAgent, …>`, so a field added
    // to the agent reaches the model without another line here, and a
    // key the caller never set is not an own property and cannot
    // overwrite a default with `undefined`.
    const {
      id: _id,
      systemPrompt: _systemPrompt,
      tools: _tools,
      ...rest
    } = shorthand;
    return {
      ...rest,
      // A conversation keeps the agent it was created with.
      id: turn.conversation?.agentId ?? shorthand.id ?? DEFAULT_AGENT_ID,
      systemPrompt: shorthand.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      ...(tools ? { tools } : {}),
    };
  }

  /**
   * The model the request asked for, if it may have it. Null when it
   * asked for nothing (or `models` is unset, in which case a request
   * cannot choose); `false` when it asked for one it may not have.
   */
  async function requestedModel(
    actor: ChatActor,
    body: Record<string, unknown>
  ): Promise<ChatModelOption | null | false> {
    if (!config.models) return null;
    const wanted = body.modelId;
    if (typeof wanted !== "string" || !wanted) return null;
    const options =
      typeof config.models.options === "function"
        ? await config.models.options(actor)
        : config.models.options;
    const option = options.find((candidate) => candidate.id === wanted);
    if (!option) return false;
    if (option.featureKey) {
      const allowed = await hasFeature(actor.workspaceId, option.featureKey);
      if (!allowed) return false;
    }
    return option;
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

  /**
   * What the model sees of stored attachments: a signed URL in place
   * of the app URL, and the extracted text of a document appended as
   * text. The persisted transcript keeps the app URL — a signed URL
   * expires, and would leak on a shared page.
   */
  async function resolveStoredFiles(
    actor: ChatActor,
    messages: UIMessage[]
  ): Promise<UIMessage[]> {
    if (attachments === false || attachments.mode !== "stored") {
      return messages;
    }
    const ids = storedAttachmentIds(messages, attachments);
    if (ids.length === 0) return messages;

    const rows = await getAttachments(actor, ids);
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    const storage = getStorageAdapter();
    const signed = new Map<string, string>();
    for (const row of rows) {
      signed.set(
        row.id,
        await storage.getSignedUrl(row.storageKey, {
          expiresInSeconds: MODEL_URL_SECONDS,
        })
      );
    }

    return messages.map((message) => {
      const parts: UIMessage["parts"] = [];
      const extracted: string[] = [];
      for (const part of message.parts) {
        if (part.type !== "file") {
          parts.push(part);
          continue;
        }
        const id = attachmentIdFromUrl(attachments, part.url);
        const row = id ? byId.get(id) : undefined;
        if (!id || !row) {
          // Not this tenant's upload, or already gone: the model does
          // not get a URL it could not have fetched anyway.
          continue;
        }
        parts.push({
          ...part,
          mediaType: row.mediaType,
          filename: row.filename,
          url: signed.get(id)!,
        });
        if (row.extractedText && !row.mediaType.startsWith("image/")) {
          extracted.push(`[Attachment: ${row.filename}]\n${row.extractedText}`);
        }
      }
      if (extracted.length > 0) {
        parts.push({ type: "text", text: extracted.join("\n\n") });
      }
      return { ...message, parts };
    });
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

  /**
   * A continuation resumes an assistant message the model wrote, and
   * the client's copy of it is not trusted: an approval answer runs the
   * tool it approves with the input it carries, and the finished reply
   * is persisted from this message. With the transport's own persistence
   * the stored message is taken and only the client's answers are copied
   * onto it (`trustedContinuation`); null refuses the turn. A deployment
   * that persists elsewhere (`persist`) makes this check in its own
   * `prepareMessages`.
   */
  async function storedContinuation(
    actor: ChatActor,
    body: { id: string; messages: UIMessage[] }
  ): Promise<UIMessage | null> {
    const last = body.messages[body.messages.length - 1]!;
    try {
      const row = await getMessage(actor, body.id, last.id);
      return trustedContinuation(
        row ? toUIMessages([row])[0] : undefined,
        last
      );
    } catch {
      return null;
    }
  }

  // POST: stream a reply.

  async function POST(request: Request): Promise<Response> {
    await config.onRequest?.();
    const t = await messagesFor(request);
    const cors = corsHeaders(request);
    const nowhere = { actor: null, conversationId: null };

    // Who is asking, before the body is read: an anonymous request
    // costs no more than its headers.
    let actor: ChatActor;
    try {
      actor = await authenticate(request);
    } catch {
      return refusal("UNAUTHORIZED", t("unauthorized"), nowhere, {}, cors);
    }

    const read = await readJsonUpTo(request, maxBodyBytes);
    if (read === "too_large" || read === "invalid") {
      return refusal(
        "BAD_REQUEST",
        t("invalidBody"),
        { actor, conversationId: null },
        {},
        cors
      );
    }
    const parsed = parseChatBody(read.json, { maxMessageLength, attachments });
    if (!parsed.ok) {
      const { key, params } = parsed.rejection;
      return refusal(
        "BAD_REQUEST",
        t(key, params),
        { actor, conversationId: null },
        {},
        cors
      );
    }
    const body = parsed.body;
    const where = { actor, conversationId: body.id };

    let limitHeaders: Record<string, string> = { ...cors };
    if (rateLimit !== false) {
      const decision = await rateLimit(actor);
      limitHeaders = { ...cors, ...rateLimitHeaders(decision) };
      if (!decision.allowed) {
        const seconds = decision.retryAfterSeconds ?? 60;
        return refusal(
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
        return refusal("NOT_FOUND", t("notFound"), where, {}, cors);
      }
      log.error("Failed to load conversation", {
        conversationId: body.id,
        error: errorMessage(loaded.error),
      });
      return refusal("INTERNAL", t("internalError"), where, {}, cors);
    }

    // Earlier messages' files sent without their bytes come back from
    // the stored transcript (`sendWithoutEarlierFiles`).
    const elided = body.messages.filter(hasElidedFile).map((m) => m.id);
    if (elided.length > 0) {
      try {
        const stored =
          config.persist === undefined && loaded.row
            ? toUIMessages(await getMessagesByIds(actor, body.id, elided))
            : [];
        body.messages = restoreElidedFiles(
          body.messages,
          stored,
          (part, role) => fileAccepted(part, role, attachments)
        );
      } catch (error) {
        log.error("Failed to restore elided files", {
          conversationId: body.id,
          error: errorMessage(error),
        });
        return refusal("INTERNAL", t("internalError"), where, {}, cors);
      }
    }

    // The writer exists only while the stream is open; a tool that
    // writes outside that window is dropped rather than crashed.
    let writerSlot: UIMessageStreamWriter<ChatUIMessage> | null = null;
    let inFlight: ReturnType<typeof inFlightTracker> | null = null;
    // Tokens tools spent on their own model calls, settled with the run's.
    let nestedUsage: TokenUsage | null = null;
    // Tokens spent on a named model, by model and capability. Which of
    // them are the turn's own model is known only once the agent is
    // resolved, so the split happens at settlement.
    const namedUsage = new Map<
      string,
      { model: string; capability?: string; usage: TokenUsage }
    >();

    const context: ChatTurnContext = {
      ...actor,
      request,
      conversationId: body.id,
      body: body.extra,
      conversation: loaded.row,
      trigger: body.trigger,
      write: (chunk: ChatDataChunk) => {
        writerSlot?.write(chunk);
      },
      updateMetadata: async (patch) => {
        await updateConversationMetadata(actor, body.id, patch);
      },
      state: new Map<string, unknown>(),
      addUsage: (usage, options) => {
        const model = options?.model;
        if (model === undefined) {
          nestedUsage = sumUsage(nestedUsage ?? {}, pickUsage(usage));
          return;
        }
        // A price is needed to bill these tokens at all; failing here
        // names the id in the tool that spent them.
        if (!isModelRegistered(model)) {
          throw new UnknownModelError(model, registeredModelIds());
        }
        const key = `${model}\u0000${options?.capability ?? ""}`;
        const entry = namedUsage.get(key);
        namedUsage.set(key, {
          model,
          ...(options?.capability ? { capability: options.capability } : {}),
          usage: sumUsage(entry?.usage ?? {}, pickUsage(usage)),
        });
      },
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
      return refusal("INTERNAL", t("internalError"), where, {}, cors);
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
        return refusal("FEATURE_GATED", t("featureGated"), where, {}, cors);
      }
    }

    // The agent's model wins; then the request's, if it may have it;
    // then the deployment's default.
    const picked = await requestedModel(actor, body.extra);
    if (picked === false) {
      return refusal(
        "FEATURE_GATED",
        t("featureGated"),
        where,
        { reasonCode: "model_not_allowed" },
        cors
      );
    }
    const modelId = agent.modelId ?? picked?.id ?? config.model.defaultId;
    const capability =
      agent.capability ?? config.capability ?? DEFAULT_CAPABILITY;
    const maxSteps = agent.maxSteps ?? config.maxSteps ?? DEFAULT_MAX_STEPS;

    // A title that resolves later is applied after the stream — a
    // model-written title must not delay the first token.
    let pendingTitle: Promise<string | null> | null = null;

    // What the stored transcript loses to this turn — the reply being
    // regenerated, the path an edit replaces. Run only once the turn is
    // admitted: a refused regenerate must leave the old answer in place.
    let trimAfter: string | null = null;
    let trimFrom: string | null = null;
    if (!loaded.row) {
      // A new conversation has nothing to trim.
    } else if (
      body.replaces &&
      body.trigger !== "regenerate-message" &&
      body.messages[body.messages.length - 1]!.role === "user"
    ) {
      // An edit that names the message it replaces: that message and
      // everything after it go, even when it is the first one the client
      // holds and no message before it says where the path forks.
      trimFrom = body.replaces;
    } else if (body.trigger === "regenerate-message") {
      // The client dropped the reply it is regenerating; drop what the
      // row holds after the user message that gets a second answer.
      trimAfter = lastUserMessage(body.messages)?.id ?? null;
    } else if (lastUserMessage(body.messages) && body.messages.length > 1) {
      // An edit: the client cut the transcript and re-sent a message
      // with a new id. Whatever the row holds after the message before
      // it is the path being replaced. On an ordinary send the message
      // before is the latest reply and nothing follows it, so this
      // deletes nothing.
      trimAfter = body.messages[body.messages.length - 2]!.id;
    }

    if (
      config.persist === undefined &&
      body.messages[body.messages.length - 1]!.role === "assistant"
    ) {
      const resumed = await storedContinuation(actor, body);
      if (!resumed) {
        return refusal("BAD_REQUEST", t("invalidBody"), where, {}, cors);
      }
      body.messages = [...body.messages.slice(0, -1), resumed];
    }

    const answers = approvalAnswers(body.messages);

    const turn: ChatTurn = {
      ...context,
      agent,
      // A first turn has no row yet, and so no history.
      history: async () =>
        context.conversation
          ? toUIMessages(await getMessages(actor, body.id))
          : [],
    };

    // Approval answers ride on a continuation; the audit hook sees
    // each once, before the tool they gate runs.
    for (const answer of answers) {
      await emit(() => events.approval?.({ turn: context, ...answer }));
    }

    let prepared: PreparedTurn;
    try {
      prepared = await prepare(turn, body.messages);
    } catch (error) {
      log.error("prepareMessages failed", {
        conversationId: body.id,
        error: errorMessage(error),
      });
      await emit(() => events.fail?.({ turn, error, phase: "unhandled" }));
      return refusal("INTERNAL", t("internalError"), where, {}, cors);
    }

    const metadata = {
      conversationId: body.id,
      agentId: agent.id,
      ...(config.metadata ? config.metadata(turn) : {}),
    };

    // Entitlement, decided against the model that is about to run, held
    // for this prompt and, with tools, every step the loop may take.
    const run = await config.executions.begin({
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      capability,
      model: modelId,
      workload: {
        inputTokens:
          estimateTokenCount(prepared.system ?? agent.systemPrompt ?? "") +
          estimateConversationTokens(prepared.messages),
        steps:
          agent.tools && Object.keys(agent.tools).length > 0 ? maxSteps : 1,
      },
      metadata,
    });

    if (!run.allowed) {
      // 402 for anything the workspace can fix by paying; 503 for what
      // only the deployment can fix — no billing configured, or a model
      // id with no registered price.
      if (run.code === "unknown_model") {
        log.error("Model has no registered price", {
          conversationId: body.id,
          modelId,
          reason: run.reason,
        });
        // The engine's reason names the registry and the id. That is
        // the operator's to read in the log; the reader gets neutral
        // copy, since nothing they can do changes the answer.
        return refusal(
          "MODEL_UNAVAILABLE",
          t("modelUnavailable"),
          where,
          { reasonCode: run.code },
          limitHeaders
        );
      }
      const notConfigured = run.code === "billing_not_configured";
      if (notConfigured) {
        log.error("Billing is not configured", {
          conversationId: body.id,
          reason: run.reason,
        });
      }
      // The engine's `reason` is English and for the log; the reader
      // gets the deployment's copy, and `reasonCode` says which case.
      return refusal(
        notConfigured ? "BILLING_NOT_CONFIGURED" : "QUOTA_EXCEEDED",
        t(notConfigured ? "billingNotConfigured" : "quotaExceeded"),
        where,
        { ...(run.code ? { reasonCode: run.code } : {}) },
        limitHeaders
      );
    }

    // The row is created once the turn is admitted: a first turn refused
    // for quota or a rate limit leaves no empty conversation behind.
    if (!loaded.row) {
      const opening = body.messages.find((message) => message.role === "user");
      const openingText = opening ? extractText(opening.parts) : "";
      try {
        const row = await createConversation(actor, {
          id: body.id,
          agentId: agent.id,
          modelId,
          title: deriveTitle ? null : truncateTitle(openingText),
        });
        context.conversation = row;
        turn.conversation = row;
      } catch (error) {
        await run.fail({ error });
        // Another actor's id: answer as if it did not exist.
        if (isConversationServiceError(error) && error.code === "forbidden") {
          return refusal("NOT_FOUND", t("notFound"), where, {}, cors);
        }
        log.error("Failed to create conversation", {
          conversationId: body.id,
          error: errorMessage(error),
        });
        return refusal("INTERNAL", t("internalError"), where, {}, cors);
      }
      // A product's title function may call a model: it runs only for
      // an admitted turn, so a refused one spends nothing on it.
      if (deriveTitle) {
        pendingTitle = Promise.resolve(deriveTitle(openingText, context));
      }
    }

    if (trimAfter || trimFrom) {
      try {
        await deleteTrailingMessages(
          actor,
          trimFrom
            ? { id: trimFrom, inclusive: true, conversationId: body.id }
            : { id: trimAfter!, conversationId: body.id }
        );
      } catch (error) {
        // The message may never have been persisted (a failed first
        // attempt). The turn still makes sense.
        log.warn("Could not trim messages before the turn", {
          conversationId: body.id,
          error: errorMessage(error),
        });
      }
    }

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

    // Whole-run usage, captured from the run's own finish (which fires
    // when the model run ends, before the UI stream drains) and read
    // back in the outer `onFinish`. `totalUsage`, not `usage`: with
    // tools bound, `usage` is the LAST step only and a five-step turn
    // would be billed for one.
    let captured:
      | {
          usage: TokenUsage;
          modelId?: string;
          finishReason?: string;
          rawFinishReason?: string;
          providerMetadata?: unknown;
          warnings?: unknown[];
        }
      | undefined;

    /**
     * Take the usage tools named a model for: the turn's own model
     * folds into `nestedUsage`, every other model is returned for its
     * own execution. Drains the map, so a second call finds nothing and
     * no model's tokens are recorded twice.
     */
    const takeOtherModelUsage = () => {
      const others: Array<{
        model: string;
        capability: string;
        usage: TokenUsage;
      }> = [];
      for (const entry of namedUsage.values()) {
        if (entry.model === modelId) {
          nestedUsage = sumUsage(nestedUsage ?? {}, entry.usage);
          continue;
        }
        others.push({
          model: entry.model,
          capability:
            entry.capability ??
            (getModelPricing(entry.model)?.kind === "embedding"
              ? EMBEDDING_CAPABILITY
              : capability),
          usage: entry.usage,
        });
      }
      namedUsage.clear();
      return others;
    };

    /**
     * Record another model's tokens as that model's execution. Begun
     * and completed at settlement rather than when the tool reports
     * them: `addUsage` is synchronous inside a tool, and one execution
     * per model per turn keeps a retrieval loop of twenty embedding
     * calls one row. The tokens are already spent, so the execution is
     * begun as such: no admission to refuse them, and they are charged.
     */
    const settleOtherModels = async (
      others: ReturnType<typeof takeOtherModelUsage>,
      aborted: boolean
    ) => {
      for (const other of others) {
        try {
          const child = await config.executions.begin({
            workspaceId: actor.workspaceId,
            userId: actor.userId,
            capability: other.capability,
            model: other.model,
            alreadySpent: true,
            metadata: {
              ...metadata,
              parentExecutionId: run.id,
              parentRequestId: run.requestId,
            },
          });
          if (!child.allowed) {
            throw new Error(
              `Usage on ${other.model} was refused: ${child.reason ?? child.code ?? "refused"}`
            );
          }
          await child.complete({
            usage: other.usage,
            model: other.model,
            metadata: { ...metadata, aborted },
          });
        } catch (error) {
          log.error("Nested model settlement failed", {
            conversationId: body.id,
            executionId: run.id,
            modelId: other.model,
            error: errorMessage(error),
          });
          await emit(() => events.fail?.({ turn, error, phase: "settlement" }));
        }
      }
    };

    const settle = async (
      usage: TokenUsage,
      detail: { aborted: boolean } & Record<string, unknown>
    ) => {
      const others = takeOtherModelUsage();
      const whole = nestedUsage ? sumUsage(usage, nestedUsage) : usage;
      const normalized = config.normalizeUsage
        ? config.normalizeUsage(whole)
        : whole;
      // Settling can throw (unrecorded usage must not be reported as
      // success). Log and continue so a settlement failure does not
      // also cost the user their message history.
      try {
        await run.complete({
          usage: normalized,
          // The model admission priced. A runtime may report a
          // provider-resolved id the registry has no price for.
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
        await settleOtherModels(others, detail.aborted);
        return;
      }
      await settleOtherModels(others, detail.aborted);
      await emit(() =>
        events.complete?.({
          turn,
          executionId: run.id,
          modelId: captured?.modelId ?? modelId,
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

    // The model's stream and the UI stream can both report one failure.
    let streamFailureReported = false;
    const reportStreamFailure = async (error: unknown) => {
      if (streamFailureReported) return;
      streamFailureReported = true;
      await emit(() => events.fail?.({ turn, error, phase: "stream" }));
    };

    const finishMetadata = (usage: TokenUsage): ChatMessageMetadata => ({
      modelId: captured?.modelId ?? modelId,
      usage: pickUsage(usage),
      finishedAt: new Date().toISOString(),
    });

    /**
     * Write what the finished steps spent onto the running execution,
     * so a run whose process is killed mid-turn is charged that
     * (`reconcile()`), not released.
     */
    const recordProgress = (tracker: ReturnType<typeof inFlightTracker>) => {
      const spent = tracker.spent();
      const whole = nestedUsage ? sumUsage(spent, nestedUsage) : spent;
      run
        .progress?.({
          usage: config.normalizeUsage ? config.normalizeUsage(whole) : whole,
        })
        .catch((error: unknown) =>
          log.warn("Could not record the turn's progress", {
            executionId: run.id,
            error: errorMessage(error),
          })
        );
    };

    /**
     * A runtime the consumer bound. It gets the whole prepared turn,
     * its stored files resolved as the model would see them, and gives
     * back UI chunks; the frames are ours.
     */
    const runBoundTurn = async (
      streamTurn: NonNullable<ChatServerConfig["streamTurn"]>,
      writer: UIMessageStreamWriter<ChatUIMessage>,
      modelMessages: UIMessage[]
    ) => {
      writer.write({ type: "start" });
      const resolved = { ...prepared, messages: modelMessages };
      const produced = await streamTurn(turn, resolved, {
        modelId,
        abortSignal: request.signal,
        writer,
      });
      writer.merge(
        withoutFrames(
          produced.stream as ReadableStream<UIMessageChunk>
        ) as ReadableStream<InferUIMessageChunk<ChatUIMessage>>
      );
      const usage = await produced.usage;
      captured = {
        usage: pickUsage(usage),
        ...(usage.modelId ? { modelId: usage.modelId } : {}),
        ...(usage.finishReason ? { finishReason: usage.finishReason } : {}),
      };
      await settle(captured.usage, { aborted: request.signal.aborted });
      const title = await applyTitle();
      if (title) {
        writer.write({ type: "data-chat-title", data: title, transient: true });
      }
      writer.write({
        type: "finish",
        ...(withMetadata
          ? { messageMetadata: finishMetadata(captured.usage) }
          : {}),
      });
    };

    const stream = createUIMessageStream<ChatUIMessage>({
      // Without this, `onFinish` sees only the reply and a tool-approval
      // continuation loses its message id. With it, the finished
      // transcript is the prepared messages plus the reply.
      originalMessages: prepared.messages as ChatUIMessage[],
      execute: async ({ writer }) => {
        writerSlot = writer;
        const modelMessages = await resolveStoredFiles(
          actor,
          prepared.messages
        );

        if (config.streamTurn) {
          await runBoundTurn(config.streamTurn, writer, modelMessages);
          return;
        }

        const model = await config.model.resolve!(modelId, context);
        const outputCeiling = getModelPricing(modelId)?.maxOutputTokens;
        const system = prepared.system ?? agent.systemPrompt;
        // The step in flight is billed by the provider and reported by
        // no one: followed here, so stopping a reply is not free.
        const tracker = inFlightTracker(
          estimateTokenCount(system ?? "") +
            estimateConversationTokens(modelMessages)
        );
        inFlight = tracker;
        const result = streamText({
          // Admission held the registered model's `maxOutputTokens`;
          // the same number caps what a step may write unless the
          // agent's own setting, spread next, replaces it.
          ...(outputCeiling !== undefined
            ? { maxOutputTokens: outputCeiling }
            : {}),
          // The agent's sampling settings, copied by name from the
          // allowlist. First in the literal on purpose: every key the
          // transport sets below is written after it and wins, so a
          // consumer cannot displace the abort signal, the finish
          // handler or the model admission priced.
          ...pickGenerationOptions(agent.generation),
          model,
          system,
          ...(agent.providerOptions
            ? { providerOptions: agent.providerOptions }
            : {}),
          messages: await convertToModelMessages(modelMessages, {
            ...(tools ? { tools } : {}),
          }),
          ...(tools
            ? {
                tools,
                stopWhen,
                // `activeTools`, not `experimental_activeTools`: the
                // prefixed key lands in `streamText`'s rest parameter,
                // accepted by the compiler inside a conditional spread
                // and ignored at runtime, so the agent would run with
                // every tool.
                ...(agent.activeTools
                  ? { activeTools: agent.activeTools as ActiveTools<ToolSet> }
                  : {}),
              }
            : {}),
          // Stop the model when the client goes away. Without this the
          // run continues server-side to completion — billed in full
          // for a reply nobody receives — and `onAbort` never fires.
          abortSignal: request.signal,
          onStepStart: tracker.onStepStart,
          onChunk: tracker.onChunk,
          onStepFinish: (step) => {
            tracker.onStepFinish(step);
            recordProgress(tracker);
          },
          onFinish: async ({
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
            // Settled here, where the usage is final, rather than when
            // the UI stream closes: a client that disconnects closes it
            // first, and the run must still be charged. A run that ended
            // in an error reports no total; its finished steps still count.
            // A step the provider failed partway through reports nothing
            // either, and is added from the tracker's estimate.
            const reported = captured.usage;
            const counted =
              (reported.inputTokens ?? 0) + (reported.outputTokens ?? 0) > 0;
            await settle(
              counted
                ? sumUsage(reported, tracker.unreported())
                : tracker.spent(),
              { aborted: false }
            );
          },
          // A provider error mid-stream reaches the client as an error
          // part and need not be thrown, so the transport's own
          // `onError` may never see it; the run still settles in
          // `onFinish`.
          onError: async ({ error }) => {
            log.error("Model stream failed", {
              conversationId: body.id,
              executionId: run.id,
              error: errorMessage(error),
            });
            await reportStreamFailure(error);
          },
          onAbort: async ({ steps }) => {
            await settle(tracker.aborted(steps), { aborted: true });
          },
        });

        writer.merge(
          result.toUIMessageStream({
            sendReasoning: config.reasoning ?? false,
            sendSources: config.sources ?? false,
            onError: () => t("streamError"),
            ...(withMetadata
              ? {
                  messageMetadata: ({ part }) =>
                    part.type === "finish"
                      ? finishMetadata(part.totalUsage)
                      : undefined,
                }
              : {}),
          }) as ReadableStream<InferUIMessageChunk<ChatUIMessage>>
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
        writerSlot = null;
        // The run settles itself where its usage becomes known (above).
        // A stream that closed with no usage and no disconnect never
        // will: failing releases the hold and leaves a `failed` row an
        // operator can see. After a disconnect the run is still ending —
        // `onAbort` or the runtime's usage settles it, and `reconcile()`
        // abandons it if neither does.
        if (!captured && !request.signal.aborted) {
          void run.fail({ error: new Error("stream ended without usage") });
          void settleOtherModels(takeOtherModelUsage(), false);
        }

        const userMessage = lastUserMessage(body.messages);
        try {
          // Uploads are tied to the conversation whether or not the
          // transcript is stored here: an unclaimed upload is swept.
          if (config.persist === false) {
            // The transcript is the client's to keep.
          } else if (config.persist) {
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
          if (
            userMessage &&
            attachments !== false &&
            attachments.mode === "stored"
          ) {
            const ids = storedAttachmentIds([userMessage], attachments);
            if (ids.length > 0) {
              await attachToConversation(actor, {
                ids,
                conversationId: body.id,
              });
            }
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
        writerSlot = null;
        // Steps that ran before the error were billed by the provider:
        // charged, not released. With none, the hold is released.
        const spent = inFlight?.spent();
        if (spent && (spent.totalTokens ?? 0) > 0) {
          void settle(spent, { aborted: true, error: errorMessage(error) });
        } else {
          void run.fail({ error });
        }
        // Another model's tokens were spent whether or not the turn
        // finished; they are that model's execution, not this one's.
        void settleOtherModels(takeOtherModelUsage(), false);
        void reportStreamFailure(error);
        return t("streamError");
      },
    });

    return createUIMessageStreamResponse({ stream, headers: limitHeaders });
  }

  // DELETE: remove a conversation.

  async function DELETE(request: Request): Promise<Response> {
    await config.onRequest?.();
    const t = await messagesFor(request);
    const cors = corsHeaders(request);

    let actor: ChatActor;
    try {
      actor = await authenticate(request);
    } catch {
      return refusal(
        "UNAUTHORIZED",
        t("unauthorized"),
        { actor: null, conversationId: null },
        {},
        cors
      );
    }

    let id = new URL(request.url).searchParams.get("id");
    if (!id) {
      // No body, or not JSON: the query string was the only place to look.
      const read = await readJsonUpTo(request, DELETE_BODY_BYTES);
      if (typeof read === "object") {
        const json = read.json as { id?: unknown } | null;
        if (typeof json?.id === "string") id = json.id;
      }
    }
    if (!id) {
      return refusal(
        "BAD_REQUEST",
        t("invalidBody"),
        { actor, conversationId: null },
        {},
        cors
      );
    }

    try {
      await deleteConversation(actor, id);
    } catch (error) {
      if (
        isConversationServiceError(error) &&
        (error.code === "not_found" || error.code === "forbidden")
      ) {
        return refusal(
          "NOT_FOUND",
          t("notFound"),
          { actor, conversationId: id },
          {},
          cors
        );
      }
      log.error("Failed to delete conversation", {
        conversationId: id,
        error: errorMessage(error),
      });
      return refusal(
        "INTERNAL",
        t("internalError"),
        { actor, conversationId: id },
        {},
        cors
      );
    }
    return Response.json({ success: true }, { headers: cors });
  }

  // GET: stream resumption. OPTIONS: CORS preflight.

  /**
   * `useChat().resumeStream()` asks here whether a turn is still in
   * flight. `streamText` runs are not durable, so the honest answer is
   * always "nothing to resume" — 204, which the SDK treats as such.
   */
  async function GET(request: Request): Promise<Response> {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  async function OPTIONS(request: Request): Promise<Response> {
    const cors = corsHeaders(request);
    return new Response(null, {
      status: 204,
      headers: { ...cors, "Access-Control-Max-Age": "600" },
    });
  }

  return { POST, DELETE, GET, OPTIONS };
}
