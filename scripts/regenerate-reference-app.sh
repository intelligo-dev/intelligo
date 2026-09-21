#!/usr/bin/env bash
# Regenerate apps/app the way a consumer gets an app: `intelligo create`,
# then `shadcn add` for every registry item in requires.json order. The
# files in scripts/reference-app-owned.json are kept; every other file is
# the CLI's output, untouched. `--check` fails if the result differs from
# what is committed — someone edited a generated file by hand.
set -euo pipefail

R="$(cd "$(dirname "$0")/.." && pwd)"
APP="$R/apps/app"
PORT="${INTELLIGO_REGISTRY_PORT:-8399}"
CHECK=false
[ "${1:-}" = "--check" ] && CHECK=true
cd "$R"

KEEP="$(mktemp -d)"
trap 'rm -rf "$KEEP"; [ -n "${SERVER:-}" ] && kill "$SERVER" 2>/dev/null || true' EXIT

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

echo "› building and serving the registry"
pnpm registry:build >/dev/null
node -e '
  const http = require("http"), fs = require("fs"), path = require("path");
  const root = process.argv[1];
  http.createServer((req, res) => {
    fs.readFile(path.join(root, decodeURIComponent(req.url.split("?")[0])), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": "application/json" }); res.end(data);
    });
  }).listen(Number(process.argv[2]));
' "$R/packages/registry/public/r" "$PORT" &
SERVER=$!
for i in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/intelligo.json" >/dev/null && break; sleep 0.5; done

# Items name Intelligo's components as @intelligo/<name>; resolve them from
# the registry just built, then put back exactly what the scaffold wrote.
cd "$APP"
cp components.json "$KEEP/.components.json.scaffold"
node -e '
  const fs = require("fs"); const c = JSON.parse(fs.readFileSync("components.json", "utf8"));
  c.registries = { ...c.registries, "@intelligo": `http://127.0.0.1:${process.argv[1]}/{name}.json` };
  fs.writeFileSync("components.json", JSON.stringify(c, null, 2) + "\n");
' "$PORT"

echo "› shadcn add intelligo and every item"
pnpm exec shadcn add "$R/packages/registry/public/r/intelligo.json" --yes --overwrite >/dev/null
ORDER=$(node -e '
  const { items } = require(process.argv[1]); const out = [], done = new Set();
  const visit = (n) => { if (done.has(n)) return; done.add(n); for (const d of items[n].items ?? []) visit(d); out.push(n); };
  for (const n of Object.keys(items)) visit(n); console.log(out.join(" "));
' "$R/packages/registry/requires.json")
for item in $ORDER; do
  if ! pnpm exec shadcn add "$R/packages/registry/public/r/$item.json" --yes --overwrite > "$KEEP/.shadcn-$item.log" 2>&1; then
    echo "  shadcn add $item failed:"; tail -20 "$KEEP/.shadcn-$item.log"; exit 1
  fi
  echo "  $item"
done
cp "$KEEP/.components.json.scaffold" components.json

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
