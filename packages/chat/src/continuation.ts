/**
 * The assistant message a continuation resumes, rebuilt from storage.
 *
 * A continuation sends back the assistant's own message with answers
 * added client-side: an approval for a tool call that awaits one, or
 * the output of a tool the client runs. Everything else in that message
 * was written by the model, and the client's copy of it is not trusted:
 * the stored message is taken, and only those answers are copied onto
 * it. The finished reply is persisted from the result, so a client
 * cannot rewrite what the assistant said.
 */

import type { UIMessage } from "ai";

type Part = Record<string, unknown>;

function isToolPart(part: Part): boolean {
  return typeof part.toolCallId === "string";
}

function sameInput(a: Part, b: Part): boolean {
  return JSON.stringify(a.input) === JSON.stringify(b.input);
}

function approvalOf(part: Part): Part | null {
  return typeof part.approval === "object" && part.approval !== null
    ? (part.approval as Part)
    : null;
}

/**
 * The stored part with the client's answer applied, the stored part
 * unchanged when the client sent no answer, or null when the client's
 * copy changes the call in any other way.
 */
function answered(stored: Part, sent: Part | undefined): Part | null {
  if (!sent || sent.state === stored.state) return stored;
  if (sent.type !== stored.type || !sameInput(stored, sent)) return null;

  if (
    stored.state === "approval-requested" &&
    sent.state === "approval-responded"
  ) {
    const proposed = approvalOf(stored);
    const answer = approvalOf(sent);
    if (
      !proposed ||
      !answer ||
      answer.id !== proposed.id ||
      typeof answer.approved !== "boolean"
    ) {
      return null;
    }
    return {
      ...stored,
      state: "approval-responded",
      approval: {
        ...proposed,
        approved: answer.approved,
        ...(typeof answer.reason === "string" ? { reason: answer.reason } : {}),
      },
    };
  }

  // A tool with no server-side execute stops the stream with its call
  // awaiting input; the client runs it and sends the result.
  if (stored.state === "input-available") {
    if (sent.state === "output-available" && "output" in sent) {
      return { ...stored, state: "output-available", output: sent.output };
    }
    if (sent.state === "output-error" && typeof sent.errorText === "string") {
      return { ...stored, state: "output-error", errorText: sent.errorText };
    }
  }
  return null;
}

/**
 * The message to continue from: `stored`'s parts with the answers in
 * `sent` applied, or null when the continuation must be refused — no
 * stored assistant message under that id, a tool call the model never
 * made, or a change other than an answer.
 */
export function trustedContinuation(
  stored: UIMessage | undefined,
  sent: UIMessage
): UIMessage | null {
  if (!stored || stored.role !== "assistant" || stored.id !== sent.id) {
    return null;
  }

  const sentCalls = new Map<string, Part>();
  for (const raw of sent.parts) {
    const part = raw as unknown as Part;
    if (isToolPart(part)) sentCalls.set(part.toolCallId as string, part);
  }

  const parts: Part[] = [];
  const known = new Set<string>();
  for (const raw of stored.parts) {
    const part = raw as unknown as Part;
    if (!isToolPart(part)) {
      parts.push(part);
      continue;
    }
    const id = part.toolCallId as string;
    known.add(id);
    const next = answered(part, sentCalls.get(id));
    if (!next) return null;
    parts.push(next);
  }
  for (const id of sentCalls.keys()) {
    if (!known.has(id)) return null;
  }

  return {
    ...stored,
    parts: parts as unknown as UIMessage["parts"],
  };
}
