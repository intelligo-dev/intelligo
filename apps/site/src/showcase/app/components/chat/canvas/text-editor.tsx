"use client";

/**
 * The canvas's text editor: ProseMirror over a markdown document.
 *
 * Markdown in, markdown out — `prosemirror-markdown`'s parser builds
 * the document and its serializer writes it back, so what the tool
 * streamed and what the reader saves are the same text the model
 * reads. While a document streams in, every update replaces the
 * document without touching the reader's draft; once settled, edits
 * flow up through `onChange`.
 *
 * Loaded lazily by `lib/chat-canvas-config.tsx`: a reader who never
 * opens a text document never downloads the editor.
 */

import { useEffect, useRef } from "react";
import { exampleSetup } from "prosemirror-example-setup";
import { inputRules, textblockTypeInputRule } from "prosemirror-inputrules";
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema,
} from "prosemirror-markdown";
import { EditorState, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import type { CanvasContentProps } from "@showcase/lib/chat-canvas-config";

function headingRule(level: number) {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${level}})\\s$`),
    schema.nodes.heading!,
    () => ({ level })
  );
}

function parse(content: string) {
  return defaultMarkdownParser.parse(content) ?? schema.node("doc", null, []);
}

/**
 * The document's typography, spelled out: the theme ships no typography
 * plugin, so `prose` classes would style nothing — lists lose their
 * numbers, headings their size.
 */
const EDITOR_CLASS = [
  "text-sm leading-relaxed text-foreground",
  "[&_.ProseMirror]:min-h-64 [&_.ProseMirror]:outline-none",
  "[&_.ProseMirror>*+*]:mt-3",
  "[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:tracking-tight",
  "[&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold",
  "[&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold",
  "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6",
  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6",
  "[&_.ProseMirror_li]:my-1 [&_.ProseMirror_li>p]:m-0",
  "[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground",
  "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-xs",
  "[&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:p-3",
  "[&_.ProseMirror_a]:underline [&_.ProseMirror_a]:underline-offset-4",
  "[&_.ProseMirror_hr]:border-border",
].join(" ");

export default function TextEditor({
  content,
  status,
  isReadonly,
  onChange,
}: CanvasContentProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readonlyRef = useRef(isReadonly);
  readonlyRef.current = isReadonly;

  useEffect(() => {
    if (!container.current || view.current) return;
    const state = EditorState.create({
      doc: parse(content),
      plugins: [
        ...exampleSetup({ schema, menuBar: false }),
        inputRules({ rules: [1, 2, 3, 4, 5, 6].map(headingRule) }),
      ],
    });
    view.current = new EditorView(container.current, {
      state,
      editable: () => !readonlyRef.current,
      dispatchTransaction(transaction: Transaction) {
        const editor = view.current;
        if (!editor) return;
        editor.updateState(editor.state.apply(transaction));
        if (transaction.docChanged && !transaction.getMeta("external")) {
          onChangeRef.current?.(
            defaultMarkdownSerializer.serialize(editor.state.doc)
          );
        }
      },
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // The editor mounts once; content updates flow through the effect below.
  }, []);

  // External content (a stream, a version switch) replaces the document.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = defaultMarkdownSerializer.serialize(editor.state.doc);
    if (current === content) return;
    if (status !== "streaming" && !isReadonly && editor.hasFocus()) return;
    const next = parse(content);
    const transaction = editor.state.tr.replaceWith(
      0,
      editor.state.doc.content.size,
      next.content
    );
    transaction.setMeta("external", true);
    editor.dispatch(transaction);
  }, [content, status, isReadonly]);

  return (
    <div
      ref={container}
      className={EDITOR_CLASS}
    />
  );
}
