/**
 * Registries that survive a bundler duplicating the module they live in.
 *
 * Next.js's server build can instantiate a package twice, so a module-scope
 * `Map` written by the composition root may not be the one a page reads —
 * and the failure is quiet (registries look empty, checks fall through to
 * their defaults). Keying storage off `Symbol.for()` puts the map in the
 * realm's global symbol registry, which every copy of the module shares.
 *
 * `globalThis` is per process: Node and Edge runtimes each still need the
 * composition root to run.
 */

/** What the module stores behind its global symbol. */
type Slot<T> = {
  readonly map: Map<string, T>;
  /** The module URL of the copy that created it, for the warning below. */
  readonly origin: string;
};

const seen = new Set<string>();

/**
 * A `Map` shared by every copy of the module that asks for the same key.
 * Use it wherever a registry is written by the composition root and read by
 * request-time code:
 *
 *     const plans = createRegistry<PlanMap>("billing/plans");
 *
 * `key` must be unique across the framework (`"<package>/<registry>"`). The
 * value type is not checked across copies.
 */
export function createRegistry<T>(key: string): Map<string, T> {
  const symbol = Symbol.for(`@intelligo-dev/registry/${key}`);
  const globals = globalThis as unknown as Record<symbol, Slot<T> | undefined>;

  const existing = globals[symbol];
  if (existing) {
    // A second copy reaching the same slot is not an error. Warn once per
    // key anyway: every other module-scope value in that file is
    // duplicated too, and those fail silently.
    if (existing.origin !== import.meta.url && !seen.has(key)) {
      seen.add(key);
      console.warn(
        `[intelligo] registry "${key}" is being read from a second module ` +
          `instance (${import.meta.url}, first seen from ${existing.origin}). ` +
          `The registry itself is shared, so this is safe — but any other ` +
          `module-scope state in that file is now duplicated.`
      );
    }
    return existing.map;
  }

  const map = new Map<string, T>();
  globals[symbol] = { map, origin: import.meta.url };
  return map;
}

/**
 * A single shared value, for registries that are not maps: a module-scope
 * `let` has the same duplication problem a `Map` does.
 */
export function createRegistryRef<T>(
  key: string,
  initial: T
): { get(): T; set(value: T): void } {
  const box = createRegistry<T>(`ref/${key}`);
  if (!box.has("value")) box.set("value", initial);
  return {
    get: () => box.get("value") as T,
    set: (value: T) => {
      box.set("value", value);
    },
  };
}
