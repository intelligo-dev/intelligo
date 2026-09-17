/**
 * Registries that survive a bundler duplicating the module they live in.
 *
 * A framework registry is a `Map` at module scope: the composition root
 * writes to it once at startup and every later reader reads through it.
 * That holds exactly as long as there is one instance of the module.
 * Next.js does not guarantee that — its server build splits code into
 * several bundles, and a package imported from two of them can be
 * instantiated twice. The composition root then writes to one copy and
 * a page reads the other.
 *
 * The failure is quiet, which is what makes it expensive. The first
 * product to hit it saw `"No billing product configured"` logged by a
 * page that rendered perfectly well: quota state came back null,
 * feature checks fell through to their closed defaults, and nothing
 * threw. Its workaround was a `server-only` side-effect module that
 * every server file had to import, plus an architecture test naming the
 * ten functions that read a registry — exactly the kind of
 * import-side-effect registration the framework forbids, so the
 * product had to violate the rule inside files the framework had
 * shipped it.
 *
 * Keying the storage off `Symbol.for()` moves the map out of the module
 * and into the realm's global symbol registry, which the bundler cannot
 * duplicate. Every copy of the module then finds the same map, and the
 * composition root can go back to running once.
 *
 * The limit, stated honestly: `globalThis` is per process. Node and
 * Edge runtimes are separate processes and each still needs the
 * composition root to run. This fixes duplicate modules, not duplicate
 * runtimes.
 */

/** What the module stores behind its global symbol. */
type Slot<T> = {
  readonly map: Map<string, T>;
  /** The module URL of the copy that created it, for the warning below. */
  readonly origin: string;
};

const seen = new Set<string>();

/**
 * A `Map` shared by every copy of the module that asks for the same
 * key.
 *
 * Use it wherever a registry is written by the composition root and
 * read by request-time code:
 *
 *     const plans = createRegistry<PlanMap>("billing/plans");
 *
 * `key` is namespaced into the global symbol registry, so it needs to
 * be unique across the framework — `"<package>/<registry>"` is the
 * convention. The value type is not checked across copies: two modules
 * that disagree about `T` for one key is a programming error this
 * cannot catch, which is why the keys live next to their registries
 * rather than in a shared list someone could reuse by accident.
 */
export function createRegistry<T>(key: string): Map<string, T> {
  const symbol = Symbol.for(`@intelligo-dev/registry/${key}`);
  const globals = globalThis as unknown as Record<symbol, Slot<T> | undefined>;

  const existing = globals[symbol];
  if (existing) {
    // A second copy of the module reaching the same slot is the
    // condition this function exists to survive — it is not an error,
    // and the map it returns is the right one. It is worth saying once
    // per key, because it also means every *other* module-scope value
    // in that file is duplicated too, and the next one to matter will
    // not announce itself.
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
 * A single shared value, for the registries that are not maps.
 *
 * `defaultProductSlug` is the one that motivated this: a `let` at
 * module scope has exactly the duplication problem a `Map` does, and
 * it is the value whose absence produces "No billing product
 * configured".
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
