import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

// ---------------------------------------------------------------------------
// Base Email Layout — Intelligo Branding
// ---------------------------------------------------------------------------
// All email templates wrap their content in this layout for consistent
// branding: violet header, white content area, muted footer.
//
// Uses inline styles exclusively — email clients do not reliably support
// CSS classes. Colors are explicit values (not CSS variables) so they work
// in both light and dark email clients.
// ---------------------------------------------------------------------------

export interface BaseLayoutProps {
  preview: string;
  children: React.ReactNode;
}

// Color palette
const colors = {
  background: "#f4f4f5", // zinc-100
  container: "#ffffff",
  text: "#18181b", // zinc-900
  muted: "#71717a", // zinc-500
  brand: "#7c3aed", // violet-600
  border: "#e4e4e7", // zinc-200
} as const;

export function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Text style={logoStyle}>Intelligo</Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Content */}
          <Section style={contentStyle}>{children}</Section>

          <Hr style={hrStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>Intelligo AI Platform</Text>
            <Text style={footerMutedStyle}>
              This is a transactional email from Intelligo. If you believe you
              received this email in error, please contact{" "}
              <Link href="mailto:support@intelligo.dev" style={footerLinkStyle}>
                support@intelligo.dev
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Inline Styles
// ---------------------------------------------------------------------------

const bodyStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: "40px 0",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: colors.container,
  borderRadius: "8px",
  maxWidth: "600px",
  margin: "0 auto",
  border: `1px solid ${colors.border}`,
};

const headerStyle: React.CSSProperties = {
  padding: "32px 40px 16px",
};

const logoStyle: React.CSSProperties = {
  color: colors.brand,
  fontSize: "24px",
  fontWeight: 700,
  margin: 0,
  lineHeight: "32px",
};

const hrStyle: React.CSSProperties = {
  borderColor: colors.border,
  borderTop: "none",
  margin: 0,
};

const contentStyle: React.CSSProperties = {
  padding: "24px 40px",
};

const footerStyle: React.CSSProperties = {
  padding: "16px 40px 32px",
};

const footerTextStyle: React.CSSProperties = {
  color: colors.muted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 8px",
  fontWeight: 600,
};

const footerMutedStyle: React.CSSProperties = {
  color: colors.muted,
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
};

const footerLinkStyle: React.CSSProperties = {
  color: colors.brand,
  textDecoration: "underline",
};
