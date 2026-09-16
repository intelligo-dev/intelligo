"use server";

/**
 * Chat conversation actions — thin transport over
 * `@intelligo-dev/core/conversations` (ADR-0009): resolve the caller's actor
 * via `requireWorkspace()`, call the core service, map any
 * `ConversationServiceError` to a friendly message, and reshape the
 * result for the page and its client components. Sending a message and
 * streaming a reply is NOT here — that is `app/api/chat/route.ts`,
 * because streaming needs a Route Handler, not a Server Action.
 *
 * `loadConversationForChat` is the one read that treats `not_found` as
 * success rather than failure: `app/[locale]/(app)/chat/page.tsx`
 * redirects to `/chat/<uuid>` without creating a row (see its doc
 * comment), so the very first render of a brand-new conversation
 * legitimately has no `conversations` row yet — the route handler
 * creates it on the first POST. Every other action here treats
 * `not_found`/`forbidden` as a genuine failure.
 */

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@intelligo-dev/auth";
import { recordChatFeedback, toUIMessages } from "@intelligo-dev/chat";
import {
  getDocumentVersions,
  isDocumentServiceError,
  saveDocument,
} from "@intelligo-dev/core/documents";
import {
  deleteConversation as deleteConversationRow,
  getConversation,
  getMessages,
  getVotes,
  isConversationServiceError,
  listConversations,
  renameConversation as renameConversationRow,
  setConversationVisibility,
  updateConversationMetadata,
} from "@intelligo-dev/core/conversations";

import { chatServerConfig } from "@/lib/chat-server-config";

export type ChatActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function friendlyMessageKey(code: string): string | undefined {
  switch (code) {
    case "not_found":
      return "actions.conversationNotFound";
    case "forbidden":
      return "actions.conversationForbidden";
    case "invalid_input":
      return "actions.invalidTitle";
    case "database_error":
      return "actions.databaseError";
    default:
      return undefined;
  }
}

function friendlyError(t: Translator, error: unknown): string {
  // Unknown errors deliberately map to the generic key — a raw
  // `Error#message` can carry internals (SQL, hostnames) to the UI.
  if (isConversationServiceError(error) || isDocumentServiceError(error)) {
    const key = friendlyMessageKey(error.code);
    return key ? t(key) : t("actions.genericError");
  }
  return t("actions.genericError");
}

async function actor() {
  const { workspace, user } = await requireWorkspace();
  return { workspaceId: workspace.id, userId: user.id };
}

export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  pinned: boolean;
};

/** Recent conversations for the sidebar, most recently updated first. */
export async function listConversationHistory(): Promise<
  ChatActionResult<ConversationSummary[]>
