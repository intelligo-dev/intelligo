/**
 * Chat widget config — the consumer-owned seam for the floating
 * assistant (composition through a config you own, never a
 * component edit).
 *
 *  - `position`: which corner the launcher sits in.
 *  - `agent`: which agent the widget's conversations run as, when it
 *    differs from the chat page's (`chatConfig.agent`).
 *  - `body`: sent with every turn — a static product context. For
 *    per-page context pass `body` to `<ChatWidget>` where it mounts.
 *  - `hideOn`: pathname prefixes where the launcher is not shown (the
 *    chat page itself, auth pages).
 *
 * Mount the widget once, in your app layout:
 *
 *   import { ChatWidget } from "@/components/chat/chat-widget";
 *   …
 *   <ChatWidget />
 */

export interface ChatWidgetConfig {
  position?: "bottom-right" | "bottom-left";
  agent?: { id?: string; name?: string; icon?: string };
  body?: Record<string, unknown>;
  hideOn?: string[];
}

export const chatWidgetConfig: ChatWidgetConfig = {
  position: "bottom-right",
  hideOn: ["/chat", "/login", "/signup"],
};
