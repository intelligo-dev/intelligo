/**
 * eve, through the chat transport — consumer-owned.
 *
 * eve (Vercel's agent framework) runs an agent as a durable session
 * and streams its own NDJSON events; its parts follow the AI SDK's
 * `UIMessage` convention but are not the AI SDK's types. This file is
 * the bridge: `eveStreamTurn` is a `streamTurn` for
 * `lib/chat-server-config.ts`, so every eve turn still goes through
 * the transport's auth, rate limit, feature gate, admission,
 * persistence and settlement, and renders through the same
 * `TOOL_RENDERERS` / `DATA_RENDERERS` as any other turn.
 *
 *   import { eveStreamTurn } from "@/lib/chat-eve";
 *
 *   export const chatServerConfig: ChatServerConfig = {
 *     executions,
 *     model: { defaultId: "eve/agent" },      // a registered model id to settle against
 *     streamTurn: eveStreamTurn({ baseUrl: process.env.EVE_URL! }),
 *     …
 *   };
 *
 * The eve session id and stream cursor live in the conversation's
 * `metadata.eve`, so a conversation continues its session across
 * turns and a cancelled turn resumes from where the stream stopped.
 *
 * Nothing here is framework code and nothing imports eve: the wire
 * protocol is HTTP + NDJSON (`/eve/v1/session`, `/stream`, `/cancel`),
 * read defensively. The event → chunk table is `mapEveEvent`; the
 * tests in `packages/registry/tests/chat-eve.test.ts` pin it. Both
 * are yours to extend when eve grows an event.
 */

import type { FileUIPart, UIMessage, UIMessageChunk } from "ai";

import type {
  ChatTurn,
  PreparedTurn,
  StreamTurn,
  TokenUsage,
} from "@intelligo-dev/chat";
import type { ChatDataChunk } from "@intelligo-dev/chat/client";

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

export type EveEvent = {
  type: string;
  data?: Record<string, unknown>;
  meta?: { id?: string; at?: string };
};

export type EveCursor = { sessionId: string; streamIndex: number };

export type EveInputRequest = {
  requestId: string;
  kind: "question" | "session-limit" | "tool-approval";
  prompt: string;
  options?: Array<{ id: string; label: string; description?: string; style?: string }>;
  allowFreeform?: boolean;
  action?: { callId: string; toolName: string; input?: unknown };
};

export type EveInputResponse = { requestId: string; optionId?: string; text?: string };

