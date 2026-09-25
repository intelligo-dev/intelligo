#!/usr/bin/env bash
# What a consumer gets from npm, proven outside the monorepo.
#
# Packs every published package, scaffolds an app with the packed CLI
# in a directory no workspace encloses, and installs the tarballs in
# place of the registry's versions — no `--link-workspace`, no
# `workspace:*`, no tsconfig reaching back into this tree. Then:
#
#   1. the bare scaffold type-checks, builds, and answers 401 on
#      /api/assistant (composition root, auth, execution boundary);
#   2. every registry item installs through the packed CLI's
#      `intelligo sync`, and `sync --check` finds no drift;
#   3. the full app type-checks, builds, serves /registry-smoke and
#      redirects an unauthenticated /dashboard to login.
#
# Expects `pnpm turbo build` and `pnpm registry:build` to have run.
# Needs no database: nothing here queries one.
#
# Usage: scripts/consumer-smoke.sh [work-dir]   (default: a mktemp dir)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${1:-$(mktemp -d)}
TARBALLS="$WORK/tarballs"
APP="$WORK/consumer"
APP_PORT=3100

step() { echo; echo "=== $*"; }
fail() { echo "consumer-smoke: $*" >&2; exit 1; }

# Build-time configuration only; nothing connects to these.
export DATABASE_URL=postgresql://consumer:consumer@localhost:5432/unused
export BETTER_AUTH_SECRET=consumer_smoke_secret_000000000000000000000000
export CRON_SECRET=consumer_smoke_secret_000000000000000000000000
export NEXT_PUBLIC_APP_URL=http://localhost:$APP_PORT
export NEXT_TELEMETRY_DISABLED=1

servers=()
cleanup() {
  for pid in ${servers[@]+"${servers[@]}"}; do kill "$pid" 2>/dev/null || true; done
  # `next start` serves from a child process that outlives its parent;
  # stop whatever holds the app's port, and nothing else.
  lsof -ti "tcp:$APP_PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
}
trap cleanup EXIT

rm -rf "$TARBALLS" "$APP"
mkdir -p "$TARBALLS"

step "pack"
for dir in "$ROOT"/packages/*/; do
  [ "$(node -p "require('$dir/package.json').private === true")" = "true" ] && continue
  (cd "$dir" && pnpm pack --pack-destination "$TARBALLS" >/dev/null)
done
ls "$TARBALLS"

step "scaffold with the packed CLI"
mkdir -p "$WORK/cli"
tar -xzf "$TARBALLS"/intelligo-dev-cli-*.tgz -C "$WORK/cli"
(cd "$WORK/cli/package" && npm install --omit=dev --no-audit --no-fund >/dev/null)
node "$WORK/cli/package/dist/bin.js" create "$APP"
cd "$APP"

# The scaffold's own pnpm settings are what a consumer installs with:
# build scripts declined, `pnpm add` allowed at the root. Every
# @intelligo-dev/* then resolves to this tree's tarball — pnpm 9 and 10
# read overrides from package.json, pnpm 11 only from the workspace file.
grep -q '^allowBuilds:' pnpm-workspace.yaml || fail "the scaffold wrote no pnpm build approvals"
grep -q '^ignore-workspace-root-check=true' .npmrc || fail "the scaffold's .npmrc does not allow pnpm add at the root"
node - "$TARBALLS" <<'EOF'
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const overrides = {};
for (const file of fs.readdirSync(dir)) {
  const m = file.match(/^intelligo-dev-(.+)-\d+\.\d+\.\d+.*\.tgz$/);
  if (m) overrides[`@intelligo-dev/${m[1]}`] = `file:${path.join(dir, file)}`;
}
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
manifest.pnpm = { ...manifest.pnpm, overrides };
fs.writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");
const yaml = [
  "overrides:",
  ...Object.entries(overrides).map(([k, v]) => `  "${k}": "${v}"`),
];
fs.appendFileSync("pnpm-workspace.yaml", yaml.join("\n") + "\n");
EOF
pnpm install --no-frozen-lockfile

# The installed packages must be the tarballs, not what npm serves.
version=$(node -p "require('$ROOT/packages/core/package.json').version")
installed=$(node -p "require('./node_modules/@intelligo-dev/core/package.json').version")
[ "$installed" = "$version" ] || fail "@intelligo-dev/core resolved to $installed, not the packed $version"

probe() {
  local url=$1 method=${2:-GET} code=000
  for _ in $(seq 1 30); do
    if [ "$method" = POST ]; then
      code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url" \
        -H 'content-type: application/json' -d '{"prompt":"ping"}' || true)
    else
      code=$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)
    fi
    [ "$code" != "000" ] && break
    sleep 2
  done
  echo "$code"
}

start() {
  pnpm exec next start --port "$APP_PORT" >"$WORK/next-$1.log" 2>&1 &
  servers+=($!)
}

stop() {
  cleanup
  servers=()
}

step "the bare scaffold type-checks, builds and boots"
pnpm exec tsc --noEmit
pnpm exec next build
start bare
code=$(probe "http://localhost:$APP_PORT/api/assistant" POST)
stop
echo "unauthenticated /api/assistant answered $code"
[ "$code" = "401" ] || fail "expected 401 from /api/assistant, got $code"

step "every registry item installs through the packed CLI"
# `intelligo sync` installs from the registry packed into the CLI — the
# pages of the same release as the packages — one `shadcn add` per item
# in requires.json order, then `--check` proves nothing drifted.
items=$(node -e 'console.log(Object.keys(require(process.argv[1]).items).join(" "))' "$ROOT/packages/registry/requires.json")
pnpm exec intelligo sync intelligo $items --force >"$WORK/sync.log" 2>&1 \
  || { tail -30 "$WORK/sync.log"; fail "intelligo sync failed"; }
# The generated admin console builds with the rest: templates are not
# type-checked anywhere else.
pnpm exec intelligo add admin-page >/dev/null || fail "intelligo add admin-page failed"
tail -2 "$WORK/sync.log"
pnpm exec intelligo sync --check || fail "intelligo sync --check reports drift right after a sync"
pnpm install --no-frozen-lockfile

step "the full app type-checks, builds and boots"
pnpm exec tsc --noEmit
pnpm exec next build
start full
# The default locale carries no prefix, so /registry-smoke is canonical.
page=$(probe "http://localhost:$APP_PORT/registry-smoke")
dashboard=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$APP_PORT/dashboard" || true)
stop
echo "/registry-smoke answered $page, unauthenticated /dashboard answered $dashboard"
[ "$page" = "200" ] || fail "expected 200 from /registry-smoke, got $page"
case "$dashboard" in
  302 | 303 | 307 | 308) ;;
  *) fail "expected /dashboard to redirect to login, got $dashboard" ;;
esac

echo
echo "consumer-smoke: ok ($version, from tarballs, outside the monorepo)"
