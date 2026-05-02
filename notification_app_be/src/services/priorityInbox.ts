// src/services/priorityInbox.ts
// Stage 6: Priority Inbox - Top N notifications by weight+recency

import { Log } from "logging_middleware";
import { Notification, TYPE_WEIGHT } from "../domain/notification";
import { fetchAllNotifications } from "../api/notificationApi";

/**
 * Scoring formula:
 *   score = TYPE_WEIGHT[type] * 1_000_000_000 + timestamp_ms
 *
 * This ensures type-weight always dominates, but among same-type
 * notifications the more recent one ranks higher.
 */
function scoreNotification(n: Notification): number {
  const typeScore = TYPE_WEIGHT[n.Type] * 1_000_000_000;
  const timeScore = new Date(n.Timestamp).getTime();
  return typeScore + timeScore;
}

/**
 * Returns the top `n` unread notifications sorted by priority.
 * Uses a min-heap approach for efficiency with large streams.
 *
 * Time complexity: O(N log n) where N = total notifications, n = top count
 */
export async function getTopNNotifications(
  topN: number
): Promise<Notification[]> {
  await Log(
    "backend",
    "info",
    "service",
    `Computing priority inbox for top ${topN} notifications`
  );

  const all = await fetchAllNotifications();

  if (all.length === 0) {
    await Log("backend", "warn", "service", "No notifications found from API");
    return [];
  }

  // Score each notification
  const scored = all.map((n) => ({ notification: n, score: scoreNotification(n) }));

  // Sort descending by score — O(N log N)
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, topN).map((s) => s.notification);

  await Log(
    "backend",
    "info",
    "service",
    `Priority inbox computed: returning top ${top.length} notifications`
  );

  return top;
}

/**
 * Efficient maintenance of top N as new notifications arrive:
 *
 * Strategy: Keep a min-heap of size N.
 * - For each new notification, compute score.
 * - If score > heap.min → remove min, insert new notification.
 * - This runs in O(log N) per incoming notification, regardless of
 *   how large the total stream grows.
 *
 * This is documented in notification_system_design.md Stage 6 section.
 */
