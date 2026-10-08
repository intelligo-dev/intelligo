/**
 * How to spawn a package-manager binary on this platform. On Windows
 * the binaries are `.cmd` shims, which only run through `cmd.exe`, and
 * Node joins the command and its arguments for the shell unquoted — so
 * a path or an argument with a space in it is split there. Each is
 * quoted for `cmd.exe` instead. Elsewhere the binary runs directly.
 */
export function spawnCommand(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[]; shell: boolean } {
  if (platform !== "win32") return { command, args: [...args], shell: false };
  // An absolute bin path names the extensionless shell script beside the
  // `.cmd` shim; cmd.exe cannot run that one.
  const shim =
    /[\\/]/.test(command) && !/\.(cmd|bat|exe)$/i.test(command)
      ? `${command}.cmd`
      : command;
  return {
    command: quoteForCmd(shim),
    args: args.map(quoteForCmd),
    shell: true,
  };
}

/** One argument as `cmd.exe` reads it back: quoted when it has to be. */
export function quoteForCmd(value: string): string {
  if (value !== "" && !/[\s"&|<>^()%!,;=]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
