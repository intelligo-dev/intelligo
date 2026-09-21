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
#   2. every registry item, served over HTTP from this tree's build,
#      installs with the shadcn CLI in requires.json order;
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
REGISTRY_PORT=8399
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

# Every @intelligo-dev/* resolves to this tree's tarball. pnpm 9 and 10
# read overrides from package.json, pnpm 11 only from
# pnpm-workspace.yaml, which is also where it wants build approvals.
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
  "packages: []",
  "overrides:",
  ...Object.entries(overrides).map(([k, v]) => `  "${k}": "${v}"`),
  "allowBuilds:",
  "  '@parcel/watcher': false",
  "  '@swc/core': false",
  "  esbuild: false",
];
fs.writeFileSync("pnpm-workspace.yaml", yaml.join("\n") + "\n");
EOF
# That file makes the app a workspace root to pnpm 9 and 10, which
# refuse the plain `pnpm add` the shadcn CLI runs there.
echo "ignore-workspace-root-check=true" >> .npmrc
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

step "every registry item installs over HTTP"
npx --yes http-server@14.1.1 "$ROOT/packages/registry/public/r" -p "$REGISTRY_PORT" -s &
servers+=($!)
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$REGISTRY_PORT/intelligo.json" >/dev/null && break
  sleep 1
done
# Items name Intelligo's components as @intelligo/<name>: point the
# namespace at this tree's build, not the deployed site.
node -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync("components.json", "utf8"));
c.registries = { ...c.registries, "@intelligo": process.argv[1] };
fs.writeFileSync("components.json", JSON.stringify(c, null, 2));
' "http://127.0.0.1:$REGISTRY_PORT/{name}.json"
order=$(node -e '
const { items } = require(process.argv[1]);
const out = [], done = new Set();
const visit = (n) => {
  if (done.has(n)) return;
  done.add(n);
  for (const d of items[n].items ?? []) visit(d);
  out.push(n);
};
for (const n of Object.keys(items)) visit(n);
console.log(out.join(" "));
' "$ROOT/packages/registry/requires.json")
for item in $order; do
  echo "--- $item"
  pnpm exec shadcn add "http://127.0.0.1:$REGISTRY_PORT/$item.json" --yes --overwrite \
    >"$WORK/add-$item.log" 2>&1 || { tail -30 "$WORK/add-$item.log"; fail "shadcn add $item failed"; }
done
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
