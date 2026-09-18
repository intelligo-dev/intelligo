# film

The homepage's "film" — terminal, pages assembling, make it yours, your
product, the run, time passes — as a rendered video instead of the
scroll-driven interactive version that used to live at
`apps/site/src/components/film.tsx`. `src/Film.tsx` started as a faithful
port of that component (`p` became `frame / durationInFrames`, every
`useTransform` a plain `interp()` call — `src/interp.ts` — evaluated once
per frame instead of a reactive value graph) and was then redesigned: a
new act order, and sidebar/topbar/dashboard wireframes corrected against
the real `app-shell`/`dashboard` registry items instead of the original's
invented ones. See the file's own top-of-file comment for what changed
and why.

Not deployed, not published, no CI job renders it — this is a one-off
production tool. Its `out/` (rendered video) and `build/` (bundled)
directories are gitignored.

## Commands

```bash
pnpm --filter film dev          # Remotion Studio — scrub the timeline, inspect any frame
pnpm --filter film render       # renders out/film-light.mp4
pnpm --filter film render:dark  # renders out/film-dark.mp4
pnpm --filter film lint
pnpm --filter film type-check
```

Both renders come from the same composition (`id="Film"`) — `theme` is a
render prop (`--props={"theme":"..."}`), not two separate compositions.

## After rendering

Neither `out/film-light.mp4` nor `out/film-dark.mp4` is committed or
auto-deployed — upload each to wherever they're meant to be hosted (R2,
YouTube, etc.) and point `apps/site/src/lib/site.ts`'s
`SITE.filmVideoUrl` at whichever one the homepage should embed (light and
dark aren't both wired up there yet — see that file's comment). While
`SITE.filmVideoUrl` is empty the homepage leaves the `#film` section out
and the hero's scroll cue points at the next section; set the URL (and
optionally `SITE.filmPosterUrl`) and both come back.

## Data

`src/data.ts` is a point-in-time snapshot of what the film's beats name —
registry item groups, the framework package ids the terminal's `pnpm add`
line lists, and the version that types into it. It isn't synced from
`packages/registry/registry.json` automatically (unlike everything
`apps/site` shows about the framework) — a rendered video is a snapshot,
not a live page. Update it by hand, from that file and
`packages/core/package.json`'s version, if the story ever needs a refresh.

## Design tokens

`src/index.css` carries the light _and_ dark halves of the token
contract (`apps/site/src/styles/global.css` — the same CSS `shadcn add
https://intelligo.dev/r/intelligo.json` writes into a consumer), trimmed
to what this film's classNames use. `Film`'s `theme` prop toggles a
`dark` class on the composition root, exactly the way the site stamps it
on `<html>`. `var(--amber)` in `Film.tsx` is deliberately left undefined
in both light and dark, matching the site: there's no `--amber` token in
the design system, so it falls back to the inherited color — the same
grayscale "emphasis, not a real color" look the site has.
