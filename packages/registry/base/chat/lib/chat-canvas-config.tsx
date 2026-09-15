"use client";

/**
 * Canvas kinds — how a document opened beside the chat is shown and
 * edited, by `kind`. Consumer-owned, a plain object literal (ADR-0005).
 *
 * A kind is the content component plus, optionally, its glyph and name
 * (on the transcript's card and the panel's header), a rendered
 * `preview` beside the source for content that has one, the extension
 * a download gets, actions in the panel's header (run, publish) and
 * toolbar items that send a message about the document ("Polish the
 * wording"). The framework ships `text` (ProseMirror over markdown),
 * `code` (CodeMirror, with a live preview for HTML and SVG), `sheet`
 * (a CSV grid) and `image`; a product adds its own — a `report` kind
 * that renders its JSON as a designed page, a `diagram` kind on a graph
 * library — by adding an entry here:
 *
 *   import { ReportCanvas } from "@/components/reports/report-canvas";
 *
 *   export const CANVAS_KINDS: Record<string, CanvasKind> = {
 *     ...DEFAULT_CANVAS_KINDS,
 *     report: { content: ReportCanvas, icon: ChartIcon, labelKey: "reports.kind" },
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
import {
  FileCodeIcon,
  FileTextIcon,
  ImageIcon,
  SheetIcon,
  type LucideIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";

import { CodeBlock } from "@/components/ui/ai-code-block";
import { Spinner } from "@/components/ui/spinner";

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
  /** The kind's glyph on its card and in the panel's header. */
  icon?: LucideIcon;
  /** A message key naming the kind — "Document", "Code". */
  labelKey?: string;
  /**
   * A rendered view of the document, offered beside its source when
   * `previewable` says this document has one.
   */
  preview?: ComponentType<CanvasContentProps>;
  previewable?: (title: string) => boolean;
  /** The extension a download gets when the title has none. */
  extension?: string;
  actions?: CanvasAction[];
  toolbar?: CanvasToolbarItem[];
}

const TextEditor = lazy(() => import("@/components/chat/canvas/text-editor"));
const CodeEditor = lazy(() => import("@/components/chat/canvas/code-editor"));
const SheetEditor = lazy(() => import("@/components/chat/canvas/sheet-editor"));

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

/**
 * An HTML page or an SVG, rendered in a sandbox: scripts run, but in an
 * opaque origin with no access to the app, its cookies or its storage.
 * The document asks for a light canvas, so a page written without a
 * background reads as it would on its own.
 */
function CodePreview({ content, title }: CanvasContentProps) {
  return (
    <iframe
      title={title}
      sandbox="allow-scripts"
      srcDoc={`<meta name="color-scheme" content="light">${content}`}
      className="size-full min-h-96 rounded-lg border"
    />
  );
}

const PREVIEWABLE_EXTENSIONS = new Set(["html", "htm", "svg"]);

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
  htm: "html",
  svg: "xml",
  css: "css",
};

type CodeLanguage = ComponentProps<typeof CodeBlock>["language"];

/** A title's file extension, lower-cased: `report.PY` → `py`. */
export function extensionOf(title: string): string | undefined {
  const match = /\.([a-z0-9]{1,8})$/i.exec(title.trim());
  return match?.[1]?.toLowerCase();
}

export function languageOf(title: string): CodeLanguage {
  return (LANGUAGE_BY_EXTENSION[extensionOf(title) ?? ""] ?? "text") as CodeLanguage;
}

/** The name a downloaded document gets: its title, with an extension. */
export function fileNameOf(title: string, kind: CanvasKind): string {
  if (extensionOf(title)) return title.trim();
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "document";
  return `${base}.${kind.extension ?? "txt"}`;
}

export const DEFAULT_CANVAS_KINDS: Record<string, CanvasKind> = {
  text: {
    content: TextCanvas,
    icon: FileTextIcon,
    labelKey: "chat.canvas.kinds.text",
    extension: "md",
  },
  code: {
    content: CodeCanvas,
    icon: FileCodeIcon,
    labelKey: "chat.canvas.kinds.code",
    preview: CodePreview,
    previewable: (title) => PREVIEWABLE_EXTENSIONS.has(extensionOf(title) ?? ""),
    extension: "txt",
  },
  sheet: {
    content: SheetCanvas,
    icon: SheetIcon,
    labelKey: "chat.canvas.kinds.sheet",
    extension: "csv",
  },
  image: {
    content: ImageCanvas,
    icon: ImageIcon,
    labelKey: "chat.canvas.kinds.image",
    extension: "png",
  },
};

export const CANVAS_KINDS: Record<string, CanvasKind> = {
  ...DEFAULT_CANVAS_KINDS,
};

export function resolveCanvasKind(kind: string): CanvasKind {
  return CANVAS_KINDS[kind] ?? CANVAS_KINDS.text ?? DEFAULT_CANVAS_KINDS.text!;
}
