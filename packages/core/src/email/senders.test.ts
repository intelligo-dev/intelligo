import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();
vi.mock("./send", () => ({ sendEmail }));

const { sendInvitationEmail } = await import("./senders");

describe("sendInvitationEmail", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    vi.unstubAllEnvs();
  });

  it("keeps the inviter's and the workspace's names out of the subject", async () => {
    vi.stubEnv("APP_NAME", "Acme");
    await sendInvitationEmail({
      to: "invitee@example.test",
      inviterName: "Your account is suspended, verify at evil.example",
      workspaceName: "Billing team",
      role: "member",
      acceptUrl: "https://app.test/accept",
      declineUrl: "https://app.test/decline",
    });

    const { subject } = sendEmail.mock.calls[0]![0] as { subject: string };
    expect(subject).toBe("You've been invited to a workspace on Acme");
    expect(subject).not.toContain("evil");
  });
});
