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
