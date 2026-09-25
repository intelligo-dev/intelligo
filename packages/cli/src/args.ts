/**
 * The flags a command accepts. A flag it does not know is an error
 * rather than ignored: `sync --chek` must not apply, and `add --all`
 * must not look as if it did something.
 */

export function unknownFlags(
  args: readonly string[],
  allowed: readonly string[]
): string[] {
  return args.filter((arg) => arg.startsWith("-") && !allowed.includes(arg));
}

export function wantsHelp(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

/** `a,b c` → `["a", "b", "c"]`: items as `create --items` takes them, or space-separated. */
export function itemNames(args: readonly string[]): string[] {
  return args
    .filter((arg) => !arg.startsWith("-"))
    .flatMap((arg) => arg.split(","))
    .map((name) => name.trim())
    .filter(Boolean);
}
