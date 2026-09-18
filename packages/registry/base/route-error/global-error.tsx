"use client";

/**
 * Last-resort boundary: a failure in the root layout itself, which
 * replaces the whole document.
 *
 * Static English and inline styles: this renders above
 * `NextIntlClientProvider` and outside the `[locale]` segment, so there
 * is no translator and no guarantee the stylesheet loaded. Keep it
 * dependency-free — whatever broke may be one of the dependencies.
 *
 * Reporting still goes through the `reportRouteError` seam, so a
 * global crash reaches the same reporter as every other boundary.
 */

import { useEffect } from "react";

import { reportRouteError } from "@/lib/error-reporting";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportRouteError(error, { scope: "global" });
    console.error("[global] error boundary caught:", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div
          style={{ maxWidth: "28rem", padding: "2rem", textAlign: "center" }}
        >
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            The application failed to load. Try again, and if it keeps
            happening, contact support.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
