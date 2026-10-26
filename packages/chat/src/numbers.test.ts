import { describe, expect, it } from "vitest";

import {
  createNumberReader,
  ENGLISH_NUMBERS,
  MONGOLIAN_NUMBERS,
  unitOfField,
  type KnownNumbers,
} from "./numbers";

const none = (): KnownNumbers => new Map();

describe("English", () => {
  const { addJson, addText, unknownNumbers } = createNumberReader([
    ENGLISH_NUMBERS,
  ]);

  it("compares by value however a number is grouped or scaled", () => {
    const known = addJson(none(), { medianUsd: 2_500_000, share: 0.7 });
    expect(unknownNumbers(known, "The median is $2,500,000.")).toEqual([]);
    expect(unknownNumbers(known, "The median is $2.5 million.")).toEqual([]);
    expect(unknownNumbers(known, "The median is 2 500 000 USD.")).toEqual([]);
    expect(unknownNumbers(known, "The median is $3 million.")).toEqual([
      "3000000",
    ]);
  });

  it("reads a decimal part after the groups", () => {
    const known = addJson(none(), { priceUsd: 1234.56 });
    expect(unknownNumbers(known, "It costs $1,234.56.")).toEqual([]);
    expect(unknownNumbers(known, "It costs $1,234.")).toEqual(["1234"]);
  });

  it("keeps a figure to its unit", () => {
    const known = addJson(none(), { sharePercent: 25, priceUsd: 40 });
    expect(unknownNumbers(known, "About 25% of listings.")).toEqual([]);
    expect(unknownNumbers(known, "About 25 percent of listings.")).toEqual([]);
    expect(unknownNumbers(known, "It costs $25.")).toEqual(["25"]);
    expect(unknownNumbers(known, "It costs 40 euros.")).toEqual(["40"]);
  });

  it("passes small counts and years said as years, bare", () => {
    expect(unknownNumbers(none(), "Three steps: 1, 2 and 3.")).toEqual([]);
    expect(unknownNumbers(none(), "Rates rose in 2027.")).toEqual([]);
    expect(unknownNumbers(none(), "Over 2027 listings.")).toEqual(["2027"]);
    expect(unknownNumbers(none(), "5% more.")).toEqual(["5"]);
  });

  it("keeps a date's parts to dates", () => {
    const known = addText(none(), "Today is 2026-10-02.");
    expect(unknownNumbers(known, "It closes on March 3rd.")).toEqual(["3"]);
    expect(unknownNumbers(known, "Published 2026-10-02.")).toEqual([]);
    expect(unknownNumbers(known, "It closes 2026-03-01.")).toEqual([
      "2026-03-01",
    ]);
  });

  it("refuses an amount spelled out, and leaves a phrase alone", () => {
    expect(unknownNumbers(none(), "It pays two million a year.")).toEqual([
      "two million",
    ]);
    expect(unknownNumbers(none(), "Fifty percent of them.")).toEqual([
      "Fifty percent",
    ]);
    expect(
      unknownNumbers(none(), "That makes a point; a dollar short.")
    ).toEqual([]);
  });

  it("does not read a unit into a word that only starts like a scale", () => {
    expect(unknownNumbers(none(), "A 5 km walk.")).toEqual([]);
  });
});

describe("ids, links and UUIDs source no figure", () => {
  const { addJson, unknownNumbers } = createNumberReader([MONGOLIAN_NUMBERS]);
  const known = addJson(none(), {
    id: "550e8400-e29b-41d4-a716-446655440000",
    programId: 716,
    url: "https://example.com/p/2024/716",
    resultUrl: "https://app.example.com/results/91",
    citation: {
      url: "https://example.org/requirements-2029",
      published: "2026-09-20",
    },
    retrievedAt: "2026-10-01T12:34:56.789Z",
  });

  it("does not take an id's, a link's or a UUID's digits as known", () => {
    expect(unknownNumbers(known, "Босго 716 оноо.")).toEqual(["716"]);
    expect(unknownNumbers(known, "91 хувийн магадлалтай.")).toEqual(["91"]);
    expect(unknownNumbers(known, "2029 оноос хойш босго 446655 оноо.")).toEqual(
      ["446655"]
    );
  });

  it("keeps a date's parts to dates", () => {
    expect(unknownNumbers(known, "20 хувь.")).toEqual(["20"]);
    expect(unknownNumbers(known, "2026-09-20-нд нийтэлсэн.")).toEqual([]);
    expect(unknownNumbers(known, "2026 оны 9 сарын 20-нд нийтэлсэн.")).toEqual(
      []
    );
  });

  it("ignores a link's digits in the reply", () => {
    expect(
      unknownNumbers(
        none(),
        "Дэлгэрэнгүй: https://example.org/requirements-2026"
      )
    ).toEqual([]);
  });
});

