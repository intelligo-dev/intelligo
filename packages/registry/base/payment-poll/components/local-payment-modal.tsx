"use client";

/**
 * QR-and-poll payment: issue an invoice, show a code the user scans in
 * their banking app, wait for the provider to confirm.
 *
 * Four states, and all four are reachable: preparing the invoice,
 * waiting for payment, paid, and failed. The waiting state is the one
 * that matters — it has to stay honest for as long as a person takes
 * to open another app, find the right account, and confirm, without
 * either spinning forever or giving up while they are mid-payment.
 * So polling stops at `timeoutMs` with a "still waiting?" message and
 * a retry, rather than silently going quiet.
 *
 * Provider work happens server-side through `@/actions/payment` (see
 * `@/lib/local-payment`): the browser never sees provider credentials,
 * and never says who is paying — that comes from the session.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CURRENCY } from "@/lib/billing-config";
import { paymentPollConfig } from "@/lib/payment-poll-config";
import { pollLocalPayment, startLocalPayment } from "@/actions/payment";
import type { LocalPaymentInvoice } from "@/lib/local-payment";

type Step = "creating" | "waiting" | "timedOut" | "paid" | "failed";

interface LocalPaymentModalProps {
  open: boolean;
  onClose: () => void;
  /** What is being bought — a plan slug, a bundle id, an order id. */
  reference: string;
  /** Amount to display. The server prices the invoice itself. */
  amount: number;
  /** Localized name of what is being bought. */
  label: string;
  /** Called once the provider confirms payment. */
  onPaid: () => void;
}

export function LocalPaymentModal({
  open,
  onClose,
  reference,
  amount,
  label,
  onPaid,
}: LocalPaymentModalProps) {
  const t = useTranslations("payment-poll");
  const format = useFormatter();

  const [step, setStep] = useState<Step>("creating");
  const [invoice, setInvoice] = useState<LocalPaymentInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // `onPaid` is usually an inline arrow; holding it in a ref keeps the
  // polling effect from restarting on every parent render.
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const createInvoice = useCallback(async () => {
    setStep("creating");
    setError(null);
    const result = await startLocalPayment(reference, amount);
    if (!result.success) {
      setError(result.error);
      setStep("failed");
      return;
    }
    setInvoice(result.data);
    setStep("waiting");
  }, [reference, amount]);

  useEffect(() => {
    if (!open) return;
    void createInvoice();
  }, [open, attempt, createInvoice]);

  useEffect(() => {
    if (step !== "waiting" || !invoice) return;

    const { pollIntervalMs, timeoutMs } = paymentPollConfig;
    const startedAt = Date.now();

    const timer = setInterval(async () => {
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        setStep("timedOut");
        return;
      }

      const result = await pollLocalPayment(invoice.invoiceId);
      // A failed poll is not a failed payment — the provider may just
      // be slow. Keep waiting; the timeout is the only give-up.
      if (!result.success) return;

      if (result.data === "paid") {
        clearInterval(timer);
        setStep("paid");
        setTimeout(() => onPaidRef.current(), 1200);
      } else if (result.data === "failed") {
        clearInterval(timer);
        setError(t("errors.declined"));
        setStep("failed");
      }
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [step, invoice, t]);

  const description =
    step === "creating"
      ? t("state.creating")
      : step === "waiting"
        ? t("state.waiting")
        : step === "timedOut"
          ? t("state.timedOut")
          : step === "paid"
            ? t("state.paid")
            : t("state.failed");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {t("title", {
              label,
              amount: format.number(amount, {
                style: "currency",
                currency: CURRENCY,
                maximumFractionDigits: 0,
              }),
            })}
          </DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          {step === "creating" ? (
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          ) : null}

          {step === "waiting" && invoice ? (
            <>
              {invoice.qrCode ? (
                // A plain <img>: the QR is usually a data: URI minted
                // per invoice, so there is nothing for next/image to
                // optimize, and a remote QR host would need adding to
                // next.config's remotePatterns in every consumer.
                <img
                  src={invoice.qrCode}
                  alt={t("qrAlt")}
                  width={200}
                  height={200}
                  className="mb-4 rounded-xl bg-white p-4"
                />
              ) : null}

              {invoice.deeplinks?.length ? (
                <div className="mt-2 w-full space-y-2">
                  <p className="mb-2 text-center text-xs text-muted-foreground">
                    {t("orChooseApp")}
                  </p>
                  {invoice.deeplinks.map((link) => (
                    <Button
                      key={link.url}
                      variant="outline"
                      className="w-full"
                      render={<a href={link.url} />}
                      nativeButton={false}
                    >
                      {link.app}
                    </Button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                <span>{t("state.polling")}</span>
              </div>
            </>
          ) : null}

          {step === "timedOut" ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                {t("timedOutHelp")}
              </p>
              <Button onClick={() => setAttempt((n) => n + 1)}>
                {t("retry")}
              </Button>
            </div>
          ) : null}

          {step === "paid" ? (
            <div className="text-center">
              <CheckCircle2
                className="mx-auto size-16 text-primary"
                aria-hidden
              />
              <p className="mt-4 text-lg font-semibold">{t("paidTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("paidBody", { label })}
              </p>
            </div>
          ) : null}

          {step === "failed" ? (
            <div className="text-center">
              <XCircle
                className="mx-auto size-16 text-destructive"
                aria-hidden
              />
              <p className="mt-4 text-lg font-semibold">{t("failedTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => setAttempt((n) => n + 1)}>
                  {t("retry")}
                </Button>
                <Button variant="outline" onClick={onClose}>
                  {t("close")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
