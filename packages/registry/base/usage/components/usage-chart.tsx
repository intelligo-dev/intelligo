"use client";

/**
 * Tokens used per day across the current period.
 *
 * One series over time, so: an area chart in a single hue, no legend
 * (the heading names the series), and a recessive grid. Not a bar per
 * day — thirty bars encode the same thing while making the shape of a
 * month harder to read than a filled line does.
 *
 * Hand-drawn SVG rather than a charting library. A registry item is
 * source a consumer owns, and one small chart is not worth committing
 * every installer to a chart dependency, its version, and its own
 * theming story. The trade is that this is deliberately one chart type,
 * not a chart toolkit: a product that grows a real analytics surface
 * should install the library it wants and replace this file.
 *
 * Two things follow from the SVG stretching (`preserveAspectRatio` is
 * `none`, so the shape fills whatever width it is given): anything that
 * must keep its proportions — a tick label, a point marker, a hit
 * target — is an HTML overlay positioned in percentages, not an SVG
 * child, and every stroke carries `vectorEffect`. The scale the overlay
 * uses is the same fraction the path is drawn with, so they line up at
 * any width.
 *
 * Colour comes from `--primary`, so it follows the app's theme in both
 * light and dark rather than carrying its own palette. Identity is
 * never colour-alone here — there is one series, it is named in the
 * heading, every point is reachable by keyboard, and every value is
 * also in the table underneath (visually hidden, but present for
 * screen readers and for copy-paste).
 */

import { useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import type { UsageDailyPoint } from "@/actions/usage";

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 180;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 20;

interface UsageChartProps {
  points: UsageDailyPoint[];
}

/**
 * `YYYY-MM-DD` as an instant that formats back to that same day.
 *
 * The series is already bucketed in the reader's zone, so a label only
 * has to print the day it already names — projecting it through a zone
 * a second time is what shifts it. Parsed as UTC and formatted as UTC
 * (see `shortDate`), the label is a pure function of the string.
 *
 * It must be, because this renders on both sides: building a
 * machine-local midnight instead made the server and the browser
 * disagree whenever they sat in different zones — a server in +08:00
 * printed "Aug 31" where the reader's browser printed "Sep 1", which
 * React reports as a hydration mismatch.
 */
function dateOf(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

export function UsageChart({ points }: UsageChartProps) {
  const t = useTranslations("usage");
  const format = useFormatter();
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  // A period with a single day has no line to draw, and an all-zero
  // period would divide by zero below.
  if (points.length < 2) return null;

  const max = Math.max(...points.map((point) => point.tokensUsed), 1);
  const plotHeight = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const step = VIEWBOX_WIDTH / (points.length - 1);

  const x = (index: number) => index * step;
  const y = (value: number) =>
    PADDING_TOP + plotHeight - (value / max) * plotHeight;

  /** The same mapping the path uses, as a fraction of the box. */
  const topPercent = (value: number) => (y(value) / VIEWBOX_HEIGHT) * 100;
  const leftPercent = (index: number) => (index / (points.length - 1)) * 100;

  const line = points
    .map((point, index) => `${x(index)},${y(point.tokensUsed)}`)
    .join(" ");
  const area = `${line} ${VIEWBOX_WIDTH},${PADDING_TOP + plotHeight} 0,${PADDING_TOP + plotHeight}`;

  const hovered = active === null ? null : points[active];
  const compact = (value: number) =>
    format.number(value, { notation: "compact", maximumFractionDigits: 1 });
  // `timeZone: "UTC"` pairs with `dateOf`: the day is already the
  // reader's, so this formats the label, it does not convert it.
  const shortDate = (date: Date) =>
    format.dateTime(date, { month: "short", day: "numeric", timeZone: "UTC" });

  // Start, middle and end: enough to place any point, without the
  // crowding a label per day would bring at thirty days.
  const axisDates = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-muted-foreground">
        {t("chart.title")}
      </figcaption>

      <div className="flex gap-2">
        {/* The scale, as HTML so it keeps its type size at any width. */}
        <div
          aria-hidden="true"
          className="relative h-44 w-10 shrink-0 text-xs text-muted-foreground"
        >
          {[max, max / 2, 0].map((value, index) => (
            <span
              key={value}
              className="absolute right-0 -translate-y-1/2 tabular-nums"
              style={{ top: `${topPercent(index === 2 ? 0 : value)}%` }}
            >
              {compact(Math.round(value))}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            className="h-44 w-full"
            role="img"
            aria-label={t("chart.ariaLabel")}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity="0.28"
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            {/* Recessive grid, at the three values the scale names. */}
            {[0, 0.5, 1].map((fraction) => (
              <line
                key={fraction}
                x1="0"
                x2={VIEWBOX_WIDTH}
                y1={PADDING_TOP + plotHeight * fraction}
                y2={PADDING_TOP + plotHeight * fraction}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <polygon points={area} fill={`url(#${gradientId})`} />
            <polyline
              points={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {active !== null ? (
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PADDING_TOP}
                y2={PADDING_TOP + plotHeight}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          {/* A marker on every day that had usage, so a month with one
              busy day reads as a point rather than a slope. */}
          {points.map((point, index) =>
            point.tokensUsed > 0 ? (
              <span
                key={`dot-${point.date}`}
                aria-hidden="true"
                className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                style={{
                  left: `${leftPercent(index)}%`,
                  top: `${topPercent(point.tokensUsed)}%`,
                }}
              />
            ) : null
          )}

          {active !== null ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
              style={{
                left: `${leftPercent(active)}%`,
                top: `${topPercent(points[active]!.tokensUsed)}%`,
              }}
            />
          ) : null}

          {/* Hit targets: full-height slices, reachable by pointer and
              by keyboard, so the series is not pointer-only. */}
          <div
            className="absolute inset-0 flex"
            onMouseLeave={() => setActive(null)}
          >
            {points.map((point, index) => (
              <button
                key={point.date}
                type="button"
                tabIndex={0}
                className="h-full flex-1 cursor-default rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${shortDate(dateOf(point.date))}: ${t("chart.tokensOnDay", { tokens: point.tokensUsed })}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              />
            ))}
          </div>

          {hovered ? (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
              style={{
                left: `${leftPercent(active!)}%`,
                // Clamped at the ends, where centring would hang the
                // card off the side of the chart.
                transform:
                  active === 0
                    ? "translateX(0)"
                    : active === points.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              <p className="font-medium">{shortDate(dateOf(hovered.date))}</p>
              <p className="text-muted-foreground">
                {t("chart.tokensOnDay", { tokens: hovered.tokensUsed })}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex justify-between pl-12 text-xs text-muted-foreground">
        {axisDates.map((index, position) => (
          <span
            key={points[index]!.date}
            className={position === 1 ? "hidden sm:inline" : undefined}
          >
            {shortDate(dateOf(points[index]!.date))}
          </span>
        ))}
      </div>

      {/* The same numbers, reachable without the chart. */}
      <table className="sr-only">
        <caption>{t("chart.tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("chart.columns.date")}</th>
            <th scope="col">{t("chart.columns.tokens")}</th>
            <th scope="col">{t("chart.columns.requests")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{format.number(point.tokensUsed)}</td>
              <td>{format.number(point.requestCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
