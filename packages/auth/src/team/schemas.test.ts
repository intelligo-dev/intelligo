import { describe, expect, it } from "vitest";

import { inviteMemberSchema } from "./schemas";

describe("inviteMemberSchema", () => {
  const email = "someone@example.test";

  it("answers a missing role and an unknown one with the same message", () => {
    for (const role of [undefined, "owner"]) {
      const result = inviteMemberSchema.safeParse({ email, role });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Please select a role");
    }
  });

  it("accepts a known role", () => {
    expect(
      inviteMemberSchema.safeParse({ email, role: "member" }).success
    ).toBe(true);
  });
});
