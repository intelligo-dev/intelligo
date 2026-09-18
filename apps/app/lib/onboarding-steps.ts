/**
 * Onboarding steps config — the consumer-owned shape of your product's
 * onboarding wizard. Everything a product might want to change lives
 * here: the steps, their fields, the completion screen, and the hook
 * that makes a step's answers durable.
 *
 * All copy is referenced by message key, never by literal string —
 * `titleKey`, `labelKey`, `ctaLabelKey` and friends are fully-qualified
 * keys resolved through a namespace-less `useTranslations()` (the same
 * contract as `chatConfig.starters` and `navItems[].titleKey`). The
 * defaults point into this item's own `onboarding` namespace, so
 * translating the shipped wizard means adding
 * `messages/<locale>/onboarding.json`, not editing this file; a step
 * you add can point at any namespace you own.
 *
 * The framework only persists step *progression* — which step id the
 * caller is on (`@intelligo-dev/auth`'s `createOnboardingService`) — via
 * `actions/onboarding.ts`. It knows nothing about your fields. Field
 * answers become durable through `onStepSubmit`, which runs
 * server-side every time the wizard advances past a step. The shipped
 * default writes the `displayName` answer to the caller's profile, so
 * a name typed into the wizard actually shows up in the shell instead
 * of being silently discarded; extend it for your own domain tables.
 *
 * This file is imported by the `"use client"` wizard as well as by the
 * server action, so it must stay client-safe: persistence goes through
 * a server action (a serializable reference), never through a service
 * imported here directly.
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
