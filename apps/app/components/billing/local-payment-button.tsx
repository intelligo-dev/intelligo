"use client";

/**
 * A button that opens `LocalPaymentModal` for one reference and, once
 * the payment is confirmed, closes it and refreshes the page so it shows
 * what was bought.
 *
 * The pricing item's plan card renders it when `lib/plan-card-config.tsx`
 * binds it; it fits anywhere else something is sold the same way.
 */

import { useState, type ComponentProps } from "react";
import { QrCode } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

import { LocalPaymentModal } from "./local-payment-modal";

interface LocalPaymentButtonProps {
  /** What is being bought — handed to `priceLocalPayment` on the server. */
  reference: string;
  /** Amount to display, in major units of `CURRENCY`. */
  amount: number;
  /** Localized name of what is being bought. */
  label: string;
  /** The button's text; "Pay with QR" by default. */
  children?: React.ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}

export function LocalPaymentButton({
  reference,
  amount,
  label,
  children,
  variant = "outline",
  className = "w-full",
}: LocalPaymentButtonProps) {
  const t = useTranslations("payment-poll");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <QrCode aria-hidden />
        {children ?? t("button")}
      </Button>
      <LocalPaymentModal
        open={open}
        onClose={() => setOpen(false)}
        reference={reference}
        amount={amount}
        label={label}
        onPaid={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
