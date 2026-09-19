"use client";

/**
 * Markdown as a model writes it: GFM, highlighted code, CJK-friendly
 * emphasis and, when the text calls for them, maths and diagrams.
 *
 * KaTeX and Mermaid weigh over a megabyte between them, so neither ships
 * with the page. Each is fetched the first time a `$$` block or a
 * `mermaid` fence appears in any rendered text, and every `Markdown` on
 * the page picks it up once it lands; until then the source shows as
 * plain text or a code block.
 */

import * as React from "react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import "katex/dist/katex.min.css";

type StreamdownProps = React.ComponentProps<typeof Streamdown>;
type Plugins = NonNullable<StreamdownProps["plugins"]>;
type OptionalPlugin = "math" | "mermaid";

const NEEDS: Record<OptionalPlugin, RegExp> = {
  math: /\$\$|```math/,
  mermaid: /```mermaid/,
};

const LOADERS: Record<OptionalPlugin, () => Promise<unknown>> = {
  math: () => import("@streamdown/math").then((m) => m.math),
  mermaid: () => import("@streamdown/mermaid").then((m) => m.mermaid),
};

const loaded: Partial<Record<OptionalPlugin, unknown>> = {};
const requested = new Set<OptionalPlugin>();
const listeners = new Set<() => void>();
let version = 0;

function request(name: OptionalPlugin) {
  if (requested.has(name)) return;
  requested.add(name);
  LOADERS[name]()
    .then((plugin) => {
      loaded[name] = plugin;
      version += 1;
      for (const notify of listeners) notify();
    })
    // A failed fetch leaves the source readable as text; the next
    // render that needs the plugin asks again.
    .catch(() => requested.delete(name));
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

const getVersion = () => version;
const getServerVersion = () => 0;

// One object per combination, so Streamdown sees the same `plugins`
// across renders and only reparses when a plugin actually arrives.
const combinations = new Map<string, Plugins>();

function pluginsFor(math: boolean, mermaid: boolean): Plugins {
  const key = `${math}:${mermaid}`;
  let plugins = combinations.get(key);
  if (!plugins) {
    // The plugin packages type `Pluggable` against their own `unified`
    // copy; the shapes are the ones Streamdown expects.
    plugins = {
      code,
      cjk,
      ...(math ? { math: loaded.math } : {}),
      ...(mermaid ? { mermaid: loaded.mermaid } : {}),
    } as unknown as Plugins;
    combinations.set(key, plugins);
  }
  return plugins;
}

export type MarkdownProps = Omit<StreamdownProps, "plugins">;

export function Markdown({ children, ...props }: MarkdownProps) {
  const text = typeof children === "string" ? children : "";
  const needsMath = NEEDS.math.test(text);
  const needsMermaid = NEEDS.mermaid.test(text);

  React.useEffect(() => {
    if (needsMath) request("math");
    if (needsMermaid) request("mermaid");
  }, [needsMath, needsMermaid]);

  React.useSyncExternalStore(subscribe, getVersion, getServerVersion);

  return (
    <Streamdown
      plugins={pluginsFor(
        needsMath && "math" in loaded,
        needsMermaid && "mermaid" in loaded
      )}
      {...props}
    >
      {children}
    </Streamdown>
  );
}
