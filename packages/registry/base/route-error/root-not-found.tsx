/**
 * Root 404 — the page Next renders for a URL that matches no route at
 * all (`/nonsense`, or `/xx/dashboard` for a locale you don't ship).
 *
 * The translated `app/[locale]/not-found.tsx` only covers `notFound()`
 * raised inside a locale segment; without this file, an unmatched URL
 * falls through to Next's unstyled default 404.
 *
 * Static English and inline styles: this renders outside `[locale]`,
 * so there is no locale to read and no `NextIntlClientProvider` above
 * it. A single-language product can replace the strings with its own.
 */

export default function RootNotFound() {
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
            Page not found
          </h2>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              background: "#111",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Go home
          </a>
        </div>
      </body>
    </html>
  );
}
