/**
 * Reading the numbers in a text by value and unit, for the number check
 * (`./number-check.ts`): every number a reply writes must be one a tool
 * returned or the reader said.
 *
 * Numbers compare by value, however they are written: 2 500 000,
 * 2,500,000, 2.500.000 and "2.5 million" are one number; "2,5" is two
 * and a half; digits of other scripts (᠒, ２, ٢) and styled digits
 * (𝟔) count as digits. A group of three digits after a separator is
 * always a group, so "1.234" is one thousand two hundred thirty-four.
 *
 * Only two kinds pass without a source, and only bare: a small count
 * (0–12) and a year said as a year ("in 2027"). A number with a unit —
 * a currency sign or code, a percent, a scale word, a unit word of the
 * language — is a figure and must be sourced; so is a date. An amount
 * spelled out in words cannot be checked, so it is refused.
 *
 * A known number keeps the unit it was given — a tool output field's
 * name (`minUsd`, `sharePercent`, `testScore`), the sign or word around
 * it — and a figure must match its value and its unit. Digits inside a
 * link or a UUID are no number, and a tool output's id, slug and link
 * fields are skipped.
 *
 * What is language — scale words, unit words, how a year or a date is
 * said, number words — is a `NumberVocabulary`. English and Mongolian
 * ship here; a product passes its own for another language.
 */

/**
 * What a number measures: "percent", "score", "year", "date", or a
 * currency's ISO code in lowercase ("usd", "mnt"). A vocabulary may
 * name its own.
 */
export type NumberUnit = string;

/** Each known value with the units it was given; `null` is a value given without one. */
export type KnownNumbers = Map<string, Set<NumberUnit | null>>;

type UnitRule = { unit: NumberUnit; pattern: RegExp };

/** The language a number check reads. */
export interface NumberVocabulary {
  /** One letter of the language, as a regex character class: what continues a word. */
  letter: string;
  /**
   * Scale words after a number ("2.5 million"): each a regex source
   * for the whole word, abbreviations and endings included, and what
   * it multiplies by.
   */
  scales?: ReadonlyArray<{ word: string; value: number }>;
  /** Units from the words right after a number, anchored at `^`, first match wins. */
  after?: ReadonlyArray<UnitRule>;
  /** Units from the words right before it, anchored at `$`. */
  before?: ReadonlyArray<UnitRule>;
  /** Amounts spelled out in words ("two million", "fifty percent"), global regexes. */
  spelled?: ReadonlyArray<RegExp>;
}

const ENGLISH_NUMBER_WORD =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|half)";
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

export const ENGLISH_NUMBERS: NumberVocabulary = {
  letter: "[a-z]",
  scales: [
    { word: "thousands?|k", value: 1_000 },
    { word: "millions?|mn", value: 1_000_000 },
    { word: "billions?|bn", value: 1_000_000_000 },
  ],
  after: [
    { unit: "percent", pattern: /^\s*(?:percent|per\s+cent|pct)\b/iu },
    { unit: "usd", pattern: /^\s*dollars?\b/iu },
    { unit: "eur", pattern: /^\s*euros?\b/iu },
    { unit: "score", pattern: /^\s*points?\b/iu },
    { unit: "date", pattern: /^(?:st|nd|rd|th)\b/iu },
    { unit: "date", pattern: new RegExp(`^\\s+(?:of\\s+)?${MONTH}\\b`, "iu") },
  ],
  before: [
    { unit: "date", pattern: new RegExp(`\\b${MONTH}\\.?\\s+$`, "iu") },
    {
      unit: "year",
      pattern: /\b(?:in|since|by|until|till|before|after|during)\s+$/iu,
    },
  ],
  spelled: [
    // "two million", "a thousand", "three hundred thousand".
    new RegExp(
      `\\b(?:a|${ENGLISH_NUMBER_WORD})(?:[\\s-]+${ENGLISH_NUMBER_WORD})*\\s+(?:thousand|million|billion)\\b`,
      "giu"
    ),
    // "fifty percent", "twenty dollars" — never "a point" or "a dollar".
    new RegExp(
      `\\b${ENGLISH_NUMBER_WORD}(?:[\\s-]+${ENGLISH_NUMBER_WORD})*\\s+(?:percent|per\\s+cent|dollars|euros)\\b`,
      "giu"
    ),
  ],
};

