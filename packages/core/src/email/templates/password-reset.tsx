import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// ---------------------------------------------------------------------------
// Password Reset Template (EMAIL-05)
// ---------------------------------------------------------------------------
// Sent when a user requests a password reset.
// ---------------------------------------------------------------------------

export interface PasswordResetEmailProps {
  userName: string;
  resetUrl: string;
}

export function PasswordResetEmail({
  userName,
  resetUrl,
}: PasswordResetEmailProps) {
  const text = {
    preview: "Reset your password",
    heading: "Reset your password",
    greeting: "Hi",
    body: "We received a request to reset your password. Click the button below to choose a new one.",
    button: "Reset Password",
    note: "This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.",
  };

  return (
    <BaseLayout preview={text.preview}>
      <Text style={headingStyle}>{text.heading}</Text>
      <Text style={bodyTextStyle}>
        {text.greeting} {userName},
      </Text>
      <Text style={bodyTextStyle}>{text.body}</Text>
      <Button href={resetUrl} style={buttonStyle}>
        {text.button}
      </Button>
      <Text style={noteStyle}>{text.note}</Text>
    </BaseLayout>
  );
}

// ---------------------------------------------------------------------------
// Inline Styles
// ---------------------------------------------------------------------------

const headingStyle: React.CSSProperties = {
  color: "#18181b",
  fontSize: "22px",
  fontWeight: 700,
  lineHeight: "30px",
  margin: "0 0 16px",
};

const bodyTextStyle: React.CSSProperties = {
  color: "#18181b",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#7c3aed",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "100%",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
  marginTop: "8px",
};

const noteStyle: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  lineHeight: "20px",
  marginTop: "20px",
};
