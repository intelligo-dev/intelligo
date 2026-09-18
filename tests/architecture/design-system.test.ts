/**
 * The design system's rules, enforced on the source this
 * repository ships: registry items and the reference app.
 *
 * The source rules compare against `design-system.baseline.json`, the
 * known violations. The baseline may only shrink: a new violation
 * fails, and so does a fixed one still listed. Regenerate after a fix
 * with
 * `UPDATE_DESIGN_SYSTEM_BASELINE=1 pnpm vitest run tests/architecture/design-system.test.ts`.
 *
 * The token rules for the `intelligo` base item have no baseline.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ROOT } from "./tree";

const BASELINE_PATH = path.join(__dirname, "design-system.baseline.json");

/** Source a consumer installs or the reference app runs. Stock primitives are shadcn's, not ours. */
const SCOPES = [
  { dir: "packages/registry/base", skip: [] as string[] },
  { dir: "apps/app/components", skip: ["apps/app/components/ui"] },
  { dir: "apps/app/app", skip: [] as string[] },
];

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";

const RULES: { id: string; why: string; pattern: RegExp }[] = [
  {
    id: "palette-colour",
    why: "colour comes from a semantic token (bg-success, text-warning…), never the Tailwind palette",
    pattern: new RegExp(
      String.raw`(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret)-(?:(?:${PALETTE})-\d{2,3}|white|black)(?:\/\d+)?(?![\w-])`,
      "g"
    ),
  },
  {
    id: "literal-colour",
    why: "no literal colours in class names",
    pattern: /-\[(?:#|rgb|hsl|oklch)[^\]]*\]/g,
  },
  {
    id: "arbitrary-value",
    why: "arbitrary values come from the reviewed allow-list",
    pattern:
      /(?<![\w-])(?:min-h|max-h|h|min-w|max-w|w|size|text|rounded|shadow|gap|p[xytrbl]?|m[xytrbl]?|top|left|right|bottom|inset|translate-[xy]|leading|tracking|z|grid-cols|basis)-\[[^\]]+\]/g,
  },
  {
    id: "radius-scale",
    why: "corners come from the scale: lg for controls and popups, xl for cards and dialogs, full for chips and dots",
    pattern: /(?<![\w-])rounded(?:-[setblrxy]{1,2})?-(?:2xl|3xl|4xl)(?![\w-])/g,
  },
  {
    id: "radix",
    why: "Base UI composes with render; Radix APIs and variables do not ship",
    pattern:
      /\basChild\b|["'](?:radix-ui|@radix-ui\/[\w-]+)["']|--radix-[\w-]+/g,
  },
  {
    id: "icon-size",
    why: "icons size with size-*",
    pattern: /(?<![\w-])h-(\d+(?:\.5)?) w-\1(?![\w-])/g,
  },
  {
    id: "loader-spinner",
    why: "pending state is Spinner with disabled and aria-busy",
    pattern: /\bLoader2(?:Icon)?\b/g,
  },
];

/**
 * The few rule matches that are the right tool, each with its reason —
 * keyed by `<rule> <match>`. An entry is a reviewed decision, not a
 * baseline: it never shrinks on its own.
 */
const ALLOWED = new Map<string, string>([
  [
    "palette-colour bg-white",
    "a QR code needs a white quiet zone to scan, in dark mode too",
  ],
  [
    "arbitrary-value max-w-[calc(100%-2rem)]",
    "a centred dialog keeps a 1rem gutter on a phone before its sm:max-w-sm applies",
  ],
  [
    "arbitrary-value w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]",
    "the floating and inset sidebar's icon rail is the icon width plus its padding",
  ],
  [
    "arbitrary-value w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]",
    "the same rail, plus the two border pixels of the floating variant",
  ],
  [
    "arbitrary-value max-h-[80vh]",
    "a dialog of arbitrary content stays inside the viewport and scrolls",
  ],
]);

function walk(dir: string, skip: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full);
    if (entry === "node_modules" || skip.includes(rel)) continue;
    if (statSync(full).isDirectory()) walk(full, skip, out);
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

type Counts = Record<string, number>;

function collectViolations(): Counts {
  const counts: Counts = {};
  for (const scope of SCOPES) {
    for (const file of walk(path.join(ROOT, scope.dir), scope.skip)) {
      const rel = path.relative(ROOT, file);
      const source = readFileSync(file, "utf8");
      for (const rule of RULES) {
        for (const match of source.matchAll(rule.pattern)) {
          if (ALLOWED.has(`${rule.id} ${match[0]}`)) continue;
          const key = `${rule.id} ${rel} ${match[0]}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

function readBaseline(): Counts {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Counts;
  } catch {
    return {};
  }
}

describe("motion honours prefers-reduced-motion", () => {
  it("every file that animates with motion reads useReducedMotion", () => {
    const offenders: string[] = [];
    for (const scope of SCOPES) {
      for (const file of walk(path.join(ROOT, scope.dir), scope.skip)) {
        const source = readFileSync(file, "utf8");
        if (!/from ["']motion\/react["']/.test(source)) continue;
        if (!/useReducedMotion/.test(source)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(
      offenders,
      "a motion animation must be gated on useReducedMotion so a reader who asked for less motion gets it"
    ).toEqual([]);
  });
});

describe("design-system source rules", () => {
  const current = collectViolations();

  if (process.env.UPDATE_DESIGN_SYSTEM_BASELINE) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  }
  const baseline = readBaseline();

  it("scans the source it rules on", () => {
    const scanned = SCOPES.flatMap((scope) =>
      walk(path.join(ROOT, scope.dir), scope.skip)
    );
    expect(scanned.length).toBeGreaterThan(50);
  });

  it("introduces no violation the baseline does not already record", () => {
    const added = Object.entries(current)
      .filter(([key, count]) => count > (baseline[key] ?? 0))
      .map(
        ([key, count]) => `${key} (${count}, baseline ${baseline[key] ?? 0})`
      );
    const why = RULES.map((rule) => `  ${rule.id}: ${rule.why}`).join("\n");
    expect(
      added,
      `new design-system violations:\n  ${added.join("\n  ")}\n\nrules:\n${why}`
    ).toEqual([]);
  });

  it("lists no violation that has since been fixed, so the baseline only shrinks", () => {
    const stale = Object.entries(baseline)
      .filter(([key, count]) => (current[key] ?? 0) < count)
      .map(
        ([key, count]) => `${key} (baseline ${count}, now ${current[key] ?? 0})`
      );
    expect(
      stale,
      `fixed violations still in the baseline — run UPDATE_DESIGN_SYSTEM_BASELINE=1:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });
});

// ── tokens ────────────────────────────────────────────────────────────

type CssVars = Record<"theme" | "light" | "dark", Record<string, string>>;

function readBase(): { config: { style: string }; cssVars: CssVars } {
  const registry = JSON.parse(
    readFileSync(path.join(ROOT, "packages/registry/registry.json"), "utf8")
  ) as {
    items: {
      name: string;
      type: string;
      config: { style: string };
      cssVars: CssVars;
    }[];
  };
  const base = registry.items.find((item) => item.type === "registry:base");
  if (!base) throw new Error("registry.json has no registry:base item");
  return base;
}

/** OKLCH → relative luminance (WCAG 2.x), via OKLab and linear sRGB, clamped to gamut. */
function luminance(value: string): number {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`not an opaque oklch() colour: ${value}`);
  const [L, C, h] = [
    Number(m[1]),
    Number(m[2]),
    (Number(m[3]) * Math.PI) / 180,
  ];
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const r = clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

/** OKLCH → gamma-encoded sRGB channels, clamped to gamut. */
function srgb(value: string): [number, number, number] {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`not an opaque oklch() colour: ${value}`);
  const [L, C, h] = [
    Number(m[1]),
    Number(m[2]),
    (Number(m[3]) * Math.PI) / 180,
  ];
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const encode = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  return [
    encode(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
  ];
}

function rgbLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast of a token's text on a `bg-token/10` tint laid over a surface. */
function tintContrast(token: string, surface: string, alpha = 0.1): number {
  const fg = srgb(token);
  const under = srgb(surface);
  const tint = fg.map((c, i) => alpha * c + (1 - alpha) * under[i]!) as [
    number,
    number,
    number,
  ];
  const [hi, lo] = [rgbLuminance(fg), rgbLuminance(tint)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("the intelligo token contract", () => {
  const base = readBase();

  it("configures base-nova", () => {
    expect(base.config.style).toBe("base-nova");
  });

  describe.each(["light", "dark"] as const)(
    "%s mode meets WCAG 2.2 AA",
    (mode) => {
      const tokens = base.cssVars[mode];
      const opaque = (name: string) =>
        tokens[name] && !tokens[name]!.includes("/");

      it("every foreground reads on its fill (4.5:1)", () => {
        const failing = Object.keys(tokens)
          .filter((name) => name.endsWith("-foreground"))
          .map((name) => [name, name.slice(0, -"-foreground".length)] as const)
          .filter(([fg, fill]) => opaque(fg) && opaque(fill))
          .map(
            ([fg, fill]) =>
              [
                `${fg} on ${fill}`,
                contrast(tokens[fg]!, tokens[fill]!),
              ] as const
          )
          .filter(([, ratio]) => ratio < 4.5)
          .map(([pair, ratio]) => `${pair}: ${ratio.toFixed(2)}`);
        expect(failing).toEqual([]);
      });

      it("text colours read on the page and card surfaces (4.5:1)", () => {
        const failing: string[] = [];
        for (const text of [
          "foreground",
          "muted-foreground",
          "destructive",
          "success",
          "warning",
          "info",
        ]) {
          for (const surface of ["background", "card", "muted"]) {
            if (text !== "muted-foreground" && surface === "muted") continue;
            const ratio = contrast(tokens[text]!, tokens[surface]!);
            if (ratio < 4.5)
              failing.push(`${text} on ${surface}: ${ratio.toFixed(2)}`);
          }
        }
        expect(failing).toEqual([]);
      });

      it("status text reads on its own tint — the badge, alert and destructive-button pattern (4.5:1)", () => {
        const failing: string[] = [];
        for (const status of ["destructive", "success", "warning", "info"]) {
          for (const surface of ["background", "card"]) {
            const ratio = tintContrast(tokens[status]!, tokens[surface]!);
            if (ratio < 4.5)
              failing.push(
                `${status} on ${status}/10 over ${surface}: ${ratio.toFixed(2)}`
              );
          }
        }
        expect(failing).toEqual([]);
      });

      it("the focus ring is visible against the page (3:1)", () => {
        expect(
          contrast(tokens.ring!, tokens.background!)
        ).toBeGreaterThanOrEqual(3);
      });
    }
  );
});

// ── surfaces ──────────────────────────────────────────────────────────

/**
 * Every listed surface uses base-nova and carries the token contract
 * verbatim — the values `shadcn add` writes from the intelligo item,
 * light in `:root` and dark in `.dark`.
 */
const SURFACES = [
  {
    name: "intelligo.dev",
    components: "apps/site/components.json",
    css: "apps/site/src/styles/global.css",
  },
  {
    name: "the reference app",
    components: "apps/app/components.json",
    css: "apps/app/app/globals.css",
  },
  {
    name: "the CLI scaffold",
    components: "packages/cli/templates/app-scaffold/components.json.tpl",
    css: "packages/cli/templates/app-scaffold/globals.css.tpl",
  },
];

function cssBlock(css: string, selector: string): Record<string, string> {
  const start = css.search(
    new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{`)
  );
  if (start < 0) return {};
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const vars: Record<string, string> = {};
  for (const m of css
    .slice(open + 1, close)
    .matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[m[1]!] = m[2]!.trim();
  }
  return vars;
}

describe.each(SURFACES)(
  "surface: $name follows the design system",
  (surface) => {
    const base = readBase();
    const css = readFileSync(path.join(ROOT, surface.css), "utf8");

    it("is configured for base-nova", () => {
      const config = JSON.parse(
        readFileSync(path.join(ROOT, surface.components), "utf8")
      ) as { style: string };
      expect(config.style).toBe("base-nova");
    });

    it.each(["light", "dark"] as const)(
      "defines the %s tokens exactly as the intelligo item",
      (mode) => {
        const block = cssBlock(css, mode === "light" ? ":root" : ".dark");
        const drift = Object.entries(base.cssVars[mode])
          .filter(([name, value]) => block[name] !== value)
          .map(
            ([name, value]) =>
              `--${name}: expected ${value}, found ${block[name] ?? "nothing"}`
          );
        expect(drift).toEqual([]);
      }
    );

    it("switches dark mode with the .dark class, not data-theme", () => {
      expect(css).toContain("@custom-variant dark (&:is(.dark *));");
      expect(css).not.toMatch(/data-theme/);
    });
  }
);