/** A Cyrillic letter: what follows a stem that has not ended. */
const MN_LETTER = "[а-яөүё]";
/** Number words, plain and attributive (тав/таван, тавь/тавин, зуу/зуун), and хагас. */
const MN_NUMBER_WORD =
  "(?:нэг|хоёр|гурав|гурван|дөрөв|дөрвөн|тав|таван|зургаа|зургаан|долоо|долоон|найм|найман|ес|есөн|арав|арван|хорь|хорин|гуч|гучин|дөч|дөчин|тавь|тавин|жар|жаран|дал|далан|ная|наян|ер|ерэн|зуу|зуун|хагас)";

export const MONGOLIAN_NUMBERS: NumberVocabulary = {
  letter: MN_LETTER,
  scales: [
    { word: `мян${MN_LETTER}*\\.?`, value: 1_000 },
    { word: `сая${MN_LETTER}*`, value: 1_000_000 },
    { word: `тэрбум${MN_LETTER}*`, value: 1_000_000_000 },
  ],
  after: [
    { unit: "percent", pattern: /^\s*хувь/iu },
    { unit: "mnt", pattern: /^\s*төг/iu },
    { unit: "usd", pattern: /^\s*(?:ам\.?\s*)?доллар/iu },
    // Before "оноо": "2027 оноос" is a year, "600 оноо" a score.
    {
      unit: "year",
      pattern: new RegExp(
        `^\\s*(?:[-–—/]\\s*\\d{2,4}\\s*)?(?:он(?:ы|д|ыг|оос|той)?(?!${MN_LETTER})|хичээлийн)`,
        "iu"
      ),
    },
    { unit: "score", pattern: /^\s*оноо/iu },
    // A calendar month: "3-р сар", "3 дугаар сар", "3 сарын 1".
    {
      unit: "date",
      pattern:
        /^(?:\s*-?\s*р\s+сар|\s+(?:дугаар|дүгээр)\s+сар|\s+сарын\s+\d)/iu,
    },
    // A day: "1-нд", "1-ний", "15-ны".
    { unit: "date", pattern: new RegExp(`^\\s*-\\s*н${MN_LETTER}*`, "iu") },
  ],
  before: [
    // A day after its month: "3 сарын 1".
    { unit: "date", pattern: /сарын\s*$/iu },
  ],
  spelled: [
    // A scale word with no digits before it: "хоёр сая", "олон мянга".
    new RegExp(
      `(?<![\\d.,]\\s*)(?<!${MN_LETTER})(?:[^\\s\\d]+\\s+)?(?:сая|мянга|тэрбум)${MN_LETTER}*`,
      "giu"
    ),
    // Number words right before a unit: "тавин хувь", "хоёр зуун оноо".
    new RegExp(
      `(?<!${MN_LETTER})${MN_NUMBER_WORD}(?:\\s+${MN_NUMBER_WORD})*\\s+(?:оноо|хувь(?!\\s+хүн)|төгрөг|₮|доллар)`,
      "giu"
    ),
  ],
};

/** Currency signs, before or after a number. */
const CURRENCY_SIGNS: Record<string, NumberUnit> = {
  $: "usd",
  "€": "eur",
  "£": "gbp",
  "¥": "jpy",
  "₩": "krw",
  "₹": "inr",
  "₽": "rub",
  "₮": "mnt",
};
/** None of the signs is special inside a character class. */
const SIGNS = `[${Object.keys(CURRENCY_SIGNS).join("")}]`;
const CURRENCY_CODES = "usd|eur|gbp|jpy|cny|krw|inr|rub|mnt|aud|cad|chf";

function currencyOf(found: string): NumberUnit {
  return CURRENCY_SIGNS[found] ?? found.toLowerCase();
}

/** Units that read the same in any language: a currency sign or code, a percent sign. */
function coreUnit(before: string, after: string): NumberUnit | null {
  const sign = new RegExp(
    `(${SIGNS}|(?<![a-z])(?:${CURRENCY_CODES}))\\s*$`,
    "iu"
  ).exec(before);
  if (sign) return currencyOf(sign[1]!);
  if (/^\s*%/u.test(after)) return "percent";
  const trailing = new RegExp(
    `^\\s*(${SIGNS}|(?:${CURRENCY_CODES})(?![a-z]))`,
    "iu"
  ).exec(after);
  if (trailing) return currencyOf(trailing[1]!);
  return null;
}

/**
 * Mongolian (᠐–᠙), full-width (０–９) and Arabic-Indic (٠–٩) digits, as
 * ASCII; NFKC first, so styled digits (𝟔𝟓𝟎, ⁶) are digits too.
 */
