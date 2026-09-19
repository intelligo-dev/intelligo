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
 * settles with, and an id with no registered price is
 * refused at admission. Using a real id here means a clean install
 * exercises the *correct* pricing path — swap in your own model id the
 * moment you swap in a real provider below, and keep it one that is
 * registered.
 *
 * To use a real provider: install its AI SDK package (e.g.
 * `pnpm add @ai-sdk/anthropic` in this app) and replace the body of
 * `getChatModel` — the commented example below is the whole change.
 *
 * Two strings are in play and they are not interchangeable. The
 * registered id (`anthropic/claude-sonnet-4-6`) is what a turn is
 * admitted and billed under. The provider's own id is often dated
 * (`claude-sonnet-4-6-20260214`) and lives in the registry entry's
 * `model` field. Read it from there; never derive it by trimming the
 * prefix off the registered id, and never write it out a second time.
 */

import type { LanguageModel } from "ai";
import { createStubLanguageModel } from "@intelligo-dev/chat/testing";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";

/** Must be a registered model id in `@intelligo-dev/executions/pricing`. */
export const CHAT_MODEL_ID = "google/gemini-2.5-flash";

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
 * Resolves the language model for a chat turn. `modelId` is unused by
 * the stub (it only ever returns one model). A real implementation
 * looks the id up in the registry, picks the SDK by the entry's
 * `provider`, and hands that SDK the entry's `model`:
 *
 *   import { anthropic } from "@ai-sdk/anthropic";
 *   import { google } from "@ai-sdk/google";
 *   import { getModelPricing } from "@intelligo-dev/executions/pricing";
 *
 *   export function getChatModel(modelId: string): LanguageModel {
 *     const entry = getModelPricing(modelId);
 *     if (!entry) throw new Error(`Model "${modelId}" is not registered.`);
 *     switch (entry.provider) {
 *       case "anthropic":
 *         return anthropic(entry.model);
 *       case "google":
 *         return google(entry.model);
 *       default:
 *         throw new Error(`No AI SDK provider is bound for "${entry.provider}".`);
 *     }
 *   }
 *
 * One `case` per provider whose package this app installed. The
 * transport only calls this with an id admission already priced, so
 * the first `throw` is for callers outside the chat route. Set
 * `CHAT_MODEL_ID` above to the registered id turns run on by default;
 * a model registered with `registerModel` resolves the same way.
 */
export function getChatModel(modelId: string): LanguageModel {
  void modelId;
  return createStubLanguageModel({
    modelId: CHAT_MODEL_ID,
    reply: async (userText) => {
      const t = await getTranslations({
        locale: await resolveLocale(),
        namespace: "chat",
      });
      return `${t("stub.preface")}\n\n${t("stub.youSaid")} "${userText}"`;
    },
  });
}
