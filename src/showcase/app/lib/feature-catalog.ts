/**
 * Feature catalogue — consumer-owned.
 *
 * Which features exist, what to call them, and which plan unlocks them
 * is product data, not framework data: `@intelligo-dev/billing` answers
 * "is this workspace entitled to feature X" (`hasFeature`), and this
 * file answers "what should we say when it isn't".
 *
 * `labelKey` and `descriptionKey` are fully-qualified message keys
 * resolved namespace-less (the `chatConfig.starters` contract), so a
 * feature's copy lives in your own message files. `requiredPlan` is
 * the plan slug that unlocks it — rendered through the plan catalogue
 * registered by your composition root, so the name a user sees stays
 * in one place.
 *
 * A feature missing from this map still gates correctly; it just falls
 * back to generic copy, which is the right failure mode for a feature
 * key added in a hurry.
 */

export interface FeatureDescriptor {
  /** Fully-qualified message key for the feature's display name. */
  labelKey: string;
  /** Plan slug that unlocks it (must exist in your plan catalogue). */
  requiredPlan: string;
  /** Fully-qualified message key for a longer explanation. */
  descriptionKey?: string;
}

/**
 * Example, once your product has features to gate:
 *
 *   export const featureCatalog: Record<string, FeatureDescriptor> = {
 *     file_uploads: {
 *       labelKey: "features.fileUploads.label",
 *       descriptionKey: "features.fileUploads.description",
 *       requiredPlan: "pro",
 *     },
 *   };
 */
export const featureCatalog: Record<string, FeatureDescriptor> = {};
