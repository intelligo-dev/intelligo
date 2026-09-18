/**
 * The `streamText` options a product may set per turn: how the model
 * samples (temperature, a token ceiling, a tool choice, a seed), none of
 * which changes what settlement reads back. Written out as an allowlist
 * rather than an `Omit<>` over the SDK's type, so an option a later SDK adds
 * is not admitted silently.
 *
 * What the transport keeps, and why each one is not negotiable:
 *
 *   `abortSignal`   without `request.signal` an abandoned run bills in
 *                   full and `onAbort` never fires.
 *   `timeout`       a timeout lands on the error path, which releases
 *                   the hold without charging tokens the provider has
 *                   already produced. The route's deadline is
 *                   `maxDuration`.
 *   `onFinish`,     the transport captures `totalUsage` there; replacing
 *   `onEnd`         it means every turn ends "stream ended without
 *                   usage".
 *   `onAbort`       settles from `sumStepUsage(steps)`.
 *   `onError`       the failure path is `run.fail()` plus localised copy.
 *   `model`         admission already priced the resolved `modelId`;
 *                   another model bills one admission never saw.
 *   `system`,       `prepareMessages` owns what the model is shown.
 *   `messages`,
 *   `prompt`,
 *   `instructions`
 *   `tools`,        already seams on the agent, and the same object
 *   `activeTools`   feeds `convertToModelMessages`; a second source
 *                   desynchronises the two.
 *   `stopWhen`      `stepCountIs(maxSteps)` must stay first and
 *                   unremovable — an uncapped step count is an uncapped
 *                   bill. `ResolvedAgent.stopWhen` appends to it.
 *   `_internal`     the SDK's own test seam, not a product knob.
 *
 * Enforced three ways, because a cast defeats the type: the type itself,
 * `pickGenerationOptions` copying only `GENERATION_KEYS` at runtime, and the
 * handler spreading the result *first* so the transport's own keys win.
 */

import type {
  LanguageModelCallOptions,
  PrepareStepFunction,
  RequestOptions,
  StreamTextTransform,
  TelemetryOptions,
  ToolChoice,
  ToolSet,
} from "ai";
import type { streamText } from "ai";

/**
 * Settlement-neutral `streamText` options, sourced from the SDK's own
 * types by indexed access so that a signature change upstream is a
 * compile error here rather than a silently dropped field.
 *
 * Nested under `generation` rather than flattened onto `ResolvedAgent`
 * for a concrete reason: `ai` has its own `reasoning` (an effort level
 * for the model) and `ChatServerConfig.reasoning` already means "stream
 * reasoning parts to the client". Flattening would put two different
 * `reasoning` in one namespace, and every future SDK option would be
 * one name collision away from a framework field.
 */
export interface ChatGenerationOptions {
  /** Ceiling on the tokens the model may produce. */
  maxOutputTokens?: LanguageModelCallOptions["maxOutputTokens"];
  temperature?: LanguageModelCallOptions["temperature"];
  topP?: LanguageModelCallOptions["topP"];
  topK?: LanguageModelCallOptions["topK"];
  presencePenalty?: LanguageModelCallOptions["presencePenalty"];
  frequencyPenalty?: LanguageModelCallOptions["frequencyPenalty"];
  stopSequences?: LanguageModelCallOptions["stopSequences"];
  seed?: LanguageModelCallOptions["seed"];
  /**
   * The model's reasoning effort — not `ChatServerConfig.reasoning`,
   * which decides whether reasoning parts reach the client.
   */
  reasoning?: LanguageModelCallOptions["reasoning"];
  /** Retries on a failed provider call. A retried call still reports one `totalUsage`. */
  maxRetries?: RequestOptions["maxRetries"];
  headers?: RequestOptions["headers"];
  /** Picks among the tools the agent already declared; cannot introduce one. */
  toolChoice?: ToolChoice<ToolSet>;
  /** Per-step adjustment inside a loop the transport still caps with `maxSteps`. */
  prepareStep?: PrepareStepFunction<ToolSet>;
  /** Observation only. The current name; `experimental_telemetry` is the SDK's deprecated alias. */
  telemetry?: TelemetryOptions;
  /** Transforms the text stream. Usage is computed from steps, not from the transformed text. */
  experimental_transform?: StreamTextTransform<ToolSet>;
  /** Per-step observation `onTurn` has no equivalent for. */
  onStepEnd?: Parameters<typeof streamText>[0]["onStepEnd"];
}

/**
 * Every key of `ChatGenerationOptions`, as values.
 *
 * `satisfies` proves the array holds only real keys; `Exhaustive` below
 * proves it holds all of them, so a field added to the interface
 * without a line here is a compile error rather than an option that
 * silently never reaches the model.
 */
export const GENERATION_KEYS = [
  "maxOutputTokens",
  "temperature",
  "topP",
  "topK",
  "presencePenalty",
  "frequencyPenalty",
  "stopSequences",
  "seed",
  "reasoning",
  "maxRetries",
  "headers",
  "toolChoice",
  "prepareStep",
  "telemetry",
  "experimental_transform",
  "onStepEnd",
] as const satisfies ReadonlyArray<keyof ChatGenerationOptions>;

/** Fails to compile if `GENERATION_KEYS` misses a key of the interface. */
type Missing = Exclude<
  keyof ChatGenerationOptions,
  (typeof GENERATION_KEYS)[number]
>;
// Stryker disable next-line BooleanLiteral: equivalent — the assertion is the type annotation, which `tsc` checks and the test runner's transform strips; the value itself is never read, so `false` changes nothing a test could observe.
const _exhaustive: Missing extends never ? true : never = true;
void _exhaustive;

/**
 * The allowlisted options, copied by name.
 *
 * Absent keys produce no own property rather than an explicit
 * `undefined`: the handler spreads the result into a call where a
 * present-but-undefined key would override the SDK's own default.
 */
export function pickGenerationOptions(
  options: ChatGenerationOptions | undefined
): Partial<ChatGenerationOptions> {
  if (!options) return {};
  const picked: Record<string, unknown> = {};
  for (const key of GENERATION_KEYS) {
    if (options[key] !== undefined) picked[key] = options[key];
  }
  return picked as Partial<ChatGenerationOptions>;
}
