"use client";

/**
 * How a saved document reads when nobody is editing it. The chat's canvas
 * and the artifacts library both compose it, so a document reads the same
 * in both: how its title names a language, how it is drawn, which glyph
 * stands for its kind. Editing and the words for a kind stay with each item.
 */

import type { ComponentProps } from "react";
import {
  FileCodeIcon,
  FileTextIcon,
  ImageIcon,
  SheetIcon,
  type LucideIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";

import { CodeBlock } from "@ui/components/ui/ai-code-block";

// The plugin packages type `Pluggable` against their own `unified`
// copy; the shapes are the ones Streamdown expects.
const MARKDOWN_PLUGINS = { code, math, mermaid, cjk } as unknown as NonNullable<
  ComponentProps<typeof Streamdown>["plugins"]
>;

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
  return (LANGUAGE_BY_EXTENSION[extensionOf(title) ?? ""] ??
    "text") as CodeLanguage;
}

/**
 * The name a downloaded document gets: its title, with an extension.
 * Takes the fallback extension rather than a kind, so nothing here has
 * to know what a canvas kind is.
 */
export function fileNameOf(title: string, extension?: string): string {
  if (extensionOf(title)) return title.trim();
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "document";
  return `${base}.${extension ?? "txt"}`;
}

const PREVIEWABLE_EXTENSIONS = new Set(["html", "htm", "svg"]);

/** Whether this document has a rendered form worth offering. */
export function isPreviewableTitle(title: string): boolean {
  return PREVIEWABLE_EXTENSIONS.has(extensionOf(title) ?? "");
}

const KIND_ICONS: Record<string, LucideIcon> = {
  text: FileTextIcon,
  code: FileCodeIcon,
  sheet: SheetIcon,
  image: ImageIcon,
};

/** A kind's glyph; an unknown kind reads as a document. */
export function documentKindIcon(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? FileTextIcon;
}

/**
 * What a download of this kind is called when the title carries no
 * extension of its own. One table, so both surfaces offer a download
 * under the same extension.
 */
const KIND_EXTENSIONS: Record<string, string> = {
  text: "md",
  code: "txt",
  sheet: "csv",
  image: "png",
};

export function documentKindExtension(kind: string): string | undefined {
  return KIND_EXTENSIONS[kind];
}

export interface DocumentViewProps {
  content: string;
  title: string;
  /** Still arriving, so markdown renders incrementally. */
  streaming?: boolean;
}

/** Notes and drafts: markdown, with maths and diagrams. */
export function TextView({ content, streaming }: DocumentViewProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        plugins={MARKDOWN_PLUGINS}
      >
        {content}
      </Streamdown>
    </div>
  );
}

export function CodeView({ content, title }: DocumentViewProps) {
  return (
    <CodeBlock code={content} language={languageOf(title)} showLineNumbers />
  );
}

/** A sheet as its raw rows — a grid is an editor's job. */
export function SheetView({ content }: DocumentViewProps) {
  return (
    <pre className="overflow-auto font-mono text-xs leading-relaxed whitespace-pre">
      {content}
    </pre>
  );
}

/** A generated image: the content is a data URL or an https URL. */
export function ImageView({ content, title }: DocumentViewProps) {
  if (!content) return null;
  return (
    <img
      src={content}
      alt={title}
      className="mx-auto max-h-full max-w-full rounded-lg object-contain"
    />
  );
}

/**
 * An HTML page or an SVG, rendered in a sandbox: scripts run, but in an
 * opaque origin with no access to the app, its cookies or its storage.
 * The document asks for a light canvas, so a page written without a
 * background reads as it would on its own.
 */
export function HtmlPreview({ content, title }: DocumentViewProps) {
  return (
    <iframe
      title={title}
      sandbox="allow-scripts"
      srcDoc={`<meta name="color-scheme" content="light">${content}`}
      className="size-full min-h-96 rounded-lg border"
    />
  );
}

/**
 * A document drawn by its kind. An unknown kind — a product's own —
 * falls back to plain text rather than to nothing, which is the same
 * promise the canvas makes when it cannot resolve a kind.
 */
export function DocumentView({
  kind,
  ...props
}: DocumentViewProps & { kind: string }) {
  switch (kind) {
    case "code":
      return <CodeView {...props} />;
    case "sheet":
      return <SheetView {...props} />;
    case "image":
      return <ImageView {...props} />;
    case "text":
      return <TextView {...props} />;
    default:
      return (
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {props.content}
        </div>
      );
  }
}
