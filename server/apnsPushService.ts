import * as crypto from "crypto";
import * as http2 from "http2";
import jwt from "jsonwebtoken";

const APNS_HOST_PRODUCTION = "api.push.apple.com";
const APNS_HOST_SANDBOX = "api.sandbox.push.apple.com";
const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000;
const APNS_EXPIRATION_SECONDS = 3600;

let cachedJwt: { token: string; createdAt: number } | null = null;

function isJwtAuthConfigured(): boolean {
  return !!(
    process.env.APPLE_APNS_KEY_P8 &&
    process.env.APPLE_APNS_KEY_ID &&
    process.env.APPLE_TEAM_IDENTIFIER
  );
}

function isCertAuthConfigured(): boolean {
  return !!(
    process.env.APPLE_APNS_CERTIFICATE_PEM &&
    process.env.APPLE_APNS_PRIVATE_KEY_PEM
  );
}

function getAuthMethod(): "jwt" | "cert" | null {
  if (isJwtAuthConfigured()) return "jwt";
  if (isCertAuthConfigured()) return "cert";
  return null;
}

function formatP8Key(rawKey: string): string {
  let cleaned = rawKey.replace(/\\n/g, "\n").trim();

  const base64Content = cleaned
    .replace(/-----BEGIN[^-]*-----/g, "")
    .replace(/-----END[^-]*-----/g, "")
    .replace(/\s+/g, "");

  const lines: string[] = [];
  for (let i = 0; i < base64Content.length; i += 64) {
    lines.push(base64Content.substring(i, i + 64));
  }
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function createApnsJwt(): string | null {
  const keyPem = process.env.APPLE_APNS_KEY_P8;
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const teamId = process.env.APPLE_TEAM_IDENTIFIER;

  if (!keyPem || !keyId || !teamId) {
    console.error("[APNs] Missing JWT credentials: APPLE_APNS_KEY_P8, APPLE_APNS_KEY_ID, or APPLE_TEAM_IDENTIFIER");
    return null;
  }

  if (cachedJwt && Date.now() - cachedJwt.createdAt < TOKEN_REFRESH_INTERVAL_MS) {
    return cachedJwt.token;
  }

  try {
    const formattedPem = formatP8Key(keyPem);

    let signingKey: string;
    try {
      const privateKey = crypto.createPrivateKey({
        key: formattedPem,
        format: "pem",
      });
      signingKey = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    } catch (pemError: any) {
      const base64Content = formattedPem
        .replace(/-----BEGIN[^-]*-----/g, "")
        .replace(/-----END[^-]*-----/g, "")
        .replace(/\s+/g, "");
      const derBuffer = Buffer.from(base64Content, "base64");
      const privateKey = crypto.createPrivateKey({
        key: derBuffer,
        format: "der",
        type: "pkcs8",
      });
      signingKey = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    }

    const now = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      {
        iss: teamId,
        iat: now,
      },
      signingKey,
      {
        algorithm: "ES256",
        header: {
          alg: "ES256",
          kid: keyId,
        },
      },
    );

    cachedJwt = { token, createdAt: Date.now() };
    console.log("[APNs] JWT token generated successfully (ES256, no exp claim per Apple spec)");
    return token;
  } catch (error: any) {
    console.error("[APNs] Failed to generate JWT:", error.message);
    cachedJwt = null;
    return null;
  }
}

interface ApnsPayload {
  aps: {
    alert: {
      title: string;
      body: string;
    };
    sound?: string;
    badge?: number;
    "mutable-content"?: number;
    "content-available"?: number;
    category?: string;
    "thread-id"?: string;
  };
  [key: string]: unknown;
}

interface ApnsSendResult {
  success: boolean;
  token: string;
  statusCode?: number;
  reason?: string;
  apnsId?: string;
}

