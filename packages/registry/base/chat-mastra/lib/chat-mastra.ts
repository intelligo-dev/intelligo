/**
 * Mastra, through the chat transport — consumer-owned.
 *
 * A Mastra agent runs the turn; the transport keeps everything around
 * it. `mastraStreamTurn` is a `streamTurn` for
 * `lib/chat-server-config.ts`, so every Mastra turn still goes through
 * the transport's auth, rate limit, feature gate, admission,
 * persistence and settlement, and renders through the same
 * `TOOL_RENDERERS` / `DATA_RENDERERS` as any other turn.
 *
 *   import { mastraStreamTurn } from "@/lib/chat-mastra";
 *   import { mastra } from "@/mastra";
 *
 *   export const chatServerConfig: ChatServerConfig = {
 *     executions,
 *     // The registered model admission holds credit for and the run is
 *     // settled against — the model the agent is built on.
 *     model: { defaultId: "anthropic/claude-haiku-5-5" },
 *     streamTurn: mastraStreamTurn({
 *       agent: (turn) => mastra.getAgent(turn.agent.id),
 *       maxSteps: 6,
 *     }),
 *     …
 *   };
 *
 * Usage settles from the whole run, every model call of a tool loop,
 * never the last step alone. A stopped turn, or one that failed after a
 * step finished, settles the steps that finished: the provider billed
 * them. Mastra reports a step's usage once its tools have run, so a
 * step whose model call or tools are still running when the reader
 * stops is not among them.
 *
 * Memory: with `memory: true` the agent's Mastra memory keeps the
 * thread. The thread is the conversation and the resource is the
 * workspace and the user together — a resource of the user alone
 * shares working memory and recall across every workspace they belong
 * to. Only the new message is sent; Mastra loads the rest from its
 * store. Without memory the transport's transcript is the context and
 * every prepared message is sent.
 *
 * Tools: every run's `requestContext` carries the turn's `workspaceId`,
 * `userId` and `conversationId`, set over any `requestContext` that
 * `streamOptions` returns. A tool reads them with `chatActorOf`, which
 * throws when the ids are missing, so a tool never runs unscoped:
 *
 *   execute: async (input, context) => {
 *     const { workspaceId, userId } = chatActorOf(context);
 *     …
 *   }
 *
 * A tool writes a data part (a card, an artifact) through Mastra's own
 * `context.writer.custom({ type: "data-…", data })`; the stream passes
 * it to the reader like any other part. Data parts never reach the
 * model's context.
 *
 * Tool approvals are Mastra's suspend and resume, which this binding
 * does not bridge: give the agent no tool that requires approval.
 */

import { toAISdkStream } from "@mastra/ai-sdk";
import type { Agent, AgentExecutionOptions } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { UIMessageChunk } from "ai";

import type {
  ChatTurn,
  PreparedTurn,
  StreamTurn,
  TokenUsage,
} from "@intelligo-dev/chat";

/** Where Mastra memory keeps a conversation. */
export type MastraMemoryScope = { thread: string; resource: string };

/** The options `mastraStreamTurn` sets itself; `streamOptions` cannot replace them. */
type BindingOwned =
  | "abortSignal"
  | "instructions"
  | "maxSteps"
  | "memory"
  | "onStepFinish"
  | "structuredOutput";

export type MastraStreamTurnOptions = {
  /** The agent, or which one runs a turn — `mastra.getAgent(turn.agent.id)`. */
  agent: Agent | ((turn: ChatTurn) => Agent | Promise<Agent>);
  /** Model and tool calls in one turn. Mastra's own default when unset. */
  maxSteps?: number;
  /**
   * `true`: the conversation's thread under the workspace and the user.
   * A function: a scope of your own. Unset: no memory.
   */
  memory?: boolean | ((turn: ChatTurn) => MastraMemoryScope);
  /**
   * More of `agent.stream`'s options for a turn — `modelSettings`,
   * `toolChoice`, a `requestContext` with values of your own (the
   * turn's actor is set on it).
   */
  streamOptions?: (
    turn: ChatTurn,
    prepared: PreparedTurn
  ) =>
    | Omit<AgentExecutionOptions, BindingOwned>
    | Promise<Omit<AgentExecutionOptions, BindingOwned>>;
};

type SettledUsage = TokenUsage & { finishReason?: string };

/** Who a tool runs for: the turn's workspace, user and conversation. */
export type ChatActor = {
  workspaceId: string;
  userId: string;
  /** Absent when the agent runs outside a chat turn. */
  conversationId?: string;
};

/**
 * The turn's actor set on `into`, a fresh `RequestContext` when none is
 * given. Only ids: Mastra serializes the request context into traces.
 */
export function chatRequestContextOf(
  turn: ChatTurn,
  into: RequestContext = new RequestContext()
): RequestContext {
  into.set("workspaceId", turn.workspaceId);
  into.set("userId", turn.userId);
  into.set("conversationId", turn.conversationId);
  return into;
}

/**
 * The actor in a tool's execution context.
 *
 * @throws when the context has no workspace or user: the agent ran
 * without `mastraStreamTurn` or `chatRequestContextOf`.
 */
