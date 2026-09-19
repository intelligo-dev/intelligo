/**
 * The token contract as published: read from the `intelligo`
 * registry:base item in registry.json, so /components shows
 * exactly what `shadcn add intelligo.dev/r/intelligo.json` installs.
 * The contrast maths mirrors tests/architecture/design-system.test.ts.
 */
import registry from "@/data/registry.json";

type CssVars = Record<"theme" | "light" | "dark", Record<string, string>>;
type Base = {
  name: string;
  type: string;
  cssVars: CssVars;
  css: Record<string, Record<string, unknown>>;
};

const base = (registry as unknown as { items: Base[] }).items.find(
  (item) => item.type === "registry:base"
);
if (!base) throw new Error("registry.json has no registry:base item");

export const TOKENS = base.cssVars;

const rootVars = (base.css["@layer base"]?.[":root"] ?? {}) as Record<
  string,
  string
>;
export const LAYERS = Object.entries(rootVars)
  .filter(([name]) => name.startsWith("--z-"))
  .map(([name, value]) => ({ name: name.slice(2), value }));
export const DURATIONS = Object.entries(rootVars)
  .filter(([name]) => name.startsWith("--duration-"))
  .map(([name, value]) => ({ name: name.slice(2), value }));
export const EASINGS = Object.entries(TOKENS.theme)
  .filter(([name]) => name.startsWith("ease-"))
  .map(([name, value]) => ({ name, value }));

function luminance(value: string): number {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return Number.NaN;
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

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The pairs the design-system test holds to AA, with their ratios in both modes. */
export const CONTRAST_PAIRS = (
  [
    ["foreground", "background", 4.5],
    ["muted-foreground", "background", 4.5],
    ["muted-foreground", "muted", 4.5],
    ["primary-foreground", "primary", 4.5],
    ["destructive", "background", 4.5],
    ["destructive-foreground", "destructive", 4.5],
    ["success", "background", 4.5],
    ["success-foreground", "success", 4.5],
    ["warning", "background", 4.5],
    ["warning-foreground", "warning", 4.5],
    ["info", "background", 4.5],
    ["info-foreground", "info", 4.5],
    ["ring", "background", 3],
  ] as const
).map(([text, surface, need]) => ({
  text,
  surface,
  need,
  light: contrast(TOKENS.light[text]!, TOKENS.light[surface]!),
  dark: contrast(TOKENS.dark[text]!, TOKENS.dark[surface]!),
}));
