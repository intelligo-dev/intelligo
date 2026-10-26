/**
 * Declared providers reach Better-Auth as `genericOAuth` configs, and a
 * profile mapper registered after the auth module loaded is still the
 * one a sign-in runs. Building the instance opens no database connection.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const ACME = {
  OAUTH_PROVIDERS: "acme",
  OAUTH_ACME_CLIENT_ID: "client",
  OAUTH_ACME_CLIENT_SECRET: "secret",
  OAUTH_ACME_AUTHORIZATION_URL: "https://id.example.com/oauth/authorize",
  OAUTH_ACME_TOKEN_URL: "https://id.example.com/oauth/token",
  OAUTH_ACME_USERINFO_URL: "https://id.example.com/oauth/user-info",
  OAUTH_ACME_NAME: "Acme",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

async function load(env: Record<string, string>) {
  vi.stubEnv(
    "DATABASE_URL",
    process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/db"
  );
  vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { auth } = await import("./server");
  const providers = await import("./oauth-providers");
  return { options: auth.options, ...providers };
}

describe("OAuth providers", () => {
  it("adds no plugin when none are declared", async () => {
    const { options, listOAuthProviders } = await load({ OAUTH_PROVIDERS: "" });
    expect(options.plugins?.some((p) => p.id === "generic-oauth")).toBe(false);
    expect(listOAuthProviders()).toEqual([]);
  });

  it("configures a declared provider and lists it for the sign-in page", async () => {
    const { options, listOAuthProviders } = await load(ACME);
    const plugin = options.plugins?.find((p) => p.id === "generic-oauth");
    expect(
      (plugin?.options as { config: { providerId: string }[] }).config
    ).toEqual([
      expect.objectContaining({
        providerId: "acme",
        clientId: "client",
        authorizationUrl: "https://id.example.com/oauth/authorize",
        tokenUrl: "https://id.example.com/oauth/token",
        userInfoUrl: "https://id.example.com/oauth/user-info",
        pkce: true,
      }),
    ]);
    expect(listOAuthProviders()).toEqual([{ id: "acme", name: "Acme" }]);
  });

  it("reads the account subject from the named field", async () => {
    const { options } = await load({
      ...ACME,
      OAUTH_ACME_SUBJECT_FIELD: "sub",
    });
    const config = (
      options.plugins?.find((p) => p.id === "generic-oauth")
        ?.options as unknown as {
        config: {
          accountSubject: (c: { profile: object }) => string | number;
        }[];
      }
    ).config[0]!;
    expect(config.accountSubject({ profile: { sub: "42", id: "x" } })).toBe(
      "42"
    );
    expect(config.accountSubject({ profile: { id: "x" } })).toBe("");
  });

  it("maps a profile with the mapper registered after the module loaded", async () => {
    const { options, registerOAuthProfileMapper } = await load(ACME);
    const config = (
      options.plugins?.find((p) => p.id === "generic-oauth")?.options as {
        config: { mapProfileToUser: (profile: object) => Promise<object> }[];
      }
    ).config[0]!;

    expect(await config.mapProfileToUser({ sub: "42" })).toEqual({});

    registerOAuthProfileMapper("acme", (profile) => ({
      email: `${String(profile.sub)}@users.acme.invalid`,
      emailVerified: false,
    }));
    expect(await config.mapProfileToUser({ sub: "42" })).toEqual({
      email: "42@users.acme.invalid",
      emailVerified: false,
    });
  });
});
