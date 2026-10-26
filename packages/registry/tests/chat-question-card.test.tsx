/**
 * A question card offers an answer only on the conversation's latest
 * message: an earlier question was answered by the turn after it, and
 * a reload must not make it answerable again.
 */

import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/item", () => ({
  Item: () => null,
  ItemActions: () => null,
  ItemContent: () => null,
  ItemDescription: () => null,
  ItemMedia: () => null,
  ItemTitle: () => null,
}));
vi.mock("@/components/ui/ai-approval-card", () => ({
  ApprovalCard: ({ status }: { status: string; children?: ReactNode }) => (
    <div data-status={status} />
  ),
}));
vi.mock("@/components/ui/status-badge", () => ({ StatusBadge: () => null }));
vi.mock("@/components/ui/ai-agent-progress", () => ({
  AgentProgress: () => null,
}));
vi.mock("@/components/ui/ai-todo-list", () => ({ TodoList: () => null }));
vi.mock("@/components/chat/artifact-card", () => ({
  ArtifactCard: () => null,
  useArtifactStream: () => null,
}));

import { ChatQuestionCard } from "../base/chat/components/data-parts";

const question = {
  id: "q1",
  prompt: "Which role?",
  options: [{ id: "a", label: "Analyst" }],
};

function status(isLastMessage: boolean, data: object = question) {
  const html = renderToStaticMarkup(
    <ChatQuestionCard
      name="chat-question"
      data={data}
      messageId="m1"
      isStreaming={false}
      isLastMessage={isLastMessage}
      isReadonly={false}
      actions={{ sendMessage: () => {} } as never}
    />
  );
  return /data-status="([^"]+)"/.exec(html)?.[1];
}

describe("ChatQuestionCard", () => {
  it("is open on the latest message", () => {
    expect(status(true)).toBe("pending");
  });

  it("shows as answered on an earlier message", () => {
    expect(status(false)).toBe("answered");
  });

  it("follows the question's own answered flag when it has one", () => {
    expect(status(true, { ...question, answered: true })).toBe("answered");
    expect(status(false, { ...question, answered: false })).toBe("pending");
  });
});
