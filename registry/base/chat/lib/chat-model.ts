import "server-only";

/**
 * Consumer-owned model resolution for `app/api/chat/route.ts`.
 *
 * A fresh install has no AI provider keys, so `getChatModel` defaults
 * to a deterministic stub: a `MockLanguageModelV3` (from `ai/test`,
 * the AI SDK's own testing surface) that echoes the last user message
 * back through a real token-by-token stream via `simulateReadableStream`.
 * No network call, no API key, and the app still builds, boots, and
 * streams a real `createUIMessageStream` response end to end.
 *
 * `CHAT_MODEL_ID` is deliberately a real, already-registered id
 * (`@intelligo-dev/executions/pricing`'s `MODEL_CONFIGS`) even though the
 * stub never calls that provider: the execution boundary bills
 * whatever id `app/api/chat/route.ts` hands to `run.complete()`
 * (ADR-0003), and an id that isn't in `MODEL_CONFIGS` silently prices
 * at the worst-case Claude rate instead of failing loudly (see
 * AGENTS.md, "Model ids are registry keys"). Using a real id here
 * means a clean install exercises the *correct* pricing path — swap
 * in your own model id the moment you swap in a real provider below,
 * and keep it one that exists in `MODEL_CONFIGS`.
 *
 * To use a real provider: install its AI SDK package (e.g.
 * `pnpm add @ai-sdk/anthropic` in this app) and replace the body of
 * `getChatModel` — the commented example below is the whole change.
 */

import type { LanguageModel } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";

/**
 * Resolves the caller's locale the same way `app/api/chat/route.ts`
 * does: this file, like that route, lives outside the `[locale]`
 * segment (it's plain server-side utility code, not a page), so there
 * is no URL segment to read a locale from — only the `NEXT_LOCALE`
 * cookie next-intl's middleware already sets on every page navigation.
 * Duplicated here rather than imported from the route: registry items
 * are self-contained (no shared cross-item helper modules), matching
 * `error.tsx`'s "no shared app-internal component" note elsewhere in
 * this item.
 */
async function resolveLocale(): Promise<string> {
  const cookieName =
    typeof routing.localeCookie === "object"
      ? (routing.localeCookie.name ?? "NEXT_LOCALE")
      : "NEXT_LOCALE";
  const value = (await cookies()).get(cookieName)?.value;
  const locales: readonly string[] = routing.locales;
  return value && locales.includes(value) ? value : routing.defaultLocale;
}

/**
 * Structurally matches the AI SDK provider spec's `LanguageModelV3StreamPart`
 * union (only the five variants this stub actually emits) without
 * importing `@ai-sdk/provider` — a transitive dependency of `ai`, not
 * one this item declares. `MockLanguageModelV3.doStream` only checks
 * shape, not the type's name, so a structurally-compatible local type
 * is enough.
 */
type StubStreamPart =
  | { type: "stream-start"; warnings: never[] }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | {
      type: "finish";
      finishReason: { unified: "stop"; raw: undefined };
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

/** Must be a key in `@intelligo-dev/executions/pricing`'s `MODEL_CONFIGS`. */
export const CHAT_MODEL_ID = "google/gemini-2.5-flash";

function lastUserText(
  prompt: readonly { role: string; content: unknown }[]
): string {
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

function stubChatModel(): LanguageModel {
  return new MockLanguageModelV3({
    provider: "stub",
    modelId: CHAT_MODEL_ID,
    doStream: async ({ prompt }) => {
      const t = await getTranslations({
        locale: await resolveLocale(),
        namespace: "chat",
      });
      const reply = `${t("stub.preface")}\n\n${t("stub.youSaid")} "${lastUserText(prompt)}"`;
      const words = reply.split(" ");

      const textDeltas: StubStreamPart[] = words.map((word, index) => ({
        type: "text-delta",
        id: "1",
        delta: index === 0 ? word : ` ${word}`,
      }));

      const chunks: StubStreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "1" },
        ...textDeltas,
        { type: "text-end", id: "1" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: undefined },
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
        stream: simulateReadableStream({ chunkDelayInMs: 15, chunks }),
      };
    },
  });
}

/**
 * Resolves the language model for a chat turn. `modelId` is threaded
 * through unused by the stub (it only ever returns one model) — a
 * real implementation switches on it, e.g.:
 *
 *   import { anthropic } from "@ai-sdk/anthropic";
 *
 *   export function getChatModel(modelId: string): LanguageModel {
 *     if (modelId === CHAT_MODEL_ID) return anthropic("claude-sonnet-4-6-20260214");
 *     return anthropic("claude-sonnet-4-6-20260214");
 *   }
 *
 * and `CHAT_MODEL_ID` above becomes whatever `MODEL_CONFIGS` key
 * matches the provider model string you pass.
 */
export function getChatModel(modelId: string): LanguageModel {
  void modelId;
  return stubChatModel();
}
