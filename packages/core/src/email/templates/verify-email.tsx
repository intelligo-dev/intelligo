import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

export interface VerifyEmailEmailProps {
  userName: string;
  verificationUrl: string;
}

export function VerifyEmailEmail({
  userName,
  verificationUrl,
}: VerifyEmailEmailProps) {
  const text = {
    preview: "Verify your email address",
    heading: "Verify your email",
    greeting: "Hi",
    body: "Please verify your email address by clicking the button below.",
    button: "Verify Email",
    note: "This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.",
  };

  return (
    <BaseLayout preview={text.preview}>
      <Text style={headingStyle}>{text.heading}</Text>
      <Text style={bodyTextStyle}>
        {text.greeting} {userName},
      </Text>
      <Text style={bodyTextStyle}>{text.body}</Text>
      <Button href={verificationUrl} style={buttonStyle}>
        {text.button}
      </Button>
      <Text style={noteStyle}>{text.note}</Text>
    </BaseLayout>
  );
}

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
