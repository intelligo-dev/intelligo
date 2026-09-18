import { Composition } from "remotion";
import { Film } from "./Film";

/**
 * 60s @ 30fps — a target length chosen for this port, not recovered from
 * the original (the scroll-driven version has no wall-clock duration,
 * only the relative pacing of its act fractions, which this
 * composition's `Film` component reproduces exactly against however many
 * frames `durationInFrames` turns out to be).
 *
 * One composition, both themes: `theme` is a render prop, not a second
 * `<Composition>` — `pnpm render`/`render:dark` pass it via `--props`.
 * `defaultProps` here only picks what Studio's own preview opens on.
 */
const FPS = 30;
const DURATION_IN_FRAMES = 60 * FPS;

export const FilmComposition = () => {
  return (
    <Composition
      id="Film"
      component={Film}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ theme: "light" }}
    />
  );
};
