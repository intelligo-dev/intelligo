/**
 * Refusals: one status per code, one message key per situation.
 *
 * The transport never invents copy. It asks a translator for a key,
 * and the application binds that translator to its own message files
 * (`messages(request)` in the config). The English table below is the
 * default a deployment gets when it binds nothing.
 */

import type { ChatErrorBody, ChatErrorCode } from "./client";

export const CHAT_ERROR_STATUS: Readonly<Record<ChatErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  QUOTA_EXCEEDED: 402,
  FEATURE_GATED: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  BILLING_NOT_CONFIGURED: 503,
};

/**
 * Every message the transport can answer with. One key per situation,
 * not per code: `BAD_REQUEST` has three.
 */
export type ChatMessageKey =
  | "invalidBody"
  | "messageTooLong"
  | "attachmentRejected"
  | "unauthorized"
  | "rateLimited"
  | "featureGated"
  | "notFound"
  | "quotaExceeded"
  | "billingNotConfigured"
  | "internalError"
  | "streamError";

export type ChatMessageParams = Record<string, string | number>;

/** Resolves a message key in the caller's locale. */
export type ChatMessages = (
  key: ChatMessageKey,
  params?: ChatMessageParams
) => string;

const ENGLISH: Readonly<Record<ChatMessageKey, string>> = {
  invalidBody: "Invalid request body.",
  messageTooLong: "Message is too long (max {max} characters).",
  attachmentRejected: "That attachment type isn't accepted.",
  unauthorized: "Unauthorized.",
  rateLimited: "Rate limit exceeded. Try again in {seconds}s.",
  featureGated: "Chat isn't included in your current plan.",
  notFound: "That conversation no longer exists.",
  quotaExceeded: "Usage quota exceeded. Upgrade your plan or purchase credits.",
  billingNotConfigured: "Billing is not configured for this deployment.",
  internalError: "Something went wrong.",
  streamError: "Something went wrong while generating a response.",
};

/** The default translator: English, with `{param}` interpolation. */
export const DEFAULT_CHAT_MESSAGES: ChatMessages = (key, params = {}) =>
  ENGLISH[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );

/** A JSON refusal with the status its code fixes. */
export function refuse(
  code: ChatErrorCode,
  error: string,
  extra: Partial<Omit<ChatErrorBody, "error" | "code">> = {},
  headers: Record<string, string> = {}
): Response {
  const body: ChatErrorBody = { error, code, ...extra };
  return Response.json(body, { status: CHAT_ERROR_STATUS[code], headers });
}
