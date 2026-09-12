import "server-only";

/**
 * Consumer-owned model resolution for the chat transport.
 *
 * A fresh install has no AI provider keys, so `getChatModel` returns
 * the framework's deterministic stub (`@intelligo-dev/chat/testing`): it
 * echoes the last user message back through a real token-by-token
 * stream. No network call, no API key, and the app still builds,
 * boots and streams a real `createUIMessageStream` response end to end.
 *
 * `CHAT_MODEL_ID` is deliberately a real, registered id
 * (`@intelligo-dev/executions/pricing`) even though the stub never calls
 * that provider: the execution boundary bills whatever id the transport
 * settles with (ADR-0003), and an id with no registered price is
 * refused at admission. Using a real id here means a clean install
 * exercises the *correct* pricing path — swap in your own model id the
 * moment you swap in a real provider below, and keep it one that is
 * registered.
 *
 * To use a real provider: install its AI SDK package (e.g.
 * `pnpm add @ai-sdk/anthropic` in this app) and replace the body of
 * `getChatModel` — the commented example below is the whole change.
 */

import type { LanguageModel } from "ai";
import { createStubLanguageModel } from "@intelligo-dev/chat/testing";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";

/** Must be a registered model id in `@intelligo-dev/executions/pricing`. */
export const CHAT_MODEL_ID = "google/gemini-2.5-flash";

/**
 * The stub's one trick beyond echoing: a message that starts with
 * "save" makes it call the `saveArtifact` tool bound in
 * `lib/chat-server-config.ts`. That exercises the whole tool path with
 * no API key — tools seam → model tool call → server-side execute →
 * document written → `ArtifactLinkCard` rendered → `/artifacts` page
 * with something in it — which is otherwise unreachable in a fresh
 * install and easy to mistake for broken.
 */
const TOOL_TRIGGER = /^\s*save\b/i;

/**
 * The stub replies in the caller's locale. This file lives outside the
 * `[locale]` segment, so the locale comes from the `NEXT_LOCALE` cookie
 * next-intl's middleware sets on every page navigation.
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
 * One call per turn: once the transcript carries a saveArtifact call,
 * the follow-up step reports instead of calling again.
 */
function callsTool(userText: string, prompt: unknown): boolean {
  return (
    TOOL_TRIGGER.test(userText) &&
    !JSON.stringify(prompt).includes("saveArtifact")
  );
}

/**
 * Resolves the language model for a chat turn. `modelId` is unused by
 * the stub (it only ever returns one model) — a real implementation
 * switches on it, e.g.:
 *
 *   import { anthropic } from "@ai-sdk/anthropic";
 *
 *   export function getChatModel(modelId: string): LanguageModel {
 *     if (modelId === CHAT_MODEL_ID) return anthropic("claude-sonnet-4-6-20260214");
 *     return anthropic("claude-sonnet-4-6-20260214");
 *   }
 *
 * and `CHAT_MODEL_ID` above becomes whatever registered id matches the
 * provider model string you pass.
 */
export function getChatModel(modelId: string): LanguageModel {
  void modelId;
  return createStubLanguageModel({
    modelId: CHAT_MODEL_ID,
    reply: async (userText, prompt) => {
      const t = await getTranslations({
        locale: await resolveLocale(),
        namespace: "chat",
      });
      return callsTool(userText, prompt)
        ? t("stub.savingArtifact")
        : `${t("stub.preface")}\n\n${t("stub.youSaid")} "${userText}"`;
    },
    toolCall: (userText, prompt) =>
      callsTool(userText, prompt)
        ? {
            toolName: "saveArtifact",
            input: {
              title: userText.replace(TOOL_TRIGGER, "").trim() || "Note",
              content: userText,
            },
          }
        : null,
  });
}
