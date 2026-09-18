import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegistry, createRegistryRef } from "./registry";

/** A key nothing else uses, so the global registry stays clean. */
const key = () => `test/${crypto.randomUUID()}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRegistry", () => {
  it("returns the same map for the same key", () => {
    const k = key();
    const a = createRegistry<number>(k);
    a.set("x", 1);

    // A second caller — in production a second copy of the module — sees
    // the first one's writes.
    expect(createRegistry<number>(k).get("x")).toBe(1);
    expect(createRegistry<number>(k)).toBe(a);
  });

  it("keeps different keys apart", () => {
    const a = createRegistry<number>(key());
    const b = createRegistry<number>(key());
    a.set("x", 1);
    expect(b.has("x")).toBe(false);
  });

  it("stores behind a cross-realm symbol, not a module variable", () => {
    const k = key();
    createRegistry<number>(k).set("x", 1);

    const symbol = Symbol.for(`@intelligo-dev/registry/${k}`);
    const slot = (
      globalThis as unknown as Record<
        symbol,
        { map: Map<string, number> } | undefined
      >
    )[symbol];
    expect(slot?.map.get("x")).toBe(1);
  });

  it("adopts a slot another module instance created, and says so once", () => {
    const k = key();
    const symbol = Symbol.for(`@intelligo-dev/registry/${k}`);
    const planted = new Map<string, number>([["x", 42]]);
    (globalThis as unknown as Record<symbol, unknown>)[symbol] = {
      map: planted,
      origin: "file:///some/other/bundle/registry.js",
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(createRegistry<number>(k)).toBe(planted);
    expect(warn).toHaveBeenCalledTimes(1);

    // The warning has to be actionable on its own: which registry,
    // which two module instances, and that the map itself is fine —
    // otherwise it reads as an error and someone "fixes" the registry.
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toContain(k);
    // Both ends of the duplication: the copy that is asking now, and
    // the copy that got there first.
    expect(message).toContain("core/src/registry.ts");
    expect(message).toContain("file:///some/other/bundle/registry.js");
    expect(message).toMatch(/second module/);
    expect(message).toMatch(/safe/);
    expect(message).toMatch(/duplicated/);

    // Once per key: the condition persists for the life of the
    // process, and a warning on every read would bury the log.
    createRegistry<number>(k);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when the same instance asks twice", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = key();
    createRegistry<number>(k);
    createRegistry<number>(k);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("createRegistryRef", () => {
  it("shares one value across callers", () => {
    const k = key();
    const a = createRegistryRef<string | undefined>(k, undefined);
    const b = createRegistryRef<string | undefined>(k, undefined);

    a.set("alpha");
    expect(b.get()).toBe("alpha");
  });

  it("does not overwrite a value a previous caller set", () => {
    // The composition root can run before or after the module that
    // reads the ref is first imported; initialising on every call
    // would make the order matter.
    const k = key();
    createRegistryRef<string | undefined>(k, undefined).set("alpha");
    expect(createRegistryRef<string | undefined>(k, undefined).get()).toBe(
      "alpha"
    );
  });

  it("keeps an explicit undefined distinct from unset", () => {
    const k = key();
    const ref = createRegistryRef<string | undefined>(k, "initial");
    ref.set(undefined);
    expect(createRegistryRef<string | undefined>(k, "initial").get()).toBe(
      undefined
    );
  });

  it("reads back the initial value it was created with", () => {
    // Without this every reader before the composition root would see
    // undefined instead of the initial value.
    expect(createRegistryRef(key(), "initial").get()).toBe("initial");
  });

  it("keeps its box in its own namespace, under a stable slot name", () => {
    const k = key();
    createRegistryRef<string | undefined>(k, "initial");

    // A ref is a map of one entry; both halves of that are contract,
    // because the other copy of the module has to find the same box.
    expect(createRegistry<string>(`ref/${k}`).get("value")).toBe("initial");
    // And it does not squat on the plain key of the same name.
    expect(createRegistry<string>(k).size).toBe(0);
  });
});
