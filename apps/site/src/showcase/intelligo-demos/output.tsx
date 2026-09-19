/**
 * Live demos for Intelligo's output and pattern components
 * (T3 and T4): what an answer cites, the code and documents it writes,
 * the image it makes, the sidebar it lives in, and the page furniture
 * around it. Every demo renders the installed registry source from
 * `@showcase/components/ui` with local state only — no network.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  HomeIcon,
  LoaderIcon,
  MessageSquareIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  SparklesIcon,
  UserPlusIcon,
} from "lucide-react";

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@showcase/components/ui/ai-artifact";
import {
  Citation,
  CitationPill,
  Citations,
  CitationSources,
  type CitationItem,
} from "@showcase/components/ui/ai-citations";
import {
  CodeBlock,
  type CodeBlockStatus,
} from "@showcase/components/ui/ai-code-block";
import {
  ImageGeneration,
  type ImageGenerationStatus,
} from "@showcase/components/ui/ai-image-generation";
import {
  Disclosure,
  EASE_OUT,
  SPRING_LAYOUT,
  SPRING_PRESS,
  SwapText,
} from "@showcase/components/ui/ai-motion";
import {
  AISidebar,
  AISidebarContent,
  AISidebarFooter,
  AISidebarHeader,
  AISidebarInset,
  AISidebarItem,
  AISidebarMenu,
  AISidebarMenuItem,
  AISidebarProvider,
  AISidebarSection,
  AISidebarSubItem,
  AISidebarSubmenu,
  AISidebarTrigger,
  AISidebarTree,
  type AISidebarResource,
} from "@showcase/components/ui/ai-sidebar";
import { Button } from "@showcase/components/ui/button";
import { CopyButton } from "@showcase/components/ui/copy-button";
import { Markdown } from "@showcase/components/ui/ai-markdown";
import { DocumentView } from "@showcase/components/ui/document-viewer";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@showcase/components/ui/page-header";
import {
  StatCard,
  StatCardAction,
  StatCardFooter,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
} from "@showcase/components/ui/stat-card";
import { StatusBadge } from "@showcase/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@showcase/components/ui/tabs";
import { TooltipProvider } from "@showcase/components/ui/tooltip";

/* ----------------------------------------------------------------------------
 * ai-citations
 * ------------------------------------------------------------------------- */

// Workspace documents rather than web pages: no url or domain, so no
// favicon is fetched and the glyph stands in.
const SOURCES: CitationItem[] = [
  {
    id: "1",
    title: "Q3 support review",
    snippet:
      "Median first response fell from 6h to 2h after triage moved to the assistant.",
  },
  {
    id: "2",
    title: "Onboarding survey",
    snippet: "71% of new members finished setup in their first session.",
  },
  {
    id: "3",
    title: "Roadmap notes",
    snippet: "Shared inboxes ship after the permissions rework.",
  },
];

