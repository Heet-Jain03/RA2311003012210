/**
 * Registration + bearer token for the Affordmed evaluation API.
 *
 * Usage (from repo root): npm install && npx ts-node auth.ts
 *
 * If you already registered (409 email exists), you do NOT need a new email.
 * Use the clientID + clientSecret you saved from registration and run auth-only:
 *
 *   PowerShell:
 *     $env:CLIENT_ID="<paste clientID>"
 *     $env:CLIENT_SECRET="<paste clientSecret>"
 *     $env:EVALUATION_BASE_URL="http://20.207.122.201"
 *     npx ts-node auth.ts
 *
 * If auth fails, try the same with EVALUATION_BASE_URL=http://20.244.56.144
 * (must match the host where your account was created).
 *
 * New access_token: if your organizer allows it, call /auth again with the same
 * clientID + clientSecret from registration (that pair is reusable). If they say
 * “save the token once”, keep using that JWT until it expires — but CLIENT_ID /
 * CLIENT_SECRET must never be confused with accessCode or access_token (see below).
 */

import axios from "axios";

/** Registration returns clientID as a UUID (36 chars with hyphens). */
const CLIENT_ID_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateClientCredentials(clientID: string, clientSecret: string): void {
  if (!CLIENT_ID_UUID.test(clientID)) {
    console.error(`
Wrong CLIENT_ID.

You must paste the "clientID" from the registration JSON — it looks like:
  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Common mistakes:
  • accessCode (e.g. ${participant.accessCode}) → NOT clientID (too short; server says "invalid UUID length").
  • access_token (JWT starting with eyJ...) → NOT clientID; use that only as AUTH_TOKEN after auth.

Fix PowerShell:
  $env:CLIENT_ID="<uuid from registration>"
  $env:CLIENT_SECRET="<short secret from same JSON, NOT the JWT>"
`);
    process.exit(1);
  }

  if (clientSecret.startsWith("eyJ")) {
    console.error(`
Wrong CLIENT_SECRET.

You pasted the access_token (JWT) into CLIENT_SECRET.

  • clientSecret = short string from registration (same response as clientID).
  • access_token (JWT) = long string starting with eyJ → use only as AUTH_TOKEN for API calls.

Fix: put the JWT in AUTH_TOKEN when calling apps, not in CLIENT_SECRET.
`);
    process.exit(1);
  }

  if (clientSecret.length > 64) {
    console.error(`
CLIENT_SECRET looks too long — usually means the JWT was pasted here.
Use the short clientSecret from registration only.
`);
    process.exit(1);
  }
}

const EVALUATION_BASE = (
  process.env.EVALUATION_BASE_URL || "http://20.207.122.201"
)
  .trim()
  .replace(/\/+$/, "");

/** Replace with your own details before running. */
const participant = {
  rollNo: "RA2311003012210",
  email: "hj8817@srmist.edu.in",
  name: "Heet Jain",
  mobileNo: "6367142024",
  githubUsername: "Heet-Jain03",
  accessCode: "QkbpxH",
} as const;

async function requestAccessToken(
  clientID: string,
  clientSecret: string
): Promise<void> {
  console.log("Requesting access token (POST /evaluation-service/auth)...");
  const authRes = await axios.post(
    `${EVALUATION_BASE}/evaluation-service/auth`,
    {
      email: participant.email,
      name: participant.name,
      rollNo: participant.rollNo,
      accessCode: participant.accessCode,
      clientID,
      clientSecret,
    }
  );

  console.log("\nAuth response:");
  console.log(JSON.stringify(authRes.data, null, 2));
  console.log(
    "\nThen set (same PowerShell window before running apps):\n" +
      '  $env:AUTH_TOKEN="<paste access_token only>"\n' +
      '  $env:EVALUATION_BASE_URL="' +
      EVALUATION_BASE +
      '"\n'
  );
}

async function main(): Promise<void> {
  const envClientId = process.env.CLIENT_ID?.trim();
  const envClientSecret = process.env.CLIENT_SECRET?.trim();

  if (envClientId && envClientSecret) {
    validateClientCredentials(envClientId, envClientSecret);
    console.log(
      "CLIENT_ID and CLIENT_SECRET set — skipping registration (auth only).\n" +
        `Host: ${EVALUATION_BASE}\n`
    );
    try {
      await requestAccessToken(envClientId, envClientSecret);
    } catch (err: unknown) {
      printAxiosError(err);
      process.exitCode = 1;
    }
    return;
  }

  console.log("Step 1: Registering...");
  try {
    const registerRes = await axios.post(
      `${EVALUATION_BASE}/evaluation-service/register`,
      {
        email: participant.email,
        name: participant.name,
        mobileNo: participant.mobileNo,
        githubUsername: participant.githubUsername,
        rollNo: participant.rollNo,
        accessCode: participant.accessCode,
      }
    );

    console.log("Registration response:");
    console.log(JSON.stringify(registerRes.data, null, 2));

    const { clientID, clientSecret } = registerRes.data as {
      clientID: string;
      clientSecret: string;
    };

    console.log("\nSave clientID and clientSecret immediately:");
    console.log(`clientID: ${clientID}`);
    console.log(`clientSecret: ${clientSecret}`);

    console.log("\nStep 2: Requesting access token...");
    await requestAccessToken(clientID, clientSecret);
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      console.error(
        "Registration returned 409 (email already registered).\n\n" +
          "That is normal. You already have an account — you do not need another email.\n" +
          "Request a fresh token using the clientID + clientSecret from your first run:\n\n" +
          "  $env:CLIENT_ID=\"<your saved clientID>\"\n" +
          "  $env:CLIENT_SECRET=\"<your saved clientSecret>\"\n" +
          "  $env:EVALUATION_BASE_URL=\"" +
          EVALUATION_BASE +
          "\"\n" +
          "  npx ts-node auth.ts\n\n" +
          "If auth fails, try EVALUATION_BASE_URL=http://20.207.122.201 instead.\n"
      );
      process.exitCode = 1;
      return;
    }
    printAxiosError(err);
    process.exitCode = 1;
  }
}

function printAxiosError(err: unknown): void {
  if (axios.isAxiosError(err)) {
    const detail =
      err.response?.data !== undefined
        ? JSON.stringify(err.response.data)
        : err.message;
    console.error(
      "Request failed:",
      err.response?.status ?? "no status",
      detail
    );
  } else if (err instanceof Error) {
    console.error("Error:", err.message);
  } else {
    console.error(err);
  }
}

void main();
