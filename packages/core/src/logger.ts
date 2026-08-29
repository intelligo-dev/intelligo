/**
 * Structured Logger with PII Redaction (Pino-backed)
 *
 * A structured logger that:
 * - Uses pino for high-performance JSON logging in production
 * - Redacts PII in production (emails, workspace IDs, UUIDs)
 * - Passes through unredacted in development for debugging
 * - Maintains the same API as the previous custom logger
 *
 * Usage:
 * ```typescript
 * import { createLogger } from "@intelligo-dev/core/logger";
 * const log = createLogger("MyModule");
 * log.info("User created", { email: "user@example.com" });
 * // Production: {"level":30,"module":"MyModule","msg":"User created","email":"u***@example.com"}
 * // Development: {"level":30,"module":"MyModule","msg":"User created","email":"user@example.com"}
 * ```
 */

import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Redact email addresses in production.
 * user@example.com -> u***@example.com
 */
function redactEmail(email: string): string {
  if (!isProduction) return email;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  return `${local[0]}***@${domain}`;
}

/**
 * Redact IDs in production (workspace IDs, UUIDs).
 * ws_abc123def456 -> ws_a...f456
 * 550e8400-e29b-41d4-a716-446655440000 -> 550e...0000
 */
function redactId(id: string): string {
  if (!isProduction) return id;
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

/**
 * Field name fragments whose values are always replaced with [REDACTED]
 * regardless of environment. These cover credentials and secrets — never
 * appropriate to log even in development. Email/id redaction is a
 * separate concern (production-only PII protection).
 *
 * Exported so a consumer's Sentry PII scrubber
 * shares the same field list — a secret name added here is stripped
 * from both the log stream and the Sentry event in one move.
 */
export const CREDENTIAL_KEY_FRAGMENTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth_header",
  "cookie",
  "session_token",
  "session_secret",
  "credit_card",
  "creditcard",
  "card_number",
  "cvv",
] as const;

/** True when `key` contains any credential fragment (case-insensitive substring). */
export function isCredentialKey(key: string): boolean {
  const lower = key.toLowerCase();
  return CREDENTIAL_KEY_FRAGMENTS.some((needle) => lower.includes(needle));
}

function redactData(data: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Always-redacted fields: credentials, tokens, secrets — these
    // never appear in logs, even in dev. Catches accidental
    // log.info("login attempt", { password: ... }) drift.
    if (isCredentialKey(key)) {
      redacted[key] = "[REDACTED]";
      continue;
    }

    // PII redaction (email/id) is production-only so dev debugging
    // still works against real values.
    if (!isProduction) {
      redacted[key] = value;
      continue;
    }

    if (typeof value === "string") {
      if (key.toLowerCase().includes("email")) {
        redacted[key] = redactEmail(value);
      } else if (
        key.toLowerCase().includes("id") ||
        key.toLowerCase().includes("workspace")
      ) {
        redacted[key] = redactId(value);
      } else {
        redacted[key] = value;
      }
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/** Base pino instance */
const baseLogger = pino({
  level: isProduction ? "info" : "debug",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: isProduction ? pino.stdTimeFunctions.isoTime : false,
});

class Logger {
  private pino: pino.Logger;

  constructor(context: string) {
    this.pino = baseLogger.child({ module: context });
  }

  info(message: string, data?: Record<string, unknown>) {
    if (data) {
      this.pino.info(redactData(data), message);
    } else {
      this.pino.info(message);
    }
  }

  warn(message: string, data?: Record<string, unknown>) {
    if (data) {
      this.pino.warn(redactData(data), message);
    } else {
      this.pino.warn(message);
    }
  }

  error(message: string, data?: Record<string, unknown>) {
    if (data) {
      this.pino.error(redactData(data), message);
    } else {
      this.pino.error(message);
    }
  }

  debug(message: string, data?: Record<string, unknown>) {
    if (data) {
      this.pino.debug(redactData(data), message);
    } else {
      this.pino.debug(message);
    }
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

/**
 * Create a logger that writes to a custom pino destination.
 * Used for testing — allows capturing log output in a writable stream.
 * @internal
 */
export function _createLoggerWithStream(
  context: string,
  stream: pino.DestinationStream
): Logger {
  const customBase = pino(
    {
      level: isProduction ? "info" : "debug",
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      timestamp: false,
    },
    stream
  );
  const instance = new Logger(context);
  // Override the internal pino child with one writing to custom stream
  (instance as any).pino = customBase.child({ module: context });
  return instance;
}

export { Logger };
export const logger = createLogger("app");
