import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Email Provider Abstraction
// ---------------------------------------------------------------------------
// The framework never hard-codes a single email service. Selection happens at
// runtime via EMAIL_PROVIDER / API-key auto-detection. First-class providers:
//   1. ResendProvider  – HTML-capable: sends the rendered React Email HTML
//   2. LoopsProvider   – template-based: sends via Loops transactional API
//                        using a per-template id mapping (Loops does not
//                        accept raw HTML)
//   3. ConsoleProvider – development fallback when no API keys are set
// ---------------------------------------------------------------------------

/**
 * Provider-neutral template descriptor attached to every framework email.
 *
 * HTML-capable providers (Resend) ignore it — they send the rendered HTML.
 * Template-based providers (Loops) require it: `key` is resolved to the
 * provider-side template id and `variables` become the template's dynamic
 * data. Keys are stable framework identifiers, e.g. "verify-email".
 */
export interface EmailTemplateRef {
  key: string;
  variables?: Record<string, string | number>;
}

export interface EmailSendParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  template?: EmailTemplateRef;
}

/**
 * Common interface every email provider must implement.
 */
export interface EmailProvider {
  send(params: EmailSendParams): Promise<{ id: string }>;
}

/** Error with an HTTP-ish status code so send.ts can decide retryability. */
function statusError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = statusCode;
  return err;
}

// ---------------------------------------------------------------------------
// ResendProvider
// ---------------------------------------------------------------------------

export class ResendProvider implements EmailProvider {
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(params: EmailSendParams): Promise<{ id: string }> {
    const { data, error } = await this.client.emails.send({
      from: params.from ?? "Intelligo <noreply@intelligo.dev>",
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });

    if (error) {
      // Resend returns an error object rather than throwing
      const err = new Error(error.message) as Error & { statusCode?: number };
      // Resend error names map to HTTP status categories
      if (
        error.name === "validation_error" ||
        error.name === "missing_required_field"
      ) {
        err.statusCode = 400;
      }
      throw err;
    }

    return { id: data?.id ?? "unknown" };
  }
}

// ---------------------------------------------------------------------------
// LoopsProvider
// ---------------------------------------------------------------------------
// Loops transactional emails are designed in the Loops dashboard and sent by
// template id — the API accepts no raw HTML and exactly one recipient per
// call. Template keys resolve to ids through (in order):
//   1. the `transactionalIds` map passed to the constructor
//   2. env: LOOPS_TRANSACTIONAL_ID_<KEY> (key upper-snaked,
//      e.g. "verify-email" → LOOPS_TRANSACTIONAL_ID_VERIFY_EMAIL)
// `from`/`replyTo` are ignored — the sender is configured per template in
// Loops itself.
// ---------------------------------------------------------------------------

const LOOPS_API_URL = "https://app.loops.so/api/v1/transactional";

export class LoopsProvider implements EmailProvider {
  constructor(
    private apiKey: string,
    private transactionalIds?: Record<string, string>
  ) {}

  private resolveTransactionalId(key: string): string | undefined {
    const mapped = this.transactionalIds?.[key];
    if (mapped) {
      return mapped;
    }
    const envName = `LOOPS_TRANSACTIONAL_ID_${key
      .toUpperCase()
      .replace(/-/g, "_")}`;
    return process.env[envName];
  }

  async send(params: EmailSendParams): Promise<{ id: string }> {
    const template = params.template;
    if (!template) {
      throw statusError(
        `Loops requires a template key (subject: "${params.subject}") — Loops cannot send raw HTML. Use a framework sender or pass { template }.`,
        400
      );
    }

    const transactionalId = this.resolveTransactionalId(template.key);
    if (!transactionalId) {
      throw statusError(
        `No Loops transactional id mapped for template "${template.key}". Set LOOPS_TRANSACTIONAL_ID_${template.key
          .toUpperCase()
          .replace(
            /-/g,
            "_"
          )} or pass a transactionalIds map to LoopsProvider.`,
        400
      );
    }

    const recipients = Array.isArray(params.to) ? params.to : [params.to];

    // Loops accepts a single recipient per request — fan out sequentially so
    // a failure surfaces with normal retry semantics in send.ts.
    for (const email of recipients) {
      const response = await fetch(LOOPS_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionalId,
          email,
          dataVariables: template.variables ?? {},
        }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const body = (await response.json()) as {
            message?: string;
            error?: { message?: string };
          };
          detail = body.message ?? body.error?.message ?? "";
        } catch {
          // Non-JSON error body — status code alone is enough
        }
        throw statusError(
          `Loops send failed (${response.status}) for template "${template.key}"${detail ? `: ${detail}` : ""}`,
          response.status
        );
      }
    }

    // Loops returns { success: true } with no message id
    return { id: `loops:${transactionalId}` };
  }
}

