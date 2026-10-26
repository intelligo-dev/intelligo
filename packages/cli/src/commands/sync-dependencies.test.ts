import { describe, expect, it } from "vitest";

import {
  keepDeclaredRanges,
  rangeFloor,
  satisfiesPin,
} from "./sync-dependencies";

describe("rangeFloor", () => {
  it("reads the lowest version of an exact, caret, tilde or >= range", () => {
    expect(rangeFloor("1.2.3")).toEqual([1, 2, 3]);
    expect(rangeFloor("^1.61.0")).toEqual([1, 61, 0]);
    expect(rangeFloor("~14.6.2")).toEqual([14, 6, 2]);
    expect(rangeFloor(">= 2.0.0")).toEqual([2, 0, 0]);
  });

  it("reads nothing from a range it cannot place", () => {
    for (const range of ["latest", "*", "workspace:*", "^1.2", "1.2.3-beta.1"]) {
      expect(rangeFloor(range)).toBeNull();
    }
  });
});

describe("satisfiesPin", () => {
  it("holds for the same floor or a newer one in the same major", () => {
    expect(satisfiesPin("^1.59.0", "^1.59.0")).toBe(true);
    expect(satisfiesPin("^1.61.0", "^1.59.0")).toBe(true);
    expect(satisfiesPin("^1.59.4", "^1.59.0")).toBe(true);
  });

  it("fails for an older floor, another major or an unread range", () => {
    expect(satisfiesPin("^1.46.0", "^1.59.0")).toBe(false);
    expect(satisfiesPin("^1.59.0", "^1.59.1")).toBe(false);
    expect(satisfiesPin("^2.0.0", "^1.59.0")).toBe(false);
    expect(satisfiesPin("latest", "^1.59.0")).toBe(false);
  });
});

describe("keepDeclaredRanges", () => {
  const item = {
    name: "chat",
    dependencies: [
      "lucide-react@^1.59.0",
      "motion@^14.4.0",
      "@scope/pkg@^2.1.0",
      "nanoid@^5.0.0",
      "@intelligo-dev/chat",
    ],
  };

  it("drops the range of a dependency the app has at or above the pin", () => {
    expect(
      keepDeclaredRanges(item, {
        "lucide-react": "^1.61.0",
        "@scope/pkg": "~2.3.0",
        motion: "^14.4.0",
      }).dependencies
    ).toEqual([
      "lucide-react",
      "motion",
      "@scope/pkg",
      "nanoid@^5.0.0",
      "@intelligo-dev/chat",
    ]);
  });

  it("keeps the pin for an older, absent or other-major dependency", () => {
    expect(
      keepDeclaredRanges(item, {
        "lucide-react": "^1.46.0",
        motion: "^13.0.0",
      }).dependencies
    ).toEqual(item.dependencies);
  });

  it("leaves an item without dependencies as it is", () => {
    const bare: { name: string; dependencies?: unknown } = { name: "smoke" };
    expect(keepDeclaredRanges(bare, { react: "^19.0.0" })).toBe(bare);
  });
});