function connectHttp2(
  host: string,
  authMethod: "jwt" | "cert",
): Promise<http2.ClientHttp2Session> {
  return new Promise((resolve, reject) => {
    const connectOptions: http2.SecureClientSessionOptions = {
      rejectUnauthorized: true,
    };

    if (authMethod === "cert") {
      connectOptions.cert = process.env.APPLE_APNS_CERTIFICATE_PEM!.replace(/\\n/g, "\n");
      connectOptions.key = process.env.APPLE_APNS_PRIVATE_KEY_PEM!.replace(/\\n/g, "\n");
    }

    const client = http2.connect(`https://${host}:443`, connectOptions);

    const connectTimeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`HTTP/2 connection timeout to ${host} (10s)`));
    }, 10000);

    client.on("connect", () => {
      clearTimeout(connectTimeout);
      resolve(client);
    });

    client.on("error", (err) => {
      clearTimeout(connectTimeout);
      reject(new Error(`HTTP/2 connection error: ${err.message}`));
    });

    client.on("goaway", (errorCode, lastStreamID, opaqueData) => {
      let reason = "unknown";
      if (opaqueData && opaqueData.length > 0) {
        try {
          const parsed = JSON.parse(opaqueData.toString());
          reason = parsed.reason || reason;
        } catch {}
      }
      console.warn(`[APNs] GOAWAY received: errorCode=${errorCode}, lastStreamID=${lastStreamID}, reason=${reason}`);
    });
  });
}

function sendSinglePush(
  client: http2.ClientHttp2Session,
  deviceToken: string,
  payload: string,
  bundleId: string,
  authMethod: "jwt" | "cert",
): Promise<ApnsSendResult> {
  return new Promise((resolve) => {
    const headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + APNS_EXPIRATION_SECONDS),
    };

    if (authMethod === "jwt") {
      const token = createApnsJwt();
      if (!token) {
        resolve({ success: false, token: deviceToken, reason: "JWT generation failed" });
        return;
      }
      headers["authorization"] = `bearer ${token}`;
    }

    let resolved = false;
    const safeResolve = (result: ApnsSendResult) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(reqTimeout);
        resolve(result);
      }
    };

    const req = client.request(headers);

    const reqTimeout = setTimeout(() => {
      req.close();
      safeResolve({
        success: false,
        token: deviceToken,
        reason: "Request timeout (15s)",
      });
    }, 15000);

    let responseData = "";
    let responseStatus = 0;
    let apnsId = "";

    req.on("response", (responseHeaders) => {
      responseStatus = (responseHeaders[":status"] as number) || 0;
      apnsId = (responseHeaders["apns-id"] as string) || "";
    });

    req.on("data", (chunk: Buffer) => {
      responseData += chunk.toString();
    });

    req.on("end", () => {
      if (responseStatus === 200) {
        safeResolve({
          success: true,
          token: deviceToken,
          statusCode: 200,
          apnsId,
        });
      } else {
        let reason = `HTTP ${responseStatus}`;
        try {
          const parsed = JSON.parse(responseData);
          reason = parsed.reason || reason;
        } catch {}
        safeResolve({
          success: false,
          token: deviceToken,
          statusCode: responseStatus,
          reason,
          apnsId,
        });
      }
    });

    req.on("error", (error) => {
      safeResolve({
        success: false,
        token: deviceToken,
        reason: `Stream error: ${error.message}`,
      });
    });

    req.write(payload);
    req.end();
  });
}

