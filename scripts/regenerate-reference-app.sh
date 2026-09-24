#!/usr/bin/env bash
# Regenerate apps/app the way a consumer gets an app: `intelligo create`,
# then `intelligo sync` for every registry item. The
# files in scripts/reference-app-owned.json are kept; every other file is
# the CLI's output, untouched. `--check` fails if the result differs from
# what is committed — someone edited a generated file by hand.
set -euo pipefail

R="$(cd "$(dirname "$0")/.." && pwd)"
APP="$R/apps/app"
CHECK=false
[ "${1:-}" = "--check" ] && CHECK=true
cd "$R"

KEEP="$(mktemp -d)"
trap 'rm -rf "$KEEP"' EXIT

# Recreating the app makes pnpm resolve its importer again, which can
# move versions nobody asked to move. The lockfile is put back unless
# the regenerated app really needs a different one.
cp pnpm-lock.yaml "$KEEP/pnpm-lock.yaml"

echo "› keeping the files the app owns"
node -e '
  const fs = require("fs"), path = require("path");
  const [app, keep, list] = process.argv.slice(1);
  for (const file of Object.keys(JSON.parse(fs.readFileSync(list, "utf8")).files)) {
    const from = path.join(app, file);
    if (!fs.existsSync(from)) { console.error(`  missing owned file: ${file}`); process.exit(1); }
    fs.mkdirSync(path.dirname(path.join(keep, file)), { recursive: true });
    fs.copyFileSync(from, path.join(keep, file));
  }
' "$APP" "$KEEP" "$R/scripts/reference-app-owned.json"

echo "› intelligo create apps/app"
for i in 1 2 3 4 5; do rm -rf "$APP" 2>/dev/null && break; sleep 1; done
pnpm exec tsx packages/cli/src/bin.ts create apps/app --link-workspace >/dev/null
pnpm install --no-frozen-lockfile >/dev/null

echo "› building the registry"
pnpm registry:build >/dev/null
# The CLI prefers the registry its build bundles, and one left over
# from another checkout would install other pages: refresh it from the
# registry just built.
node packages/cli/scripts/sync-registry-requires.mjs >/dev/null

# Every item, through the CLI a consumer runs: `intelligo sync` installs
# each with `shadcn add --overwrite` from the registry just built, in
# requires.json order, and records the result in intelligo.manifest.json.
ITEMS=$(node -e 'console.log(Object.keys(require(process.argv[1]).items).join(" "))' "$R/packages/registry/requires.json")
echo "› intelligo sync intelligo $ITEMS"
cd "$APP"
if ! pnpm exec tsx "$R/packages/cli/src/bin.ts" sync intelligo $ITEMS --force > "$KEEP/.sync.log" 2>&1; then
  echo "  intelligo sync failed:"; tail -30 "$KEEP/.sync.log"; exit 1
fi
tail -1 "$KEEP/.sync.log"
cd "$R"

echo "› restoring the files the app owns"
cd "$R"
node -e '
  const fs = require("fs"), path = require("path");
  const [app, keep, list] = process.argv.slice(1);
  for (const file of Object.keys(JSON.parse(fs.readFileSync(list, "utf8")).files)) {
    fs.mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
    fs.copyFileSync(path.join(keep, file), path.join(app, file));
  }
' "$APP" "$KEEP" "$R/scripts/reference-app-owned.json"
pnpm install --no-frozen-lockfile >/dev/null

LOCK_CHANGED=false
if ! cmp -s pnpm-lock.yaml "$KEEP/pnpm-lock.yaml"; then
  cp "$KEEP/pnpm-lock.yaml" pnpm-lock.yaml
  if ! pnpm install --frozen-lockfile >/dev/null 2>&1; then
    pnpm install --no-frozen-lockfile >/dev/null
    LOCK_CHANGED=true
    echo "! pnpm-lock.yaml changed: the regenerated app needs different dependencies"
  fi
fi

if $CHECK; then
  if $LOCK_CHANGED; then
    echo "apps/app needs a different lockfile than the one committed:"
    git diff --stat -- pnpm-lock.yaml
    exit 1
  fi
  # next-env.d.ts is Next's: `next dev` and `next build` each write their
  # own, so which one is on disk says only which command ran last.
  DRIFT="$(git status --porcelain -- apps/app ':!apps/app/next-env.d.ts')"
  if [ -n "$DRIFT" ]; then
    echo "apps/app is not the CLI's output — a generated file was edited by hand:"
    echo "$DRIFT" | head -40
    exit 1
  fi
  echo "✓ apps/app is exactly the CLI's output plus its owned files"
else
  git status --short -- apps/app | head -40
fi
