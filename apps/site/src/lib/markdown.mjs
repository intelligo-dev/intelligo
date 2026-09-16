/**
 * Code blocks in the docs, framed at build time so nothing shifts on
 * load: a label (the file, or the language), a copy button, and a prompt
 * on shell commands. A shiki transformer, so it runs under Astro's
 * default Markdown processor with no extra dependency. (Heading anchors
 * are added by the docs layout: a build-time anchor would land inside the
 * heading text the id is slugged from.)
 *
 * Astro caches rendered content and does not see a change to this file:
 * after editing it, delete .astro/data-store.json and
 * node_modules/.astro/data-store.json before building.
 */

const SHELL = new Set(["bash", "sh", "shell", "zsh", "console"]);
const LABELS = {
  bash: "Terminal",
  sh: "Terminal",
  shell: "Terminal",
  zsh: "Terminal",
  console: "Terminal",
  ts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  json: "JSON",
  ini: "Environment",
  dotenv: "Environment",
  text: "Output",
  sql: "SQL",
  css: "CSS",
};

const el = (tagName, properties, children = []) => ({
  type: "element",
  tagName,
  properties,
  children,
});

const text = (node) =>
  node.type === "text" ? node.value : (node.children ?? []).map(text).join("");

/** `title="lib/intelligo.ts"` in the fence's info string. */
const titleOf = (meta = "") => meta.match(/title="([^"]+)"/)?.[1];

const COPY_ICON = el(
  "svg",
  {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    className: ["icon-copy"],
  },
  [
    el("rect", { x: 9, y: 9, width: 13, height: 13, rx: 2 }),
    el("path", {
      d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    }),
  ]
);
const CHECK_ICON = el(
  "svg",
  {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    className: ["icon-check"],
  },
  [el("path", { d: "M20 6 9 17l-5-5" })]
);

/** Shiki transformer: the code frame and the shell prompt. */
export const codeFrame = {
  name: "intelligo-code-frame",
  line(node) {
    if (!SHELL.has(this.options.lang)) return;
    const t = text(node);
    const continued = this.__continues === true;
    this.__continues = /\\\s*$/.test(t);
    // A prompt on every command; none on a blank line, a comment or a continuation.
    if (!continued && t.trim() && !t.trim().startsWith("#")) {
      this.addClassToHast(node, "cmd");
    }
  },
  root(root) {
    const lang = this.options.lang;
    const title = titleOf(this.options.meta?.__raw);
    const label = title ?? LABELS[lang] ?? lang;
    const bar = el("div", { className: ["code-bar"] }, [
      el(
        "span",
        { className: title ? ["code-label", "code-file"] : ["code-label"] },
        [{ type: "text", value: label }]
      ),
      el(
        "button",
        {
          type: "button",
          className: ["code-copy"],
          "aria-label": "Copy code",
          "data-copy": "",
        },
        [COPY_ICON, CHECK_ICON]
      ),
    ]);
    return {
      type: "root",
      children: [
        el(
          "div",
          {
            className: ["code-frame"],
            "data-lang": SHELL.has(lang) ? "shell" : lang,
          },
          [bar, ...root.children]
        ),
      ],
    };
  },
};
