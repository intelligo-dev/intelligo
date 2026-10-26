/**
 * Startup validation of environment variables: a missing required variable
 * throws immediately instead of when its feature is first used. Some are
 * optional in development (STRIPE_*, RESEND_API_KEY).
 */

export type EnvVar = {
  name: string;
  required: boolean;
  description: string;
  /** Optional minimum length — used for secret strength checks */
  minLength?: number;
};

/**
 * Variables that only work together: one set without the others is a
 * feature half-configured, which fails later and less clearly.
 */
const ENV_PAIRS: ReadonlyArray<readonly string[]> = [
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"],
];

/**
 * An OAuth 2.0 or OpenID Connect provider declared in the environment,
 * beside the built-in Google and GitHub: an identity provider of the
 * product's own market (a national platform, a company's SSO).
 *
 *   OAUTH_PROVIDERS=acme
 *   OAUTH_ACME_CLIENT_ID=…
 *   OAUTH_ACME_CLIENT_SECRET=…
 *   OAUTH_ACME_AUTHORIZATION_URL=https://…/oauth/authorize
 *   OAUTH_ACME_TOKEN_URL=https://…/oauth/token
 *   OAUTH_ACME_USERINFO_URL=https://…/oauth/user-info
 *   # OAUTH_ACME_DISCOVERY_URL replaces the three URLs for an OIDC provider
 *   # OAUTH_ACME_SCOPES="profile email"   OAUTH_ACME_NAME=Acme
 *   # OAUTH_ACME_PKCE=false               for a provider that rejects PKCE
 *   # OAUTH_ACME_SUBJECT_FIELD=sub        the profile field naming the account
 *
 * The endpoints are configuration; how a provider's profile becomes a
 * user (a provider that has no email for some accounts) is code, and is
 * registered from the composition root with `registerOAuthProfileMapper`
 * from `@intelligo-dev/auth`.
 */
export interface OAuthProviderEnv {
  /** Lowercase, `[a-z][a-z0-9-]*`; the callback is `/api/auth/callback/<id>`. */
  id: string;
  /** What the sign-in button says. Defaults to the id. */
  name: string;
  clientId: string;
  clientSecret?: string;
  discoveryUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  scopes?: string[];
  pkce: boolean;
  /**
   * The profile field that identifies the account at the provider, for
   * good: Better-Auth reads `sub` from an OpenID Connect provider and `id`
   * from a plain OAuth one, and a plain one that answers with `sub` (or
   * `user_id`) names it here. Never a field that can change, like email.
   */
  subjectField?: string;
}

const OAUTH_PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const PROFILE_FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
/** Ids Better-Auth's own social providers answer to; a generic one may not take them. */
const BUILT_IN_OAUTH_IDS = new Set(["google", "github", "credential"]);

function oauthUrl(value: string | undefined): string | undefined | null {
  const v = value?.trim();
  if (!v) return undefined;
  try {
    const url = new URL(v);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local)
      ? v
      : null;
  } catch {
    return null;
  }
}

/**
 * The providers `OAUTH_PROVIDERS` names, each read from its
 * `OAUTH_<ID>_*` variables. A provider configured incompletely is left
 * out and named in `problems`: a button that cannot sign anyone in is
 * worse than none.
 */
