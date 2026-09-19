"use client";

/**
 * Writes the browser's time zone to a cookie so per-day figures bucket
 * in the reader's day rather than UTC. The server reads it through
 * `@intelligo-dev/core/request-context`; a browser's time zone reaches the
 * server no other way. The first render of a new session has no cookie
 * yet and buckets in UTC.
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