function CitationsDemo() {
  return (
    <div className="flex flex-col gap-4 text-sm leading-6">
      <p>
        Response times improved sharply this quarter
        <CitationPill
          citations={SOURCES.slice(0, 2)}
          label="Sources: Q3 support review"
        />
        , and most new members now finish setup on day one
        <Citation citationId="2" index={2} idPrefix="demo-sources" />. Shared
        inboxes are next on the roadmap
        <Citation citationId="3" index={3} idPrefix="demo-sources" />.
      </p>
      <Citations citations={SOURCES} idPrefix="demo-sources" defaultOpen />
      <CitationSources citations={SOURCES} label="3 sources" title="Sources" />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * ai-code-block
 * ------------------------------------------------------------------------- */

const CODE = `import { createChatHandler } from "@intelligo-dev/chat";

import { chatServerConfig } from "@/lib/chat-server";

export const { POST, DELETE } = createChatHandler(chatServerConfig);
`;

function CodeBlockDemo() {
  const [length, setLength] = useState(CODE.length);
  const status: CodeBlockStatus =
    length < CODE.length ? "streaming" : "complete";

  useEffect(() => {
    if (length >= CODE.length) return;
    const timer = setTimeout(
      () => setLength((n) => Math.min(CODE.length, n + 6)),
      40
    );
    return () => clearTimeout(timer);
  }, [length]);

  return (
    <div className="flex flex-col gap-3">
      <CodeBlock
        code={CODE.slice(0, length)}
        language="typescript"
        filename="app/api/chat/route.ts"
        status={status}
        showLineNumbers
        highlightLines={[5]}
        maxHeight={200}
        copyable
      />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={status === "streaming"}
        onClick={() => setLength(0)}
      >
        <RotateCcwIcon data-icon="inline-start" />
        Replay stream
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * ai-artifact
 * ------------------------------------------------------------------------- */

function ArtifactDemo() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileTextIcon data-icon="inline-start" />
        Reopen artifact
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Artifact className="max-h-80">
        <ArtifactHeader>
          <div className="min-w-0">
            <ArtifactTitle>Weekly summary</ArtifactTitle>
            <ArtifactDescription>Updated 2 minutes ago</ArtifactDescription>
          </div>
          <ArtifactActions>
            <ArtifactAction
              label="Regenerate"
              tooltip="Regenerate"
              icon={SparklesIcon}
            />
            <ArtifactAction
              label="Download"
              tooltip="Download"
              icon={DownloadIcon}
            />
            <ArtifactClose label="Close" onClick={() => setOpen(false)} />
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent className="flex flex-col gap-2 text-sm">
          <p className="font-medium">Highlights</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>128 conversations resolved, 14 escalated to a teammate.</li>
            <li>Two new members joined the workspace.</li>
            <li>Credit usage is at 62% of this month&apos;s allowance.</li>
          </ul>
        </ArtifactContent>
      </Artifact>
    </TooltipProvider>
  );
}

/* ----------------------------------------------------------------------------
 * ai-image-generation
 * ------------------------------------------------------------------------- */

const IMAGE_SEQUENCE: { status: ImageGenerationStatus; ms: number }[] = [
  { status: "queued", ms: 900 },
  { status: "generating", ms: 2200 },
  { status: "refining", ms: 1400 },
  { status: "complete", ms: 0 },
];

/** The "generated" image: a token-coloured composition, no URL needed. */
function GeneratedArt() {
  return (
    <div className="relative overflow-hidden bg-linear-to-br from-primary/40 via-accent to-muted">
      <div className="absolute -top-6 -left-6 size-28 rounded-full bg-primary/50 blur-xl" />
      <div className="absolute right-4 bottom-6 size-20 rounded-full bg-background/70 blur-md" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-foreground/25 to-transparent" />
    </div>
  );
}

function ImageGenerationDemo() {
  const [step, setStep] = useState(0);
  const current = IMAGE_SEQUENCE[step]!;

  useEffect(() => {
    if (current.ms === 0) return;
    const timer = setTimeout(() => setStep((s) => s + 1), current.ms);
    return () => clearTimeout(timer);
  }, [current.ms, step]);

  return (
    <div className="flex flex-col items-center gap-3">
      <ImageGeneration
        status={current.status}
        prompt="Soft abstract shapes for a workspace cover"
        resolution="1024 × 1024"
      >
        <GeneratedArt />
      </ImageGeneration>
      <Button
        variant="outline"
        size="sm"
        disabled={current.status !== "complete"}
        onClick={() => setStep(0)}
      >
        <RotateCcwIcon data-icon="inline-start" />
        Generate again
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * ai-sidebar
 * ------------------------------------------------------------------------- */

const RESOURCES: AISidebarResource[] = [
  {
    id: "launch",
    label: "Launch plan",
    kind: "project",
    children: [
      { id: "brief", label: "Campaign brief", kind: "file" },
      { id: "copy", label: "Draft landing copy", kind: "conversation" },
    ],
  },
  {
    id: "research",
    label: "Research",
    kind: "folder",
    children: [
      { id: "interviews", label: "Customer interviews", kind: "file" },
    ],
  },
  { id: "pricing", label: "Pricing questions", kind: "conversation" },
];

function resourceLabel(
  items: AISidebarResource[],
  id: string
): string | undefined {
  for (const item of items) {
    if (item.id === id) return item.label;
    const found = item.children && resourceLabel(item.children, id);
    if (found) return found;
  }
  return undefined;
}

const NAV = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
  { id: "chat", label: "Chat", icon: <MessageSquareIcon />, badge: "3" },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
];

function SidebarDemo() {
  const [active, setActive] = useState("home");
  const [docsOpen, setDocsOpen] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);

  const title = doc ?? NAV.find((item) => item.id === active)?.label ?? "Home";

  return (
    <div className="showcase-canvas relative h-85 overflow-hidden rounded-lg border">
      <AISidebarProvider shortcut={null} className="h-full min-h-0">
        <AISidebar label="Workspace navigation" panelClassName="h-full">
          <AISidebarHeader>
            <div className="flex min-h-9 items-center gap-2 overflow-hidden px-1">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                A
              </span>
              <span className="truncate text-sm font-semibold">
                Acme workspace
              </span>
            </div>
          </AISidebarHeader>
          <AISidebarContent>
            <AISidebarSection>
              <AISidebarMenu>
                {NAV.slice(0, 2).map((item) => (
                  <AISidebarMenuItem key={item.id}>
                    <AISidebarItem
                      icon={item.icon}
                      badge={item.badge}
                      isActive={!doc && active === item.id}
                      onSelect={() => {
                        setActive(item.id);
                        setDoc(null);
                      }}
                    >
                      {item.label}
                    </AISidebarItem>
                  </AISidebarMenuItem>
                ))}
                <AISidebarMenuItem>
                  <AISidebarItem
                    icon={<FolderIcon />}
                    expanded={docsOpen}
                    onSelect={() => setDocsOpen((open) => !open)}
                  >
                    Documents
                  </AISidebarItem>
                  <AISidebarSubmenu open={docsOpen}>
                    {["Meeting notes", "Style guide"].map((name) => (
                      <AISidebarSubItem
                        key={name}
                        isActive={doc === name}
                        onSelect={() => setDoc(name)}
                      >
                        {name}
                      </AISidebarSubItem>
                    ))}
                  </AISidebarSubmenu>
                </AISidebarMenuItem>
                <AISidebarMenuItem>
                  <AISidebarItem
                    icon={NAV[2]!.icon}
                    isActive={!doc && active === "settings"}
                    onSelect={() => {
                      setActive("settings");
                      setDoc(null);
                    }}
                  >
                    Settings
                  </AISidebarItem>
                </AISidebarMenuItem>
              </AISidebarMenu>
            </AISidebarSection>
            <AISidebarSection label="Projects">
              <AISidebarTree
                defaultItems={RESOURCES}
                defaultExpandedIds={["launch"]}
                onActiveChange={(id) =>
                  setDoc(resourceLabel(RESOURCES, id) ?? null)
                }
              />
            </AISidebarSection>
          </AISidebarContent>
          <AISidebarFooter>
            <div className="flex items-center gap-2 overflow-hidden px-1 text-sm">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
                JD
              </span>
              <span className="truncate text-muted-foreground">
                jordan@acme.test
              </span>
            </div>
          </AISidebarFooter>
        </AISidebar>
        <AISidebarInset className="min-h-0">
          <header className="flex h-12 items-center gap-2 border-b px-3">
            <AISidebarTrigger />
            <span className="truncate text-sm font-medium">{title}</span>
          </header>
          <div className="flex flex-1 flex-col gap-2 p-4 text-sm text-muted-foreground">
            <p>
              Collapse the panel into an icon rail, unfold Documents, or drag a
              row in the tree.
            </p>
          </div>
        </AISidebarInset>
      </AISidebarProvider>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * ai-motion
 * ------------------------------------------------------------------------- */

const STATUS_WORDS = ["Thinking", "Searching", "Writing", "Done"];

const CURVES = [
  { name: "SPRING_PRESS", transition: SPRING_PRESS },
  { name: "SPRING_LAYOUT", transition: SPRING_LAYOUT },
  { name: "EASE_OUT", transition: { duration: 0.5, ease: EASE_OUT } },
];

function MotionDemo() {
  const [open, setOpen] = useState(true);
  const [count, setCount] = useState(3);
  const [word, setWord] = useState(0);
  const [end, setEnd] = useState(false);

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-col gap-2">
        {CURVES.map((curve) => (
          <div key={curve.name} className="flex items-center gap-3">
            <code className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
              {curve.name}
            </code>
            <div
              className={`flex h-6 flex-1 items-center rounded-full bg-muted px-1 ${
                end ? "justify-end" : "justify-start"
              }`}
            >
              <motion.span
                layout
                transition={curve.transition}
                className="size-4 rounded-full bg-primary"
              />
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setEnd((v) => !v)}
        >
          Play curves
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setCount((n) => n + 1)}
        >
          <SwapText value={String(count)}>{count}</SwapText>
          <span className="text-muted-foreground">steps · click to roll</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setWord((n) => (n + 1) % STATUS_WORDS.length)}
        >
          <SwapText value={STATUS_WORDS[word]!} animation="blur">
            {STATUS_WORDS[word]}
          </SwapText>
          <span className="text-muted-foreground">· click to blur</span>
        </button>
      </div>

      <div className="rounded-lg border">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Reasoning
          <span className="text-xs text-muted-foreground">
            {open ? "Hide" : "Show"}
          </span>
        </button>
        <Disclosure open={open}>
          <p className="border-t px-3 py-2 text-muted-foreground">
            The request mentions last week, so the summary reads the seven most
            recent days of activity before drafting.
          </p>
        </Disclosure>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * ai-markdown
 * ------------------------------------------------------------------------- */

const MARKDOWN = {
  prose: `### Refund policy

Refunds are **prorated** to the day. A workspace on the yearly plan that
cancels in month four gets eight months back.

| Plan    | Window  |
| ------- | ------- |
| Monthly | 14 days |
| Yearly  | 30 days |`,
  maths: `The prorated refund for a plan of price $$P$$ cancelled after $$d$$ of $$D$$ days:

$$
R = P \\cdot \\frac{D - d}{D}
$$`,
  diagram: `\`\`\`mermaid
flowchart LR
  request --> admit{quota?}
  admit -- yes --> run --> settle
  admit -- no --> refuse
\`\`\``,
} as const;

type MarkdownSample = keyof typeof MARKDOWN;

function MarkdownDemo() {
  const [sample, setSample] = useState<MarkdownSample>("prose");

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={sample}
        onValueChange={(value) => setSample(value as MarkdownSample)}
      >
        <TabsList>
          <TabsTrigger value="prose">Prose</TabsTrigger>
          <TabsTrigger value="maths">Maths</TabsTrigger>
          <TabsTrigger value="diagram">Diagram</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <Markdown>{MARKDOWN[sample]}</Markdown>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * document-viewer
 * ------------------------------------------------------------------------- */

const DOCUMENTS = {
  text: {
    title: "Release notes",
    content: `## Release notes

The assistant now **cites its sources** inline, and long answers stream
without the layout jumping.

- Shared inboxes for every workspace
- Faster document search
- Usage exports as CSV`,
  },
  code: {
    title: "retry.ts",
    content: `export async function retry<T>(run: () => Promise<T>, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (error) {
      if (i >= attempts) throw error;
    }
  }
}`,
  },
  sheet: {
    title: "usage.csv",
    content: `date,conversations,credits
2026-09-01,42,1180
2026-09-02,57,1512
2026-09-03,49,1307
2026-09-04,63,1690`,
  },
} as const;

type DocumentKind = keyof typeof DOCUMENTS;

function DocumentViewerDemo() {
  const [kind, setKind] = useState<DocumentKind>("text");
  const doc = DOCUMENTS[kind];

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={kind}
        onValueChange={(value) => setKind(value as DocumentKind)}
      >
        <TabsList>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="sheet">Sheet</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="max-h-72 overflow-auto rounded-lg border p-4">
        <DocumentView kind={kind} title={doc.title} content={doc.content} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * page-header
 * ------------------------------------------------------------------------- */

function PageHeaderDemo() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Team</PageHeaderTitle>
          <PageHeaderDescription>
            Invite people to the workspace and choose what each of them can do.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline">Export</Button>
          <Button>
            <UserPlusIcon data-icon="inline-start" />
            Invite member
          </Button>
        </PageHeaderActions>
      </PageHeader>
      <PageHeader className="border-t pt-6">
        <PageHeaderContent>
          <PageHeaderTitle level={2}>API keys</PageHeaderTitle>
          <PageHeaderDescription>
            A section title under a layout that already names the page.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button size="sm" variant="outline">
            <PlusIcon data-icon="inline-start" />
            New key
          </Button>
        </PageHeaderActions>
      </PageHeader>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * stat-card
 * ------------------------------------------------------------------------- */

function StatCardDemo() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard>
        <StatCardHeader>
          <StatCardLabel>Conversations</StatCardLabel>
          <StatCardValue>1,284</StatCardValue>
          <StatCardAction>
            <StatusBadge status="success">+12%</StatusBadge>
          </StatCardAction>
        </StatCardHeader>
        <StatCardFooter>Last 30 days</StatCardFooter>
      </StatCard>
      <StatCard>
        <StatCardHeader>
          <StatCardLabel>Credits used</StatCardLabel>
          <StatCardValue>8,420</StatCardValue>
          <StatCardAction>
            <StatusBadge status="warning">82%</StatusBadge>
          </StatCardAction>
        </StatCardHeader>
        <StatCardFooter>Of 10,000 this month</StatCardFooter>
      </StatCard>
      <StatCard>
        <StatCardHeader>
          <StatCardLabel>Spend</StatCardLabel>
          <StatCardValue>$46.10</StatCardValue>
          <StatCardAction>
            <StatusBadge>Within limit</StatusBadge>
          </StatCardAction>
        </StatCardHeader>
        <StatCardFooter>Resets on the 1st</StatCardFooter>
      </StatCard>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * status-badge
 * ------------------------------------------------------------------------- */

function StatusBadgeDemo() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <StatusBadge dot>Draft</StatusBadge>
        <StatusBadge status="info" dot>
          Queued
        </StatusBadge>
        <StatusBadge status="success" dot>
          Active
        </StatusBadge>
        <StatusBadge status="warning" dot>
          Past due
        </StatusBadge>
        <StatusBadge status="destructive" dot>
          Failed
        </StatusBadge>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status="info">
          <LoaderIcon />
          Running
        </StatusBadge>
        <StatusBadge status="success">
          <CircleCheckIcon />
          Completed
        </StatusBadge>
        <StatusBadge status="warning">
          <ClockIcon />
          Trial ends in 3 days
        </StatusBadge>
        <StatusBadge status="destructive">
          <CircleAlertIcon />
          Payment failed
        </StatusBadge>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * copy-button
 * ------------------------------------------------------------------------- */

function CopyButtonDemo() {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function report(message: string) {
    setStatus(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 2000);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex max-w-md items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          ws_7f3a9c2e41b8
        </code>
        <CopyButton
          value="ws_7f3a9c2e41b8"
          label="Copy workspace ID"
          copiedLabel="Workspace ID copied"
          onCopyError={() => report("Clipboard is unavailable here.")}
        />
      </div>
      <CopyButton
        value="https://example.com/invite/team"
        label="Copy invite link"
        copiedLabel="Invite link copied"
        variant="outline"
        size="sm"
        className="self-start"
        onCopy={() => report("Invite link copied.")}
        onCopyError={() => report("Clipboard is unavailable here.")}
      >
        Copy invite link
      </CopyButton>
      <p aria-live="polite" className="min-h-5 text-xs text-muted-foreground">
        {status}
      </p>
    </div>
  );
}

export const OUTPUT_DEMOS: Record<string, () => ReactNode> = {
  "ai-citations": () => <CitationsDemo />,
  "ai-code-block": () => <CodeBlockDemo />,
  "ai-markdown": () => <MarkdownDemo />,
  "ai-artifact": () => <ArtifactDemo />,
  "ai-image-generation": () => <ImageGenerationDemo />,
  "ai-sidebar": () => <SidebarDemo />,
  "ai-motion": () => <MotionDemo />,
  "document-viewer": () => <DocumentViewerDemo />,
  "page-header": () => <PageHeaderDemo />,
  "stat-card": () => <StatCardDemo />,
  "status-badge": () => <StatusBadgeDemo />,
  "copy-button": () => <CopyButtonDemo />,
};
