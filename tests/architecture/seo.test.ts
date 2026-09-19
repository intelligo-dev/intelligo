/**
 * What a search engine and a link preview read on intelligo.dev.
 *
 * The site is built into a temporary directory and every page's head is
 * checked against the sitemap and against every other page: a title a
 * query can match, a description a result can show, one canonical URL
 * that is also the one every link and the sitemap use (the host answers
 * any other form with a 307), a social card that exists, and structured
 * data that describes this page rather than the site.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { APPS_DIR, walk } from "./tree";

const SITE_DIR = path.join(APPS_DIR, "website");
const ORIGIN = "https://intelligo.dev";
const TITLE_MAX = 60;
const DESCRIPTION_RANGE = [70, 160] as const;

type Page = {
  /** The URL path the host serves it at: `/`, `/docs/cli`. */
  path: string;
  html: string;
  title: string;
  description: string;
  canonical: string | null;
  noindex: boolean;
  ogImage: string | null;
  h1s: number;
  jsonLd: unknown[];
  links: string[];
};

let out: string;
let pages: Page[];
let indexable: Page[];
let sitemap: string[];

const decode = (s: string) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const meta = (html: string, attr: string, key: string) => {
  const tag = html.match(new RegExp(`<meta[^>]*${attr}="${key}"[^>]*>`))?.[0];
  const content = tag?.match(/content="([^"]*)"/)?.[1];
  return content === undefined ? null : decode(content);
};

function readPage(file: string): Page {
  const rel = path.relative(out, file).split(path.sep).join("/");
  const route =
    rel === "index.html"
      ? "/"
      : `/${rel.replace(/\/?index\.html$/, "").replace(/\.html$/, "")}`;
  const html = readFileSync(file, "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  return {
    path: route,
    html,
    title: decode(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""),
    description: meta(head, "name", "description") ?? "",
    canonical: head.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null,
    noindex: /<meta name="robots" content="[^"]*noindex/.test(head),
    ogImage: meta(head, "property", "og:image"),
    h1s: (html.match(/<h1[\s>]/g) ?? []).length,
    jsonLd: [
      ...head.matchAll(
        /<script type="application\/ld\+json">([^<]*)<\/script>/g
      ),
    ].map((m) => {
      try {
        return JSON.parse(m[1]!);
      } catch {
        return null;
      }
    }),
    links: [...html.matchAll(/<a\b[^>]*\shref="(\/[^"]*)"/g)].map((m) =>
      decode(m[1]!)
    ),
  };
}

const url = (p: string) => (p === "/" ? `${ORIGIN}/` : `${ORIGIN}${p}`);

beforeAll(() => {
  out = mkdtempSync(path.join(tmpdir(), "intelligo-seo-"));
  execFileSync(
    path.join(SITE_DIR, "node_modules/.bin/astro"),
    ["build", "--outDir", out],
    {
      cwd: SITE_DIR,
      stdio: "pipe",
    }
  );
  pages = walk(out, (name) => name.endsWith(".html")).map(readPage);
  indexable = pages.filter((p) => !p.noindex);
  const xml = walk(out, (name) => /^sitemap-\d+\.xml$/.test(name))
    .map((f) => readFileSync(f, "utf8"))
    .join("");
  sitemap = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!);
}, 180_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

const offenders = (check: (p: Page) => string | false) =>
  indexable.map((p) => check(p) && `${p.path}: ${check(p)}`).filter(Boolean);

describe("every indexable page", () => {
  it("has one h1", () => {
    expect(offenders((p) => p.h1s !== 1 && `${p.h1s} h1 elements`)).toEqual([]);
  });

  it(`has a title of at most ${TITLE_MAX} characters that names Intelligo`, () => {
    expect(
      offenders((p) =>
        p.title.length > TITLE_MAX
          ? `${p.title.length} chars — "${p.title}"`
          : !p.title.includes("Intelligo") &&
            `"${p.title}" does not name Intelligo`
      )
    ).toEqual([]);
  });

  it(`has a description of ${DESCRIPTION_RANGE[0]}–${DESCRIPTION_RANGE[1]} characters`, () => {
    expect(
      offenders((p) => {
        const n = p.description.length;
        return (
          (n < DESCRIPTION_RANGE[0] || n > DESCRIPTION_RANGE[1]) && `${n} chars`
        );
      })
    ).toEqual([]);
  });

  it("has a title and a description no other page has", () => {
    const dupes = (key: "title" | "description") => {
      const seen = new Map<string, string[]>();
      for (const p of indexable)
        seen.set(p[key], [...(seen.get(p[key]) ?? []), p.path]);
      return [...seen.values()].filter((paths) => paths.length > 1);
    };
    expect(dupes("title")).toEqual([]);
    expect(dupes("description")).toEqual([]);
  });

  it("names itself canonical at the URL the host serves without a redirect", () => {
    expect(
      offenders(
        (p) =>
          p.canonical !== url(p.path) &&
          `canonical ${p.canonical}, served at ${url(p.path)}`
      )
    ).toEqual([]);
  });

  it("is in the sitemap, and the sitemap lists nothing else", () => {
    const expected = indexable.map((p) => url(p.path)).sort();
    expect([...sitemap].sort()).toEqual(expected);
  });

  it("has a social card image that the site serves", () => {
    expect(
      offenders((p) => {
        if (!p.ogImage?.startsWith(ORIGIN)) return `og:image ${p.ogImage}`;
        return (
          !existsSync(path.join(out, new URL(p.ogImage).pathname)) &&
          `${p.ogImage} is not built`
        );
      })
    ).toEqual([]);
  });

  it("carries structured data that parses and is its own", () => {
    const home = JSON.stringify(indexable.find((p) => p.path === "/")?.jsonLd);
    expect(
      offenders((p) => {
        if (p.jsonLd.length === 0) return "no JSON-LD";
        if (p.jsonLd.some((d) => d === null)) return "JSON-LD does not parse";
        const typed = p.jsonLd
          .flat()
          .every(
            (d) => typeof (d as { "@type"?: unknown })["@type"] === "string"
          );
        if (!typed) return "a JSON-LD object without @type";
        return (
          p.path !== "/" &&
          JSON.stringify(p.jsonLd) === home &&
          "repeats the homepage's JSON-LD"
        );
      })
    ).toEqual([]);
  });
});

describe("internal links", () => {
  it("land on a built page in its canonical form", () => {
    const built = new Set(pages.map((p) => p.path));
    const bad = new Set<string>();
    for (const p of pages) {
      for (const href of p.links) {
        const target = href.split("#")[0]!.split("?")[0]!;
        if (target === "" || /\.[a-z0-9]+$/i.test(target)) continue;
        if (target !== "/" && target.endsWith("/"))
          bad.add(`${p.path} → ${href} (trailing slash redirects)`);
        else if (!built.has(target))
          bad.add(`${p.path} → ${href} (no such page)`);
      }
    }
    expect([...bad]).toEqual([]);
  });
});
