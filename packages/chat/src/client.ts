/**
 * What a chat client needs to know about the transport. Imports nothing at
 * runtime (`./parts` is types and one type guard), so the UI never pulls
 * the server handler, or Drizzle, Stripe and the auth server behind it,
 * into the browser.
 */

/** Stable codes the transport answers with. The status is fixed per code. */
export const CHAT_ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "QUOTA_EXCEEDED",
  "FEATURE_GATED",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL",
  "BILLING_NOT_CONFIGURED",
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

/** The JSON body of every non-2xx answer from the chat transport. */
export type ChatErrorBody = {
  /** Human-readable, in the caller's locale when the app bound a translator. */
  error: string;
  code: ChatErrorCode;
  /**
   * The entitlement port's own refusal code (`insufficient_credits`,
   * `allowance_depleted`, …) when `code` is `QUOTA_EXCEEDED` or
   * `BILLING_NOT_CONFIGURED`.
   */
  reasonCode?: string;
  /** Set on `RATE_LIMITED`. */
  retryAfterSeconds?: number;
};

/**
 * What the chat page opened with: a server-rendered estimate of the
 * caller's credit, so the page can say "you are out" before a message
 * is spent on finding out. Amounts are micros of the billing currency.
 */
export type ChatQuotaState = {
  /** False when the next turn would be refused. */
  allowed: boolean;
  /** Why, when the engine refused. */
  reason: string | null;
  /** Typed refusal, for a UI that wants to distinguish them. */
  code: string | null;
  /** Balance left across every pool. */
  remaining: number;
  /** Worst-case cost of one turn. */
  estimated: number;
  /** Where "upgrade" and "top up" should go. */
  upgradeHref: string;
};

/**
 * A model the composer may offer. `id` is a registered model id; the
 * transport refuses any other. `featureKey` gates it by plan.
 */
export type ChatModelOption = {
  id: string;
  label: string;
  description?: string;
  /** Plan feature the workspace needs for this model; unset means every plan. */
  featureKey?: string;
};

export type {
  ChatAgentData,
  ChatArtifactData,
  ChatAuthorizationData,
  ChatCompactionData,
  ChatDataChunk,
  ChatDataPart,
  ChatDataPartName,
  ChatDataParts,
  ChatMessageMetadata,
  ChatQuestionData,
  ChatQuestionOption,
  ChatStatusData,
  ChatTaskData,
  ChatTaskItem,
  ChatTaskStatus,
  ChatUIMessage,
  ChatUIMessageChunk,
} from "./parts";
export { isChatDataPart } from "./parts";

const CODES: ReadonlySet<string> = new Set(CHAT_ERROR_CODES);

/**
 * The transport's error body, from the error `useChat` surfaces.
 *
 * The AI SDK's transport throws an `Error` whose message is the
 * response text, so a JSON refusal arrives as a string. Anything that
 * is not one of ours — a network failure, a proxy's HTML page — is
 * null, and belongs in a generic error strip rather than a banner.
 */
export function parseChatError(error: unknown): ChatErrorBody | null {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<ChatErrorBody>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.error !== "string" ||
      typeof parsed.code !== "string" ||
      !CODES.has(parsed.code)
    ) {
      return null;
    }
    return {
      error: parsed.error,
      code: parsed.code as ChatErrorCode,
      ...(typeof parsed.reasonCode === "string"
        ? { reasonCode: parsed.reasonCode }
        : {}),
      ...(typeof parsed.retryAfterSeconds === "number"
        ? { retryAfterSeconds: parsed.retryAfterSeconds }
        : {}),
    };
  } catch {
    return null;
  }
}
