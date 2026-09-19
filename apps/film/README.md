# film

The project film — one minute, silent, rendered with Remotion. It plays
muted wherever it is embedded (the README, the homepage), so the story is
carried by the line in the lower third; the stage shows the registry's
own shell, dashboard, chat and usage components (`src/ui`, see
`scripts/sync-ui.mjs`), not drawings of them.

## The script

Problem → promise → proof → ownership → call to action. `BEATS` in
`src/Film.tsx` is the source; this table is its reading copy.

| #   | Seconds | On the stage                                                 | The line                                                                                    |
| --- | ------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 01  | 0–7     | An agent that works, then the empty slots a product needs    | _Your agent works._ → _It isn't a product yet._ → _That half is the same in every AI SaaS._ |
| 02  | 7–13    | The terminal: `create`, the packages, the pages              | _Intelligo ships that half. One command._                                                   |
| 03  | 13–25   | Auth, dashboard, chat, settings and billing assemble         | _Every page lands as your own source._                                                      |
| 04  | 25–30   | The real shell and dashboard                                 | _A running product. Day one._                                                               |
| 05  | 30–42   | A message crosses the execution boundary: admit, run, settle | _Your agent runs unmodified._                                                               |
| 06  | 42–48   | The usage page: that run settling onto the books             | _Every run, accounted for._                                                                 |
| 07  | 48–54   | `lib/chat-config.tsx` edited, the header hot-reloads         | _Make it yours — config, not forks._                                                        |
| 08  | 54–60   | The closing card, with the `create` command                  | _You build the agent. Intelligo is everything around it._                                   |

Acts 01–02 stand alone as the short cut (`pnpm --filter film
render:teaser`): the problem, then "One command".

Everything on screen exists today; a beat that needs a feature the
framework does not have does not go in the film.

Not deployed, not published, no CI job renders it — this is a one-off
production tool. Its `out/` (rendered video) and `build/` (bundled)
directories are gitignored.

## Commands

```bash
pnpm --filter film dev          # Remotion Studio — scrub the timeline, inspect any frame
pnpm --filter film render       # renders out/film-light.mp4
pnpm --filter film render:dark  # renders out/film-dark.mp4
pnpm --filter film render:teaser # the first two acts, out/teaser-light.mp4
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
