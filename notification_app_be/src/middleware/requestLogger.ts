// src/middleware/requestLogger.ts
import { Request, Response, NextFunction } from "express";
import { Log } from "logging_middleware";

export async function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const start = Date.now();
  await Log(
    "backend",
    "info",
    "middleware",
    `Incoming request: ${req.method} ${req.path}`
  );

  res.on("finish", async () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    await Log(
      "backend",
      level,
      "middleware",
      `${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}
