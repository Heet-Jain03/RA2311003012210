// src/api/notificationApi.ts
import axios from "axios";
import { Log } from "logging_middleware";
import { config } from "../config/env";
import { Notification } from "../domain/notification";

const client = axios.create({
  baseURL: config.BASE_URL,
  timeout: 30_000,
  headers: {
    Authorization: `Bearer ${config.AUTH_TOKEN}`,
    "Content-Type": "application/json",
  },
});

export async function fetchAllNotifications(): Promise<Notification[]> {
  await Log(
    "backend",
    "info",
    "service",
    "Fetching all notifications from evaluation API"
  );
  try {
    const res = await client.get("/evaluation-service/notifications");
    const notifications: Notification[] = res.data.notifications;
    await Log(
      "backend",
      "info",
      "service",
      `Fetched ${notifications.length} notifications successfully`
    );
    return notifications;
  } catch (error) {
    await Log(
      "backend",
      "fatal",
      "service",
      `Failed to fetch notifications: ${error}`
    );
    throw error;
  }
}
