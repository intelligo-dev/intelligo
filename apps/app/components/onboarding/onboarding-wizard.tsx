"use client";

/**
 * Onboarding wizard — orchestrates the steps defined in
 * `@/lib/onboarding-steps.ts`: progress indicator, back/next/skip,
 * and the completion screen. Delegates a single step's field rendering
 * to `./onboarding-step.tsx`.
 *
 * Resume behavior: `initialStepId` (the caller's persisted
 * `onboardingStep`, read server-side in `page.tsx`) is matched against
 * `onboardingConfig.steps` to pick a starting index. Reaching the
 * completion screen does not persist a step id of its own — it isn't
 * one of the product's own step ids, and there's nothing left to
 * "resume into" once the caller has answered every step; a caller who
 * abandons on the completion screen simply resumes at the last
 * answered step next time.
 *
 * Focus management: the card advances its `tabIndex={-1}` focus on
 * every step change, so screen readers announce the new step the same
 * way a route change would.
 */

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  advanceStep,
  completeOnboarding,
  skipOnboarding,
} from "@/actions/onboarding";
import {
  onboardingConfig,
  type OnboardingAnswers,
} from "@/lib/onboarding-steps";
import { OnboardingStep } from "./onboarding-step";

interface OnboardingWizardProps {
  initialStepId: string | null;
}

export function OnboardingWizard({ initialStepId }: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  // Namespace-less: completion-screen copy keys are fully qualified
  // (see `@/lib/onboarding-steps`).
  const tAny = useTranslations();
  const router = useRouter();
  const { steps, complete } = onboardingConfig;

  const initialIndex = initialStepId
    ? Math.max(
        steps.findIndex((step) => step.id === initialStepId),
        0
      )
    : 0;

  const [stepIndex, setStepIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [isSkipping, startSkip] = useTransition();
  const [isPending, startTransition] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);

  const isCompleteScreen = stepIndex >= steps.length;
  const currentStep = steps[stepIndex];
  const totalScreens = steps.length + 1; // + the completion screen
  const progressPosition = Math.min(stepIndex, steps.length);

  function focusCard() {
    cardRef.current?.focus();
  }

  function handleAnswerChange(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  function handleNext() {
    if (!currentStep) return;
    setError(null);
    startTransition(async () => {
      const nextIndex = stepIndex + 1;
      const nextStep = steps[nextIndex];
      // Only persist a step id while the caller is still moving between
      // the product's own steps — see the module doc comment for why
      // the completion screen doesn't get one.
      const result = nextStep
        ? await advanceStep(nextStep.id, answers)
        : { success: true as const, data: undefined };
      if (!result.success) {
        setError(result.error);
        return;
      }
      setStepIndex(nextIndex);
      focusCard();
    });
  }

  function handleBack() {
    if (stepIndex === 0) return;
    setError(null);
    startTransition(async () => {
      const prevIndex = stepIndex - 1;
      const prevStep = steps[prevIndex];
      if (prevStep) {
        const result = await advanceStep(prevStep.id, answers);
        if (!result.success) {
          setError(result.error);
          return;
        }
      }
      setStepIndex(prevIndex);
      focusCard();
    });
  }

  function handleSkip() {
    setError(null);
    startSkip(async () => {
      const result = await skipOnboarding();
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(complete.ctaHref);
      router.refresh();
    });
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding();
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(complete.ctaHref);
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex justify-end mb-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          disabled={isSkipping}
          className="text-muted-foreground"
        >
          {isSkipping ? t("wizard.skipping") : t("wizard.skip")}
        </Button>
      </div>

      <div
        className="flex items-center justify-center gap-2 mb-8"
        role="progressbar"
        aria-valuenow={progressPosition + 1}
        aria-valuemin={1}
        aria-valuemax={totalScreens}
        aria-label={t("wizard.progressLabel")}
      >
        {Array.from({ length: totalScreens }).map((_, index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full transition-all ${
              index === progressPosition
                ? "w-8 bg-primary"
                : index < progressPosition
                  ? "w-1.5 bg-primary/60"
                  : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>

      <div
        ref={cardRef}
        tabIndex={-1}
        className="rounded-xl border bg-card p-8 outline-none"
      >
        {error && (
          <p role="alert" className="text-sm text-destructive mb-4">
            {error}
          </p>
        )}

        {isCompleteScreen ? (
          <div className="text-center py-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <CheckCircle2
                className="w-8 h-8 text-primary"
                aria-hidden="true"
              />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {tAny(complete.titleKey)}
            </h2>
            {complete.descriptionKey && (
              <p className="text-sm text-muted-foreground mb-8">
                {tAny(complete.descriptionKey)}
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              onClick={handleComplete}
              disabled={isPending}
            >
              {isPending ? t("wizard.finishing") : tAny(complete.ctaLabelKey)}
            </Button>
          </div>
        ) : currentStep ? (
          <OnboardingStep
            step={currentStep}
            answers={answers}
            onAnswerChange={handleAnswerChange}
            onBack={stepIndex > 0 ? handleBack : undefined}
            onNext={handleNext}
            isSubmitting={isPending}
          />
        ) : null}
      </div>
    </div>
  );
}
