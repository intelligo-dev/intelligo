import { describe, expect, it } from "vitest";

import { personalWorkspaceSlug } from "./workspace-slug";

describe("personalWorkspaceSlug", () => {
  it("is a slug the workspace settings form accepts", () => {
    const slug = personalWorkspaceSlug(
      "Jane.Doe+test@example.com",
      "TfyYRR8bQx91"
    );
    expect(slug).toBe("jane-doe-test-tfyyrr8b");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("is deterministic for one user, so concurrent provisioning collides", () => {
    expect(personalWorkspaceSlug("a@b.co", "AbCdEfGh1")).toBe(
      personalWorkspaceSlug("a@b.co", "AbCdEfGh1")
    );
  });

  it("falls back to `user` without an email", () => {
    expect(personalWorkspaceSlug(null, "XyZ12345")).toBe("user-xyz12345");
    expect(personalWorkspaceSlug("@example.com", "XyZ12345")).toBe(
      "user-xyz12345"
    );
  });
});
