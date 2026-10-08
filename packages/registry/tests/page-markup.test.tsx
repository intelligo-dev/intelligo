/**
 * Markup that assistive technology reads: names that resolve, content
 * hidden behind a paywall that cannot be reached, a spinner that speaks
 * the reader's language or stays quiet, and settings tabs that are one
 * control each.
 */

import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/settings/profile",
}));

vi.mock("@/lib/utils", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: (props: Record<string, unknown>) => <label {...props} />,
}));
vi.mock(
  "@/components/ui/ai-motion",
  () => import("../base/ui/ai-motion/ai-motion")
);
vi.mock("@/components/ui/tabs", () => import("../base/ui/tabs/tabs"));
vi.mock("@/lib/feature-gating-config", () => ({
  featureGatingConfig: { upgradeHref: "/pricing" },
}));
vi.mock("@/lib/settings-nav", () => ({
  settingsTabs: [
    {
      value: "profile",
      href: "/settings/profile",
      titleKey: "settings.profile",
      icon: () => null,
    },
    {
      value: "privacy",
      href: "/settings/privacy",
      titleKey: "settings.privacy",
      icon: () => null,
    },
  ],
}));

const { Spinner } = await import("../base/ui/spinner/spinner");
const { PaywallBlur } =
  await import("../base/feature-gating/components/paywall-blur");
const { OnboardingStep } =
  await import("../base/onboarding/components/onboarding-step");
const { SettingsTabs } =
  await import("../base/settings-shell/components/settings-tabs");

describe("Spinner", () => {
  it("is hidden from assistive technology when it has no label", () => {
    const html = renderToStaticMarkup(<Spinner />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("role=");
    expect(html).not.toContain("Loading");
  });

  it("announces the label it is given as a status", () => {
    const html = renderToStaticMarkup(<Spinner label="Ачаалж байна" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Ачаалж байна"');
    expect(html).not.toContain("aria-hidden");
  });
});

describe("PaywallBlur", () => {
  it("makes the locked content inert, so focus cannot reach it", () => {
    const html = renderToStaticMarkup(
      <PaywallBlur isLocked>
        <a href="/secret">Gated link</a>
      </PaywallBlur>
    );
    expect(html).toMatch(/<div inert=""[^>]*><a href="\/secret">/);
  });
});

describe("OnboardingStep", () => {
  it("names a card group by its question", () => {
    const html = renderToStaticMarkup(
      <OnboardingStep
        step={{
          id: "purpose",
          titleKey: "onboarding.purpose.title",
          fields: [
            {
              id: "purpose",
              type: "select-cards",
              labelKey: "onboarding.purpose.label",
              required: true,
              options: [{ value: "work", labelKey: "onboarding.purpose.work" }],
            },
          ],
        }}
        answers={{}}
        onAnswerChange={() => {}}
        onNext={() => {}}
        isSubmitting={false}
      />
    );
    const labelledBy = html.match(
      /role="radiogroup" aria-labelledby="([^"]+)"/
    )?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });
});

describe("SettingsTabs", () => {
  it("renders each tab as the link itself, not a button inside a link", () => {
    const html = renderToStaticMarkup(<SettingsTabs />);
    expect(html).toMatch(/<a [^>]*role="tab"/);
    expect(html).not.toMatch(/<a [^>]*>\s*<button/);
  });
});
