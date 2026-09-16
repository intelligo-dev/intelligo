/**
 * Live demos for the agent-run parts of the design system (T3): activity
 * streams, progress, reasoning, to-dos, tool approval and results,
 * decisions and file diffs. Each one is the installed registry component,
 * driven by local simulated state — no model, no network.
 */
import { useEffect, useState, type ReactNode } from "react";
import { RotateCcwIcon } from "lucide-react";

import {
  AgentActivity,
  type AgentActivityItem,
} from "@showcase/components/ui/ai-agent-activity";
import { AgentProgress } from "@showcase/components/ui/ai-agent-progress";
import {
  ApprovalCard,
  type ApprovalCardStatus,
} from "@showcase/components/ui/ai-approval-card";
import {
  FileDiff,
  type FileDiffLine,
} from "@showcase/components/ui/ai-file-diff";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@showcase/components/ui/ai-reasoning";
import { ReasoningText } from "@showcase/components/ui/ai-reasoning-text";
import { ShimmerText } from "@showcase/components/ui/ai-shimmer-text";
import { TodoList, type TodoItem } from "@showcase/components/ui/ai-todo-list";
import {
  ToolApproval,
  ToolApprovalCode,
  type ToolApprovalStatus,
} from "@showcase/components/ui/ai-tool-approval";
import {
  ToolResult,
  ToolResultOutput,
} from "@showcase/components/ui/ai-tool-result";
import { Button } from "@showcase/components/ui/button";

/* ----------------------------------------------------------------------------
 * Shared scaffolding
 * ------------------------------------------------------------------------- */

/** Counts from 0 to `total` every `ms`; changing `run` starts it over. */
function useStep(total: number, ms: number, run: number) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= total) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, ms);
    return () => window.clearInterval(timer);
  }, [total, ms, run]);

  return step;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-xl flex-col gap-3">{children}</div>;
}

function ReplayButton({
  onClick,
  label = "Replay",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="self-start text-muted-foreground"
    >
      <RotateCcwIcon className="size-3.5" />
      {label}
    </Button>
  );
}

/* ----------------------------------------------------------------------------
 * ai-agent-activity
 * ------------------------------------------------------------------------- */

const ACTIVITY_ITEMS: AgentActivityItem[] = [
  {
    id: "a1",
    type: "text",
    content: "The user wants last quarter's churn drivers, with sources.",
  },
  {
    id: "a2",
    type: "search",
    query: "SaaS churn benchmarks 2026",
    results: [
      {
        id: "r1",
        title: "Retention benchmarks by segment",
        domain: "example.com",
      },
      {
        id: "r2",
        title: "Why customers leave in year one",
        domain: "example.org",
      },
    ],
    moreCount: 3,
  },
  {
    id: "a3",
    type: "tool",
    action: "read",
    target: "reports/q2-retention.csv",
  },
  {
    id: "a4",
    type: "tool",
    action: "edit",
    target: "docs/churn-summary.md",
    additions: 24,
    deletions: 6,
  },
  { id: "a5", type: "step", label: "Drafted the summary for review" },
];

