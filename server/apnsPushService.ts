import * as crypto from "crypto";
import * as http2 from "http2";
import * as tls from "tls";

const APNS_HOST_PRODUCTION = "api.push.apple.com";
const APNS_HOST_SANDBOX = "api.sandbox.push.apple.com";
const TOKEN_EXPIRY_MS = 50 * 60 * 1000;

let cachedJwt: { token: string; createdAt: number } | null = null;

function isCertAuthConfigured(): boolean {
  return !!(
    process.env.APPLE_APNS_CERTIFICATE_PEM &&
    process.env.APPLE_APNS_PRIVATE_KEY_PEM
  );
}

function isJwtAuthConfigured(): boolean {
  return !!(
    process.env.APPLE_APNS_KEY_P8 &&
    process.env.APPLE_APNS_KEY_ID &&
    process.env.APPLE_TEAM_IDENTIFIER
  );
}

function getAuthMethod(): "cert" | "jwt" | null {
  if (isCertAuthConfigured()) return "cert";
  if (isJwtAuthConfigured()) return "jwt";
  return null;
}

function convertDerToRaw(derSignature: Buffer): Buffer {
  let offset = 2;
  if (derSignature[1] & 0x80) {
    offset += (derSignature[1] & 0x7f);
  }

  const rLength = derSignature[offset + 1];
  let rStart = offset + 2;
  let r = derSignature.subarray(rStart, rStart + rLength);
  if (r.length === 33 && r[0] === 0) {
    r = r.subarray(1);
  }

  const sTagOffset = rStart + rLength;
  const sLength = derSignature[sTagOffset + 1];
  let sStart = sTagOffset + 2;
  let s = derSignature.subarray(sStart, sStart + sLength);
  if (s.length === 33 && s[0] === 0) {
    s = s.subarray(1);
  }

  const rPadded = Buffer.alloc(32);
  r.copy(rPadded, 32 - r.length);
  const sPadded = Buffer.alloc(32);
  s.copy(sPadded, 32 - s.length);

  return Buffer.concat([rPadded, sPadded]);
}

function createApnsJwt(): string | null {
  const keyPem = process.env.APPLE_APNS_KEY_P8;
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const teamId = process.env.APPLE_TEAM_IDENTIFIER;

  if (!keyPem || !keyId || !teamId) {
    console.error("[APNs] Missing JWT credentials: APPLE_APNS_KEY_P8, APPLE_APNS_KEY_ID, or APPLE_TEAM_IDENTIFIER");
    return null;
  }

  if (cachedJwt && Date.now() - cachedJwt.createdAt < TOKEN_EXPIRY_MS) {
    return cachedJwt.token;
  }

  try {
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
    const signingInput = `${header}.${claims}`;

    const key = keyPem.replace(/\\n/g, "\n");
    const sign = crypto.createSign("SHA256");
    sign.update(signingInput);
    const derSignature = sign.sign(key);

    const rawSig = convertDerToRaw(derSignature);
    const signature = rawSig.toString("base64url");

    const jwt = `${signingInput}.${signature}`;
    cachedJwt = { token: jwt, createdAt: Date.now() };
    console.log("[APNs] JWT token generated successfully");
    return jwt;
  } catch (error) {
    console.error("[APNs] Failed to generate JWT:", error);
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
  };
  [key: string]: unknown;
}

