"use client";

/**
 * Mastra's data parts, on the activity timeline.
 *
 * `@mastra/ai-sdk` streams a workflow, an agent network and a nested
 * agent as `data-workflow`, `data-workflow-step`, `data-network`,
 * `data-tool-agent` and `data-tool-agent-step` parts, each a snapshot
 * reconciled by id. They arrive here untouched (ADR-0003: no helper
 * over the framework) and render as steps on the T3 chain-of-thought
 * part. The shapes are read defensively — Mastra's payloads carry
 * more than what is shown, and a field that is missing costs a label,
 * not a render.
 */

import { useTranslations } from "use-intl";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtSteps,
  type ChainOfThoughtStepStatus,
} from "@showcase/components/ui/ai-chain-of-thought";
import type { DataRendererProps } from "@showcase/lib/chat-renderers";

type Snapshot = Record<string, unknown>;

function asRecord(value: unknown): Snapshot {
  return typeof value === "object" && value !== null ? (value as Snapshot) : {};
}

function stepStatus(raw: unknown): ChainOfThoughtStepStatus {
  const status = typeof raw === "string" ? raw : "";
  if (status === "success" || status === "completed" || status === "done") {
    return "complete";
  }
  if (status === "failed" || status === "error") return "error";
  if (status === "running" || status === "in_progress" || status === "streaming") {
    return "active";
  }
  return "pending";
}

function statusMessageKey(status: ChainOfThoughtStepStatus) {
  switch (status) {
    case "complete":
      return "activity.done";
    case "error":
      return "activity.failed";
    case "active":
      return "activity.running";
    default:
      return "activity.pending";
  }
}

/** Mastra's `steps` map or array → ordered rows. */
function stepsOf(snapshot: Snapshot): Array<{
  id: string;
  label: string;
  status: ChainOfThoughtStepStatus;
}> {
  const raw = snapshot.steps;
  const entries: Array<[string, Snapshot]> = Array.isArray(raw)
    ? raw.map((step, index) => {
        const record = asRecord(step);
        return [String(record.id ?? record.stepId ?? index), record];
      })
    : Object.entries(asRecord(raw)).map(([id, step]) => [id, asRecord(step)]);
  return entries.map(([id, step]) => ({
    id,
    label: String(step.name ?? step.id ?? step.stepId ?? id),
    status: stepStatus(step.status),
  }));
}

function Timeline({
  title,
  status,
  steps,
  isStreaming,
}: {
  title: string;
  status: ChainOfThoughtStepStatus;
  steps: ReturnType<typeof stepsOf>;
  isStreaming: boolean;
}) {
  const t = useTranslations("chat");
  return (
    <ChainOfThought className="max-w-xl" defaultOpen={isStreaming}>
      <ChainOfThoughtHeader>
        {title}
        {steps.length > 0 ? (
          <span className="ml-2 font-normal text-muted-foreground">
            {t("activity.steps", { count: steps.length })}
          </span>
        ) : null}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtSteps>
          {steps.length === 0 ? (
            <ChainOfThoughtStep
              status={status}
              label={t(statusMessageKey(status))}
            />
          ) : (
            steps.map((step) => (
              <ChainOfThoughtStep
                key={step.id}
                status={step.status}
                label={step.label}
                statusLabel={t(statusMessageKey(step.status))}
              />
            ))
          )}
        </ChainOfThoughtSteps>
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

export function MastraWorkflowActivity({ data, isStreaming }: DataRendererProps) {
  const t = useTranslations("chat");
  const snapshot = asRecord(data);
  return (
    <Timeline
      title={String(snapshot.name ?? snapshot.workflowId ?? t("activity.workflow"))}
      status={stepStatus(snapshot.status)}
      steps={stepsOf(snapshot)}
      isStreaming={isStreaming}
    />
  );
}

export function MastraWorkflowStepActivity({
  data,
  isStreaming,
}: DataRendererProps) {
  const t = useTranslations("chat");
  const snapshot = asRecord(data);
  const status = stepStatus(snapshot.status);
  return (
    <ChainOfThought className="max-w-xl" defaultOpen={isStreaming}>
      <ChainOfThoughtHeader>
        {String(snapshot.name ?? snapshot.stepId ?? snapshot.id ?? t("activity.workflow"))}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtSteps>
          <ChainOfThoughtStep status={status} label={t(statusMessageKey(status))} />
        </ChainOfThoughtSteps>
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

export function MastraNetworkActivity({ data, isStreaming }: DataRendererProps) {
  const t = useTranslations("chat");
  const snapshot = asRecord(data);
  return (
    <Timeline
      title={String(snapshot.name ?? snapshot.networkId ?? t("activity.network"))}
      status={stepStatus(snapshot.status)}
      steps={stepsOf(snapshot)}
      isStreaming={isStreaming}
    />
  );
}

export function MastraToolAgentActivity({ data, isStreaming }: DataRendererProps) {
  const t = useTranslations("chat");
  const snapshot = asRecord(data);
  return (
    <Timeline
      title={String(snapshot.name ?? snapshot.agentId ?? snapshot.id ?? t("activity.agent"))}
      status={stepStatus(snapshot.status)}
      steps={stepsOf(snapshot)}
      isStreaming={isStreaming}
    />
  );
}

export function MastraToolAgentStepActivity({
  data,
  isStreaming,
}: DataRendererProps) {
  const t = useTranslations("chat");
  const snapshot = asRecord(data);
  const status = stepStatus(snapshot.status);
  return (
    <ChainOfThought className="max-w-xl" defaultOpen={isStreaming}>
      <ChainOfThoughtHeader>
        {String(snapshot.name ?? snapshot.agentId ?? t("activity.agent"))}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtSteps>
          <ChainOfThoughtStep status={status} label={t(statusMessageKey(status))} />
        </ChainOfThoughtSteps>
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