function AgentActivityDemo() {
  const [run, setRun] = useState(0);
  const step = useStep(ACTIVITY_ITEMS.length + 1, 1100, run);
  const working = step <= ACTIVITY_ITEMS.length;
  const items = ACTIVITY_ITEMS.slice(
    0,
    Math.min(step, ACTIVITY_ITEMS.length)
  ).map((item, index, shown): AgentActivityItem =>
    working &&
    index === shown.length - 1 &&
    (item.type === "search" || item.type === "tool")
      ? { ...item, status: "running" }
      : item
  );

  return (
    <Frame>
      <AgentActivity
        items={items}
        status={working ? "working" : "complete"}
        duration={step * 1.1}
        maxHeight={180}
      />
      <ReplayButton onClick={() => setRun((current) => current + 1)} />
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-agent-progress
 * ------------------------------------------------------------------------- */

function AgentProgressDemo() {
  return (
    <Frame>
      <AgentProgress label="Indexing documents" />
      <AgentProgress label="Summarizing the thread" initialSeconds={64} />
      <AgentProgress label="Paused" elapsedSeconds={12.4} running={false} />
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-reasoning
 * ------------------------------------------------------------------------- */

const REASONING = `The request asks for a **workspace-level** summary, so member-private notes stay out.

1. Group the open tasks by owner.
2. Flag anything overdue by more than a week.
3. Keep the summary under five bullet points.`;

/** One reasoning pass: streams for three seconds, then folds with its time. */
function ReasoningRun() {
  const streaming = useStep(1, 3200, 0) === 0;

  return (
    <Reasoning isStreaming={streaming}>
      <ReasoningTrigger
        getThinkingMessage={(isStreaming, duration) =>
          isStreaming
            ? "Thinking…"
            : duration === undefined
              ? "Thought briefly"
              : `Thought for ${duration} seconds`
        }
      />
      <ReasoningContent>{REASONING}</ReasoningContent>
    </Reasoning>
  );
}

function ReasoningDemo() {
  const [run, setRun] = useState(0);

  return (
    <Frame>
      <ReasoningRun key={run} />
      <ReplayButton onClick={() => setRun((current) => current + 1)} />
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-reasoning-text
 * ------------------------------------------------------------------------- */

const PHRASES = [
  "Reading the brief",
  "Checking the workspace",
  "Drafting a reply",
];

function ReasoningTextDemo() {
  return (
    <Frame>
      {(["cascade", "swap", "scramble"] as const).map((variant) => (
        <div
          key={variant}
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          <span className="w-16 font-mono text-xs text-muted-foreground">
            {variant}
          </span>
          <ReasoningText variant={variant} phrases={PHRASES} interval={2000} />
        </div>
      ))}
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-shimmer-text
 * ------------------------------------------------------------------------- */

const SHIMMER_PHRASES = [
  "Searching your documents…",
  "Comparing three sources…",
  "Writing the answer…",
];

function ShimmerTextDemo() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % SHIMMER_PHRASES.length),
      2200
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Frame>
      <ShimmerText className="text-base">
        {SHIMMER_PHRASES[index] ?? ""}
      </ShimmerText>
      <ShimmerText duration={4}>Slow sweep, fixed text</ShimmerText>
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-todo-list
 * ------------------------------------------------------------------------- */

const TODO_TITLES = [
  "Collect last month's usage exports",
  "Group spend by workspace",
  "Flag workspaces over their plan",
  "Draft the billing summary",
];

function TodoListDemo() {
  const [run, setRun] = useState(0);
  // Each task takes two ticks: in progress, then completed.
  const step = useStep(TODO_TITLES.length * 2, 900, run);
  const items: TodoItem[] = TODO_TITLES.map((title, index) => {
    const started = step > index * 2;
    const done = step > index * 2 + 1;
    return {
      id: `todo-${index}`,
      title,
      status: done ? "completed" : started ? "in-progress" : "pending",
      detail: index === 0 && done ? "3 files" : undefined,
    };
  });

  return (
    <Frame>
      <TodoList title="Monthly billing review" items={items} />
      <ReplayButton onClick={() => setRun((current) => current + 1)} />
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-tool-approval
 * ------------------------------------------------------------------------- */

function ToolApprovalDemo() {
  const [status, setStatus] = useState<ToolApprovalStatus>("pending");
  const [note, setNote] = useState<string | null>(null);

  // Allowing walks the card through approving → running → completed.
  useEffect(() => {
    const next: Partial<Record<ToolApprovalStatus, ToolApprovalStatus>> = {
      approving: "running",
      running: "complete",
    };
    const target = next[status];
    if (!target) return;
    const timer = window.setTimeout(() => setStatus(target), 1200);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <Frame>
      <ToolApproval
        tool="workspace.members.invite"
        title="Invite 3 people to the workspace?"
        status={status}
        alwaysAllow
        denyReason
        defaultOpen
        parameters={[
          { id: "role", label: "Role", value: "member" },
          {
            id: "emails",
            label: "Emails",
            value: (
              <ToolApprovalCode
                language="json"
                code={
                  '["ana@example.com", "li@example.com", "sam@example.com"]'
                }
              />
            ),
          },
        ]}
        onAllow={(remember) => {
          setNote(
            remember ? "Always allowed for this workspace." : "Allowed once."
          );
          setStatus("approving");
        }}
        onDeny={(reason) => {
          setNote(reason ? `Denied: “${reason}”` : "Denied without a reason.");
          setStatus("denied");
        }}
      />
      {status !== "pending" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{note}</span>
          <ReplayButton
            label="Reset"
            onClick={() => {
              setNote(null);
              setStatus("pending");
            }}
          />
        </div>
      ) : null}
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-tool-result
 * ------------------------------------------------------------------------- */

const OUTPUT_LINES = [
  "$ export --workspace acme --format csv",
  "Reading 1,284 records…",
  "Writing members.csv (212 rows)",
  "Writing usage.csv (1,072 rows)",
  "Done in 2.4s",
];

function ToolResultDemo() {
  const [run, setRun] = useState(0);
  const step = useStep(OUTPUT_LINES.length, 650, run);
  const running = step < OUTPUT_LINES.length;
  const output = OUTPUT_LINES.slice(0, Math.max(1, step)).join("\n");

  return (
    <Frame>
      <ToolResult
        tool="workspace.export"
        title={running ? "Exporting workspace data" : "Exported workspace data"}
        kind="terminal"
        status={running ? "running" : "success"}
        meta={running ? undefined : "2.4s"}
        collapseOnComplete={false}
        maxHeight={160}
        copyText={OUTPUT_LINES.join("\n")}
        onRetry={() => setRun((current) => current + 1)}
      >
        <ToolResultOutput>{output}</ToolResultOutput>
      </ToolResult>
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-approval-card
 * ------------------------------------------------------------------------- */

function ApprovalCardDemo() {
  const [mode, setMode] = useState<"decision" | "questions">("decision");
  const [status, setStatus] = useState<ApprovalCardStatus>("pending");
  const [result, setResult] = useState<string | undefined>();
  const [run, setRun] = useState(0);

  const reset = () => {
    setStatus("pending");
    setResult(undefined);
    setRun((current) => current + 1);
  };

  return (
    <Frame>
      <div className="flex gap-1">
        {(["decision", "questions"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mode === value ? "secondary" : "ghost"}
            onClick={() => {
              setMode(value);
              reset();
            }}
          >
            {value === "decision" ? "Decision" : "Questions"}
          </Button>
        ))}
      </div>

      {mode === "decision" ? (
        <ApprovalCard
          key={`decision-${run}`}
          title="Publish the onboarding guide?"
          description="The agent finished the draft and wants to share it with every workspace member."
          status={status}
          result={result}
          onApprove={() => {
            setStatus("approved");
            setResult("Published to 18 members.");
          }}
          onRequestChanges={() => {
            setStatus("changes-requested");
            setResult("The agent will revise the draft.");
          }}
          onReject={() => {
            setStatus("rejected");
            setResult("The draft stays private.");
          }}
        />
      ) : (
        <ApprovalCard
          key={`questions-${run}`}
          status={status}
          result={result}
          questions={[
            {
              id: "tone",
              title: "Which tone should the reply use?",
              options: [
                { value: "friendly", label: "Friendly" },
                { value: "formal", label: "Formal" },
                { value: "brief", label: "Brief" },
              ],
            },
            {
              id: "include",
              title: "What should it include?",
              multiple: true,
              options: [
                { value: "summary", label: "A short summary" },
                { value: "links", label: "Links to sources" },
                { value: "next", label: "Next steps" },
              ],
              allowCustom: true,
              customPlaceholder: "Something else…",
            },
          ]}
          onSubmit={(answers) => {
            const picked = Object.values(answers).reduce(
              (count, answer) => count + answer.selected.length,
              0
            );
            setStatus("answered");
            setResult(`${picked} choices sent to the agent.`);
          }}
        />
      )}

      {status !== "pending" ? (
        <ReplayButton label="Reset" onClick={reset} />
      ) : null}
    </Frame>
  );
}

/* ----------------------------------------------------------------------------
 * ai-file-diff
 * ------------------------------------------------------------------------- */

const DIFF_LINES: FileDiffLine[] = [
  {
    id: "d1",
    type: "context",
    oldLine: 12,
    newLine: 12,
    content: "export function greeting(member: Member) {",
  },
  {
    id: "d2",
    type: "removed",
    oldLine: 13,
    content: '  return "Hello, " + member.name;',
  },
  {
    id: "d3",
    type: "added",
    newLine: 13,
    content: "  const name = member.displayName ?? member.name;",
  },
  {
    id: "d4",
    type: "added",
    newLine: 14,
    content: "  return `Welcome back, ${name}`;",
  },
  { id: "d5", type: "context", oldLine: 14, newLine: 15, content: "}" },
  { id: "d6", type: "context", oldLine: 15, newLine: 16, content: "" },
  {
    id: "d7",
    type: "added",
    newLine: 17,
    content: "export const GREETING_VERSION = 2;",
  },
];

function FileDiffDemo() {
  const [run, setRun] = useState(0);
  const step = useStep(DIFF_LINES.length, 500, run);
  const streaming = step < DIFF_LINES.length;

  return (
    <Frame>
      <FileDiff
        file="src/lib/greeting.ts"
        lines={DIFF_LINES.slice(0, step)}
        status={streaming ? "streaming" : "complete"}
        collapseOnComplete={false}
        maxHeight={180}
        copyText={DIFF_LINES.map((line) => line.content).join("\n")}
      />
      <ReplayButton onClick={() => setRun((current) => current + 1)} />
    </Frame>
  );
}

export const AGENT_DEMOS: Record<string, () => ReactNode> = {
  "ai-agent-activity": () => <AgentActivityDemo />,
  "ai-agent-progress": () => <AgentProgressDemo />,
  "ai-reasoning": () => <ReasoningDemo />,
  "ai-reasoning-text": () => <ReasoningTextDemo />,
  "ai-shimmer-text": () => <ShimmerTextDemo />,
  "ai-todo-list": () => <TodoListDemo />,
  "ai-tool-approval": () => <ToolApprovalDemo />,
  "ai-tool-result": () => <ToolResultDemo />,
  "ai-approval-card": () => <ApprovalCardDemo />,
  "ai-file-diff": () => <FileDiffDemo />,
};