type EveMetadata = {
  sessionId?: string;
  streamIndex?: number;
  /** A question the run paused on; the next user message answers it. */
  pendingQuestion?: { requestId: string; options?: EveInputRequest["options"] };
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** The option an approval answer picks: eve names them; we match by intent. */
function optionFor(
  options: EveInputRequest["options"] | undefined,
  approved: boolean
): string | undefined {
  if (!options?.length) return undefined;
  const wanted = approved ? /approve|allow|yes|confirm|accept/i : /deny|reject|no|cancel|decline/i;
  const byId = options.find((o) => wanted.test(o.id) || wanted.test(o.label));
  if (byId) return byId.id;
  return approved ? options[0]!.id : options[options.length - 1]!.id;
}

// ---------------------------------------------------------------------------
// Event → UI message chunks
// ---------------------------------------------------------------------------

export type EveMapperState = {
  usage: TokenUsage;
  finishReason?: string;
  modelId?: string;
  done: boolean;
  failed?: string;
  cancelled: boolean;
  /** A question the run paused on, to remember for the next turn. */
  pendingQuestion?: EveMetadata["pendingQuestion"];
};

/**
 * One eve event → the AI SDK chunks it means. Stateful per turn: it
 * remembers which text, reasoning and tool blocks are open so deltas
 * land in the right part and blocks close once.
 */
export function createEveEventMapper() {
  const state: EveMapperState = {
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    done: false,
    cancelled: false,
  };
  const openText = new Map<number, string>();
  const openReasoning = new Map<number, string>();
  const startedTools = new Set<string>();
  const seen = new Set<string>();

  function textId(step: number) {
    let id = openText.get(step);
    if (!id) {
      id = `t-${step}-${openText.size}`;
      openText.set(step, id);
    }
    return id;
  }

  function map(event: EveEvent): UIMessageChunk[] {
    const id = event.meta?.id;
    if (id) {
      if (seen.has(id)) return [];
      seen.add(id);
    }
    const data = asRecord(event.data);
    const step = typeof data.stepIndex === "number" ? data.stepIndex : 0;
    const out: UIMessageChunk[] = [];

    switch (event.type) {
      case "step.started":
        if (typeof data.modelId === "string") state.modelId = data.modelId;
        out.push({ type: "start-step" });
        break;

      case "step.completed": {
        const usage = asRecord(data.usage);
        const input = typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
        const output = typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
        state.usage = {
          inputTokens: (state.usage.inputTokens ?? 0) + input,
          outputTokens: (state.usage.outputTokens ?? 0) + output,
          totalTokens: (state.usage.totalTokens ?? 0) + input + output,
        };
        if (typeof data.finishReason === "string") state.finishReason = data.finishReason;
        const text = openText.get(step);
        if (text) {
          out.push({ type: "text-end", id: text });
          openText.delete(step);
        }
        out.push({ type: "finish-step" });
        break;
      }

      case "reasoning.appended": {
        let rid = openReasoning.get(step);
        if (!rid) {
          rid = `r-${step}`;
          openReasoning.set(step, rid);
          out.push({ type: "reasoning-start", id: rid });
        }
        out.push({ type: "reasoning-delta", id: rid, delta: str(data.reasoningDelta) });
        break;
      }
      case "reasoning.completed": {
        const rid = openReasoning.get(step);
        if (rid) {
          out.push({ type: "reasoning-end", id: rid });
          openReasoning.delete(step);
        }
        break;
      }

      case "message.appended": {
        const tid = openText.get(step);
        const target = tid ?? textId(step);
        if (!tid) out.push({ type: "text-start", id: target });
        out.push({ type: "text-delta", id: target, delta: str(data.messageDelta) });
        break;
      }
      case "message.completed": {
        const tid = openText.get(step);
        if (tid) {
          out.push({ type: "text-end", id: tid });
          openText.delete(step);
        }
        break;
      }

      case "action.input.appended": {
        const callId = str(data.callId);
        if (!callId) break;
        if (!startedTools.has(callId)) {
          startedTools.add(callId);
          out.push({
            type: "tool-input-start",
            toolCallId: callId,
            toolName: str(data.toolName, "tool"),
            dynamic: true,
          });
        }
        out.push({ type: "tool-input-delta", toolCallId: callId, inputTextDelta: str(data.inputTextDelta) });
        break;
      }

      case "actions.requested": {
        const actions = Array.isArray(data.actions) ? data.actions : [];
        for (const raw of actions) {
          const action = asRecord(raw);
          const callId = str(action.callId);
          if (!callId) continue;
          startedTools.add(callId);
          out.push({
            type: "tool-input-available",
            toolCallId: callId,
            toolName: str(action.toolName ?? action.name ?? action.kind, "tool"),
            input: action.input ?? {},
            dynamic: true,
            providerMetadata: { eve: { kind: str(action.kind, "tool-call") } },
          });
        }
        break;
      }

      case "action.partial": {
        const result = asRecord(data.result);
        const callId = str(result.callId);
        if (!callId) break;
        out.push({
          type: "tool-output-available",
          toolCallId: callId,
          output: result.output ?? null,
          dynamic: true,
          preliminary: true,
        });
        break;
      }

      case "action.result": {
        const result = asRecord(data.result);
        const callId = str(result.callId);
        if (!callId) break;
        const status = str(data.status, "completed");
        if (status === "rejected") {
          out.push({ type: "tool-output-denied", toolCallId: callId });
        } else if (status === "failed" || result.isError === true) {
          const error = asRecord(data.error);
          out.push({
            type: "tool-output-error",
            toolCallId: callId,
            errorText: str(error.message, typeof result.output === "string" ? result.output : "Tool failed"),
            dynamic: true,
          });
        } else {
          out.push({
            type: "tool-output-available",
            toolCallId: callId,
            output: result.output ?? null,
            dynamic: true,
          });
        }
        break;
      }

      case "input.requested": {
        const requests = Array.isArray(data.requests) ? data.requests : [];
        for (const raw of requests) {
          const request = asRecord(raw) as unknown as EveInputRequest;
          if (!request.requestId) continue;
          if (request.kind === "tool-approval" && request.action?.callId) {
            const callId = request.action.callId;
            // Re-state the call with the request on it, so the answer
            // on the next turn can be turned back into eve's option id.
            out.push({
              type: "tool-input-available",
              toolCallId: callId,
              toolName: request.action.toolName || "tool",
              input: request.action.input ?? {},
              dynamic: true,
              providerMetadata: {
                eve: {
                  inputRequest: {
                    requestId: request.requestId,
                    options: (request.options ?? []) as never,
                  },
                },
              },
            });
            out.push({
              type: "tool-approval-request",
              approvalId: request.requestId,
              toolCallId: callId,
            });
          } else {
            state.pendingQuestion = { requestId: request.requestId, options: request.options };
            out.push(dataChunk({
              type: "data-chat-question",
              id: request.requestId,
              data: {
                id: request.requestId,
                prompt: request.prompt,
                ...(request.options ? { options: request.options.map(({ id, label, description }) => ({ id, label, ...(description ? { description } : {}) })) } : {}),
                ...(request.allowFreeform !== undefined ? { allowFreeform: request.allowFreeform } : {}),
              },
            }));
          }
        }
        break;
      }

      case "subagent.called": {
        const callId = str(data.callId);
        out.push(dataChunk({
          type: "data-chat-agent",
          id: callId || undefined,
          data: {
            id: callId,
            name: str(data.subagentName ?? data.agentId, "subagent"),
            status: "started",
          },
        }));
        break;
      }
      case "subagent.completed": {
        const callId = str(data.callId);
        const output = str(data.output);
        out.push(dataChunk({
          type: "data-chat-agent",
          id: callId || undefined,
          data: {
            id: callId,
            name: str(data.subagentName, "subagent"),
            status: "completed",
            ...(output ? { summary: output.length > 280 ? `${output.slice(0, 279)}…` : output } : {}),
          },
        }));
        break;
      }

      case "authorization.required": {
        const challenge = asRecord(data.authorization);
        const id = str(data.attemptId ?? data.candidateId ?? data.name, "authorization");
        out.push(dataChunk({
          type: "data-chat-authorization",
          id,
          data: {
            id,
            name: str(data.name),
            status: "required",
            ...(typeof data.description === "string" ? { description: data.description } : {}),
            ...(typeof challenge.url === "string" ? { url: challenge.url } : {}),
            ...(typeof challenge.instructions === "string" ? { instructions: challenge.instructions } : {}),
          },
        }));
        break;
      }
      case "authorization.completed": {
        const id = str(data.attemptId ?? data.candidateId ?? data.name, "authorization");
        out.push(dataChunk({
          type: "data-chat-authorization",
          id,
          data: { id, name: str(data.name), status: "completed" },
        }));
        break;
      }

      case "compaction.requested":
      case "compaction.completed":
        out.push(dataChunk({
          type: "data-chat-compaction",
          data: { status: event.type === "compaction.requested" ? "requested" : "completed" },
          transient: true,
        }));
        break;

      case "result.completed":
        out.push(dataChunk({ type: "data-chat-result", data: data.result ?? null }));
        break;

      case "step.failed":
      case "turn.failed":
      case "session.failed": {
        const message = str(data.message, "The agent failed.");
        state.failed = message;
        state.done = true;
        out.push({ type: "error", errorText: message });
        break;
      }

      case "turn.cancelled":
        state.cancelled = true;
        state.done = true;
        out.push({ type: "abort" });
        break;

      case "turn.completed":
      case "session.waiting":
      case "session.completed":
        state.done = true;
        break;

      default:
        // session.started, turn.started, message.received, approval.*,
        // subagent.started / subagent.event, context.cleared: nothing to draw.
        break;
    }
    return out;
  }

  return { map, state };
}

function dataChunk(chunk: ChatDataChunk): UIMessageChunk {
  return chunk as unknown as UIMessageChunk;
}

// ---------------------------------------------------------------------------
// The other direction: what the client answered → eve's input responses
// ---------------------------------------------------------------------------

/** Approval answers on a continuation, as eve input responses. */
export function approvalResponsesFrom(
  messages: ReadonlyArray<UIMessage>
): EveInputResponse[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return [];
  const responses: EveInputResponse[] = [];
  for (const raw of last.parts) {
    const part = raw as unknown as Record<string, unknown>;
    if (part.state !== "approval-responded") continue;
    const approval = asRecord(part.approval);
    const requestId = str(approval.id);
    if (!requestId) continue;
    const meta = asRecord(asRecord(asRecord(part.callProviderMetadata).eve).inputRequest);
    const options = Array.isArray(meta.options) ? (meta.options as EveInputRequest["options"]) : undefined;
    const approved = approval.approved === true;
    const optionId = optionFor(options, approved);
    responses.push(
      optionId
        ? { requestId, optionId }
        : { requestId, text: approved ? "approve" : `deny${typeof approval.reason === "string" ? `: ${approval.reason}` : ""}` }
    );
  }
  return responses;
}

/** The user's message as eve's `message` — a string, or parts when files ride along. */
export function userContentFrom(message: UIMessage): unknown {
  const text = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
  const files = message.parts.filter((part): part is FileUIPart => part.type === "file");
  if (files.length === 0) return text;
  return [
    ...(text ? [{ type: "text", text }] : []),
    ...files.map((file) => ({
      type: "file",
      data: file.url,
      mediaType: file.mediaType,
      ...(file.filename ? { filename: file.filename } : {}),
    })),
  ];
}

// ---------------------------------------------------------------------------
// The streamTurn binding
// ---------------------------------------------------------------------------

export type EveStreamTurnOptions = {
  /** Where eve is mounted, e.g. `https://agent.example.com` or the app's own origin. */
  baseUrl: string;
  /** A named agent (`/eve/agents/<name>/eve/v1`); the root agent when omitted. */
  agent?: string;
  /** Credentials for eve — a bearer token, a bypass header. */
  headers?: (turn: ChatTurn) => HeadersInit | Promise<HeadersInit>;
  fetch?: typeof fetch;
};

function routes(options: EveStreamTurnOptions) {
  const base = `${options.baseUrl.replace(/\/$/, "")}${options.agent ? `/eve/agents/${options.agent}` : ""}/eve/v1`;
  return {
    create: `${base}/session`,
    session: (id: string) => `${base}/session/${id}`,
    stream: (id: string, from: number) => `${base}/session/${id}/stream?startIndex=${from}`,
    cancel: (id: string) => `${base}/session/${id}/cancel`,
  };
}

async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<EveEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          yield JSON.parse(line) as EveEvent;
        } catch {
          // A torn line is not an event.
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      yield JSON.parse(tail) as EveEvent;
    } catch {
      // ignore
    }
  }
}

