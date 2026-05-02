// src/controllers/notificationController.ts
import { Request, Response } from "express";
import { Log } from "logging_middleware";
import { getTopNNotifications } from "../services/priorityInbox";
import { fetchAllNotifications } from "../api/notificationApi";

export async function getAllNotifications(
  req: Request,
  res: Response
): Promise<void> {
  await Log(
    "backend",
    "info",
    "controller",
    "GET /notifications - Fetching all notifications"
  );
  try {
    const notifications = await fetchAllNotifications();
    res.status(200).json({ notifications });
  } catch (error) {
    await Log(
      "backend",
      "error",
      "controller",
      `GET /notifications failed: ${error}`
    );
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
}

export async function getPriorityInbox(
  req: Request,
  res: Response
): Promise<void> {
  const topN = parseInt((req.query.top as string) || "10", 10);

  if (isNaN(topN) || topN <= 0) {
    await Log(
      "backend",
      "warn",
      "controller",
      `GET /notifications/priority called with invalid top param: ${req.query.top}`
    );
    res.status(400).json({ error: "Query param 'top' must be a positive integer" });
    return;
  }

  await Log(
    "backend",
    "info",
    "controller",
    `GET /notifications/priority?top=${topN} - Computing priority inbox`
  );

  try {
    const notifications = await getTopNNotifications(topN);
    res.status(200).json({ count: notifications.length, notifications });
  } catch (error) {
    await Log(
      "backend",
      "error",
      "controller",
      `GET /notifications/priority failed: ${error}`
    );
    res.status(500).json({ error: "Failed to compute priority inbox" });
  }
}
