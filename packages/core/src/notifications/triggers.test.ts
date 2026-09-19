/**
 * The quota notice states money. The plan allowance is an amount in the
 * deployment's billing currency, so the in-app notification, the email
 * and the variables a template provider receives all carry formatted
 * amounts of it — never the raw micros, and never the word "tokens".
 */

import { render } from "@react-email/components";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => {
        mocks.insertValues(row);
        return { returning: async () => [row] };
      },
    }),
  },
}));
vi.mock("../db/schema", () => ({ notifications: {} }));
vi.mock("../email/send", () => ({ sendEmail: mocks.sendEmail }));

import { money } from "../money";
import { triggerQuotaNotification } from "./triggers";

const base = {
  userId: "user-1",
  userEmail: "owner@example.com",
  workspaceId: "ws-1",
  workspaceName: "Acme",
};

type SentEmail = {
  subject: string;
  react: React.ReactElement;
  template: { key: string; variables: Record<string, unknown> };
};

function sentEmail(): SentEmail {
  return mocks.sendEmail.mock.calls[0]![0] as SentEmail;
}

/** The email's visible text, without markup or the zero-width preview padding. */
async function emailText(): Promise<string> {
  const html = await render(sentEmail().react);
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&lsquo;|&rsquo;|‘|’/g, "'")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sendEmail.mockResolvedValue({ success: true });
});

describe("the 80% warning", () => {
  beforeEach(async () => {
    await triggerQuotaNotification({
      ...base,
      percentageUsed: 81,
      used: money(12_150_000, "USD"),
      allowance: money(15_000_000, "USD"),
      isExceeded: false,
    });
  });

  it("states the amount used out of the allowance in-app", () => {
    const row = mocks.insertValues.mock.calls[0]![0] as {
      type: string;
      message: string;
      metadata: string;
    };

    expect(row.type).toBe("quota_warning_80");
    expect(row.message).toBe(
      'Your workspace "Acme" has used $12.15 of its $15.00 monthly allowance (81%).'
    );
    expect(row.message).not.toMatch(/token/i);
    expect(JSON.parse(row.metadata)).toEqual({
      workspaceName: "Acme",
      percentageUsed: 81,
      usedMicros: 12_150_000,
      allowanceMicros: 15_000_000,
      currency: "USD",
    });
  });

  it("states the same amounts in the email", async () => {
    expect(sentEmail().subject).toBe("Monthly allowance at 81%");

    const text = await emailText();
    expect(text).toContain(
      "has used $12.15 of its $15.00 monthly allowance (81%)."
    );
    expect(text).not.toMatch(/token/i);
    expect(text).not.toContain("15,000,000");
  });

  it("hands a template provider formatted amounts and the currency", () => {
    expect(sentEmail().template).toEqual({
      key: "quota-warning",
      variables: {
        workspaceName: "Acme",
        percentageUsed: 81,
        used: "$12.15",
        allowance: "$15.00",
        currency: "USD",
        upgradeUrl: expect.stringMatching(/\/settings\/billing$/),
      },
    });
  });
});

describe("the used-up notice", () => {
  it("names the allowance as money, in the deployment's currency", async () => {
    await triggerQuotaNotification({
      ...base,
      percentageUsed: 100,
      used: money(50_000_000_000, "MNT"),
      allowance: money(50_000_000_000, "MNT"),
      isExceeded: true,
    });

    const row = mocks.insertValues.mock.calls[0]![0] as {
      type: string;
      message: string;
    };
    expect(row.type).toBe("quota_warning_100");
    // `Intl` separates a currency code from the number with a no-break space.
    expect(row.message.replace(/\u00a0/g, " ")).toBe(
      'Your workspace "Acme" has used all of its MNT 50,000 monthly allowance. Upgrade your plan for more.'
    );

    expect(sentEmail().subject).toBe("Monthly allowance used up");
    expect(sentEmail().template.key).toBe("quota-exceeded");
    const text = await emailText();
    expect(text).toContain("has used all of its MNT 50,000 monthly allowance.");
    expect(text).not.toMatch(/token/i);
  });
});
