/**
 * A deterministic language model, for a chat that has no API key yet.
 *
 * A fresh install streams end to end — a real `createUIMessageStream`
 * response, token by token — before any provider is configured, and the
 * transport's own tests run against the same thing. Built on the AI
 * SDK's own testing surface (`ai/test`), so it is a real
 * `LanguageModel` as far as `streamText` is concerned.
 *
 * `modelId` is a parameter, never a literal: the execution boundary
 * bills whatever id the transport settles with, and the id has to be
 * one `@intelligo-dev/executions/pricing` knows.
 */

import type { LanguageModel } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";

/** A model prompt as the stub sees it: the AI SDK's provider-level shape. */
export type StubPrompt = ReadonlyArray<{ role: string; content: unknown }>;

export type StubToolCall = {
  toolName: string;
  /** Must satisfy the tool's input schema. */
  input: Record<string, unknown>;
};

export type StubLanguageModelOptions = {
  /** Reported to the boundary; must be a registered model id. */
  modelId: string;
  /** The reply, from the last user message's text. */
  reply: (lastUserText: string, prompt: StubPrompt) => string | Promise<string>;
  /**
   * A tool call to emit alongside the reply, or null for none. Lets a
   * stub exercise the whole tool path — call, execute, render — with
   * no provider. Called once per step; return null on the follow-up
   * step (the prompt then carries the earlier call) to end the turn.
   */
  toolCall?: (
    lastUserText: string,
    prompt: StubPrompt
  ) => StubToolCall | null | Promise<StubToolCall | null>;
  /** Delay between tokens, in ms. Default 15; 0 in tests. */
  chunkDelayInMs?: number;
};

/**
 * Structurally the provider spec's `LanguageModelV3StreamPart`, for
 * the variants this stub emits, without importing `@ai-sdk/provider`
 * — a transitive dependency of `ai`, not one this package declares.
 */
type StubStreamPart =
  | { type: "stream-start"; warnings: never[] }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      /** Stringified JSON matching the tool's input schema. */
      input: string;
    }
  | {
      type: "finish";
      finishReason: { unified: "stop" | "tool-calls"; raw: undefined };
      usage: {
        inputTokens: {
          total: number;
          noCache: undefined;
          cacheRead: undefined;
          cacheWrite: undefined;
        };
        outputTokens: { total: number; text: number; reasoning: undefined };
      };
    };

/** The last user message's text, from a provider-level prompt. */
export function lastUserTextOf(prompt: StubPrompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message?.role !== "user") continue;
    const parts = Array.isArray(message.content) ? message.content : [];
    return parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" &&
          part !== null &&
          (part as { type?: unknown }).type === "text"
      )
      .map((part) => part.text)
      .join(" ");
  }
  return "";
}

export function createStubLanguageModel(
  options: StubLanguageModelOptions
): LanguageModel {
  const delay = options.chunkDelayInMs ?? 15;
  return new MockLanguageModelV3({
    provider: "stub",
    modelId: options.modelId,
    doStream: async ({ prompt }) => {
      const userText = lastUserTextOf(prompt);
      const reply = await options.reply(userText, prompt);
      const call = options.toolCall
        ? await options.toolCall(userText, prompt)
        : null;
      const words = reply.split(" ");

      const chunks: StubStreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "1" },
        ...words.map<StubStreamPart>((word, index) => ({
          type: "text-delta",
          id: "1",
          delta: index === 0 ? word : ` ${word}`,
        })),
        { type: "text-end", id: "1" },
        ...(call
          ? [
              {
                type: "tool-call" as const,
                toolCallId: `stub-${Date.now()}`,
                toolName: call.toolName,
                input: JSON.stringify(call.input),
              },
            ]
          : []),
        {
          type: "finish",
          finishReason: {
            unified: call ? "tool-calls" : "stop",
            raw: undefined,
          },
          usage: {
            inputTokens: {
              total: Math.max(1, Math.ceil(JSON.stringify(prompt).length / 4)),
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: words.length,
              text: words.length,
              reasoning: undefined,
            },
          },
        },
      ];

      return {
        stream: simulateReadableStream({ chunkDelayInMs: delay, chunks }),
      };
    },
  });
}
