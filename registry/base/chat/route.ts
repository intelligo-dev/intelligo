/**
 * Chat API Route Handler.
 *
 * POST — streams an assistant reply through the execution boundary:
 *   auth → rate limit → feature gate → load-or-create conversation →
 *   executions.begin() → streamText → persist. Ordering mirrors
 * Acme's production `/api/chat` route; ADR-0003 is why entitlement
 * is decided here (`executions.begin`) rather than earlier — the hold
 * has to match the model that's actually about to run.
 *
 * Deletion is not handled here: the `deleteConversation` server action
 * in `actions/chat.ts` is the one delete path (the UI already calls
 * it, and a second HTTP surface for the same mutation would just be
 * drift risk).
 *
 * Consumer contract: this route imports `{ composeIntelligo, executions }`
 * from `@/lib/intelligo` — this scaffold's composition root (ADR-0005).
 * `executions` must be an `Executions` instance
 * (`@intelligo/executions`'s `createExecutions(ports)`) with its
 * entitlement/settlement ports already bound to this deployment's
 * billing rules; `composeIntelligo()` must be idempotent and safe to
 * call on every request (Next does not guarantee one module instance
 * across server bundles — see AGENTS.md). If your app names that file
 * or those exports differently, update the import below; nothing else
 * in this route assumes a specific composition-root shape beyond
 * those two names.
 *
 * Everything else this route decides — system prompt, tools, feature
 * key, capability, agent id, message-length cap, step budget, and how a
 * new conversation is titled — comes from `@/lib/chat-server-config`,
 * consumer-owned source you edit instead of this file. Tools in
 * particular: bind them there and the tool-renderer seam in
 * `@/lib/chat-renderers` starts receiving calls.
 *
 * `chatServerConfig.featureKey` ("chat" by default) must be registered
 * for at least one plan via `registerProductFeatures`
 * (`@intelligo/billing/plans`) or every request is feature-gated out —
 * see `@/lib/plans.ts`.
 *
 * i18n: this route lives at `app/api/chat/route.ts`, outside the
 * `[locale]` segment (ADR-0010), so there is no URL segment or
 * `next-intl` middleware header to read a locale from. `resolveLocale`
 * below falls back to the `NEXT_LOCALE` cookie next-intl's middleware
 * already sets for every page navigation, then to the configured
 * default locale — the same "works with nothing extra" guarantee a
 * single-locale deployment gets everywhere else.
 */

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import type { UIMessage } from "ai";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireWorkspace } from "@intelligo/auth";
import {
  checkRateLimit,
  getWorkspaceBilling,
  hasFeature,
} from "@intelligo/billing";
import {
  createConversation,
  getConversation,
  isConversationServiceError,
  upsertMessages,
} from "@intelligo/core/conversations";
import { createLogger } from "@intelligo/core/logger";

import { routing } from "@/i18n/routing";
import { composeIntelligo, executions } from "@/lib/intelligo";
import { CHAT_MODEL_ID, getChatModel } from "@/lib/chat-model";
import { chatServerConfig } from "@/lib/chat-server-config";

export const maxDuration = 300;

const log = createLogger("ChatRoute");

// ---------------------------------------------------------------------------
// Locale resolution — see the module doc comment's "i18n" section.
// ---------------------------------------------------------------------------

async function resolveLocale(): Promise<string> {
  const cookieName =
    typeof routing.localeCookie === "object"
      ? (routing.localeCookie.name ?? "NEXT_LOCALE")
      : "NEXT_LOCALE";
  const value = (await cookies()).get(cookieName)?.value;
  const locales: readonly string[] = routing.locales;
  return value && locales.includes(value) ? value : routing.defaultLocale;
}

async function chatTranslations() {
  return getTranslations({ locale: await resolveLocale(), namespace: "chat" });
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const messagePartSchema = z.object({ type: z.string() }).passthrough();

const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(messagePartSchema),
});