function asciiDigits(text: string) {
  return text.normalize("NFKC").replace(/[᠐-᠙０-９٠-٩]/gu, (d) => {
    const code = d.charCodeAt(0);
    const zero = code >= 0xff10 ? 0xff10 : code >= 0x1810 ? 0x1810 : 0x0660;
    return String(code - zero);
  });
}

/** The separators a grouped number uses: spaces of every width, comma, dot, apostrophes. */
const GROUP_SEP = "[\\u0020\\u00a0\\u2009\\u202f,.’']";
/** 2 500 000, 2,500,000, 2.500.000, 1,234.56 — one separator throughout, then a decimal part. */
const GROUPED = `\\d{1,3}(?:(?<sep>${GROUP_SEP})\\d{3})(?:\\k<sep>\\d{3})*(?!\\d)(?:(?!\\k<sep>)[.,]\\d+)?`;
/** 0.7, 2,5 — a decimal comma takes one or two digits, three are a group. */
const PLAIN = "\\d+(?:\\.\\d+|,\\d{1,2}(?!\\d))?";

/** Spans whose digits are no number: a link, a UUID. */
const NOT_NUMBERS =
  /(?:https?:\/\/|www\.)[^\s)\]>"']+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

/** A written date: 2027-03-01, 2027.03.01, 2026-10-01T12:34:56.789Z, 01.03.2027. */
const DATE =
  /(?<!\d)(?:\d{4}([-./])\d{1,2}\1\d{1,2}(?:T\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}([./])\d{1,2}\2\d{4})(?!\d)/gu;

/** A field that names or links a thing (`id`, `positionId`, `slug`, `url`): its digits are no figure. */
const NOT_A_FIGURE = /^(?:id|ids|slug|url|href)$|(?:Id|Ids|Slug|Url|Href)$/u;

/** A tool output field's unit, from its name (`minUsd`, `sharePercent`, `testScore`). */
export function unitOfField(key: string): NumberUnit | null {
  const currency = new RegExp(`(${CURRENCY_CODES})$`, "iu").exec(key);
  if (currency) return currency[1]!.toLowerCase();
  if (/score$/iu.test(key)) return "score";
  if (/percent$|share$/iu.test(key)) return "percent";
  if (/(^y|Y)ear$/u.test(key)) return "year";
  return null;
}

interface NumberToken {
  /** The value as a canonical string ("2500000", "0.7"). */
  value: string;
  scaled: boolean;
  unit: NumberUnit | null;
  /** A written date, whole ("2027-03-15"), or one part of one. */
  date?: "whole" | "part";
}

function canonical(raw: string, separator: string | undefined, scale: number) {
  const digits = separator
    ? raw.split(separator).join("").replace(",", ".")
    : raw.replace(",", ".");
  const value = Number(digits) * scale;
  // Round away float noise from scaling (2.2 × 1e6).
  return Number.isFinite(value)
    ? String(Math.round(value * 1e6) / 1e6)
    : digits;
}

/** `text` with `pattern`'s matches blanked out, its length kept so positions still line up. */
function blank(text: string, pattern: RegExp) {
  return text.replace(pattern, (m) => " ".repeat(m.length));
}

function add(known: KnownNumbers, value: string, unit: NumberUnit | null) {
  const units = known.get(value) ?? new Set<NumberUnit | null>();
  units.add(unit);
  known.set(value, units);
}

function holds(known: KnownNumbers, n: NumberToken) {
  const units = known.get(n.value);
  if (!units) return false;
  // A date's month or day matches only a date: every day 1–31 is in some other number.
  if (n.unit === "date") return units.has("date");
  return n.unit === null || units.has(null) || units.has(n.unit);
}

function allowedAlways(n: NumberToken) {
  // A unit makes a number a figure; only a year said as a year may pass bare.
  if (n.scaled || (n.unit !== null && n.unit !== "year")) return false;
  const v = Number(n.value);
  if (!Number.isInteger(v)) return false;
  if (v >= 0 && v <= 12) return true;
  return v >= 1990 && v <= 2035 && n.unit === "year";
}

/** Reads numbers in the given languages; the same reader must build `known` and check against it. */
export interface NumberReader {
  /** Adds the numbers of `text`, each with `unit`, else the one written around it. */
  addText(
    known: KnownNumbers,
    text: string,
    unit?: NumberUnit | null
  ): KnownNumbers;
  /** Adds every number in a JSON value (a tool's output), each with the unit its field's name gives. */
  addJson(
    known: KnownNumbers,
    value: unknown,
    unit?: NumberUnit | null
  ): KnownNumbers;
  /** Amounts written in words. */
  spelledAmounts(text: string): string[];
  /** The numbers in `text` that `known` does not hold with that unit, and every amount spelled out in words. */
  unknownNumbers(known: KnownNumbers, text: string): string[];
}