describe("Mongolian", () => {
  const { addJson, addText, unknownNumbers } = createNumberReader([
    MONGOLIAN_NUMBERS,
  ]);

  it("refuses a month and a day no source gave, even small ones", () => {
    const known = addText(none(), "Өнөөдөр: 2026-10-02.");
    expect(
      unknownNumbers(known, "Бүртгэл 2027 оны 3 сарын 1-нд хаагдана.")
    ).toEqual(["3", "1"]);
    expect(unknownNumbers(known, "Бүртгэл 3-р сарын 1-нээс эхэлнэ.")).toEqual([
      "3",
      "1",
    ]);
    expect(unknownNumbers(known, "Эцсийн хугацаа 2026.03.05.")).toEqual([
      "2026-03-05",
    ]);
  });

  it("checks a written date whole, however it is written", () => {
    const deadline = addJson(none(), { deadline: "2027-03-15" });
    expect(unknownNumbers(deadline, "Эцсийн хугацаа 2027-15-03.")).toEqual([
      "2027-15-03",
    ]);
    expect(unknownNumbers(deadline, "Эцсийн хугацаа 15.03.2027.")).toEqual([]);
    const first = addJson(none(), { deadline: "2027-03-01" });
    expect(unknownNumbers(first, "Эцсийн хугацаа 2027 оны 3 сарын 1.")).toEqual(
      []
    );
  });

  it("leaves a count of months alone", () => {
    expect(unknownNumbers(none(), "6 сарын хугацаанд, 3 оны өмнө.")).toEqual(
      []
    );
  });

  it("reads scale words, abbreviated, and a currency sign before the number", () => {
    const score = addJson(none(), { thresholdScore: 500 });
    expect(unknownNumbers(score, "Төлбөр нь 500 мян ₮.")).toEqual(["500000"]);
    expect(unknownNumbers(score, "Төлбөр нь 500 мян.₮.")).toEqual(["500000"]);
    expect(unknownNumbers(score, "Төлбөр нь ₮500.")).toEqual(["500"]);
    expect(unknownNumbers(score, "Босго 500 оноо.")).toEqual([]);
    const fee = addJson(none(), { amountMnt: 3_200_000 });
    expect(unknownNumbers(fee, "Төлбөр ₮3,200,000.")).toEqual([]);
    expect(unknownNumbers(fee, "Төлбөр 3.2 сая төгрөг.")).toEqual([]);
    expect(unknownNumbers(fee, "Төлбөр 4 сая төгрөг.")).toEqual(["4000000"]);
  });

  it("reads оноо after a range as a score, not он", () => {
    const known = addJson(none(), { thresholdScore: 600 });
    expect(unknownNumbers(known, "600-700 оноо.")).toEqual(["700"]);
    expect(unknownNumbers(none(), "2027 оноос хойш.")).toEqual([]);
  });

  it("refuses a figure written in number words", () => {
    expect(unknownNumbers(none(), "Босго хоёр зуун тавин оноо.")).toEqual([
      "хоёр зуун тавин оноо",
    ]);
    expect(unknownNumbers(none(), "Тэтгэлэг тавин хувь.")).toEqual([
      "тавин хувь",
    ]);
    expect(unknownNumbers(none(), "Цалин хоёр сая.")).toEqual(["хоёр сая"]);
    expect(unknownNumbers(none(), "Нэг хувь хүн, ер нь.")).toEqual([]);
  });

  it("reads styled digits and other scripts' digits as digits", () => {
    const known = addJson(none(), { thresholdScore: 650 });
    expect(unknownNumbers(none(), "Босго 𝟔𝟓𝟎 оноо.")).toEqual(["650"]);
    expect(unknownNumbers(known, "Босго 𝟔𝟓𝟎 оноо.")).toEqual([]);
    expect(unknownNumbers(known, "Босго ᠖᠕᠐ оноо.")).toEqual([]);
  });
});

describe("unitOfField", () => {
  it("reads a currency, a score, a share and a year from a field's name", () => {
    expect(unitOfField("minMnt")).toBe("mnt");
    expect(unitOfField("priceUsd")).toBe("usd");
    expect(unitOfField("testScore")).toBe("score");
    expect(unitOfField("sharePercent")).toBe("percent");
    expect(unitOfField("marketShare")).toBe("percent");
    expect(unitOfField("startYear")).toBe("year");
    expect(unitOfField("count")).toBeNull();
  });
});