export function readOAuthProviders(
  env: Record<string, string | undefined> = process.env
): { providers: OAuthProviderEnv[]; problems: string[] } {
  const providers: OAuthProviderEnv[] = [];
  const problems: string[] = [];
  const ids = (env.OAUTH_PROVIDERS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  for (const id of ids) {
    if (!OAUTH_PROVIDER_ID.test(id)) {
      problems.push(
        `OAUTH_PROVIDERS names "${id}" — an id is lowercase letters, digits and dashes, starting with a letter`
      );
      continue;
    }
    if (BUILT_IN_OAUTH_IDS.has(id)) {
      problems.push(
        `OAUTH_PROVIDERS names "${id}", a built-in provider — configure it with its own variables`
      );
      continue;
    }
    if (providers.some((p) => p.id === id)) {
      problems.push(`OAUTH_PROVIDERS names "${id}" twice`);
      continue;
    }

    const prefix = `OAUTH_${id.toUpperCase().replace(/-/g, "_")}_`;
    const read = (key: string) => env[prefix + key]?.trim() || undefined;
    const urlKeys = {
      discoveryUrl: "DISCOVERY_URL",
      authorizationUrl: "AUTHORIZATION_URL",
      tokenUrl: "TOKEN_URL",
      userInfoUrl: "USERINFO_URL",
    } as const;
    const urls = Object.fromEntries(
      Object.entries(urlKeys).map(([field, key]) => [
        field,
        oauthUrl(read(key)),
      ])
    ) as Record<keyof typeof urlKeys, string | undefined | null>;
    const bad = (Object.keys(urlKeys) as (keyof typeof urlKeys)[])
      .filter((field) => urls[field] === null)
      .map((field) => prefix + urlKeys[field]);
    const clientId = read("CLIENT_ID");
    const missing: string[] = [];
    if (!clientId) missing.push(`${prefix}CLIENT_ID`);
    if (!urls.discoveryUrl) {
      if (!urls.authorizationUrl) missing.push(`${prefix}AUTHORIZATION_URL`);
      if (!urls.tokenUrl) missing.push(`${prefix}TOKEN_URL`);
      if (!urls.userInfoUrl) missing.push(`${prefix}USERINFO_URL`);
    }
    if (bad.length > 0) {
      problems.push(
        `${bad.join(", ")} not an https URL (http is accepted for localhost only) — OAuth provider "${id}" is off`
      );
      continue;
    }
    if (missing.length > 0) {
      problems.push(
        `OAuth provider "${id}" is off until ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} set${urls.discoveryUrl === undefined && missing.length > 1 ? ` (or ${prefix}DISCOVERY_URL for an OpenID Connect provider)` : ""}`
      );
      continue;
    }
    const subjectField = read("SUBJECT_FIELD");
    if (subjectField && !PROFILE_FIELD.test(subjectField)) {
      problems.push(
        `${prefix}SUBJECT_FIELD is "${subjectField}", not a field name — OAuth provider "${id}" is off`
      );
      continue;
    }

    const scopes = read("SCOPES")
      ?.split(/[\s,]+/)
      .filter(Boolean);
    providers.push({
      id,
      name: read("NAME") ?? id,
      clientId: clientId!,
      ...(read("CLIENT_SECRET") ? { clientSecret: read("CLIENT_SECRET") } : {}),
      ...(urls.discoveryUrl ? { discoveryUrl: urls.discoveryUrl } : {}),
      ...(urls.authorizationUrl
        ? { authorizationUrl: urls.authorizationUrl }
        : {}),
      ...(urls.tokenUrl ? { tokenUrl: urls.tokenUrl } : {}),
      ...(urls.userInfoUrl ? { userInfoUrl: urls.userInfoUrl } : {}),
      ...(scopes && scopes.length > 0 ? { scopes } : {}),
      pkce: read("PKCE")?.toLowerCase() !== "false",
      ...(subjectField ? { subjectField } : {}),
    });
  }
  return { providers, problems };
}

// Only variables the framework itself reads. A model provider's key is
// absent on purpose: which provider a deployment calls is the product's
// choice, and its SDK reports a missing key on the first request.
const ENV_VARS: EnvVar[] = [
  {
    name: "DATABASE_URL",
    required: true,
    description: "PostgreSQL connection string",
  },
  {
    name: "BETTER_AUTH_SECRET",
    required: true,
    description:
      "Better-Auth session encryption key (AUTH_SECRET is accepted as a legacy alias)",
    minLength: 32,
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: true,
    description: "Application base URL for auth and redirects",
  },
  {
    name: "STRIPE_SECRET_KEY",
    required: false,
    description: "Stripe API key (billing features)",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: false,
    description: "Stripe webhook signature secret",
  },
  {
    name: "RESEND_API_KEY",
    required: false,
    description: "Resend API key (email features)",
  },
  {
    name: "LOOPS_API_KEY",
    required: false,
    description:
      "Loops API key (email features; templates mapped via LOOPS_TRANSACTIONAL_ID_*)",
  },
  {
    name: "EMAIL_PROVIDER",
    required: false,
    description: "Explicit email provider selection (resend | loops | console)",
  },
  // Cron endpoints gate on a Bearer header equal to CRON_SECRET. Optional
  // in development; production should set at least 32 characters.
  {
    name: "CRON_SECRET",
    required: false,
    description: "Shared secret for /api/cron/* Bearer auth",
    minLength: 32,
  },
];

export function validateEnv(options: { extra?: readonly EnvVar[] } = {}): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** The required variables that are unset, by name. */
  missing: string[];
} {
  const missing: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const unsetOptional: string[] = [];

  for (const envVar of [...ENV_VARS, ...(options.extra ?? [])]) {
    let value = process.env[envVar.name];
    // Better-Auth reads BETTER_AUTH_SECRET then AUTH_SECRET; the CLI, the
    // scaffold and this validator use the former.
    if (
      envVar.name === "BETTER_AUTH_SECRET" &&
      !value &&
      process.env.AUTH_SECRET
    ) {
      value = process.env.AUTH_SECRET;
      warnings.push(
        "AUTH_SECRET is set but BETTER_AUTH_SECRET is not — rename it; AUTH_SECRET is a legacy alias"
      );
    }
    if (!value || value.trim() === "") {
      if (envVar.required) {
        missing.push(envVar.name);
        errors.push(
          `Missing required env var: ${envVar.name} — ${envVar.description}`
        );
      } else {
        unsetOptional.push(envVar.name);
      }
      continue;
    }
    if (envVar.minLength && value.length < envVar.minLength) {
      const msg = `${envVar.name} is shorter than ${envVar.minLength} chars — too weak for ${envVar.description}`;
      if (envVar.required) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // One line for all of them: each is a feature left off, which is the
  // point of its being optional, not a fault to repeat on every boot.
  if (unsetOptional.length > 0) {
    warnings.push(
      `Optional env vars not set, their features stay off: ${unsetOptional.join(", ")}`
    );
  }

  // Resend rejects a send without a sender on a verified domain, and the
  // framework has no domain of its own to fall back on. Loops takes the
  // sender from each template, so only Resend is checked.
  const emailProvider = process.env.EMAIL_PROVIDER?.toLowerCase();
  const sendsThroughResend =
    Boolean(process.env.RESEND_API_KEY?.trim()) &&
    emailProvider !== "loops" &&
    emailProvider !== "console";
  if (sendsThroughResend && !process.env.EMAIL_FROM?.trim()) {
    warnings.push(
      'RESEND_API_KEY is set but EMAIL_FROM is not — every email fails until EMAIL_FROM names a sender on a domain verified with Resend, e.g. "Acme <noreply@acme.com>"'
    );
  }

  // Production safety checks
  if (process.env.NODE_ENV === "production") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (appUrl && !appUrl.startsWith("https://")) {
      warnings.push(
        `NEXT_PUBLIC_APP_URL is ${appUrl}, not an https URL — auth callbacks, email links and secure cookies are built from it`
      );
    }
    // Without a provider, sign-up skips email verification and an
    // invitation reaches whoever registers the address, so production
    // refuses to start unless the deployment says it means it.
    if (
      !process.env.RESEND_API_KEY?.trim() &&
      !process.env.LOOPS_API_KEY?.trim() &&
      emailProvider !== "console"
    ) {
      errors.push(
        "No email provider (RESEND_API_KEY or LOOPS_API_KEY) — sign-ups would not be email-verified. Set one, or EMAIL_PROVIDER=console to run without email on purpose"
      );
    }
    if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
      warnings.push(
        "STRIPE_SECRET_KEY is a test key in production environment"
      );
    }
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
      // A warning, not an error: the framework ships no cron route of its
      // own, and the maintenance route refuses to serve without it.
      warnings.push(
        "CRON_SECRET unset or shorter than 32 chars — required by any /api/cron/* route you mount"
      );
    }
  }

  warnings.push(...readOAuthProviders().problems);

  for (const group of ENV_PAIRS) {
    const set = group.filter((name) => process.env[name]?.trim());
    if (set.length > 0 && set.length < group.length) {
      warnings.push(
        `${set.join(", ")} set without ${group.filter((n) => !set.includes(n)).join(", ")} — the feature they configure stays broken until all are set`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings, missing };
}

/**
 * Call during app initialization. Throws on missing required variables,
 * naming them; logs warnings for optional ones. `extra` adds the
 * product's own variables to the same check.
 */
export function assertEnv(options: { extra?: readonly EnvVar[] } = {}): void {
  const { valid, errors, warnings, missing } = validateEnv(options);

  for (const warning of warnings) {
    console.warn(`[Env] ${warning}`);
  }

  if (!valid) {
    console.error("[Env] Missing required environment variables:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    throw new Error(
      missing.length > 0
        ? `Missing required environment variable(s): ${missing.join(", ")}.`
        : `${errors.length} environment variable(s) are invalid: ${errors.join("; ")}`
    );
  }
}
