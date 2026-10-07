/**
 * The CLI's help text, whole and per command.
 */

export function usage(): string {
  return [
    "intelligo <command>",
    "",
    "  create [dir]      Scaffold an app, then install the registry pages you pick",
    "                    (--items a,b | --all, --yes, --no-install, --name <name>)",
    "  doctor            Report configuration and migration-chain problems, and,",
    "                    with DATABASE_URL, the database's (--offline skips it;",
    "                    --json for CI)",
    "  migrate           Apply the framework's migration chain to DATABASE_URL",
    "  migrate --check   Compare the framework's and the app's migrations to a database",
    "                    (--json: one object whose `state` is up_to_date | pending |",
    "                    fresh | ahead | unmanaged | legacy)",
    "  admin grant <email>  Make a signed-up user a platform admin (--force in production)",
    "  admin revoke <email> Take platform admin away and end its sessions (--force in production)",
    "  add <feature>     Generate consumer-owned source (--force to overwrite)",
    "  upgrade --check   Show what a template upgrade would change (--json)",
    "  upgrade --diff <path>    How your copy differs from the current template",
    "  upgrade --accept <path>  Keep your copy; stop reporting it as a conflict",
    "  sync [items…]     Install registry pages from this release's registry",
    "                    (names space- or comma-separated),",
    "                    keeping seams and merging messages (--force replaces",
    "                    hand-edited files; --check only reports, exit 1 on drift,",
    "                    --json for CI; --diff <path> compares a file, a seam",
    "                    included, with what the registry ships)",
    "  remove <item>     Delete an installed page's files and forget it (seams stay)",
    "  --version         Print the CLI's version",
    "",
    "Exit codes: 0 done, 1 a check found problems or the command failed,",
    "2 the command was used wrongly.",
    "",
  ].join("\n");
}

/**
 * The usage lines of one command: its own line and the indented lines
 * that continue it. The whole usage when the command is unknown.
 */
export function commandUsage(command: string): string {
  const lines = usage().split("\n");
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (/^  \S/.test(line))
      inside =
        line.trimStart().startsWith(`${command} `) || line.trim() === command;
    else if (!/^ {4,}\S/.test(line)) inside = false;
    if (inside) out.push(line);
  }
  return out.length > 0
    ? ["intelligo " + command, "", ...out, ""].join("\n")
    : usage();
}