export function chatActorOf(context: {
  requestContext?: RequestContext;
}): ChatActor {
  const read = (key: string) => {
    const value = context.requestContext?.get(key);
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const workspaceId = read("workspaceId");
  const userId = read("userId");
  if (!workspaceId || !userId) {
    throw new Error(
      "No workspace or user in the request context: run the agent through mastraStreamTurn, or set one with chatRequestContextOf."
    );
  }
  const conversationId = read("conversationId");
  return { workspaceId, userId, ...(conversationId ? { conversationId } : {}) };
}

/** The conversation's thread, under the workspace and the user. */
export function memoryScopeOf(turn: ChatTurn): MastraMemoryScope {
  return {
    thread: turn.conversationId,
    resource: `${turn.workspaceId}:${turn.userId}`,
  };
}

/** Mastra's usage, whose prompt-cache counts carry their own names. */
type MastraUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
};

type SpentUsage = Required<
  Pick<TokenUsage, "inputTokens" | "outputTokens" | "totalTokens">
> &
  Pick<TokenUsage, "cacheReadTokens" | "cacheWriteTokens">;

/** The cache counts Mastra reported, under the transport's names. */
function cacheOf(usage: MastraUsage | undefined) {
  return {
    ...(usage?.cachedInputTokens !== undefined
      ? { cacheReadTokens: usage.cachedInputTokens }
      : {}),
    ...(usage?.cacheCreationInputTokens !== undefined
      ? { cacheWriteTokens: usage.cacheCreationInputTokens }
      : {}),
  };
}

function addUsage(sum: SpentUsage, step: MastraUsage | undefined): SpentUsage {
  const input = step?.inputTokens ?? 0;
  const output = step?.outputTokens ?? 0;
  const cache = cacheOf(step);
  const read = addCount(sum.cacheReadTokens, cache.cacheReadTokens);
  const write = addCount(sum.cacheWriteTokens, cache.cacheWriteTokens);
  return {
    inputTokens: sum.inputTokens + input,
    outputTokens: sum.outputTokens + output,
    totalTokens: sum.totalTokens + (step?.totalTokens ?? input + output),
    ...(read !== undefined ? { cacheReadTokens: read } : {}),
    ...(write !== undefined ? { cacheWriteTokens: write } : {}),
  };
}

/** A cache count summed, absent while neither side reported one. */
function addCount(a: number | undefined, b: number | undefined) {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

/**
 * `source`, calling `end` once its reader has nothing more to read
 * from it: the stream finished, failed, or was cancelled.
 */
function withEnd<T>(source: ReadableStream<T>, end: () => void) {
  const reader = source.getReader();
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          end();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        end();
        controller.error(error);
      }
    },
    cancel(reason) {
      end();
      return reader.cancel(reason);
    },
  });
}

export function mastraStreamTurn(options: MastraStreamTurnOptions): StreamTurn {
  return async (turn, prepared, { abortSignal, reasoning, sources }) => {
    const agent =
      typeof options.agent === "function"
        ? await options.agent(turn)
        : options.agent;
    const memory =
      options.memory === true
        ? memoryScopeOf(turn)
        : typeof options.memory === "function"
          ? options.memory(turn)
          : undefined;
    // With memory, the stored thread is the context: the new message
    // alone, or Mastra keeps every earlier one twice.
    const messages = memory ? prepared.messages.slice(-1) : prepared.messages;

    // Every finished step, summed: what a stopped or failed run spent.
    let spent: SpentUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    const extra = options.streamOptions
      ? await options.streamOptions(turn, prepared)
      : {};
    const output = await agent.stream(messages, {
      ...extra,
      requestContext: chatRequestContextOf(turn, extra.requestContext),
      abortSignal,
      ...(prepared.system !== undefined
        ? { instructions: prepared.system }
        : {}),
      ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
      ...(memory ? { memory } : {}),
      onStepFinish: (step) => {
        spent = addUsage(spent, step.usage);
      },
    });

    let ended!: () => void;
    const streamEnded = new Promise<void>((resolve) => {
      ended = resolve;
    });

    const usage = new Promise<SettledUsage>((resolve, reject) => {
      output.totalUsage.then(
        (total) =>
          resolve({
            inputTokens: total.inputTokens ?? 0,
            outputTokens: total.outputTokens ?? 0,
            totalTokens:
              total.totalTokens ??
              (total.inputTokens ?? 0) + (total.outputTokens ?? 0),
            ...cacheOf(total),
          }),
        (error: unknown) => {
          // Mastra rejects every pending result of a stopped or failed
          // run. The steps that finished were billed all the same.
          if (abortSignal.aborted) resolve(spent);
          else if (spent.totalTokens > 0)
            resolve({ ...spent, finishReason: "error" });
          else reject(error);
        }
      );
      // A reader that stops reading never lets Mastra finish its
      // stream, and then `totalUsage` never settles.
      void streamEnded.then(() => {
        if (abortSignal.aborted) resolve(spent);
      });
    });

    const stream = withEnd(
      toAISdkStream(output, {
        from: "agent",
        version: "v7",
        sendReasoning: reasoning,
        sendSources: sources,
      }) as ReadableStream<UIMessageChunk>,
      ended
    );

    return { stream, usage };
  };
}
