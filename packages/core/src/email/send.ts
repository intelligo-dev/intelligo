import { render } from "@react-email/components";
import type React from "react";
import { getEmailProvider, type EmailTemplateRef } from "./provider";

// ---------------------------------------------------------------------------
// Send Email Utility
// ---------------------------------------------------------------------------
// Wraps the provider abstraction with:
//   - Default `from` address from EMAIL_FROM env var
//   - Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
//   - Error containment: NEVER throws – always returns a result object
//     (TECH-08 graceful degradation)
//   - Smart retry: only retries on 5xx / network errors, NOT on 4xx
//   - React Email support: accepts { react } to render components to HTML
// ---------------------------------------------------------------------------

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  /** Defaults to EMAIL_FROM env var or "Intelligo <noreply@intelligo.dev>" */
  from?: string;
  replyTo?: string;
  /**
   * Provider-neutral template descriptor. Required by template-based
   * providers (Loops); ignored by HTML-capable providers (Resend).
   */
  template?: EmailTemplateRef;
}

export interface SendEmailWithComponentParams {
  to: string | string[];
  subject: string;
  /** A React Email component element. Will be rendered to HTML before sending. */
  react: React.ReactElement;
  /** Defaults to EMAIL_FROM env var or "Intelligo <noreply@intelligo.dev>" */
  from?: string;
  replyTo?: string;
  /**
   * Provider-neutral template descriptor. Required by template-based
   * providers (Loops); ignored by HTML-capable providers (Resend).
   */
  template?: EmailTemplateRef;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

/**
 * Returns true if the error is a client error (4xx) that should NOT be retried.
 */
function isClientError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;

    // Check for explicit statusCode (set by ResendProvider / LoopsProvider).
    // 429 is excluded: rate limits are transient and worth retrying.
    if (typeof err.statusCode === "number") {
      return (
        err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 429
      );
    }

    // Check for status property (some HTTP libraries)
    if (typeof err.status === "number") {
      return err.status >= 400 && err.status < 500 && err.status !== 429;
    }

    // Resend SDK error names that indicate client errors
    const name = err.name as string | undefined;
    if (
      name === "validation_error" ||
      name === "missing_required_field" ||
      name === "invalid_api_Key"
    ) {
      return true;
    }
  }

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send an email through the configured provider with retry logic.
 *
 * Accepts either raw HTML via `{ html }` or a React Email component via
 * `{ react }`. When a React element is provided, it is rendered to HTML
 * using `@react-email/components`'s `render()` before sending.
 *
 * This function NEVER throws. All errors are caught and returned as
 * `{ success: false, error: "..." }`. This prevents email failures
 * from crashing the application (TECH-08).
 */
export async function sendEmail(
  params: SendEmailParams | SendEmailWithComponentParams
): Promise<SendEmailResult> {
  try {
    const provider = getEmailProvider();
    const from =
      params.from ??
      process.env.EMAIL_FROM ??
      "Intelligo <noreply@intelligo.dev>";

    const recipient = Array.isArray(params.to)
      ? params.to.join(", ")
      : params.to;

    // Resolve HTML content: either use provided html or render React component
    let html: string;
    if ("react" in params) {
      try {
        html = await render(params.react);
      } catch (renderError) {
        const message =
          renderError instanceof Error
            ? renderError.message
            : String(renderError);
        console.error(`[Email] Failed to render React component: ${message}`);
        return { success: false, error: `Template render failed: ${message}` };
      }
    } else {
      html = params.html;
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await provider.send({
          to: params.to,
          subject: params.subject,
          html,
          from,
          replyTo: params.replyTo,
          template: params.template,
        });

        return { success: true, id: result.id };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);

        // Do NOT retry client errors (4xx) – they will always fail
        if (isClientError(error)) {
          console.error(
            `[Email] Send failed for ${recipient} (client error, not retrying): ${message}`
          );
          return { success: false, error: message };
        }

        console.warn(
          `[Email] Send attempt ${attempt}/${MAX_ATTEMPTS} failed for ${recipient}: ${message}`
        );

        // Wait before next attempt (exponential backoff: 1s, 2s, 4s)
        if (attempt < MAX_ATTEMPTS) {
          await delay(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }

    // All attempts exhausted
    const finalMessage =
      lastError instanceof Error ? lastError.message : String(lastError);
    console.error(
      `[Email] All ${MAX_ATTEMPTS} attempts failed for ${recipient}: ${params.subject}`
    );

    return { success: false, error: finalMessage };
  } catch (error) {
    // Catch-all for unexpected errors (e.g., getEmailProvider() failing)
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Email] Unexpected error: ${message}`);
    return { success: false, error: message };
  }
}