function logApnsErrorDetails(reason: string, bundleId: string) {
  const hints: Record<string, string> = {
    BadDeviceToken: "Token may be from wrong environment (sandbox vs production), or is invalid/expired. Tokens from Xcode debug builds use sandbox; TestFlight/App Store builds use production.",
    TopicDisallowed: `Bundle ID "${bundleId}" is not allowed for this signing key. Verify the key covers this bundle ID in Apple Developer Portal.`,
    InvalidProviderToken: "JWT signing key (.p8) may be wrong, revoked, or created for a different environment (sandbox vs production). Team-scoped keys are environment-specific.",
    Unregistered: "Device has uninstalled the app or token is no longer valid. Remove this token from your database.",
    DeviceTokenNotForTopic: `Device token was generated for a different app/bundle ID than "${bundleId}". The token and bundle ID must match.`,
    MissingTopic: `The apns-topic header is missing or empty. Should be "${bundleId}".`,
    BadCertificate: `Certificate is invalid or does not match bundle ID "${bundleId}".`,
    BadCertificateEnvironment: "Certificate environment (sandbox/production) does not match the APNs host being used.",
    ExpiredProviderToken: "JWT token iat timestamp is older than 1 hour. Token cache may be stale.",
    Forbidden: "The specified action is not allowed. Check that the signing key has APNs permission enabled.",
    TooManyRequests: "Rate limited by Apple. Reduce push frequency to this device token.",
    TooManyProviderTokenUpdates: "JWT is being refreshed too frequently. Must wait at least 20 minutes between token refreshes on the same connection.",
  };

  if (hints[reason]) {
    console.error(`[APNs] HINT for "${reason}": ${hints[reason]}`);
  }
}

export async function sendApnsPushNotifications(
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<{ sent: number; failed: number; details?: ApnsSendResult[] }> {
  if (deviceTokens.length === 0) {
    console.log("[APNs] No device tokens to send to");
    return { sent: 0, failed: 0 };
  }

  const bundleId = process.env.APPLE_BUNDLE_ID || "com.bladeoutboards.app";
  const useSandbox = process.env.APNS_ENVIRONMENT === "sandbox";
  const host = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
  const authMethod = getAuthMethod();

  console.log(`[APNs] === Push Notification Send ===`);
  console.log(`[APNs] Auth: ${authMethod || "NONE"} | Host: ${host} | Bundle: ${bundleId} | Tokens: ${deviceTokens.length}`);

  if (!authMethod) {
    console.error("[APNs] No authentication method configured!");
    console.error("[APNs] Required: APPLE_APNS_KEY_P8 + APPLE_APNS_KEY_ID + APPLE_TEAM_IDENTIFIER (JWT auth)");
    return { sent: 0, failed: deviceTokens.length };
  }

  const payload: ApnsPayload = {
    aps: {
      alert: { title, body },
      sound: "default",
      "mutable-content": 1,
    },
    ...(data || {}),
  };
  const payloadStr = JSON.stringify(payload);

  const payloadBytes = Buffer.byteLength(payloadStr);
  if (payloadBytes > 4096) {
    console.error(`[APNs] Payload exceeds 4KB limit: ${payloadBytes} bytes`);
    return { sent: 0, failed: deviceTokens.length };
  }

  let client: http2.ClientHttp2Session;
  try {
    client = await connectHttp2(host, authMethod);
  } catch (error: any) {
    console.error(`[APNs] HTTP/2 connection failed: ${error.message}`);
    return { sent: 0, failed: deviceTokens.length };
  }

  const allResults: ApnsSendResult[] = [];
  let sent = 0;
  let failed = 0;

  try {
    const validTokens: string[] = [];
    for (const token of deviceTokens) {
      const cleanToken = token.replace(/[^a-fA-F0-9]/g, "");
      if (cleanToken.length !== 64) {
        console.warn(`[APNs] Invalid token length ${cleanToken.length} (expected 64): ${token.substring(0, 16)}...`);
        allResults.push({
          success: false,
          token,
          reason: `Invalid token length: ${cleanToken.length} (expected 64 hex chars)`,
        });
        failed++;
      } else {
        validTokens.push(cleanToken);
      }
    }

    if (validTokens.length > 0) {
      const firstResult = await sendSinglePush(client, validTokens[0]!, payloadStr, bundleId, authMethod);
      allResults.push(firstResult);
      if (firstResult.success) {
        sent++;
        console.log(`[APNs] First push OK (apns-id: ${firstResult.apnsId})`);
      } else {
        failed++;
        console.error(`[APNs] First push FAILED: ${firstResult.reason} (HTTP ${firstResult.statusCode || "N/A"})`);
        if (firstResult.reason) logApnsErrorDetails(firstResult.reason, bundleId);

        if (firstResult.statusCode === 403 && (firstResult.reason === "InvalidProviderToken" || firstResult.reason === "ExpiredProviderToken")) {
          console.error("[APNs] Auth token rejected by Apple. Aborting batch — all remaining tokens would fail with the same error.");
          for (let i = 1; i < validTokens.length; i++) {
            allResults.push({ success: false, token: validTokens[i]!, statusCode: 403, reason: firstResult.reason });
            failed++;
          }
          return { sent, failed, details: allResults };
        }
      }

      if (validTokens.length > 1) {
        const BATCH_SIZE = 50;
        const remaining = validTokens.slice(1);

        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map((token) => sendSinglePush(client, token, payloadStr, bundleId, authMethod)),
          );

          for (const result of batchResults) {
            allResults.push(result);
            if (result.success) {
              sent++;
            } else {
              failed++;
              if (result.reason) logApnsErrorDetails(result.reason, bundleId);
            }
          }
        }
      }
    }
  } finally {
    client.close();
  }

  console.log(`[APNs] Result: ${sent} sent, ${failed} failed out of ${deviceTokens.length} total`);

  for (const r of allResults) {
    if (!r.success) {
      console.log(`[APNs]   FAILED ${r.token.substring(0, 12)}... => ${r.reason} (HTTP ${r.statusCode || "N/A"})`);
    }
  }

  return { sent, failed, details: allResults };
}

