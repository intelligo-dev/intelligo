import { describe, expect, it } from "vitest";

import { definePlans, forPlans, type PlanConfig } from "./plans";

const plan = (slug: string): Omit<PlanConfig, "slug"> & { slug: string } => ({
  name: slug,
  slug,
  description: "",
  priceOneTime: 0,
  targetAudience: "",
  aiModelLabel: "",
  limits: {},
  features: [],
});

describe("definePlans and forPlans", () => {
  const PLANS = definePlans({
    free: { ...plan("free"), slug: "free" },
    pro: { ...plan("pro"), slug: "pro" },
  });
  const plans = forPlans(PLANS);

  it("returns what it is given, as the registry's shapes", () => {
    const features = plans.features({ chat: ["free", "pro"] });
    const seats = plans.values({ free: 3, pro: 25 });
    const registered: Record<string, PlanConfig> = PLANS;
    const matrix: Record<string, readonly string[]> = features;
    const limits: Record<string, number> = seats;
    expect(registered.pro?.slug).toBe("pro");
    expect(matrix).toEqual({ chat: ["free", "pro"] });
    expect(limits).toEqual({ free: 3, pro: 25 });
  });

  it("refuses, at compile time, a plan the catalogue does not have", () => {
    // @ts-expect-error a misspelt slug
    plans.features({ chat: ["free", "por"] });
    // @ts-expect-error a plan that does not exist
    plans.values({ free: 3, enterprise: 25 });
    definePlans({
      // @ts-expect-error a slug that is not its key
      free: { ...plan("free"), slug: "fre" },
    });
    expect(true).toBe(true);
  });
});
