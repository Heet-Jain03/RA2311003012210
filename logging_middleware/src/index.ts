import axios from "axios";

// ── Types ────────────────────────────────────────────────────────────────────

type Stack = "backend" | "frontend";

type Level = "debug" | "info" | "warn" | "error" | "fatal";

type BackendPackage =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service";

type FrontendPackage = "api" | "component" | "hook" | "page" | "state" | "style";

type SharedPackage = "auth" | "config" | "middleware" | "utils";

type Package = BackendPackage | FrontendPackage | SharedPackage;

interface LogPayload {
  stack: Stack;
  level: Level;
  package: Package;
  message: string;
}

interface LogResponse {
  logID: string;
  message: string;
}

interface LoggerConfig {
  authToken: string;
  baseUrl?: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

/** Default host (same as auth/register). Override with initLogger `baseUrl` or `EVALUATION_BASE_URL` in apps. */
const DEFAULT_BASE_URL = "http://20.207.122.201";
const LOG_ENDPOINT = "/evaluation-service/logs";

/** API rejects log bodies when this field exceeds 48 UTF-8 bytes. */
const LOG_MESSAGE_MAX_BYTES = 48;

let _config: LoggerConfig | null = null;

/** Serialize log POSTs so parallel callers (e.g. Promise.all) do not race the server. */
let logSendMutex = Promise.resolve();

/** Trim, strip wrapping quotes, and a leading `Bearer ` so env / PowerShell pastes work. */
export function normalizeEvaluationAuthToken(raw: string): string {
  let t = String(raw ?? "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  if (/^Bearer\s+/i.test(t)) {
    t = t.replace(/^Bearer\s+/i, "").trim();
  }
  return t;
}

export function normalizeEvaluationBaseUrl(
  raw: string | undefined,
  fallback: string
): string {
  const candidate = (raw && raw.trim()) || fallback;
  return candidate.trim().replace(/\/+$/, "");
}

function clampLogMessageUtf8(message: string): string {
  const buf = Buffer.from(message, "utf8");
  if (buf.length <= LOG_MESSAGE_MAX_BYTES) {
    return message;
  }
  let end = LOG_MESSAGE_MAX_BYTES;
  while (end > 0 && (buf[end - 1] & 0xc0) === 0x80) {
    end -= 1;
  }
  return buf.subarray(0, end).toString("utf8");
}

async function postLogPayload(payload: LogPayload): Promise<LogResponse | null> {
  if (!_config) {
    return null;
  }
  try {
    const response = await axios.post<LogResponse>(
      `${_config.baseUrl}${LOG_ENDPOINT}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${_config.authToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      }
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const body =
        data !== undefined && data !== null ? JSON.stringify(data) : "";

      if (error.response) {
        console.error(
          `[Logger] Failed to send log | status=${status} | response=${body}`
        );
        if (status === 401) {
          console.error(
            "[Logger] Hint: expired JWT or host mismatch. Run `npx ts-node auth.ts` with CLIENT_ID+CLIENT_SECRET; " +
              'then set $env:AUTH_TOKEN. Try $env:EVALUATION_BASE_URL="http://20.207.122.201" or "...56.144".'
          );
        }
      } else {
        const url = `${_config.baseUrl}${LOG_ENDPOINT}`;
        console.error(
          `[Logger] Failed to send log | no HTTP response (network) | code=${error.code ?? "?"} | ${error.message} | ${url}`
        );
        console.error(
          "[Logger] This usually means the host is unreachable from your network. " +
            'Use the same $env:EVALUATION_BASE_URL that worked when you ran auth.ts (often http://20.207.122.201). ' +
            "Do not use 20.244.56.144 if your connection times out or is refused."
        );
      }
    } else {
      console.error("[Logger] Unexpected error while sending log:", error);
    }
    return null;
  }
}

/**
 * Initialise the logger once (call this at app startup).
 */
export function initLogger(config: LoggerConfig): void {
  _config = {
    authToken: normalizeEvaluationAuthToken(config.authToken || ""),
    baseUrl: normalizeEvaluationBaseUrl(
      config.baseUrl,
      DEFAULT_BASE_URL
    ),
  };
}

// ── Core Log Function ────────────────────────────────────────────────────────

/**
 * Log(stack, level, package, message)
 *
 * Sends a log entry to the Affordmed evaluation server.
 * Integrate this strategically throughout your codebase.
 */
export async function Log(
  stack: Stack,
  level: Level,
  pkg: Package,
  message: string
): Promise<LogResponse | null> {
  if (!_config) {
    console.error(
      "[Logger] Logger not initialised. Call initLogger(config) at startup."
    );
    return null;
  }

  const safeMessage = clampLogMessageUtf8(String(message));

  const payload: LogPayload = {
    stack,
    level,
    package: pkg,
    message: safeMessage,
  };

  return await new Promise<LogResponse | null>((resolve) => {
    logSendMutex = logSendMutex
      .catch(() => undefined)
      .then(async () => {
        const result = await postLogPayload(payload);
        resolve(result);
      });
  });
}

// ── Convenience Wrappers ─────────────────────────────────────────────────────

export const Logger = {
  debug: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "debug", pkg, message),

  info: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "info", pkg, message),

  warn: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "warn", pkg, message),

  error: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "error", pkg, message),

  fatal: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "fatal", pkg, message),
};

export type { Stack, Level, Package, LogPayload, LogResponse, LoggerConfig };