export async function testApnsConnection(): Promise<{
  authMethod: string | null;
  bundleId: string;
  environment: string;
  host: string;
  connectionOk: boolean;
  jwtOk?: boolean;
  jwtClaims?: { iss: string; iat: number; hasExp: boolean };
  certConfigured: boolean;
  jwtConfigured: boolean;
  keyIdLength?: number;
  teamIdLength?: number;
  error?: string;
}> {
  const authMethod = getAuthMethod();
  const bundleId = process.env.APPLE_BUNDLE_ID || "com.bladeoutboards.app";
  const useSandbox = process.env.APNS_ENVIRONMENT === "sandbox";
  const host = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;

  const result: any = {
    authMethod,
    bundleId,
    environment: useSandbox ? "sandbox" : "production",
    host,
    connectionOk: false,
    certConfigured: isCertAuthConfigured(),
    jwtConfigured: isJwtAuthConfigured(),
    keyIdLength: process.env.APPLE_APNS_KEY_ID?.length || 0,
    teamIdLength: process.env.APPLE_TEAM_IDENTIFIER?.length || 0,
  };

  if (!authMethod) {
    result.error = "No auth method configured. Need APPLE_APNS_KEY_P8 + APPLE_APNS_KEY_ID + APPLE_TEAM_IDENTIFIER";
    return result;
  }

  if (authMethod === "jwt") {
    cachedJwt = null;
    const token = createApnsJwt();
    result.jwtOk = !!token;
    if (token) {
      try {
        const parts = token.split(".");
        const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
        result.jwtClaims = {
          iss: claims.iss,
          iat: claims.iat,
          hasExp: "exp" in claims,
        };
      } catch {}
    } else {
      result.error = "JWT generation failed — check .p8 key format";
      return result;
    }
  }

  try {
    const client = await connectHttp2(host, authMethod);
    result.connectionOk = true;
    client.close();
  } catch (error: any) {
    result.error = `HTTP/2 connection to ${host} failed: ${error.message}`;
  }

  return result;
}

export function isApnsConfigured(): boolean {
  return isJwtAuthConfigured() || isCertAuthConfigured();
}
