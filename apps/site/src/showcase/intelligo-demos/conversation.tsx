/**
 * Live demos for the conversation parts of the Intelligo design system
 * (ADR-0013, T3): message rows, bubbles, the transcript scroller, a
 * streamed reply, the composer and its pickers. Each demo uses the
 * registry source as installed and simulates its state locally — no
 * network, no model.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FileTextIcon,
  HashIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SparklesIcon,
  UserIcon,
  WandSparklesIcon,
} from "lucide-react";

import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
  MessageMarker,
  MessageTyping,
} from "@showcase/components/ui/ai-message";
import {
  MessageBubble,
  MessageBubbleCollapsible,
  MessageBubbleContent,
  MessageBubbleGroup,
} from "@showcase/components/ui/ai-message-bubble";
import { MessageScroller } from "@showcase/components/ui/ai-message-scroller";
import { StreamingResponse } from "@showcase/components/ui/ai-streaming-response";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@showcase/components/ui/ai-prompt-input";
import { Suggestion, Suggestions } from "@showcase/components/ui/ai-suggestion";
import {
  Branch,
  BranchNext,
  BranchPage,
  BranchPrevious,
} from "@showcase/components/ui/ai-branch";
import {
  ComposerMenu,
  type ComposerMenuOption,
} from "@showcase/components/ui/ai-composer-menu";
import { SpeechInput } from "@showcase/components/ui/ai-speech-input";
import { Button } from "@showcase/components/ui/button";
import { TooltipProvider } from "@showcase/components/ui/tooltip";

function AssistantAvatar() {
  return (
    <MessageAvatar>
      <SparklesIcon />
    </MessageAvatar>
  );
}

/* ai-message ------------------------------------------------------------- */

function MessageDemo() {
  return (
    <MessageGroup spacing="default">
      <MessageMarker>Today, 9:41</MessageMarker>
      <Message from="user">
        <MessageAvatar>
          <UserIcon />
        </MessageAvatar>
        <MessageContent>
          <MessageHeader>You</MessageHeader>
          <MessageBubble>
            <MessageBubbleContent>
              Which accounts renewed last month?
            </MessageBubbleContent>
          </MessageBubble>
        </MessageContent>
      </Message>
      <Message from="assistant">
        <AssistantAvatar />
        <MessageContent>
          <MessageHeader>Assistant</MessageHeader>
          <MessageBubble variant="outline">
            <MessageBubbleContent>
              Twelve accounts renewed in August, three of them on an annual plan
              for the first time.
            </MessageBubbleContent>
          </MessageBubble>
          <MessageFooter>Answered in 2.4s</MessageFooter>
        </MessageContent>
      </Message>
      <Message from="assistant">
        <AssistantAvatar />
        <MessageContent>
          <MessageBubble>
            <MessageBubbleContent>
              <MessageTyping label="Assistant is responding" />
            </MessageBubbleContent>
          </MessageBubble>
        </MessageContent>
      </Message>
    </MessageGroup>
  );
}

/* ai-message-bubble ------------------------------------------------------ */

function MessageBubbleDemo() {
  return (
    <MessageGroup spacing="default">
      <Message from="user">
        <MessageContent>
          <MessageBubbleGroup>
            <MessageBubble variant="solid">
              <MessageBubbleContent>
                Draft the weekly update.
              </MessageBubbleContent>
            </MessageBubble>
            <MessageBubble variant="solid">
              <MessageBubbleContent>
                Keep it under five bullet points.
              </MessageBubbleContent>
            </MessageBubble>
          </MessageBubbleGroup>
        </MessageContent>
      </Message>
      <Message from="assistant">
        <AssistantAvatar />
        <MessageContent>
          <MessageBubble variant="soft">
            <MessageBubbleContent>
              <MessageBubbleCollapsible collapsedLines={3}>
                <ul>
                  <li>Onboarding flow shipped to all workspaces.</li>
                  <li>Support backlog down 18% week over week.</li>
                  <li>Two enterprise trials converted to paid plans.</li>
                  <li>Usage reports now export to CSV.</li>
                  <li>Next week: invoice reminders and audit filters.</li>
                </ul>
              </MessageBubbleCollapsible>
            </MessageBubbleContent>
          </MessageBubble>
          <MessageBubble variant="tint">
            <MessageBubbleContent render={<button type="button" />}>
              Turn this into an email
            </MessageBubbleContent>
          </MessageBubble>
          <MessageBubble variant="danger">
            <MessageBubbleContent>
              The previous draft could not be saved.
            </MessageBubbleContent>
          </MessageBubble>
        </MessageContent>
      </Message>
    </MessageGroup>
  );
}