export function createNumberReader(
  vocabularies: ReadonlyArray<NumberVocabulary> = [ENGLISH_NUMBERS]
): NumberReader {
  const letter = `(?:${vocabularies.map((v) => v.letter).join("|") || "[a-z]"})`;
  const scales = vocabularies.flatMap((v) => v.scales ?? []);
  const scaleWords = scales.map((s) => `(?:${s.word})`).join("|");
  const number = new RegExp(
    `(?<num>${GROUPED}|${PLAIN})${
      scaleWords ? `(?:\\s*(?<scale>${scaleWords})(?!${letter}))?` : ""
    }`,
    "giu"
  );
  const scaleOf = (word: string | undefined) => {
    if (!word) return 1;
    const found = scales.find((s) =>
      new RegExp(`^(?:${s.word})$`, "iu").test(word)
    );
    return found?.value ?? 1;
  };

  function unitAround(before: string, after: string): NumberUnit | null {
    const core = coreUnit(before, after);
    if (core) return core;
    for (const vocabulary of vocabularies) {
      for (const rule of vocabulary.after ?? [])
        if (rule.pattern.test(after)) return rule.unit;
      for (const rule of vocabulary.before ?? [])
        if (rule.pattern.test(before)) return rule.unit;
    }
    return null;
  }

  function tokens(text: string): NumberToken[] {
    const t = blank(asciiDigits(text), NOT_NUMBERS);
    const found: { at: number; token: NumberToken }[] = [];
    // A written date is read whole: each part is a date's, never a count or a figure.
    for (const m of t.matchAll(DATE)) {
      const parts = [...m[0].matchAll(/\d+/gu)];
      for (const part of parts)
        found.push({
          at: (m.index ?? 0) + (part.index ?? 0),
          token: {
            value: canonical(part[0], undefined, 1),
            scaled: false,
            unit: "date",
            date: "part",
          },
        });
      const [a, b, c] = parts.map((p) => p[0]);
      const [y, mo, d] = a!.length === 4 ? [a!, b!, c!] : [c!, b!, a!];
      found.push({
        at: m.index ?? 0,
        token: {
          value: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
          scaled: false,
          unit: "date",
          date: "whole",
        },
      });
    }
    const rest = blank(t, DATE);
    for (const m of rest.matchAll(number)) {
      const scale = scaleOf(m.groups?.scale);
      const start = m.index ?? 0;
      const end = start + m[0].length;
      found.push({
        at: start,
        token: {
          value: canonical(m.groups!.num!, m.groups?.sep, scale),
          scaled: scale !== 1,
          unit: unitAround(
            rest.slice(Math.max(0, start - 16), start),
            rest.slice(end, end + 24)
          ),
        },
      });
    }
    return found.sort((a, b) => a.at - b.at).map((f) => f.token);
  }

  function addText(
    known: KnownNumbers,
    text: string,
    unit: NumberUnit | null = null
  ): KnownNumbers {
    // A date's parts stay a date's, whatever the field says.
    for (const n of tokens(text))
      add(known, n.value, n.unit === "date" ? "date" : (unit ?? n.unit));
    return known;
  }

  function addJson(
    known: KnownNumbers,
    value: unknown,
    unit: NumberUnit | null = null
  ): KnownNumbers {
    // Text never carries a sign the reader sees as part of the number.
    if (typeof value === "number")
      add(known, canonical(String(Math.abs(value)), undefined, 1), unit);
    else if (typeof value === "string") addText(known, value, unit);
    else if (Array.isArray(value))
      for (const item of value) addJson(known, item, unit);
    else if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value))
        if (!NOT_A_FIGURE.test(key)) addJson(known, item, unitOfField(key));
    return known;
  }

  function spelledAmounts(text: string): string[] {
    const t = asciiDigits(text);
    return vocabularies.flatMap((v) =>
      (v.spelled ?? []).flatMap((pattern) =>
        [...t.matchAll(pattern)].map((m) => m[0].trim())
      )
    );
  }

  function unknownNumbers(known: KnownNumbers, text: string): string[] {
    // A written date is checked whole, never part by part.
    const unknown = tokens(text)
      .filter((n) => n.date !== "part" && !holds(known, n) && !allowedAlways(n))
      .map((n) => n.value);
    return [...new Set([...unknown, ...spelledAmounts(text)])];
  }

  return { addText, addJson, spelledAmounts, unknownNumbers };
}