const postBodySchema = z.object({
  id: z.string().uuid(),
  messages: z.array(uiMessageSchema).min(1),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

/**
 * Last user message's combined text length, or `null` if the last
 * message isn't from the user. Split out of `postBodySchema` (rather
 * than a `.superRefine`) because its error message is localized, and a
 * zod refinement has no `await` — `t()` above already needs one.
 */
function lastUserMessageLength(
  body: z.infer<typeof postBodySchema>
): number | null {
  const last = body.messages[body.messages.length - 1];
  if (last?.role !== "user") return null;
  return last.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text)
    .join("").length;
}

/** Combined text of the first user message — the title source. */
function firstUserText(body: z.infer<typeof postBodySchema>): string {
  const first = body.messages.find((message) => message.role === "user");
  if (!first) return "";
  return first.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text)
    .join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// POST — stream a reply
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  composeIntelligo();
  const t = await chatTranslations();

  let body: z.infer<typeof postBodySchema>;
  try {
    body = postBodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: t("route.invalidBody"), code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const messageLength = lastUserMessageLength(body);
  if (
    messageLength !== null &&
    messageLength > chatServerConfig.maxMessageLength
  ) {
    return Response.json(
      {
        error: t("route.messageTooLong", {
          max: chatServerConfig.maxMessageLength,
        }),
        code: "BAD_REQUEST",
      },
      { status: 400 }
    );
  }

  let session;
  try {
    session = await requireWorkspace();
  } catch {
    return Response.json(
      { error: t("route.unauthorized"), code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  const actor = {
    workspaceId: session.workspace.id,
    userId: session.user.id,
  };

  // Step 1: rate limit.
  const billing = await getWorkspaceBilling(actor.workspaceId);
  const planSlug = billing.plan?.slug ?? "free";
  const rateLimit = await checkRateLimit(actor.workspaceId, planSlug);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: t("route.rateLimited", {
          seconds: rateLimit.retryAfterSeconds ?? 60,
        }),
        code: "RATE_LIMITED",
      },
      { status: 429 }
    );
  }

  // Step 2: feature gate.
  const allowed = await hasFeature(
    actor.workspaceId,
    chatServerConfig.featureKey
  );
  if (!allowed) {
    return Response.json(
      {
        error: t("route.featureGated"),
        code: "FEATURE_GATED",
      },
      { status: 403 }
    );
  }

  // Step 3: load-or-create the conversation this turn belongs to.
  try {
    await getConversation(actor, body.id);
  } catch (error) {
    if (isConversationServiceError(error) && error.code === "not_found") {
      try {
        // Title the row from the message that opened it, so history
        // rows are distinguishable without anyone renaming them.
        await createConversation(actor, {
          id: body.id,
          agentId: chatServerConfig.agentId,
          modelId: CHAT_MODEL_ID,
          title: chatServerConfig.deriveTitle(firstUserText(body)),
        });
      } catch (createError) {
        log.error("Failed to create conversation", {
          conversationId: body.id,
          error: errorMessage(createError),
        });
        return Response.json(
          { error: t("route.internalError"), code: "INTERNAL" },
          { status: 500 }
        );
      }
    } else {
      log.error("Failed to load conversation", {
        conversationId: body.id,
        error: errorMessage(error),
      });
      return Response.json(
        { error: t("route.internalError"), code: "INTERNAL" },
        { status: 500 }
      );
    }
  }

  // Step 4: open the execution. Entitlement is decided here, and the
  // worst-case cost reserved, after the model is resolved so the hold
  // matches what will actually run.
  const run = await executions.begin({
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    capability: chatServerConfig.capability,
    model: CHAT_MODEL_ID,
    metadata: { conversationId: body.id },
  });

  if (!run.allowed) {
    return Response.json(
      {
        error: run.reason ?? t("route.quotaExceeded"),
        code: "QUOTA_EXCEEDED",
      },
      { status: 402 }
    );
  }

  // `postBodySchema` validates shape (id/role/a typed part discriminator)
  // without re-declaring every AI SDK part variant — the cast reflects
  // that: parts are zod-validated, just not to the SDK's own exact
  // union type.
  const modelMessages = await convertToModelMessages(
    body.messages as UIMessage[]
  );

  // Captured inside `execute` (where the `streamText` result lives)
  // and read back in the outer `onFinish` below — `result.usage` only
  // resolves once the stream has fully drained.
  let capturedUsage:
    | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
    | undefined;

  // Tools may close over the turn's tenancy (see chat-server-config).
  const tools =
    typeof chatServerConfig.tools === "function"
      ? await chatServerConfig.tools({ ...actor, conversationId: body.id })
      : chatServerConfig.tools;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: getChatModel(CHAT_MODEL_ID),
        system: chatServerConfig.systemPrompt,
        messages: modelMessages,
        ...(tools && Object.keys(tools).length > 0
          ? { tools, stopWhen: stepCountIs(chatServerConfig.maxSteps) }
          : {}),
      });

      writer.merge(result.toUIMessageStream());

      const usage = await result.usage;
      capturedUsage = {
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalTokens: usage?.totalTokens,
      };
    },
    generateId,
    onFinish: async ({ messages: finishedMessages }) => {
      // Settling can throw (unrecorded usage must not be reported as
      // success — see @intelligo/executions). Log and continue so a
      // settlement failure doesn't also cost the user their message
      // history.
      try {
        await run.complete({
          usage: capturedUsage,
          model: CHAT_MODEL_ID,
          metadata: { conversationId: body.id },
        });
      } catch (error) {
        log.error("Execution settlement failed", {
          conversationId: body.id,
          executionId: run.id,
          error: errorMessage(error),
        });
      }

      try {
        await upsertMessages(body.id, finishedMessages);
      } catch (error) {
        log.error("Message persistence failed", {
          conversationId: body.id,
          error: errorMessage(error),
        });
      }
    },
    onError: (error) => {
      // fail() is a no-op if complete() already won, so a late error
      // after a settled stream can't corrupt the row. `t` was already
      // resolved above, before this callback was defined — `onError`
      // itself stays synchronous (the AI SDK does not await it).
      void run.fail({ error });
      return t("route.streamError");
    },
  });

  return createUIMessageStreamResponse({ stream });
}
