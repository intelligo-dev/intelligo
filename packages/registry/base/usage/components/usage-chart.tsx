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
 * Colour comes from `--primary`, so it follows the app's theme in both
 * light and dark rather than carrying its own palette. Identity is
 * never colour-alone here — there is one series, it is named in the
 * heading, and every value is also in the table underneath (visually
 * hidden, but present for screen readers and for copy-paste).
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

export function UsageChart({ points }: UsageChartProps) {
  const t = useTranslations("usage");
  const format = useFormatter();
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  // A period with a single day has no line to draw, and an all-zero
  // period would divide by zero below.
  if (points.length < 2) return null;

  const max = Math.max(...points.map((point) => point.tokensUsed), 1);
  const plotHeight = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const step = VIEWBOX_WIDTH / (points.length - 1);

  const x = (index: number) => index * step;
  const y = (value: number) =>
    PADDING_TOP + plotHeight - (value / max) * plotHeight;

  const line = points
    .map((point, index) => `${x(index)},${y(point.tokensUsed)}`)
    .join(" ");
  const area = `${line} ${VIEWBOX_WIDTH},${PADDING_TOP + plotHeight} 0,${PADDING_TOP + plotHeight}`;

  const active = hovered === null ? null : points[hovered];
  const firstDate = new Date(`${points[0]!.date}T00:00:00Z`);
  const lastDate = new Date(`${points[points.length - 1]!.date}T00:00:00Z`);

  const shortDate = (date: Date) =>
    format.dateTime(date, { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-muted-foreground">
        {t("chart.title")}
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="h-44 w-full"
          role="img"
          aria-label={t("chart.ariaLabel")}
          preserveAspectRatio="none"
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive grid: three lines, no axis furniture. */}
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

          {hovered !== null ? (
            <>
              <line
                x1={x(hovered)}
                x2={x(hovered)}
                y1={PADDING_TOP}
                y2={PADDING_TOP + plotHeight}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(hovered)}
                cy={y(points[hovered]!.tokensUsed)}
                r="4"
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}

          {/* Hit targets: full-height columns, so the pointer finds a
              day anywhere in its slice rather than only on the line. */}
          {points.map((point, index) => (
            <rect
              key={point.date}
              x={x(index) - step / 2}
              y={0}
              width={step}
              height={VIEWBOX_HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
            />
          ))}
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(hovered! / (points.length - 1)) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="font-medium">
              {shortDate(new Date(`${active.date}T00:00:00Z`))}
            </p>
            <p className="text-muted-foreground">
              {t("chart.tokensOnDay", { tokens: active.tokensUsed })}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{shortDate(firstDate)}</span>
        <span>{shortDate(lastDate)}</span>
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
