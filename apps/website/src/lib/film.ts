/**
 * The film's eight acts: where each starts, in seconds, its title card
 * and the line a muted viewer reads under it. The homepage seeks by
 * `at`, and `public/film/film.en.vtt` carries the same lines as
 * captions. tests/architecture/docs.test.ts holds the titles, lines and
 * starts to the composition (tools/film/src/Film.tsx).
 */
export const FILM_SECONDS = 60;

export const FILM_CHAPTERS = [
  {
    n: "01",
    at: 0,
    title: "The other half",
    line: "Your agent works. It isn't a product yet.",
  },
  {
    n: "02",
    at: 7.2,
    title: "One command",
    line: "Intelligo ships that half. One command.",
  },
  {
    n: "03",
    at: 13.2,
    title: "Pages assemble",
    line: "Every page lands as your own source.",
  },
  {
    n: "04",
    at: 25.2,
    title: "Your product",
    line: "A running product. Day one.",
  },
  {
    n: "05",
    at: 30,
    title: "The execution boundary",
    line: "Your agent runs unmodified.",
  },
  {
    n: "06",
    at: 42,
    title: "On the record",
    line: "Every run, accounted for.",
  },
  {
    n: "07",
    at: 48,
    title: "Make it yours",
    line: "Make it yours — config, not forks.",
  },
  {
    n: "08",
    at: 54,
    title: "Now build yours",
    line: "You build the agent. Intelligo is everything around it.",
  },
] as const;