function sendApnsHttp2(
  deviceToken: string,
  payload: ApnsPayload,
  bundleId: string,
  useSandbox: boolean,
  authMethod: "cert" | "jwt",
): Promise<{ success: boolean; statusCode?: number; reason?: string }> {
  return new Promise((resolve) => {
    const host = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
    const payloadStr = JSON.stringify(payload);
    const authLabel = authMethod.toUpperCase();

    console.log(`[APNs-${authLabel}] Sending via HTTP/2 to ${host} (${useSandbox ? "SANDBOX" : "PRODUCTION"})`);
    console.log(`[APNs-${authLabel}] Device token: ${deviceToken.substring(0, 12)}...${deviceToken.substring(deviceToken.length - 6)}`);
    console.log(`[APNs-${authLabel}] Bundle ID (apns-topic): ${bundleId}`);
    console.log(`[APNs-${authLabel}] Payload size: ${Buffer.byteLength(payloadStr)} bytes`);

    const connectOptions: http2.SecureClientSessionOptions = {};

    if (authMethod === "cert") {
      connectOptions.cert = process.env.APPLE_APNS_CERTIFICATE_PEM!.replace(/\\n/g, "\n");
      connectOptions.key = process.env.APPLE_APNS_PRIVATE_KEY_PEM!.replace(/\\n/g, "\n");
    }

    let client: http2.ClientHttp2Session;
    try {
      client = http2.connect(`https://${host}`, connectOptions);
    } catch (error: any) {
      console.error(`[APNs-${authLabel}] HTTP/2 connect error:`, error.message);
      resolve({ success: false, reason: `HTTP/2 connect error: ${error.message}` });
      return;
    }

    client.on("error", (error) => {
      console.error(`[APNs-${authLabel}] HTTP/2 session error:`, error.message);
      resolve({ success: false, reason: `HTTP/2 session error: ${error.message}` });
      client.close();
    });

    const headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payloadStr),
    };

    if (authMethod === "jwt") {
      const jwt = createApnsJwt();
      if (!jwt) {
        console.error(`[APNs-JWT] JWT generation failed - cannot send push`);
        resolve({ success: false, reason: "Failed to generate APNs JWT" });
        client.close();
        return;
      }
      headers["authorization"] = `bearer ${jwt}`;
    }

    const req = client.request(headers);

    let responseData = "";
    let responseStatus = 0;

    req.on("response", (responseHeaders) => {
      responseStatus = responseHeaders[":status"] as number || 500;
    });

    req.on("data", (chunk: Buffer) => {
      responseData += chunk.toString();
    });

    req.on("end", () => {
      client.close();

      if (responseStatus === 200) {
        console.log(`[APNs-${authLabel}] SUCCESS: Push delivered to ${deviceToken.substring(0, 12)}... (HTTP ${responseStatus})`);
        resolve({ success: true, statusCode: responseStatus });
      } else {
        let reason = "Unknown error";
        try {
          const parsed = JSON.parse(responseData);
          reason = parsed.reason || reason;
        } catch {}
        console.error(`[APNs-${authLabel}] FAILED for ${deviceToken.substring(0, 12)}...: HTTP ${responseStatus} - ${reason}`);
        console.error(`[APNs-${authLabel}] Full response body: ${responseData}`);
        logApnsErrorDetails(reason, bundleId);
        resolve({ success: false, statusCode: responseStatus, reason });
      }
    });

    req.on("error", (error) => {
      console.error(`[APNs-${authLabel}] Request error for ${deviceToken.substring(0, 12)}...:`, error.message);
      client.close();
      resolve({ success: false, reason: error.message });
    });

    const timeout = setTimeout(() => {
      console.error(`[APNs-${authLabel}] Request timeout for ${deviceToken.substring(0, 12)}...`);
      req.close();
      client.close();
      resolve({ success: false, reason: "Request timeout (15s)" });
    }, 15000);

    req.on("end", () => clearTimeout(timeout));

    req.write(payloadStr);
    req.end();
  });
}

function logApnsErrorDetails(reason: string, bundleId: string) {
  if (reason === "BadDeviceToken") {
    console.error(`[APNs] BadDeviceToken: Token may be from wrong environment (sandbox vs production) or is invalid/expired`);
  } else if (reason === "TopicDisallowed") {
    console.error(`[APNs] TopicDisallowed: Bundle ID "${bundleId}" does not match APNs certificate`);
  } else if (reason === "InvalidProviderToken") {
    console.error(`[APNs] InvalidProviderToken: JWT signing key may be wrong or expired`);
  } else if (reason === "Unregistered") {
    console.error(`[APNs] Unregistered: Device token is no longer active - device may have uninstalled the app`);
  } else if (reason === "DeviceTokenNotForTopic") {
    console.error(`[APNs] DeviceTokenNotForTopic: Token was generated for a different bundle ID than "${bundleId}"`);
  } else if (reason === "MissingTopic") {
    console.error(`[APNs] MissingTopic: The apns-topic header is missing. Bundle ID: "${bundleId}"`);
  } else if (reason === "BadCertificate") {
    console.error(`[APNs] BadCertificate: The certificate is invalid or does not match the bundle ID "${bundleId}"`);
  } else if (reason === "BadCertificateEnvironment") {
    console.error(`[APNs] BadCertificateEnvironment: Certificate environment (sandbox/production) does not match the APNs endpoint`);
  }
}

export async function sendApnsPushNotifications(
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<{ sent: number; failed: number }> {
  if (deviceTokens.length === 0) {
    console.log("[APNs] No device tokens to send to");
    return { sent: 0, failed: 0 };
  }

  const bundleId = process.env.APPLE_BUNDLE_ID || "app.replit.bladeoutboards";
  const envSetting = process.env.APNS_ENVIRONMENT || "not set (defaulting to production)";
  const useSandbox = process.env.APNS_ENVIRONMENT === "sandbox";
  const authMethod = getAuthMethod();

  console.log(`[APNs] === Push Notification Send (HTTP/2) ===`);
  console.log(`[APNs] Auth method: ${authMethod || "NONE"}`);
  console.log(`[APNs] Title: "${title}"`);
  console.log(`[APNs] Body: "${body}"`);
  console.log(`[APNs] Token count: ${deviceTokens.length}`);
  console.log(`[APNs] Bundle ID: ${bundleId}`);
  console.log(`[APNs] APNS_ENVIRONMENT: ${envSetting}`);
  console.log(`[APNs] Using endpoint: ${useSandbox ? "SANDBOX" : "PRODUCTION"}`);

  if (!authMethod) {
    console.error("[APNs] No authentication method configured!");
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

  let sent = 0;
  let failed = 0;

  const BATCH_SIZE = 50;
  for (let i = 0; i < deviceTokens.length; i += BATCH_SIZE) {
    const batch = deviceTokens.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((token) => sendApnsHttp2(token, payload, bundleId, useSandbox, authMethod)),
    );
    for (const result of results) {
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
  }

  console.log(`[APNs] Result: Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

export function isApnsConfigured(): boolean {
  return isCertAuthConfigured() || isJwtAuthConfigured();
}
