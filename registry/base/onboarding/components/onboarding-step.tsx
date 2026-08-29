"use client";

/**
 * Renders a single onboarding step's fields, driven entirely by the
 * step's config (`@/lib/onboarding-steps.ts`) — two generic field
 * types (a text input, a single-select card group) cover the common
 * cases; a product that needs more composes its own step component and
 * points `onboarding-wizard.tsx` at it instead of this one.
 */

import { useId } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  OnboardingAnswers,
  OnboardingStepConfig,
} from "@/lib/onboarding-steps";

interface OnboardingStepProps {
  step: OnboardingStepConfig;
  answers: OnboardingAnswers;
  onAnswerChange: (fieldId: string, value: string) => void;
  onBack?: () => void;
  onNext: () => void;
  isSubmitting: boolean;
}

function isStepComplete(
  step: OnboardingStepConfig,
  answers: OnboardingAnswers
): boolean {
  return (step.fields ?? []).every((field) => {
    if (!field.required) return true;
    return Boolean(answers[field.id]?.trim());
  });
}

export function OnboardingStep({
  step,
  answers,
  onAnswerChange,
  onBack,
  onNext,
  isSubmitting,
}: OnboardingStepProps) {
  const t = useTranslations("onboarding");
  // Namespace-less: step/field copy keys are fully qualified so a
  // product's own steps can point at its own namespace (see
  // `@/lib/onboarding-steps`).
  const tAny = useTranslations();
  const headingId = useId();
  const canProceed = isStepComplete(step, answers);

  return (
    <div role="group" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold text-center mb-2">
        {tAny(step.titleKey)}
      </h2>
      {step.descriptionKey && (
        <p className="text-sm text-muted-foreground text-center mb-6">
          {tAny(step.descriptionKey)}
        </p>
      )}

      <div className="space-y-5">
        {(step.fields ?? []).map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>{tAny(field.labelKey)}</Label>

            {field.type === "text" ? (
              <Input
                id={field.id}
                value={answers[field.id] ?? ""}
                onChange={(event) =>
                  onAnswerChange(field.id, event.target.value)
                }
                placeholder={
                  field.placeholderKey ? tAny(field.placeholderKey) : undefined
                }
                required={field.required}
              />
            ) : (
              <div
                className="space-y-2"
                role="radiogroup"
                aria-labelledby={field.id}
              >
                {(field.options ?? []).map((option) => {
                  const selected = answers[field.id] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onAnswerChange(field.id, option.value)}
                      className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {tAny(option.labelKey)}
                        </p>
                        {option.descriptionKey && (
                          <p className="text-xs text-muted-foreground">
                            {tAny(option.descriptionKey)}
                          </p>
                        )}
                      </div>
                      {selected && (
                        <CheckCircle2
                          className="h-5 w-5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-8">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
          >
            {t("step.back")}
          </Button>
        )}
        <Button
          type="button"
          className="flex-1"
          onClick={onNext}
          disabled={!canProceed || isSubmitting}
        >
          {isSubmitting ? t("step.saving") : t("step.continue")}
        </Button>
      </div>
    </div>
  );
}
