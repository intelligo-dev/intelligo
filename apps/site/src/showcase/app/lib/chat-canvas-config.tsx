"use client";

/**
 * Canvas kinds — how a document opened beside the chat is shown and
 * edited, by `kind`. Consumer-owned, a plain object literal (ADR-0005).
 *
 * A kind is the content component plus, optionally, actions in the
 * panel's header (copy, run, download) and toolbar items that send a
 * message about the document ("Polish the wording"). The framework
 * ships `text` (ProseMirror over markdown), `code` (CodeMirror),
 * `sheet` (a CSV grid) and `image`; a product adds its own — a
 * `report` kind that renders its JSON as a designed page, a `diagram`
 * kind on a graph library — by adding an entry here:
 *
 *   import { ReportCanvas } from "@showcase/components/reports/report-canvas";
 *
 *   export const CANVAS_KINDS: Record<string, CanvasKind> = {
 *     ...DEFAULT_CANVAS_KINDS,
 *     report: { content: ReportCanvas },
 *   };
 *
 * The editors load lazily: a document that is still streaming, or one
 * the reader may not edit, renders on the light viewers below and
 * never pulls the editor bundle. The chat's `saveArtifact` tool and
 * `createArtifactWriter` name a kind; the canvas looks it up here and
 * falls back to `text` for one it does not know, so nothing renders
 * blank.
 */

import {
  Suspense,
  lazy,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import { Streamdown } from "streamdown";

import { CodeBlock } from "@showcase/components/ui/ai-code-block";
import { Spinner } from "@showcase/components/ui/spinner";

export interface CanvasContentProps {
  content: string;
  /** Streaming in, or settled. */
  status: "streaming" | "ready" | "error";
  /** The document title, for a kind that shows it. */
  title: string;
  /** Read-only: the shared page, an older version, a stream in progress. */
  isReadonly: boolean;
  /** The reader edited the document; the canvas keeps the draft until saved. */
  onChange?: (content: string) => void;
}

export interface CanvasActionContext {
  content: string;
  title: string;
  documentId?: string;
}

export interface CanvasAction {
  /** Accessible name and tooltip — a message key, resolved by the canvas. */
  labelKey: string;
  icon: LucideIcon;
  onClick: (context: CanvasActionContext) => void | Promise<void>;
}

export interface CanvasToolbarItem {
  /** A message key for the button's text. */
  labelKey: string;
  /** The message sent to the chat when clicked. */
  message: string;
}

export interface CanvasKind {
  content: ComponentType<CanvasContentProps>;
  actions?: CanvasAction[];
  toolbar?: CanvasToolbarItem[];
}

const TextEditor = lazy(() => import("@showcase/components/chat/canvas/text-editor"));
const CodeEditor = lazy(() => import("@showcase/components/chat/canvas/code-editor"));
const SheetEditor = lazy(() => import("@showcase/components/chat/canvas/sheet-editor"));

function Loading() {
  return (
    <div className="flex h-24 items-center justify-center text-muted-foreground">
      <Spinner />
    </div>
  );
}

/** Editable once settled; a rendered view while it streams or is read-only. */
function TextCanvas(props: CanvasContentProps) {
  if (props.isReadonly || props.status === "streaming" || !props.onChange) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <Streamdown mode={props.status === "streaming" ? "streaming" : "static"}>
          {props.content}
        </Streamdown>
      </div>
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <TextEditor {...props} />
    </Suspense>
  );
}

function CodeCanvas(props: CanvasContentProps) {
  if (props.isReadonly || props.status === "streaming" || !props.onChange) {
    return (
      <CodeBlock
        code={props.content}
        language={languageOf(props.title)}
        showLineNumbers
      />
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <CodeEditor {...props} />
    </Suspense>
  );
}

function SheetCanvas(props: CanvasContentProps) {
  if (props.status === "streaming") {
    return (
      <pre className="overflow-auto font-mono text-xs whitespace-pre">
        {props.content}
      </pre>
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <SheetEditor {...props} />
    </Suspense>
  );
}

/** A generated image: the content is a data URL or an https URL. */
function ImageCanvas({ content, title }: CanvasContentProps): ReactNode {
  if (!content) return null;
  return (
    <img
      src={content}
      alt={title}
      className="mx-auto max-h-full max-w-full rounded-lg object-contain"
    />
  );
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  cs: "csharp",
  sh: "bash",
  sql: "sql",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  html: "html",
  css: "css",
};

type CodeLanguage = ComponentProps<typeof CodeBlock>["language"];

function languageOf(title: string): CodeLanguage {
  const extension = title.split(".").pop()?.toLowerCase() ?? "";
  return (LANGUAGE_BY_EXTENSION[extension] ?? "text") as CodeLanguage;
}

export const DEFAULT_CANVAS_KINDS: Record<string, CanvasKind> = {
  text: { content: TextCanvas },
  code: { content: CodeCanvas },
  sheet: { content: SheetCanvas },
  image: { content: ImageCanvas },
};

export const CANVAS_KINDS: Record<string, CanvasKind> = {
  ...DEFAULT_CANVAS_KINDS,
};

export function resolveCanvasKind(kind: string): CanvasKind {
  return CANVAS_KINDS[kind] ?? CANVAS_KINDS.text ?? DEFAULT_CANVAS_KINDS.text!;
}
