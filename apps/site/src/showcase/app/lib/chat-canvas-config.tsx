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
 *   import { ReportCanvas } from "@showcase/components/reports/report-canvas";
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
  type ComponentType,
  type ReactNode,
} from "react";
import { type LucideIcon } from "lucide-react";

import {
  CodeView,
  HtmlPreview,
  ImageView,
  SheetView,
  TextView,
  documentKindIcon,
  extensionOf,
  fileNameOf as fileNameFor,
  isPreviewableTitle,
  languageOf,
} from "@showcase/components/ui/document-viewer";
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

/**
 * The viewers below are the shared ones
 * (`@/components/ui/document-viewer`), so a document reads the same
 * here as it does in the artifacts library. What stays here is the
 * editing: which kinds have an editor, and when it is allowed to load.
 */

/** Editable once settled; a rendered view while it streams or is read-only. */
function TextCanvas(props: CanvasContentProps) {
  if (props.isReadonly || props.status === "streaming" || !props.onChange) {
    return (
      <TextView
        content={props.content}
        title={props.title}
        streaming={props.status === "streaming"}
      />
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
    return <CodeView content={props.content} title={props.title} />;
  }
  return (
    <Suspense fallback={<Loading />}>
      <CodeEditor {...props} />
    </Suspense>
  );
}

function CodePreview({ content, title }: CanvasContentProps) {
  return <HtmlPreview content={content} title={title} />;
}

function SheetCanvas(props: CanvasContentProps) {
  if (props.status === "streaming") {
    return <SheetView content={props.content} title={props.title} />;
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
  return <ImageView content={content} title={title} />;
}

/**
 * Re-exported, not redefined: the canvas and the transcript's artifact
 * card ask this module for them, and a kind config is where a reader
 * looks for "how is this document named and highlighted".
 */
export { extensionOf, languageOf };

/** The name a downloaded document gets: its title, with an extension. */
export function fileNameOf(title: string, kind: CanvasKind): string {
  return fileNameFor(title, kind.extension);
}

export const DEFAULT_CANVAS_KINDS: Record<string, CanvasKind> = {
  text: {
    content: TextCanvas,
    icon: documentKindIcon("text"),
    labelKey: "chat.canvas.kinds.text",
    extension: "md",
  },
  code: {
    content: CodeCanvas,
    icon: documentKindIcon("code"),
    labelKey: "chat.canvas.kinds.code",
    preview: CodePreview,
    previewable: isPreviewableTitle,
    extension: "txt",
  },
  sheet: {
    content: SheetCanvas,
    icon: documentKindIcon("sheet"),
    labelKey: "chat.canvas.kinds.sheet",
    extension: "csv",
  },
  image: {
    content: ImageCanvas,
    icon: documentKindIcon("image"),
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
