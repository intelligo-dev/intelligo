import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// ---------------------------------------------------------------------------
// Welcome Email (EMAIL-03)
// ---------------------------------------------------------------------------
// Sent when a user signs up for an Intelligo account.
// ---------------------------------------------------------------------------

export interface WelcomeEmailProps {
  userName: string;
  dashboardUrl: string;
  locale?: "en" | "mn";
}

export function WelcomeEmail({
  userName,
  dashboardUrl,
  locale = "en",
}: WelcomeEmailProps) {
  const text =
    locale === "mn"
      ? {
          preview: `Тавтай морил, ${userName}!`,
          heading: "Intelligo-д тавтай морил",
          greeting: "Сайн байна уу",
          body: "Бүртгүүлсэнд баярлалаа! Та одоо AI хэрэгслүүдийг ашиглаж бүтээмжээ нэмэгдүүлэх бэлэн боллоо.",
          button: "Хянах самбар руу очих",
        }
      : {
          preview: `Welcome to Intelligo, ${userName}!`,
          heading: "Welcome to Intelligo",
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
