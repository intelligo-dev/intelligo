"use client";

/**
 * `useNotifications` — client-side state for the notification bell:
 * unread count + recent list, refreshed by polling every 60s, paused
 * while the caller says a dropdown showing the data is open (mirrors
 * Acme's `NotificationBell`). Mutations are optimistic: the local
 * state updates immediately, the server action runs alongside it.
 *
 * Pass `initialCount`/`initialNotifications` when a server component up
 * the tree already fetched them (fast first paint, no fetch-on-mount).
 * Omit both and the hook fetches for itself on mount — this is what
 * lets `NotificationBell` be dropped into a shell with zero props.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  getUnreadCount,
  getUnreadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationData,
} from "@/actions/notifications";

const POLL_INTERVAL_MS = 60_000;
const RECENT_LIMIT = 10;

export interface UseNotificationsOptions {
  initialCount?: number;
  initialNotifications?: NotificationData[];
  /** Skip the next poll tick while true (e.g. the bell dropdown is open). */
  paused?: boolean;
}

export interface UseNotificationsResult {
  notifications: NotificationData[];
  unreadCount: number;
  isPending: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  refresh: () => void;
}

export function useNotifications(
  options: UseNotificationsOptions = {}
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationData[]>(
    options.initialNotifications ?? []
  );
  const [unreadCount, setUnreadCount] = useState(options.initialCount ?? 0);
  const [isPending, startTransition] = useTransition();

  const pausedRef = useRef(options.paused ?? false);
  pausedRef.current = options.paused ?? false;

  // Only ever read once: whether the caller handed us a starting point
  // decides if we fetch on mount, independent of later prop changes.
  const hadInitialData = useRef(options.initialNotifications !== undefined);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const [countResult, listResult] = await Promise.all([
        getUnreadCount(),
        getUnreadNotifications(RECENT_LIMIT),
      ]);
      if (countResult.success) setUnreadCount(countResult.data);
      if (listResult.success) setNotifications(listResult.data);
    });
  }, []);

  useEffect(() => {
    // Runs once on mount; `refresh` is a stable useCallback.
    if (!hadInitialData.current) refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!pausedRef.current) refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }, []);

  return {
    notifications,
    unreadCount,
    isPending,
    markRead,
    markAllRead,
    refresh,
  };
}