export function eveStreamTurn(options: EveStreamTurnOptions): StreamTurn {
  const doFetch = options.fetch ?? fetch;
  const url = routes(options);

  return async (turn: ChatTurn, prepared: PreparedTurn, context) => {
    const metadata = asRecord(turn.conversation?.metadata);
    const eve = asRecord(metadata.eve) as EveMetadata;
    const headers = {
      "content-type": "application/json",
      ...(options.headers ? await options.headers(turn) : {}),
    };

    // What this turn sends: an approval answer, a question's answer, or the message.
    const last = prepared.messages[prepared.messages.length - 1];
    let payload: Record<string, unknown>;
    let clearQuestion = false;
    if (last?.role === "assistant") {
      payload = { inputResponses: approvalResponsesFrom(prepared.messages) };
    } else if (last && eve.pendingQuestion) {
      const text = String(userContentFrom(last));
      const option = eve.pendingQuestion.options?.find(
        (o) => o.label === text || o.id === text
      );
      payload = {
        inputResponses: [
          option
            ? { requestId: eve.pendingQuestion.requestId, optionId: option.id }
            : { requestId: eve.pendingQuestion.requestId, text },
        ],
      };
      clearQuestion = true;
    } else if (last) {
      payload = { message: userContentFrom(last) };
    } else {
      payload = { message: "" };
    }

    // Open or continue the session.
    let sessionId = eve.sessionId;
    let streamIndex = eve.streamIndex ?? 0;
    const send = async (target: string) =>
      doFetch(target, { method: "POST", headers, body: JSON.stringify(payload), signal: context.abortSignal });

    let response = sessionId ? await send(url.session(sessionId)) : null;
    if (!response || response.status === 404 || response.status === 409 || response.status === 410) {
      response = await send(url.create);
      sessionId = undefined;
      streamIndex = 0;
    }
    if (!response.ok) {
      throw new Error(`eve answered ${response.status} to the turn`);
    }
    const accepted = asRecord(await response.json().catch(() => ({})));
    sessionId =
      sessionId ??
      str(accepted.sessionId) ??
      response.headers.get("x-eve-session-id") ??
      undefined;
    if (!sessionId) throw new Error("eve did not return a session id");
    const fixedSessionId = sessionId;

    const mapper = createEveEventMapper();
    let settle: (usage: TokenUsage & { modelId?: string; finishReason?: string }) => void;
    let fail: (error: unknown) => void;
    const usage = new Promise<TokenUsage & { modelId?: string; finishReason?: string }>(
      (resolve, reject) => {
        settle = resolve;
        fail = reject;
      }
    );

    const onAbort = () => {
      void doFetch(url.cancel(fixedSessionId), { method: "POST", headers }).catch(() => {});
    };
    context.abortSignal.addEventListener("abort", onAbort, { once: true });

    const stream = new ReadableStream<UIMessageChunk>({
      async start(controller) {
        let count = 0;
        try {
          const live = await doFetch(url.stream(fixedSessionId, streamIndex), {
            headers,
            signal: context.abortSignal,
          });
          if (!live.ok || !live.body) {
            throw new Error(`eve answered ${live.status} to the stream`);
          }
          for await (const event of ndjson(live.body)) {
            count += 1;
            for (const chunk of mapper.map(event)) controller.enqueue(chunk);
            if (mapper.state.done) break;
          }
          await turn.updateMetadata({
            eve: {
              sessionId: fixedSessionId,
              streamIndex: streamIndex + count,
              ...(mapper.state.pendingQuestion
                ? { pendingQuestion: mapper.state.pendingQuestion }
                : clearQuestion
                  ? { pendingQuestion: null }
                  : {}),
            },
          }).catch(() => {});
          if (mapper.state.failed) {
            fail(new Error(mapper.state.failed));
          } else {
            settle({
              ...mapper.state.usage,
              ...(mapper.state.modelId ? { modelId: mapper.state.modelId } : {}),
              ...(mapper.state.finishReason ? { finishReason: mapper.state.finishReason } : {}),
            });
          }
          controller.close();
        } catch (error) {
          if (context.abortSignal.aborted) {
            settle(mapper.state.usage);
            controller.close();
          } else {
            fail(error);
            controller.error(error);
          }
        } finally {
          context.abortSignal.removeEventListener("abort", onAbort);
        }
      },
    });

    return { stream, usage };
  };
}
