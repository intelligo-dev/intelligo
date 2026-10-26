import { afterEach, describe, expect, it, vi } from "vitest";

import { readOAuthProviders, validateEnv } from "./env";

const acme = {
  OAUTH_PROVIDERS: "acme",
  OAUTH_ACME_CLIENT_ID: "client",
  OAUTH_ACME_CLIENT_SECRET: "secret",
  OAUTH_ACME_AUTHORIZATION_URL: "https://id.example.com/oauth/authorize",
  OAUTH_ACME_TOKEN_URL: "https://id.example.com/oauth/token",
  OAUTH_ACME_USERINFO_URL: "https://id.example.com/oauth/user-info",
};

describe("readOAuthProviders", () => {
  it("reads nothing when OAUTH_PROVIDERS is unset", () => {
    expect(readOAuthProviders({})).toEqual({ providers: [], problems: [] });
  });

  it("reads a provider's endpoints, scopes, name, PKCE and subject field", () => {
    const { providers, problems } = readOAuthProviders({
      ...acme,
      OAUTH_ACME_SCOPES: "profile, email",
      OAUTH_ACME_NAME: "Acme",
      OAUTH_ACME_PKCE: "false",
      OAUTH_ACME_SUBJECT_FIELD: "sub",
    });
    expect(problems).toEqual([]);
    expect(providers).toEqual([
      {
        id: "acme",
        name: "Acme",
        clientId: "client",
        clientSecret: "secret",
        authorizationUrl: "https://id.example.com/oauth/authorize",
        tokenUrl: "https://id.example.com/oauth/token",
        userInfoUrl: "https://id.example.com/oauth/user-info",
        scopes: ["profile", "email"],
        pkce: false,
        subjectField: "sub",
      },
    ]);
  });

  it("refuses a subject field that is not a field name", () => {
    const { providers, problems } = readOAuthProviders({
      ...acme,
      OAUTH_ACME_SUBJECT_FIELD: "user.id",
    });
    expect(providers).toEqual([]);
    expect(problems).toEqual([
      'OAUTH_ACME_SUBJECT_FIELD is "user.id", not a field name — OAuth provider "acme" is off',
    ]);
  });

  it("takes a discovery URL in place of the three endpoints, PKCE on by default", () => {
    const { providers } = readOAuthProviders({
      OAUTH_PROVIDERS: "corp-sso",
      OAUTH_CORP_SSO_CLIENT_ID: "c",
      OAUTH_CORP_SSO_DISCOVERY_URL:
        "https://sso.example.org/.well-known/openid-configuration",
    });
    expect(providers).toEqual([
      {
        id: "corp-sso",
        name: "corp-sso",
        clientId: "c",
        discoveryUrl:
          "https://sso.example.org/.well-known/openid-configuration",
        pkce: true,
      },
    ]);
  });

  it("leaves out a provider configured by half, and says what is missing", () => {
    const { providers, problems } = readOAuthProviders({
      ...acme,
      OAUTH_ACME_TOKEN_URL: "",
    });
    expect(providers).toEqual([]);
    expect(problems).toEqual([
      'OAuth provider "acme" is off until OAUTH_ACME_TOKEN_URL is set',
    ]);
  });

  it("refuses plain http except on localhost", () => {
    const { providers, problems } = readOAuthProviders({
      ...acme,
      OAUTH_ACME_TOKEN_URL: "http://id.example.com/oauth/token",
    });
    expect(providers).toEqual([]);
    expect(problems[0]).toContain("OAUTH_ACME_TOKEN_URL not an https URL");

    const local = readOAuthProviders({
      ...acme,
      OAUTH_ACME_TOKEN_URL: "http://localhost:4100/oauth/token",
    });
    expect(local.problems).toEqual([]);
  });

  it("refuses a bad id, a built-in id and a repeated one", () => {
    const { providers, problems } = readOAuthProviders({
      ...acme,
      OAUTH_PROVIDERS: "Acme, google, acme, acme",
    });
    expect(providers.map((p) => p.id)).toEqual(["acme"]);
    expect(problems).toEqual([
      'OAUTH_PROVIDERS names "Acme" — an id is lowercase letters, digits and dashes, starting with a letter',
      'OAUTH_PROVIDERS names "google", a built-in provider — configure it with its own variables',
      'OAUTH_PROVIDERS names "acme" twice',
    ]);
  });
});

describe("validateEnv and OAuth providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("warns about a provider it leaves out", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-secret-padded-to-thirty-two-chars-long"
    );
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("OAUTH_PROVIDERS", "acme");
    vi.stubEnv("OAUTH_ACME_CLIENT_ID", "c");
    const { valid, warnings } = validateEnv();
    expect(valid).toBe(true);
    expect(warnings.join("\n")).toContain(
      'OAuth provider "acme" is off until OAUTH_ACME_AUTHORIZATION_URL, OAUTH_ACME_TOKEN_URL, OAUTH_ACME_USERINFO_URL are set (or OAUTH_ACME_DISCOVERY_URL for an OpenID Connect provider)'
    );
  });
});
