/**
 * The shell's onboarding gate, as the `lib/shell-config.tsx` seam sets
 * it: the default sends an unfinished user to /onboarding, a path sends
 * them there, and `false` skips the check without reading the user row.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  shellConfig: {} as Record<string, unknown>,
  onboardingCompleted: false,
  userQueries: 0,
  redirects: [] as string[],
}));

class Redirected extends Error {}

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@intelligo-dev/auth", () => ({
  auth: { api: { listOrganizations: async () => [] } },
  ensureUserWorkspace: async () => "ws-1",
  getAuthSession: async () => ({
    user: { id: "user-1", name: "U", email: "u@x" },
  }),
  getWorkspaceContextById: async () => ({ workspace: { id: "ws-1" } }),
}));
vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            state.userQueries++;
            return [{ onboardingCompleted: state.onboardingCompleted }];
          },
        }),
      }),
    }),
  },
}));
vi.mock("@intelligo-dev/core/db/schema", () => ({ users: {} }));
vi.mock("drizzle-orm", () => ({ eq: () => undefined }));
vi.mock("@/i18n/navigation", () => ({
  redirect: ({ href }: { href: string }) => {
    state.redirects.push(href);
    throw new Redirected(href);
  },
}));
vi.mock("@/lib/shell-config", () => ({
  get shellConfig() {
    return state.shellConfig;
  },
}));
vi.mock("@/components/shell/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/shell/page-transition", () => ({
  PageTransition: () => null,
}));
vi.mock("@/components/shell/shell-header", () => ({ ShellHeader: () => null }));
vi.mock("@/components/shell/time-zone-cookie", () => ({
  TimeZoneCookie: () => null,
}));
vi.mock("@/components/ui/ai-sidebar", () => ({
  AISidebarInset: () => null,
  AISidebarProvider: () => null,
}));

const { default: AppLayout } = await import("../base/app-shell/layout");

async function render(): Promise<string | null> {
  try {
    await AppLayout({ children: null });
    return null;
  } catch (error) {
    if (error instanceof Redirected) return error.message;
    throw error;
  }
}

beforeEach(() => {
  state.shellConfig = {};
  state.onboardingCompleted = false;
  state.userQueries = 0;
  state.redirects = [];
});

describe("the onboarding gate", () => {
  it("sends an unfinished user to /onboarding by default", async () => {
    expect(await render()).toBe("/onboarding");
  });

  it("sends them where the seam says", async () => {
    state.shellConfig = { onboardingRedirect: "/welcome" };
    expect(await render()).toBe("/welcome");
  });

  it("skips the check, and the query, when the seam says false", async () => {
    state.shellConfig = { onboardingRedirect: false };
    expect(await render()).toBeNull();
    expect(state.userQueries).toBe(0);
  });

  it("lets a user who finished onboarding through", async () => {
    state.onboardingCompleted = true;
    expect(await render()).toBeNull();
  });
});