> {
  try {
    // Enough to fill a sidebar and be worth searching. The cap is
    // deliberate: past a few hundred, filtering belongs in a query,
    // not in the browser (see `components/chat/chat-history-nav.tsx`).
    const rows = await listConversations(await actor(), { limit: 100 });
    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
        pinned: (row.metadata as { pinned?: unknown } | null)?.pinned === true,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

export type LoadedConversation = {
  conversation: { id: string; title: string | null } | null;
  messages: ReturnType<typeof toUIMessages>;
  /** The reader's votes, by message id. */
  votes: Record<string, "up" | "down">;
};

/**
 * Loads a conversation and its messages for the thread's initial
 * state. A conversation id with no row yet resolves as a brand-new,
 * empty chat rather than an error — see the module doc comment above.
 */
export async function loadConversationForChat(
  id: string
): Promise<ChatActionResult<LoadedConversation>> {
  try {
    const scoped = await actor();

    try {
      const conversation = await getConversation(scoped, id);
      const [rows, voteRows] = await Promise.all([
        getMessages(scoped, id),
        getVotes(scoped, id),
      ]);
      const votes: Record<string, "up" | "down"> = {};
      for (const vote of voteRows) {
        votes[vote.messageId] = vote.isUpvoted ? "up" : "down";
      }
      return {
        success: true,
        data: {
          conversation: { id: conversation.id, title: conversation.title },
          // Stored parts are a JSON string; a corrupt row costs one
          // message, not the conversation.
          messages: toUIMessages(rows),
          votes,
        },
      };
    } catch (error) {
      if (isConversationServiceError(error) && error.code === "not_found") {
        return {
          success: true,
          data: { conversation: null, messages: [], votes: {} },
        };
      }
      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

export async function renameConversation(
  id: string,
  title: string
): Promise<ChatActionResult<{ title: string | null }>> {
  try {
    const updated = await renameConversationRow(await actor(), id, title);
    return { success: true, data: { title: updated.title } };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

export async function deleteConversation(
  id: string
): Promise<ChatActionResult<undefined>> {
  try {
    await deleteConversationRow(await actor(), id);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

/** Pin a conversation to the top of the sidebar, or unpin it. */
export async function setConversationPinned(
  id: string,
  pinned: boolean
): Promise<ChatActionResult<undefined>> {
  try {
    await updateConversationMetadata(await actor(), id, { pinned });
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

/** The reader's verdict on a reply; `null` withdraws it. */
export async function voteMessage(
  conversationId: string,
  messageId: string,
  vote: "up" | "down" | null
): Promise<ChatActionResult<undefined>> {
  const t = await getTranslations("chat");
  try {
    const result = await recordChatFeedback(chatServerConfig, await actor(), {
      conversationId,
      messageId,
      vote,
    });
    if (!result.ok) {
      return {
        success: false,
        error: t(
          result.code === "not_found"
            ? "actions.conversationNotFound"
            : "actions.feedbackFailed"
        ),
      };
    }
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(t, error) };
  }
}

/** Whether the conversation is published at `/share/<id>`. */
export async function getShareState(
  id: string
): Promise<ChatActionResult<{ shared: boolean }>> {
  try {
    const row = await getConversation(await actor(), id);
    return { success: true, data: { shared: row.visibility === "public" } };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

export async function setConversationShared(
  id: string,
  shared: boolean
): Promise<ChatActionResult<{ shared: boolean }>> {
  try {
    const row = await setConversationVisibility(
      await actor(),
      id,
      shared ? "public" : "private"
    );
    revalidatePath(`/share/${id}`);
    return { success: true, data: { shared: row.visibility === "public" } };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

/**
 * Saves one assistant reply as a document artifact, so a useful answer
 * doesn't only live in a conversation. This is the manual counterpart
 * to a `saveArtifact` tool: same destination (`@intelligo-dev/core`'s
 * document persistence, ADR-0009), same `/artifacts` page, just driven
 * by the reader instead of the model.
 *
 * The message id becomes the document id, which makes saving the same
 * reply twice a new *version* of one artifact rather than a duplicate.
 */
export async function saveMessageAsArtifact(params: {
  messageId: string;
  content: string;
  title?: string;
  /** Lets the artifacts page link back to where this came from. */
  conversationId?: string;
}): Promise<ChatActionResult<{ id: string; title: string }>> {
  const t = await getTranslations("chat");

  const content = params.content.trim();
  if (!content) {
    return { success: false, error: t("actions.emptyArtifact") };
  }

  const title = params.title?.trim() || deriveArtifactTitle(content);

  try {
    const saved = await saveDocument(await actor(), {
      id: params.messageId,
      title,
      content,
      kind: "text",
      ...(params.conversationId
        ? { conversationId: params.conversationId }
        : {}),
    });
    revalidatePath("/artifacts");
    return { success: true, data: { id: saved.id, title: saved.title } };
  } catch (error) {
    return { success: false, error: friendlyError(t, error) };
  }
}

/** Every version of a document the canvas shows, newest first. */
export async function listArtifactVersions(
  documentId: string
): Promise<ChatActionResult<Array<{ createdAt: string; content: string }>>> {
  try {
    const versions = await getDocumentVersions(await actor(), documentId);
    return {
      success: true,
      data: versions.map((version) => ({
        createdAt: version.createdAt,
        content: version.content ?? "",
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("chat"), error),
    };
  }
}

/** An edit in the canvas becomes a new version of the document. */
export async function saveArtifactVersion(params: {
  documentId: string;
  title: string;
  kind: string;
  content: string;
}): Promise<ChatActionResult<{ id: string }>> {
  const t = await getTranslations("chat");
  try {
    const saved = await saveDocument(await actor(), {
      id: params.documentId,
      title: params.title,
      content: params.content,
      kind: params.kind,
    });
    revalidatePath("/artifacts");
    return { success: true, data: { id: saved.id } };
  } catch (error) {
    return { success: false, error: friendlyError(t, error) };
  }
}

const MAX_ARTIFACT_TITLE = 60;

/** First line of the reply, trimmed to something list-sized. */
function deriveArtifactTitle(content: string): string {
  const line =
    content
      .split("\n")
      .map((value) => value.replace(/^#+\s*/, "").trim())
      .find(Boolean) ?? "";
  if (!line) return "Untitled";
  return line.length <= MAX_ARTIFACT_TITLE
    ? line
    : `${line.slice(0, MAX_ARTIFACT_TITLE - 1).trimEnd()}…`;
}
