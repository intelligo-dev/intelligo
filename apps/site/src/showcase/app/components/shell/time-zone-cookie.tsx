"use client";

/**
 * Tells the server which day it is where the reader is sitting.
 *
 * A server has no way to know a browser's time zone: it is not in a
 * header, and guessing from an IP is both wrong and creepy. Without it
 * every per-day figure buckets in UTC, so a reader in +08:00 who ran
 * something at 00:36 sees it filed under yesterday and watches their
 * month end a day early — which is exactly what the usage page did.
 *
 * So the browser writes it once, as a cookie the server can read on
 * the next request through `@intelligo-dev/core/request-context`. A
 * cookie rather than a header because it survives navigation and
 * reaches server components without a round trip of its own.
 *
 * The honest cost: the very first render of a brand-new session has no
 * cookie yet and buckets in UTC. Everything after it is the reader's
 * own day, and nothing is stored server-side.
 */

import { useEffect } from "react";

const COOKIE = "tz";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function TimeZoneCookie() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;

    const current = document.cookie.match(/(?:^|;\s*)tz=([^;]*)/)?.[1];
    if (current && decodeURIComponent(current) === zone) return;

    // Lax: this rides same-site navigation, and it is a display
    // preference, not a credential.
    document.cookie = `${COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }, []);

  return null;
}
