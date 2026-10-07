import { describe, expect, it } from "vitest";

import {
  mergeMessages,
  messageArguments,
  messageDrift,
  messageEntry,
  messageHashes,
} from "./sync-messages.js";

const shippedBefore = {
  title: "Billing",
  plan: { renew: "Renews on {date}", cancel: "Cancel" },
  legacy: "Old copy",
};

describe("message merge against what was shipped", () => {
  const shipped = messageHashes(shippedBefore);
  const registry = {
    title: "Billing and plans",
    plan: { renew: "Renews {date}", cancel: "Cancel plan", pause: "Pause" },
  };

  it("takes new text for untouched keys and keeps reworded ones", () => {
    const app = {
      title: "Billing",
      plan: { renew: "Next charge: {date}", cancel: "Cancel" },
      legacy: "Old copy",
      product: { own: "Mine" },
    };
    expect(mergeMessages(registry, app, shipped)).toEqual({
      title: "Billing and plans",
      plan: {
        renew: "Next charge: {date}",
        cancel: "Cancel plan",
        pause: "Pause",
      },
      product: { own: "Mine" },
    });
  });

  it("keeps a reworded key the registry dropped", () => {
    const app = { ...shippedBefore, legacy: "Our copy" };
    expect(mergeMessages(registry, app, shipped).legacy).toBe("Our copy");
  });

  it("keeps every app value when nothing was recorded", () => {
    const app = { ...shippedBefore };
    expect(mergeMessages(registry, app)).toEqual({
      ...shippedBefore,
      plan: { ...shippedBefore.plan, pause: "Pause" },
    });
  });

  it("reports missing, stale, reworded-and-changed keys", () => {
    const app = {
      title: "Billing",
      plan: { renew: "Next charge: {date}", cancel: "Cancel" },
      legacy: "Old copy",
    };
    expect(messageDrift(registry, app, shipped)).toEqual({
      missing: ["plan.pause"],
      stale: ["title", "plan.cancel", "legacy"],
      changed: ["plan.renew"],
      arguments: [],
    });
  });
});

describe("message arguments", () => {
  it("reads simple, plural and nested arguments", () => {
    expect([
      ...messageArguments(
        "{name} has {count, plural, one {# seat} other {# seats in {team}}}"
      ),
    ]).toEqual(["name", "count", "team"]);
  });

  it("fails a reworded message that uses an argument no longer passed", () => {
    const registry = { usage: "{amount} left" };
    const app = { usage: "{count} credits left" };
    expect(
      messageEntry("usage", "messages/en/usage.json", registry, app)
    ).toEqual({
      item: "usage",
      path: "messages/en/usage.json",
      state: "messages-arguments",
      missingKeys: ["usage"],
    });
  });

  it("allows a reworded message to leave an argument out", () => {
    const registry = { usage: "{amount} left of {total}" };
    const app = { usage: "{amount} left" };
    expect(messageDrift(registry, app).arguments).toEqual([]);
  });
});