// ---------------------------------------------------------------------------
// ConsoleProvider (development fallback)
// ---------------------------------------------------------------------------

export class ConsoleProvider implements EmailProvider {
  async send(params: EmailSendParams): Promise<{ id: string }> {
    const recipient = Array.isArray(params.to)
      ? params.to.join(", ")
      : params.to;

    console.log(
      `[Email] Would send to: ${recipient}, subject: ${params.subject}`
    );

    return { id: `console-${Date.now()}` };
  }
}

// ---------------------------------------------------------------------------
// Factory – singleton provider instance
// ---------------------------------------------------------------------------

export type EmailProviderName = "resend" | "loops" | "console";

let cachedProvider: EmailProvider | null = null;

/** Test-only: clear the cached provider so env changes take effect. */
export function resetEmailProviderCache(): void {
  cachedProvider = null;
}

/**
 * Returns the email provider based on environment variables.
 *
 * Priority:
 *   1. EMAIL_PROVIDER env var → explicit selection (with API key validation)
 *   2. RESEND_API_KEY → ResendProvider (auto-detect; preferred because it can
 *      send every framework email without per-template setup)
 *   3. LOOPS_API_KEY  → LoopsProvider (auto-detect; needs
 *      LOOPS_TRANSACTIONAL_ID_* mappings for the templates you use)
 *   4. (none)         → ConsoleProvider
 *
 * The provider instance is cached (singleton) so a new client is NOT created
 * on every call.
 */
export function getEmailProvider(): EmailProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const explicit = process.env.EMAIL_PROVIDER?.toLowerCase();

  if (explicit) {
    cachedProvider = resolveExplicitProvider(explicit);
    if (cachedProvider) {
      return cachedProvider;
    }
    // Unknown value — warn and fall through to auto-detect
    console.warn(
      `[Email] Unknown EMAIL_PROVIDER="${process.env.EMAIL_PROVIDER}", falling back to auto-detect`
    );
  }

  // Auto-detect from available API keys (backwards compatible)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    console.log("[Email] Using Resend provider");
    cachedProvider = new ResendProvider(resendKey);
    return cachedProvider;
  }

  const loopsKey = process.env.LOOPS_API_KEY;
  if (loopsKey) {
    console.log("[Email] Using Loops provider");
    cachedProvider = new LoopsProvider(loopsKey);
    return cachedProvider;
  }

  console.log("[Email] Using console provider (no API key set)");
  cachedProvider = new ConsoleProvider();
  return cachedProvider;
}

/**
 * Resolve an explicit EMAIL_PROVIDER value to a provider instance.
 * Returns null for unknown values so the caller can fall through to auto-detect.
 */
function resolveExplicitProvider(provider: string): EmailProvider | null {
  switch (provider) {
    case "resend": {
      const key = process.env.RESEND_API_KEY;
      if (!key) {
        console.warn(
          "[Email] EMAIL_PROVIDER=resend but RESEND_API_KEY is not set, falling back to console"
        );
        return new ConsoleProvider();
      }
      console.log("[Email] Using Resend provider (explicit)");
      return new ResendProvider(key);
    }
    case "loops": {
      const key = process.env.LOOPS_API_KEY;
      if (!key) {
        console.warn(
          "[Email] EMAIL_PROVIDER=loops but LOOPS_API_KEY is not set, falling back to console"
        );
        return new ConsoleProvider();
      }
      console.log("[Email] Using Loops provider (explicit)");
      return new LoopsProvider(key);
    }
    case "console":
      console.log("[Email] Using console provider (explicit)");
      return new ConsoleProvider();
    default:
      return null;
  }
}
