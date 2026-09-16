/**
 * The per-product extension seam.
 *
 * Every lookup here has two answers that matter: what a product that
 * registered something gets, and what a deployment that registered
 * nothing gets. The second is the one worth pinning — each default was
 * chosen deliberately (no trial, one seat, a conservative request
 * ceiling, a loud throw for the catalogue) and a well-meaning "sensible
 * fallback" added later would give away seats, money or both without
 * failing any other test.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { money } from "@intelligo-dev/core/money";

import {
  BillingNotConfiguredError,
  DEFAULT_REQUESTS_PER_MINUTE,
  NO_TRIAL,
  clearActionLimitKeys,
  clearDefaultProductSlug,
  clearProductFeatures,
  clearProductPlans,
  clearRateLimits,
  clearTeamMemberLimits,
  clearTrialConfig,
  getActionLabel,
  getActionLimitKey,
  getDefaultProductSlug,
  getProductFeatures,
  getProductPlans,
  getRateLimit,
  getRegisteredProductSlugs,
  getTeamMemberLimit,
  getTrialConfig,
  getUpgradeMessage,
  registerActionLabels,
  registerActionLimitKeys,
  registerProductFeatures,
  registerProductPlans,
  registerRateLimits,
  registerTeamMemberLimits,
  registerTrialConfig,
  registerUpgradeMessages,
  setDefaultProductSlug,
} from "./plan-registry";
import type { PlanConfig } from "./plans";

const plan = (slug: string): PlanConfig =>
  ({
    name: slug,
    slug,
    description: slug,
    limits: {},
  }) as unknown as PlanConfig;

beforeEach(() => {
  clearProductPlans();
  clearProductFeatures();
  clearActionLimitKeys();
  clearTrialConfig();
  clearTeamMemberLimits();
  clearRateLimits();
  clearDefaultProductSlug();
});

describe("plan catalogue", () => {
  it("keeps each product's catalogue to itself", () => {
    registerProductPlans("alpha", { free: plan("free") });
    registerProductPlans("beta", { starter: plan("starter") });

    expect(Object.keys(getProductPlans("alpha") ?? {})).toEqual(["free"]);
    expect(Object.keys(getProductPlans("beta") ?? {})).toEqual(["starter"]);
    expect(getRegisteredProductSlugs().sort()).toEqual(["alpha", "beta"]);
  });

  it("has no fallback catalogue for an unregistered product", () => {
    expect(getProductPlans("nobody")).toBeUndefined();
  });
});

describe("default product", () => {
  it("throws a typed error rather than billing against nothing", () => {
    expect(() => getDefaultProductSlug()).toThrow(BillingNotConfiguredError);
    try {
      getDefaultProductSlug();
    } catch (error) {
      // Admission maps this code to a refusal; a bare Error would
      // become a 500 instead.
      expect((error as BillingNotConfiguredError).code).toBe(
        "billing_not_configured"
      );
    }
  });

  it("returns the configured slug", () => {
    setDefaultProductSlug("alpha");
    expect(getDefaultProductSlug()).toBe("alpha");
  });
});

describe("defaults when a deployment registered nothing", () => {
  it("grants no trial", () => {
    setDefaultProductSlug("alpha");
    expect(getTrialConfig()).toEqual(NO_TRIAL);
    expect(getTrialConfig().durationDays).toBe(0);
  });

  it("grants no trial even before a product is configured", () => {
    expect(getTrialConfig()).toEqual(NO_TRIAL);
  });

  it("caps a workspace at one seat", () => {
    setDefaultProductSlug("alpha");
    expect(getTeamMemberLimit(undefined, "pro")).toBe(1);
    expect(getTeamMemberLimit("never-registered", "pro")).toBe(1);
  });

  it("rate-limits conservatively rather than refusing everything", () => {
    // The one default that cannot fail closed: zero would refuse every
    // request in a deployment that simply had not registered a table.
    expect(getRateLimit(undefined, "pro")).toBe(DEFAULT_REQUESTS_PER_MINUTE);
    setDefaultProductSlug("alpha");
    expect(getRateLimit(undefined, "pro")).toBe(DEFAULT_REQUESTS_PER_MINUTE);
  });

  it("maps an action to a limit field of the same name", () => {
    expect(getActionLimitKey("alpha", "reports")).toBe("reports");
  });

  it("has no upgrade copy or action label to offer", () => {
    expect(getUpgradeMessage("alpha", "free", "chat")).toBeUndefined();
    expect(getActionLabel("alpha", "chat")).toBeUndefined();
    expect(getProductFeatures("alpha")).toBeUndefined();
  });
});

describe("registered values", () => {
  it("resolves the trial, seats and rate limit of the configured product", () => {
    setDefaultProductSlug("alpha");
    registerTrialConfig("alpha", {
      initialCredits: 100,
      grant: money(500_000_000, "MNT"),
      durationDays: 14,
      warningThreshold: 0.2,
      reminderDaysBeforeExpiry: 3,
    });
    registerTeamMemberLimits("alpha", { team: 10 });
    registerRateLimits("alpha", { pro: 60 });

    expect(getTrialConfig().durationDays).toBe(14);
    expect(getTeamMemberLimit(undefined, "team")).toBe(10);
    expect(getRateLimit(undefined, "pro")).toBe(60);
  });

  it("falls back per key, not per product", () => {
    registerTeamMemberLimits("alpha", { team: 10 });
    registerRateLimits("alpha", { pro: 60 });

    // A plan the product did not list still gets the closed default.
    expect(getTeamMemberLimit("alpha", "solo")).toBe(1);
    expect(getRateLimit("alpha", "free")).toBe(DEFAULT_REQUESTS_PER_MINUTE);
  });

  it("remaps an action whose limit field is named differently", () => {
    registerActionLimitKeys("alpha", { chat: "chatMessages" });
    expect(getActionLimitKey("alpha", "chat")).toBe("chatMessages");
    expect(getActionLimitKey("alpha", "reports")).toBe("reports");
    expect(getActionLimitKey("beta", "chat")).toBe("chat");
  });

  it("keeps upgrade copy, labels and the feature matrix per product", () => {
    registerUpgradeMessages("alpha", { free: { chat: "Upgrade to chat" } });
    registerActionLabels("alpha", { chat: "messages" });
    registerProductFeatures("alpha", { deep_report: ["pro"] });

    expect(getUpgradeMessage("alpha", "free", "chat")).toBe("Upgrade to chat");
    expect(getUpgradeMessage("beta", "free", "chat")).toBeUndefined();
    expect(getActionLabel("alpha", "chat")).toBe("messages");
    expect(getProductFeatures("alpha")).toEqual({ deep_report: ["pro"] });
  });

  it("reads the configured product when the caller passes none", () => {
    setDefaultProductSlug("alpha");
    registerTeamMemberLimits("alpha", { team: 4 });
    registerTeamMemberLimits("beta", { team: 99 });

    expect(getTeamMemberLimit(undefined, "team")).toBe(4);
    expect(getTeamMemberLimit("beta", "team")).toBe(99);
  });
});
