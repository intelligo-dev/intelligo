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
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@showcase/components/ui/questionnaire";
import { Spinner } from "@showcase/components/ui/spinner";
import { StatusBadge } from "@showcase/components/ui/status-badge";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItems,
  TaskTrigger,
} from "@showcase/components/ui/ai-task";
import type { DataRendererProps } from "@showcase/lib/chat-renderers";

export function ChatTaskCard({ data }: DataRendererProps) {
  const t = useTranslations("chat");
  const task = data as ChatTaskData;
  const items = task.items ?? [];
  const done = items.filter((item) => item.status === "done").length;

  return (
    <Task className="max-w-xl">
      <TaskTrigger
        title={task.title || t("task.title")}
        progress={
          items.length > 0
            ? t("task.progress", { done, total: items.length })
            : undefined
        }
      />
      {items.length > 0 ? (
        <TaskContent>
          <TaskItems>
            {items.map((item) => (
              <TaskItem
                key={item.id}
                status={item.status}
                statusLabel={t(`activity.${statusKey(item.status)}`)}
              >
                {item.title}
              </TaskItem>
            ))}
          </TaskItems>
        </TaskContent>
      ) : null}
    </Task>
  );
}

function statusKey(status: ChatTaskData["status"]) {
  switch (status) {
    case "in_progress":
      return "running";
    case "done":
      return "done";
    case "failed":
      return "failed";
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

  return (
    <div className="max-w-xl rounded-lg border p-3">
      <Questionnaire
        onSubmit={(event) => {
          event.preventDefault();
          if (!canAnswer) return;
          const form = new FormData(event.currentTarget);
          const picked = form
            .getAll(question.id)
            .map((value) => String(value))
            .filter(Boolean);
          const answer = picked
            .map(
              (value) =>
                question.options?.find((option) => option.id === value)
                  ?.label ?? value
            )
            .join(", ")
            .trim();
          if (!answer) return;
          setAnswered(true);
          actions?.sendMessage(answer);
        }}
      >
        <QuestionnaireItem
          name={question.id}
          required
          multiple={Boolean(question.options && question.multiple)}
          disabled={!canAnswer}
        >
          <QuestionnaireTitle>{question.prompt}</QuestionnaireTitle>
          {question.options ? (
            <QuestionnaireChoices>
              {question.options.map((option) => (
                <QuestionnaireChoice key={option.id} value={option.id}>
                  {option.label}
                  {option.description ? (
                    <QuestionnaireChoiceDescription>
                      {option.description}
                    </QuestionnaireChoiceDescription>
                  ) : null}
                </QuestionnaireChoice>
              ))}
            </QuestionnaireChoices>
          ) : (
            <QuestionnaireInput
              placeholder={t("question.freeformPlaceholder")}
            />
          )}
        </QuestionnaireItem>
        <QuestionnaireActions>
          {answered ? (
            <StatusBadge status="success" dot>
              {t("question.answered")}
            </StatusBadge>
          ) : (
            <QuestionnaireSubmit>{t("question.answer")}</QuestionnaireSubmit>
          )}
        </QuestionnaireActions>
      </Questionnaire>
    </div>
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
