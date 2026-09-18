/**
 * The onboarding wizard: its steps, their fields, the completion screen
 * and `onStepSubmit`.
 *
 * Copy is referenced by fully-qualified message key (`titleKey`,
 * `labelKey`, `ctaLabelKey`…), resolved through a namespace-less
 * `useTranslations()`; a step you add can point at any namespace.
 *
 * The framework persists only which step the caller is on. Field
 * answers are kept only if `onStepSubmit` saves them; it runs
 * server-side each time the wizard advances past a step, and by default
 * writes `displayName` to the profile.
 *
 * The client wizard imports this file too, so it must stay client-safe:
 * persist through a server action, never a service imported here.
 */

import { saveDisplayName } from "@/actions/onboarding";

export type OnboardingFieldType = "text" | "select-cards";

export interface OnboardingSelectOption {
  value: string;
  labelKey: string;
  descriptionKey?: string;
}

export interface OnboardingField {
  /** Unique within its step. Used as the answers-map key. */
  id: string;
  type: OnboardingFieldType;
  labelKey: string;
  /** `type: "text"` only. */
  placeholderKey?: string;
  required?: boolean;
  /** `type: "select-cards"` only. */
  options?: OnboardingSelectOption[];
}

export interface OnboardingStepConfig {
  /** Persisted verbatim; at most 64 characters, unique across `steps`. */
  id: string;
  titleKey: string;
  descriptionKey?: string;
  /** Omit for a purely informational step with only a Continue button. */
  fields?: OnboardingField[];
}

export interface OnboardingCompleteConfig {
  titleKey: string;
  descriptionKey?: string;
  ctaLabelKey: string;
  /** Where the completion screen's CTA (and Skip) send the caller. */
  ctaHref: string;
}

export type OnboardingAnswers = Record<string, string>;

export interface OnboardingConfig {
  steps: OnboardingStepConfig[];
  complete: OnboardingCompleteConfig;
  /**
   * Runs server-side whenever the wizard advances past `stepId`, with
   * that step's answers. The only place answers are saved.
   */
  onStepSubmit?: (
    stepId: string,
    answers: OnboardingAnswers
  ) => Promise<void> | void;
}

export const onboardingConfig: OnboardingConfig = {
  steps: [
    {
      id: "purpose",
      titleKey: "onboarding.steps.purpose.title",
      descriptionKey: "onboarding.steps.purpose.description",
      fields: [
        {
          id: "purpose",
          type: "select-cards",
          labelKey: "onboarding.steps.purpose.label",
          required: true,
          options: [
            {
              value: "personal",
              labelKey: "onboarding.steps.purpose.options.personal.label",
              descriptionKey:
                "onboarding.steps.purpose.options.personal.description",
            },
            {
              value: "team",
              labelKey: "onboarding.steps.purpose.options.team.label",
              descriptionKey:
                "onboarding.steps.purpose.options.team.description",
            },
            {
              value: "clients",
              labelKey: "onboarding.steps.purpose.options.clients.label",
              descriptionKey:
                "onboarding.steps.purpose.options.clients.description",
            },
          ],
        },
      ],
    },
    {
      id: "profile",
      titleKey: "onboarding.steps.profile.title",
      descriptionKey: "onboarding.steps.profile.description",
      fields: [
        {
          id: "displayName",
          type: "text",
          labelKey: "onboarding.steps.profile.label",
          placeholderKey: "onboarding.steps.profile.placeholder",
          required: true,
        },
      ],
    },
  ],
  complete: {
    titleKey: "onboarding.complete.title",
    descriptionKey: "onboarding.complete.description",
    ctaLabelKey: "onboarding.complete.cta",
    ctaHref: "/dashboard",
  },
  onStepSubmit: async (stepId, answers) => {
    if (stepId === "profile" && answers.displayName) {
      await saveDisplayName(answers.displayName);
    }
  },
};
