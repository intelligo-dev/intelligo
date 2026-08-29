import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// ---------------------------------------------------------------------------
// Trial Warning Template (EMAIL-07 at 20%, EMAIL-08 when depleted)
// ---------------------------------------------------------------------------
// Sent when a workspace's trial credits are running low or fully depleted.
// Uses isDepleted flag to toggle between warning and depleted variants.
// ---------------------------------------------------------------------------

export interface TrialWarningEmailProps {
  workspaceName: string;
  creditsRemaining: number;
  totalCredits: number;
  percentageRemaining: number;
  upgradeUrl: string;
  isDepleted: boolean;
  locale?: "en" | "mn";
}

export function TrialWarningEmail({
  workspaceName,
  creditsRemaining,
  totalCredits,
  percentageRemaining,
  upgradeUrl,
  isDepleted,
  locale = "en",
}: TrialWarningEmailProps) {
  const text =
    locale === "mn"
      ? {
          previewDepleted: "Таны туршилтын кредит дууссан",
          previewWarning: "Таны туршилтын кредит дуусч байна",
          headingDepleted: "Туршилтын кредит дууссан",
          headingWarning: "Туршилтын кредит дуусч байна",
          bodyDepleted1: "Таны ажлын орчин",
          bodyDepleted2: "бүх туршилтын кредитийг ашигласан.",
          warningText:
            "AI функцүүдийг үргэлжлүүлэхийн тулд төлөвлөгөө сонгоно уу.",
          bodyWarning1: "Таны ажлын орчин",
          bodyWarning2: "нь",
          bodyWarning3: "туршилтын кредит үлдсэн",
          button: "Төлөвлөгөө сонгох",
        }
      : {
          previewDepleted: "Your trial credits are depleted",
          previewWarning: "Your trial credits are running low",
          headingDepleted: "Trial Credits Depleted",
          headingWarning: "Trial Credits Running Low",
          bodyDepleted1: "Your workspace",
          bodyDepleted2: "has used all trial credits.",
          warningText: "Subscribe to a plan to continue using AI features.",
          bodyWarning1: "Your workspace",
          bodyWarning2: "has",
          bodyWarning3: "trial credits remaining",
          button: "Subscribe Now",
        };

  return (
    <BaseLayout
      preview={isDepleted ? text.previewDepleted : text.previewWarning}
    >
      <Text style={headingStyle}>
        {isDepleted ? text.headingDepleted : text.headingWarning}
      </Text>

      {isDepleted ? (
        <>
          <Text style={bodyTextStyle}>
            {text.bodyDepleted1} &lsquo;{workspaceName}&rsquo;{" "}
            {text.bodyDepleted2}
          </Text>
          <Text style={warningTextStyle}>{text.warningText}</Text>
        </>
      ) : (
        <Text style={bodyTextStyle}>
          {text.bodyWarning1} &lsquo;{workspaceName}&rsquo; {text.bodyWarning2}{" "}
          {creditsRemaining.toLocaleString()} / {totalCredits.toLocaleString()}{" "}
          {text.bodyWarning3} ({percentageRemaining}%).
        </Text>
      )}

      <Button href={upgradeUrl} style={buttonStyle}>
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

const warningTextStyle: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "15px",
  fontWeight: 600,
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
