import { Button, Text } from "@react-email/components";
import * as React from "react";
import { emailBrand } from "../brand";
import { BaseLayout } from "./base-layout";

export interface WelcomeEmailProps {
  userName: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ userName, dashboardUrl }: WelcomeEmailProps) {
  const { name } = emailBrand();
  const text = {
    preview: name
      ? `Welcome to ${name}, ${userName}!`
      : `Welcome, ${userName}!`,
    heading: name ? `Welcome to ${name}` : "Welcome",
    greeting: "Hi",
    body: "Thanks for signing up! You're all set to start using AI-powered tools to boost your productivity.",
    button: "Go to Dashboard",
  };

  return (
    <BaseLayout preview={text.preview}>
      <Text style={headingStyle}>{text.heading}</Text>
      <Text style={bodyTextStyle}>
        {text.greeting} {userName},
      </Text>
      <Text style={bodyTextStyle}>{text.body}</Text>
      <Button href={dashboardUrl} style={buttonStyle}>
        {text.button}
      </Button>
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
