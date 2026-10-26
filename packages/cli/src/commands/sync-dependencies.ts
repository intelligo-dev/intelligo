/**
 * What the served items say about npm dependencies the app already has.
 *
 * Each built item pins its dependencies to the range the registry is
 * tested against, and `shadcn add` writes that range over the app's
 * whenever an item names one. An app that had moved a dependency past
 * the pin would be taken back down on every sync. A dependency the app
 * declares at or above the pin, within the same major, is served
 * without its range instead: shadcn then leaves the app's spec alone.
 * Any other — absent, older, another major, a range this does not
 * read — keeps the pin, which raises it.
 */

type Version = readonly [number, number, number];

/** The lowest version a range admits, for `1.2.3`, `^1.2.3`, `~1.2.3` and `>=1.2.3`; null for anything else. */
export function rangeFloor(range: string): Version | null {
  const match = /^(?:\^|~|>=)?\s*v?(\d+)\.(\d+)\.(\d+)$/.exec(range.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when the app's range starts at or above the pinned one, in the same major. */
export function satisfiesPin(appRange: string, pinnedRange: string): boolean {
  const app = rangeFloor(appRange);
  const pin = rangeFloor(pinnedRange);
  if (!app || !pin || app[0] !== pin[0]) return false;
  for (let i = 1; i < 3; i++) {
    if (app[i]! !== pin[i]!) return app[i]! > pin[i]!;
  }
  return true;
}

/** `name@range` → `[name, range]`; a scoped name keeps its leading `@`. */
function splitSpec(spec: string): [string, string | null] {
  const at = spec.indexOf("@", 1);
  return at === -1 ? [spec, null] : [spec.slice(0, at), spec.slice(at + 1)];
}

/**
 * The item with each dependency the app declares at or above its pin
 * named without a range. `declared` is the app's dependencies and
 * devDependencies.
 */
export function keepDeclaredRanges<T extends { dependencies?: unknown }>(
  item: T,
  declared: Readonly<Record<string, string>>
): T {
  if (!Array.isArray(item.dependencies)) return item;
  return {
    ...item,
    dependencies: item.dependencies.map((spec: unknown) => {
      if (typeof spec !== "string") return spec;
      const [name, pinned] = splitSpec(spec);
      const own = declared[name];
      return pinned && own && satisfiesPin(own, pinned) ? name : spec;
    }),
  };
}
