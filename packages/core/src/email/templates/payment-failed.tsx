import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// ---------------------------------------------------------------------------
// Payment Failed Template (EMAIL-11)
// ---------------------------------------------------------------------------
// Sent when Stripe payment fails for a workspace subscription.
// ---------------------------------------------------------------------------

export interface PaymentFailedEmailProps {
  workspaceName: string;
  amount: string;
  updatePaymentUrl: string;
  locale?: "en" | "mn";
}

export function PaymentFailedEmail({
  workspaceName,
  amount,
  updatePaymentUrl,
  locale = "en",
}: PaymentFailedEmailProps) {
  const text =
    locale === "mn"
      ? {
          preview: `${workspaceName}-ийн төлбөр амжилтгүй`,
          heading: "Төлбөр амжилтгүй",
          body1: "Бид таны ажлын орчин",
          body2: "-ийн",
          body3: "төлбөрийг боловсруулж чадсангүй.",
          warning:
            "Хэрэв төлбөр шинэчлэгдэхгүй бол 3 хоногийн дараа захиалга нь үнэгүй хязгаарт шилжинэ.",
          button: "Төлбөрийн хэрэгсэл шинэчлэх",
        }
      : {
          preview: `Payment failed for ${workspaceName}`,
          heading: "Payment Failed",
          body1: "We were unable to process the payment of",
          body2: "for your workspace",
          body3: "",
          warning:
            "Your subscription will be restricted to free limits after a 3-day grace period if payment is not updated.",
          button: "Update Payment Method",
        };

  return (
    <BaseLayout preview={text.preview}>
      <Text style={headingStyle}>{text.heading}</Text>
      <Text style={bodyTextStyle}>
        {text.body1} <strong>{amount}</strong> {text.body2} &lsquo;
        {workspaceName}&rsquo;{text.body3}
      </Text>
      <Text style={warningTextStyle}>{text.warning}</Text>
      <Button href={updatePaymentUrl} style={buttonStyle}>
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
