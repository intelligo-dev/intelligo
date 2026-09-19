/**
 * One social card per page, drawn after the build from what the page
 * already says: its heading, its description and where it sits. The card
 * cannot fall behind a title change because nothing about it is written
 * down twice. Base.astro points `og:image` at the same path (og-path.mjs).
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { ogImagePath } from "./og-path.mjs";

const require = createRequire(import.meta.url);
const font = (pkg, file) =>
  readFileSync(
    path.join(
      path.dirname(require.resolve(`${pkg}/package.json`)),
      "files",
      file
    )
  );

const FONTS = [
  {
    name: "Outfit",
    weight: 500,
    data: font("@fontsource/outfit", "outfit-latin-500-normal.woff"),
  },
  {
    name: "Outfit",
    weight: 700,
    data: font("@fontsource/outfit", "outfit-latin-700-normal.woff"),
  },
  {
    name: "Geist",
    weight: 400,
    data: font("@fontsource/geist-sans", "geist-sans-latin-400-normal.woff"),
  },
  {
    name: "Geist Mono",
    weight: 400,
    data: font("@fontsource/geist-mono", "geist-mono-latin-400-normal.woff"),
  },
];

const WIDTH = 1200;
const HEIGHT = 630;

/** The section a path belongs to, shown beside the brand. */
function section(route) {
  if (route.startsWith("/docs")) return "docs";
  if (route.startsWith("/blocks")) return "pages";
  if (route.startsWith("/components") || route === "/ui") return "ui";
  return null;
}

const text = (html) =>
  html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const h = (type, style, ...children) => ({
  type,
  props: {
    style: { display: "flex", ...style },
    children: children.length === 1 ? children[0] : children,
  },
});

function card({ heading, description, route }) {
  const label = section(route);
  const size = heading.length > 70 ? 50 : heading.length > 40 ? 60 : 72;
  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      padding: "56px 64px",
      flexDirection: "column",
      justifyContent: "space-between",
      background: "#fafafa",
      color: "#060606",
      fontFamily: "Geist",
    },
    h(
      "div",
      {
        alignItems: "center",
        gap: 14,
        fontFamily: "Outfit",
        fontWeight: 700,
        fontSize: 30,
      },
      h("div", {
        width: 20,
        height: 20,
        borderRadius: 5,
        background: "#171717",
      }),
      "intelligo",
      ...(label
        ? [
            h(
              "div",
              {
                marginLeft: 8,
                fontFamily: "Geist Mono",
                fontWeight: 400,
                fontSize: 22,
                color: "#737373",
              },
              `/ ${label}`
            ),
          ]
        : [])
    ),
    h(
      "div",
      { flexDirection: "column", gap: 24 },
      h(
        "div",
        {
          fontFamily: "Outfit",
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.08,
          letterSpacing: "-0.01em",
          maxWidth: 1040,
        },
        heading
      ),
      ...(description
        ? [
            h(
              "div",
              {
                fontSize: 28,
                lineHeight: 1.4,
                color: "#525252",
                maxWidth: 980,
              },
              description
            ),
          ]
        : [])
    ),
    h(
      "div",
      {
        justifyContent: "space-between",
        alignItems: "center",
        borderTop: "1px solid #dedede",
        paddingTop: 24,
        fontFamily: "Geist Mono",
        fontSize: 22,
        color: "#737373",
      },
      h("div", {}, `intelligo.dev${route === "/" ? "" : route}`),
      h("div", {}, "Open source · Apache-2.0")
    )
  );
}

function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

export default function ogImages() {
  return {
    name: "intelligo-og-images",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        let count = 0;
        for (const file of htmlFiles(root)) {
          const html = readFileSync(file, "utf8");
          const head = html.slice(0, html.indexOf("</head>"));
          if (/<meta name="robots" content="[^"]*noindex/.test(head)) continue;
          const rel = path.relative(root, file).split(path.sep).join("/");
          const route =
            rel === "index.html"
              ? "/"
              : `/${rel.replace(/\/?index\.html$/, "").replace(/\.html$/, "")}`;
          const heading = text(
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ""
          );
          const description = text(
            head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ""
          );
          const svg = await satori(card({ heading, description, route }), {
            width: WIDTH,
            height: HEIGHT,
            fonts: FONTS,
          });
          const png = new Resvg(svg, {
            fitTo: { mode: "width", value: WIDTH },
            // Satori has already turned the text into paths; scanning the
            // system's fonts on every card is what would make this slow.
            font: { loadSystemFonts: false },
          })
            .render()
            .asPng();
          const target = path.join(root, ogImagePath(route));
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, png);
          count++;
        }
        logger.info(`${count} social cards written to og/`);
      },
    },
  };
}
