// src/index.ts
import express from "express";
import cors from "cors";
import { initLogger, Log } from "logging_middleware";
import { config } from "./config/env";
import { requestLogger } from "./middleware/requestLogger";
import notificationRoutes from "./routes/notificationRoutes";

// ── Initialise Logger ─────────────────────────────────────────────────────────
initLogger({ authToken: config.AUTH_TOKEN, baseUrl: config.BASE_URL });

// ── App Setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/notifications", notificationRoutes);

app.get("/health", async (_req, res) => {
  await Log("backend", "debug", "route", "Health check endpoint called");
  res.status(200).json({ status: "ok", service: "notification_app_be" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(config.PORT, async () => {
  await Log(
    "backend",
    "info",
    "config",
    `notification_app_be started on port ${config.PORT}`
  );
  console.log(`[notification_app_be] Server running on port ${config.PORT}`);
});
