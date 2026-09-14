"use client";

/**
 * Renderers for the framework's own `data-chat-*` parts — the ones a
 * tool writes with `turn.write`, or a runtime binding maps to: a plan,
 * a delegated agent, a document streaming into the canvas, a question
 * the run paused on, a connection that needs a sign-in.
 *
 * Wired through `lib/chat-renderers.tsx`'s `DATA_RENDERERS`, so a
 * product can swap any of them without touching this file.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";
import { BotIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";

import type {
  ChatAgentData,
  ChatArtifactData,
  ChatAuthorizationData,
  ChatQuestionData,
  ChatTaskData,
} from "@intelligo-dev/chat/client";

import { Button } from "@showcase/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@showcase/components/ui/item";
import {
  ApprovalCard,
  type ApprovalCardAnswers,
} from "@showcase/components/ui/ai-approval-card";
import { Spinner } from "@showcase/components/ui/spinner";
import { StatusBadge } from "@showcase/components/ui/status-badge";
import { TodoList, type TodoItemStatus } from "@showcase/components/ui/ai-todo-list";
import type { DataRendererProps } from "@showcase/lib/chat-renderers";

export function ChatTaskCard({ data }: DataRendererProps) {
  const t = useTranslations("chat");
  const task = data as ChatTaskData;
  const items = (task.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    status: todoStatus(item.status),
  }));

  return (
    <TodoList
      className="max-w-xl"
      items={items}
      title={task.title || t("task.title")}
      label={t("task.title")}
      emptyLabel={t("task.empty")}
      completedLabel={(done, total) => t("task.progress", { done, total })}
      statusLabels={{
        pending: t("activity.pending"),
        "in-progress": t("activity.running"),
        completed: t("activity.done"),
        cancelled: t("activity.failed"),
      }}
    />
  );
}

function todoStatus(status: ChatTaskData["status"]): TodoItemStatus {
  switch (status) {
    case "in_progress":
      return "in-progress";
    case "done":
      return "completed";
    case "failed":
      return "cancelled";
    default:
      return "pending";
  }
}

export function ChatAgentCard({ data }: DataRendererProps) {
  const t = useTranslations("chat");
  const agent = data as ChatAgentData;
  const status =
    agent.status === "completed"
      ? "success"
      : agent.status === "failed"
        ? "destructive"
        : "info";

  return (
    <Item variant="outline" size="sm" className="max-w-xl">
      <ItemMedia variant="icon">
        {agent.status === "started" ? <Spinner /> : <BotIcon />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{agent.name}</ItemTitle>
        {agent.summary ? (
          <ItemDescription>{agent.summary}</ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions>
        <StatusBadge status={status} dot>
          {t(
            agent.status === "completed"
              ? "activity.done"
              : agent.status === "failed"
                ? "activity.failed"
                : "activity.running"
          )}
        </StatusBadge>
      </ItemActions>
    </Item>
  );
}

/**
 * The card for a document that streamed (or is streaming) into the
 * canvas. Opening it hands the canvas the part's own id, so the panel
 * that opened for the stream and the one opened from the card are the
 * same panel.
 */
export function ChatArtifactCard({
  data,
  isReadonly,
  actions,
}: DataRendererProps) {
  const t = useTranslations("chat");
  const artifact = data as ChatArtifactData;

  return (
    <Item variant="outline" size="sm" className="max-w-xl">
      <ItemMedia variant="icon">
        {artifact.status === "streaming" ? <Spinner /> : <FileTextIcon />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{artifact.title}</ItemTitle>
        <ItemDescription>
          {artifact.status === "streaming"
            ? t("artifactCard.streaming")
            : artifact.status === "error"
              ? (artifact.error ?? t("artifactCard.failed"))
              : t("artifactCard.saved")}
        </ItemDescription>
      </ItemContent>
      {!isReadonly && actions && artifact.status !== "error" ? (
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() =>
              actions.openCanvas({
                id: artifact.id,
                kind: artifact.kind,
                title: artifact.title,
                ...(artifact.documentId
                  ? { documentId: artifact.documentId }
                  : {}),
                ...(artifact.content !== undefined
                  ? { content: artifact.content }
                  : {}),
                status: artifact.status,
              })
            }
          >
            {t("artifactCard.open")}
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}

/**
 * A question the run paused on — eve's `ask_question`, or a product's
 * own. The answer goes back as the next user turn, so the runtime sees
 * it the way it sees any reply. shadcn's Questionnaire gives the
 * choices their keyboard shortcuts and the single/multiple semantics.
 */
export function ChatQuestionCard({
  data,
  isReadonly,
  actions,
}: DataRendererProps) {
  const t = useTranslations("chat");
  const question = data as ChatQuestionData;
  const [answered, setAnswered] = useState(question.answered ?? false);
  const canAnswer = !answered && !isReadonly && Boolean(actions);

  function submit(answers: ApprovalCardAnswers) {
    if (!canAnswer) return;
    const picked = answers[question.id] ?? { selected: [], custom: "" };
    const labels = picked.selected.map(
      (value) =>
        question.options?.find((option) => option.id === value)?.label ?? value
    );
    const answer = [...labels, picked.custom?.trim() ?? ""]
      .filter(Boolean)
      .join(", ")
      .trim();
    if (!answer) return;
    setAnswered(true);
    actions?.sendMessage(answer);
  }

  return (
    <ApprovalCard
      className="max-w-xl"
      status={answered ? "answered" : "pending"}
      questions={[
        {
          id: question.id,
          title: question.prompt,
          options: question.options?.map((option) => ({
            value: option.id,
            label: option.description
              ? `${option.label} — ${option.description}`
              : option.label,
          })),
          multiple: Boolean(question.options && question.multiple),
          allowCustom: !question.options || question.allowFreeform === true,
          autoAdvance: false,
        },
      ]}
      onSubmit={submit}
      submitLabel={t("question.answer")}
      customPlaceholder={t("question.freeformPlaceholder")}
      statusLabels={{
        pending: t("question.pending"),
        answered: t("question.answered"),
      }}
    />
  );
}

export function ChatAuthorizationCard({ data }: DataRendererProps) {
  const t = useTranslations("chat");
  const auth = data as ChatAuthorizationData;

  if (auth.status === "completed") {
    return (
      <StatusBadge status="success" dot>
        {t("authorization.completed", { name: auth.name })}
      </StatusBadge>
    );
  }

  return (
    <Item variant="outline" size="sm" className="max-w-xl">
      <ItemMedia variant="icon">
        <ExternalLinkIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t("authorization.required", { name: auth.name })}</ItemTitle>
        {auth.instructions || auth.description ? (
          <ItemDescription>
            {auth.instructions ?? auth.description}
          </ItemDescription>
        ) : null}
      </ItemContent>
      {auth.url ? (
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            render={<a href={auth.url} target="_blank" rel="noreferrer" />}
            nativeButton={false}
          >
            {t("authorization.signIn")}
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}
