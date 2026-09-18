/**
 * Startup validation of environment variables: a missing required variable
 * throws immediately instead of when its feature is first used. Some are
 * optional in development (STRIPE_*, RESEND_API_KEY).
 */

type EnvVar = {
  name: string;
  required: boolean;
  description: string;
  /** Optional minimum length — used for secret strength checks */
  minLength?: number;
};

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
    name: "OPENAI_API_KEY",
    required: false,
    description: "OpenAI API key (AI chat features)",
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
    name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    required: false,
    description: "Stripe publishable key (billing UI)",
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

export function validateEnv(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
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
        errors.push(
          `Missing required env var: ${envVar.name} — ${envVar.description}`
        );
      } else {
        warnings.push(
          `Missing optional env var: ${envVar.name} — ${envVar.description}`
        );
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

  // Production safety checks
  if (process.env.NODE_ENV === "production") {
    if (!process.env.RESEND_API_KEY && !process.env.LOOPS_API_KEY) {
      warnings.push(
        "No email provider (RESEND_API_KEY or LOOPS_API_KEY) — sign-ups are not email-verified and emails only reach the server console"
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

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Call during app initialization. Throws on missing required variables;
 * logs warnings for optional ones.
 */
export function assertEnv(): void {
  const { valid, errors, warnings } = validateEnv();

  for (const warning of warnings) {
    console.warn(`[Env] ${warning}`);
  }

  if (!valid) {
    console.error("[Env] Missing required environment variables:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    throw new Error(
      `Missing ${errors.length} required environment variable(s). See logs above.`
    );
  }
}
