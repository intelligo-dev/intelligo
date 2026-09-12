/**
 * The default conversation title: the first line of the opening
 * message, truncated to something a sidebar can list.
 */

const MAX_TITLE_LENGTH = 60;

/** First line, trimmed, truncated — enough to tell history rows apart. */
export function truncateTitle(firstUserText: string): string | null {
  const line = firstUserText.trim().split("\n")[0]?.trim();
  if (!line) return null;
  return line.length <= MAX_TITLE_LENGTH
    ? line
    : `${line.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}
