// src/config/env.ts
import {
  normalizeEvaluationAuthToken,
  normalizeEvaluationBaseUrl,
} from "logging_middleware";

const BASE_URL = normalizeEvaluationBaseUrl(
  process.env.EVALUATION_BASE_URL,
  "http://20.207.122.201"
);

export const config = {
  PORT: process.env.PORT || 4000,
  AUTH_TOKEN: normalizeEvaluationAuthToken(process.env.AUTH_TOKEN || ""),
  BASE_URL,
  NOTIFICATION_API: `${BASE_URL}/evaluation-service/notifications`,
};