/* ai-message-scroller ---------------------------------------------------- */

const SCROLLER_TURNS: Array<{ from: "user" | "assistant"; text: string }> = [
  { from: "user", text: "Summarise the open support tickets." },
  {
    from: "assistant",
    text: "There are 42 open tickets. Most concern billing questions and exports.",
  },
  { from: "user", text: "Which ones are older than a week?" },
  {
    from: "assistant",
    text: "Nine tickets are older than seven days; four are waiting on a customer reply.",
  },
  { from: "user", text: "Group those nine by team." },
  {
    from: "assistant",
    text: "Billing has five, Integrations has three and Onboarding has one.",
  },
  { from: "user", text: "Who owns the Integrations ones?" },
  {
    from: "assistant",
    text: "All three are assigned to the platform team; two have a draft reply ready.",
  },
];

const FOLLOW_UPS = [
  "Send the draft replies for review.",
  "Remind me about this on Friday.",
  "Export the list as a spreadsheet.",
];

function MessageScrollerDemo() {
  const [turns, setTurns] = useState(SCROLLER_TURNS);
  const followUp =
    FOLLOW_UPS[(turns.length - SCROLLER_TURNS.length) % FOLLOW_UPS.length]!;

  return (
    <div className="flex flex-col gap-3">
      <MessageScroller
        className="h-72 rounded-lg border border-border"
        contentClassName="flex flex-col gap-4 p-4"
        navigation="rail"
        anchor={turns.length}
      >
        {turns.map((turn, index) => (
          <Message
            key={index}
            from={turn.from}
            animateIn={index >= SCROLLER_TURNS.length}
          >
            {turn.from === "assistant" ? <AssistantAvatar /> : null}
            <MessageContent>
              <MessageBubble variant={turn.from === "user" ? "soft" : "ghost"}>
                <MessageBubbleContent>{turn.text}</MessageBubbleContent>
              </MessageBubble>
            </MessageContent>
          </Message>
        ))}
      </MessageScroller>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Scroll up to let go of the live edge; hover the rail to preview a
          turn.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setTurns((current) => [
              ...current,
              { from: "user", text: followUp },
            ])
          }
        >
          Add a message
        </Button>
      </div>
    </div>
  );
}

/* ai-streaming-response -------------------------------------------------- */

const STREAMED_REPLY =
  "Revenue grew 14% this quarter, led by annual plans. Churn held at 2.1%, and the new onboarding flow cut time to first value from four days to two. The largest risk is concentration: the top five workspaces account for a third of recurring revenue.";

const REPLY_SOURCES = [
  {
    id: "q3-report",
    title: "Q3 revenue report",
    domain: "reports",
    snippet: "Annual plans contributed 61% of new recurring revenue.",
  },
  {
    id: "churn-dashboard",
    title: "Retention dashboard",
    domain: "analytics",
    snippet: "Logo churn 2.1%, net revenue retention 108%.",
  },
];

