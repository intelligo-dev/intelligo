"use client";

/**
 * The canvas's code editor: CodeMirror 6, with the language picked from
 * the document's file extension and the theme following the app's.
 * External content — a stream, a version switch — replaces the buffer
 * as a remote change so it never re-enters as an edit.
 *
 * Loaded lazily by `lib/chat-canvas-config.tsx`.
 */

import { useEffect, useMemo, useRef } from "react";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useTheme } from "next-themes";

import type { CanvasContentProps } from "@/lib/chat-canvas-config";

function languageFor(title: string) {
  const extension = title.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "jsx":
      return javascript({ jsx: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "py":
      return python();
    default:
      return [];
  }
}

const lightTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "0.875rem" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none" },
});

export default function CodeEditor({
  content,
  status,
  title,
  isReadonly,
  onChange,
}: CanvasContentProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { resolvedTheme } = useTheme();
  const themeCompartment = useMemo(() => new Compartment(), []);
  const readonlyCompartment = useMemo(() => new Compartment(), []);
  const languageCompartment = useMemo(() => new Compartment(), []);

  useEffect(() => {
    if (!container.current || view.current) return;
    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        languageCompartment.of(languageFor(title)),
        themeCompartment.of(resolvedTheme === "dark" ? oneDark : lightTheme),
        readonlyCompartment.of(EditorState.readOnly.of(isReadonly)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const local = update.transactions.some(
            (transaction) => !transaction.annotation(Transaction.remote)
          );
          if (local) onChangeRef.current?.(update.state.doc.toString());
        }),
      ],
    });
    view.current = new EditorView({ state, parent: container.current });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // Mounts once; the compartments below follow prop changes.
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: themeCompartment.reconfigure(
        resolvedTheme === "dark" ? oneDark : lightTheme
      ),
    });
  }, [resolvedTheme, themeCompartment]);

  useEffect(() => {
    view.current?.dispatch({
      effects: readonlyCompartment.reconfigure(
        EditorState.readOnly.of(isReadonly)
      ),
    });
  }, [isReadonly, readonlyCompartment]);

  useEffect(() => {
    view.current?.dispatch({
      effects: languageCompartment.reconfigure(languageFor(title)),
    });
  }, [title, languageCompartment]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === content) return;
    if (status !== "streaming" && !isReadonly && editor.hasFocus) return;
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      annotations: [Transaction.remote.of(true)],
    });
  }, [content, status, isReadonly]);

  return <div ref={container} className="min-h-64 text-sm" />;
}
