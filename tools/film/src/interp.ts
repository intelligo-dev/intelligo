import { interpolate } from "remotion";

/**
 * Framer Motion's `useTransform(mv, [a,b], [x,y])`, ported: Remotion's
 * `interpolate()` throws when the input falls outside `[a,b]` unless told
 * to clamp, where `useTransform` clamps by default — so every call here
 * clamps both ends to match the original's behaviour.
 */
export function interp(
  value: number,
  input: readonly number[],
  output: readonly number[],
): number {
  return interpolate(value, input as number[], output as number[], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const seg = (v: number, a: number, b: number) =>
  clamp01((v - a) / (b - a));

/** `text` typed out while `v` runs a → b. */
export function typed(v: number, a: number, b: number, text: string): string {
  return text.slice(0, Math.round(seg(v, a, b) * text.length));
}

/** deterministic scatter, so every render agrees */
export function rnd(i: number, k: number) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