function StreamingResponseDemo() {
  const words = STREAMED_REPLY.split(" ");
  const [count, setCount] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    setCount(0);
    const timer = window.setInterval(() => {
      setCount((current) => {
        if (current >= words.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 60);
    return () => window.clearInterval(timer);
  }, [run, words.length]);

  const done = count >= words.length;

  return (
    <Message from="assistant">
      <AssistantAvatar />
      <MessageContent>
        <StreamingResponse
          status={done ? "complete" : "streaming"}
          copyText={STREAMED_REPLY}
          onRetry={() => setRun((value) => value + 1)}
          sources={REPLY_SOURCES}
        >
          <p className="min-h-24">{words.slice(0, count).join(" ")}</p>
        </StreamingResponse>
      </MessageContent>
    </Message>
  );
}

/* ai-prompt-input -------------------------------------------------------- */

const MODELS = [
  { id: "fast", label: "Fast" },
  { id: "balanced", label: "Balanced" },
  { id: "thorough", label: "Thorough" },
];

function PromptInputDemo() {
  const [value, setValue] = useState("");
  const [model, setModel] = useState("balanced");
  const [status, setStatus] = useState<"ready" | "streaming">("ready");
  const [sent, setSent] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function stop() {
    window.clearTimeout(timer.current);
    setStatus("ready");
  }

  return (
    <div className="flex flex-col gap-3">
      <PromptInput
        multiple
        maxFiles={3}
        onSubmit={({ text, files }) => {
          const trimmed = text.trim();
          if (!trimmed && files.length === 0) return;
          setSent(
            files.length > 0
              ? `${trimmed || "(no text)"} — ${files.length} attachment${files.length === 1 ? "" : "s"}`
              : trimmed
          );
          setValue("");
          setStatus("streaming");
          timer.current = window.setTimeout(() => setStatus("ready"), 2500);
        }}
      >
        <PromptInputAttachments>
          {(file) => (
            <PromptInputAttachment
              data={file}
              removeLabel="Remove attachment"
            />
          )}
        </PromptInputAttachments>
        <PromptInputTextarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask anything about your workspace…"
          aria-label="Message"
        />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger aria-label="Add attachments" />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="Add photos or files" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <PromptInputSelect
              value={model}
              onValueChange={(next) => {
                if (typeof next === "string") setModel(next);
              }}
            >
              <PromptInputSelectTrigger size="sm" aria-label="Model">
                <PromptInputSelectValue>
                  {(current: string) =>
                    MODELS.find((option) => option.id === current)?.label ??
                    current
                  }
                </PromptInputSelectValue>
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                {MODELS.map((option) => (
                  <PromptInputSelectItem key={option.id} value={option.id}>
                    {option.label}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <PromptInputSubmit
            status={status}
            label={status === "streaming" ? "Stop" : "Send"}
            disabled={status === "ready" && !value.trim()}
            onClick={status === "streaming" ? stop : undefined}
          />
        </PromptInputFooter>
      </PromptInput>
      <p className="px-1 text-xs text-muted-foreground">
        {sent
          ? status === "streaming"
            ? `Sent “${sent}”. Replying…`
            : `Sent “${sent}”.`
          : "Enter sends, Shift+Enter adds a line. Paste or drop a file to attach it."}
      </p>
    </div>
  );
}

/* ai-suggestion ---------------------------------------------------------- */

const STARTERS = [
  "Summarise this week's activity",
  "Draft a reply to the latest ticket",
  "Compare usage with last month",
  "List overdue invoices",
  "Explain the new billing plan",
];

function SuggestionDemo() {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Suggestions>
        {STARTERS.map((starter) => (
          <Suggestion key={starter} suggestion={starter} onClick={setPicked} />
        ))}
      </Suggestions>
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {picked ? (
          <>
            <span className="text-foreground">{picked}</span> would be sent as
            the first message.
          </>
        ) : (
          "Pick a starter; the row scrolls sideways on narrow screens."
        )}
      </div>
    </div>
  );
}

/* ai-branch -------------------------------------------------------------- */

const VERSIONS = [
  "Thanks for reaching out. Your invoice was corrected and a credit of $40 was added to your workspace.",
  "Hi! We fixed the invoice and added a $40 credit — it will apply to your next billing cycle automatically.",
  "Good news: the invoice error is resolved. We have credited $40 to your account, visible under Billing.",
];

function BranchDemo() {
  const [index, setIndex] = useState(VERSIONS.length - 1);

  return (
    <MessageGroup spacing="default">
      <Message from="user">
        <MessageContent>
          <MessageBubble>
            <MessageBubbleContent>
              Write a short reply about the corrected invoice.
            </MessageBubbleContent>
          </MessageBubble>
        </MessageContent>
      </Message>
      <Message from="assistant">
        <AssistantAvatar />
        <MessageContent>
          <MessageBubble variant="ghost">
            <MessageBubbleContent key={index}>
              {VERSIONS[index]}
            </MessageBubbleContent>
          </MessageBubble>
          <MessageFooter>
            <Branch
              index={index}
              count={VERSIONS.length}
              onIndexChange={setIndex}
            >
              <BranchPrevious label="Previous version" />
              <BranchPage />
              <BranchNext label="Next version" />
            </Branch>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Regenerate"
              className="text-muted-foreground"
              onClick={() =>
                setIndex((current) => (current + 1) % VERSIONS.length)
              }
            >
              <RotateCcwIcon />
            </Button>
          </MessageFooter>
        </MessageContent>
      </Message>
    </MessageGroup>
  );
}

/* ai-composer-menu ------------------------------------------------------- */

const COMMAND_OPTIONS: ComposerMenuOption[] = [
  {
    value: "summarize",
    label: "/summarize",
    description: "Summarise the conversation so far",
    icon: <WandSparklesIcon />,
    group: "Commands",
  },
  {
    value: "attach",
    label: "/attach",
    description: "Attach a document from the workspace",
    icon: <PaperclipIcon />,
    group: "Commands",
  },
];

const MENTION_OPTIONS: ComposerMenuOption[] = [
  {
    value: "quarterly-report",
    label: "Quarterly report",
    description: "Document · updated yesterday",
    icon: <FileTextIcon />,
    group: "Documents",
  },
  {
    value: "support",
    label: "support",
    description: "Channel · 12 members",
    icon: <HashIcon />,
    group: "Channels",
  },
  {
    value: "onboarding-guide",
    label: "Onboarding guide",
    description: "Document · updated last week",
    icon: <FileTextIcon />,
    group: "Documents",
  },
];

/** The token under the caret: `/cmd` at the start, or `@name` anywhere. */
function readTrigger(text: string) {
  const command = text.match(/^\/([\w-]*)$/);
  if (command) return { kind: "command" as const, query: command[1] ?? "" };
  const mention = text.match(/(?:^|\s)@([\w-]*)$/);
  if (mention) return { kind: "mention" as const, query: mention[1] ?? "" };
  return null;
}

function ComposerMenuDemo() {
  const [value, setValue] = useState("/");
  const [dismissed, setDismissed] = useState(false);
  const trigger = readTrigger(value);
  const open = Boolean(trigger) && !dismissed;

  function select(option: ComposerMenuOption) {
    if (trigger?.kind === "command") {
      setValue(`${option.label} `);
    } else {
      setValue(value.replace(/@[\w-]*$/, `@${option.label} `));
    }
    setDismissed(true);
  }

  return (
    <div className="flex min-h-72 flex-col justify-end">
      <div className="relative">
        <ComposerMenu
          open={open}
          options={
            trigger?.kind === "mention" ? MENTION_OPTIONS : COMMAND_OPTIONS
          }
          query={trigger?.query ?? ""}
          onSelect={select}
          emptyLabel="No matches"
        />
        <textarea
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setDismissed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDismissed(true);
          }}
          rows={2}
          aria-label="Message"
          placeholder="Type / for commands or @ to mention"
          className="block w-full resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/25"
        />
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Type <kbd className="font-mono">/</kbd> for commands or{" "}
        <kbd className="font-mono">@</kbd> to mention; Escape closes the menu.
      </p>
    </div>
  );
}

/* ai-speech-input -------------------------------------------------------- */

function SpeechInputDemo() {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2">
        <p className="min-h-12 flex-1 px-2 py-1.5 text-sm leading-6">
          {text || interim ? (
            <>
              <span className="text-foreground">{text}</span>
              {interim ? (
                <span className="text-muted-foreground"> {interim}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground/60">
              Press the microphone and start speaking…
            </span>
          )}
        </p>
        <SpeechInput
          lang="en-US"
          startLabel="Start voice input"
          stopLabel="Stop voice input"
          onTranscript={(spoken, isFinal) => {
            if (!isFinal) {
              setInterim(spoken);
              return;
            }
            setInterim("");
            const clean = spoken.trim();
            if (clean)
              setText((current) => (current ? `${current} ${clean}` : clean));
          }}
        />
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {supported === false
          ? "This browser has no speech recognition, so the button renders nothing — a control that cannot work is left out."
          : "Uses the browser's own speech recognition; the button is omitted where it is unavailable."}
      </p>
    </div>
  );
}

export const CONVERSATION_DEMOS: Record<string, () => ReactNode> = {
  "ai-message": () => <MessageDemo />,
  "ai-message-bubble": () => <MessageBubbleDemo />,
  "ai-message-scroller": () => <MessageScrollerDemo />,
  "ai-streaming-response": () => <StreamingResponseDemo />,
  "ai-prompt-input": () => (
    <TooltipProvider>
      <PromptInputDemo />
    </TooltipProvider>
  ),
  "ai-suggestion": () => <SuggestionDemo />,
  "ai-branch": () => <BranchDemo />,
  "ai-composer-menu": () => <ComposerMenuDemo />,
  "ai-speech-input": () => <SpeechInputDemo />,
};
