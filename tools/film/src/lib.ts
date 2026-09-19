/** Join truthy class names. No conflict-resolution needed here — every
 * className in this project is a fixed, non-overlapping list. */
export function cn(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}
