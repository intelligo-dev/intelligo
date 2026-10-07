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
 *
 * Images load only from the hosts in `imagePrefixes`, none by default. Model output can be steered by what it
 * read — a page, a document, a tool result — and an image URL fetches on
 * render, so an open policy would let that text send the reader's IP, and
 * anything put in the URL, to any server; a shared chat would do it for
 * every visitor. Pass the hosts a product trusts.
 */

import * as React from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";
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

// Streamdown's own hardening plugin, re-optioned: its default lets
// every image and link through.
const [harden] = defaultRehypePlugins.harden as unknown as [
  NonNullable<StreamdownProps["rehypePlugins"]>[number],
];

const rehypeFor = new Map<string, NonNullable<StreamdownProps["rehypePlugins"]>>();

function rehypePluginsFor(imagePrefixes: readonly string[]) {
  const key = imagePrefixes.join(" ");
  let plugins = rehypeFor.get(key);
  if (!plugins) {
    plugins = [
      defaultRehypePlugins.raw!,
      defaultRehypePlugins.sanitize!,
      [
        harden,
        {
          // Resolves a relative URL, which then matches no allowed host.
          defaultOrigin: "https://relative.invalid",
          allowedImagePrefixes: [...imagePrefixes],
          allowDataImages: true,
          allowedLinkPrefixes: ["*"],
          allowedProtocols: ["*"],
        },
      ],
    ] as NonNullable<StreamdownProps["rehypePlugins"]>;
    rehypeFor.set(key, plugins);
  }
  return plugins;
}

const NO_IMAGE_HOSTS: readonly string[] = [];

export type MarkdownProps = Omit<StreamdownProps, "plugins"> & {
  /** URL prefixes images may load from, e.g. `https://cdn.example.com/`. */
  imagePrefixes?: readonly string[];
};

export function Markdown({
  children,
  imagePrefixes = NO_IMAGE_HOSTS,
  ...props
}: MarkdownProps) {
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
      rehypePlugins={rehypePluginsFor(imagePrefixes)}
      {...props}
    >
      {children}
    </Streamdown>
  );
}
