import { describe, expect, it } from "vitest";
import { invitationLinks } from "./invitation-links";

describe("invitationLinks", () => {
  it("points the accept link at the invitation page", () => {
    expect(invitationLinks("https://app.example.test", "inv_1").acceptUrl).toBe(
      "https://app.example.test/accept-invitation/inv_1"
    );
  });

  it("lands the decline link on the same page, the only one that handles it", () => {
    const { acceptUrl, declineUrl } = invitationLinks(
      "https://app.example.test",
      "inv_1"
    );

    expect(declineUrl).toBe(acceptUrl);
  });

  it("carries no locale segment and tolerates a trailing slash on the origin", () => {
    expect(
      invitationLinks("https://app.example.test/", "inv_1").acceptUrl
    ).toBe("https://app.example.test/accept-invitation/inv_1");
  });
});
