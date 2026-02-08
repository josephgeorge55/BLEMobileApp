import * as crypto from "crypto";
import * as https from "https";
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

function sendApnsRequestCert(
  deviceToken: string,
  payload: ApnsPayload,
  bundleId: string,
  useSandbox: boolean = false,
): Promise<{ success: boolean; statusCode?: number; reason?: string }> {
  return new Promise((resolve) => {
    const certPem = process.env.APPLE_APNS_CERTIFICATE_PEM!.replace(/\\n/g, "\n");
    const keyPem = process.env.APPLE_APNS_PRIVATE_KEY_PEM!.replace(/\\n/g, "\n");

    const host = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
    const payloadStr = JSON.stringify(payload);

    console.log(`[APNs-CERT] Sending to ${host} (${useSandbox ? "SANDBOX" : "PRODUCTION"})`);
    console.log(`[APNs-CERT] Device token: ${deviceToken.substring(0, 12)}...${deviceToken.substring(deviceToken.length - 6)}`);
    console.log(`[APNs-CERT] Bundle ID (apns-topic): ${bundleId}`);
    console.log(`[APNs-CERT] Payload size: ${Buffer.byteLength(payloadStr)} bytes`);

    const options: https.RequestOptions = {
      hostname: host,
      port: 443,
      path: `/3/device/${deviceToken}`,
      method: "POST",
      cert: certPem,
      key: keyPem,
      headers: {
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payloadStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const statusCode = res.statusCode || 500;
        if (statusCode === 200) {
          console.log(`[APNs-CERT] SUCCESS: Push delivered to ${deviceToken.substring(0, 12)}... (HTTP 200)`);
          resolve({ success: true, statusCode });
        } else {
          let reason = "Unknown error";
          try {
            const parsed = JSON.parse(data);
            reason = parsed.reason || reason;
          } catch {}
          console.error(`[APNs-CERT] FAILED for ${deviceToken.substring(0, 12)}...: HTTP ${statusCode} - ${reason}`);
          logApnsErrorDetails(reason, bundleId);
          resolve({ success: false, statusCode, reason });
        }
      });
    });

    req.on("error", (error) => {
      console.error(`[APNs-CERT] Network/TLS error for ${deviceToken.substring(0, 12)}...:`, error.message);
      resolve({ success: false, reason: error.message });
    });

    req.write(payloadStr);
    req.end();
  });
}

function sendApnsRequestJwt(
  deviceToken: string,
  payload: ApnsPayload,
  bundleId: string,
  useSandbox: boolean = false,
): Promise<{ success: boolean; statusCode?: number; reason?: string }> {
  return new Promise((resolve) => {
    const jwt = createApnsJwt();
    if (!jwt) {
      console.error("[APNs-JWT] JWT generation failed - cannot send push");
      resolve({ success: false, reason: "Failed to generate APNs JWT" });
      return;
    }

    const host = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
    const payloadStr = JSON.stringify(payload);

    console.log(`[APNs-JWT] Sending to ${host} (${useSandbox ? "SANDBOX" : "PRODUCTION"})`);
    console.log(`[APNs-JWT] Device token: ${deviceToken.substring(0, 12)}...${deviceToken.substring(deviceToken.length - 6)}`);
    console.log(`[APNs-JWT] Bundle ID (apns-topic): ${bundleId}`);
    console.log(`[APNs-JWT] Payload size: ${Buffer.byteLength(payloadStr)} bytes`);

    const options: https.RequestOptions = {
      hostname: host,
      port: 443,
      path: `/3/device/${deviceToken}`,
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payloadStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const statusCode = res.statusCode || 500;
        if (statusCode === 200) {
          console.log(`[APNs-JWT] SUCCESS: Push delivered to ${deviceToken.substring(0, 12)}... (HTTP 200)`);
          resolve({ success: true, statusCode });
        } else {
          let reason = "Unknown error";
          try {
            const parsed = JSON.parse(data);
            reason = parsed.reason || reason;
          } catch {}
          console.error(`[APNs-JWT] FAILED for ${deviceToken.substring(0, 12)}...: HTTP ${statusCode} - ${reason}`);
          logApnsErrorDetails(reason, bundleId);
          resolve({ success: false, statusCode, reason });
        }
      });
    });

    req.on("error", (error) => {
      console.error(`[APNs-JWT] Network error for ${deviceToken.substring(0, 12)}...:`, error.message);
      resolve({ success: false, reason: error.message });
    });

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
  }
}

function sendApnsRequest(
  deviceToken: string,
  payload: ApnsPayload,
  bundleId: string,
  useSandbox: boolean = false,
): Promise<{ success: boolean; statusCode?: number; reason?: string }> {
  const authMethod = getAuthMethod();

  if (authMethod === "cert") {
    console.log(`[APNs] Using CERTIFICATE-based authentication`);
    return sendApnsRequestCert(deviceToken, payload, bundleId, useSandbox);
  } else if (authMethod === "jwt") {
    console.log(`[APNs] Using JWT/token-based authentication`);
    return sendApnsRequestJwt(deviceToken, payload, bundleId, useSandbox);
  } else {
    console.error("[APNs] No authentication method configured!");
    return Promise.resolve({ success: false, reason: "No APNs auth configured" });
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

  console.log(`[APNs] === Push Notification Send ===`);
  console.log(`[APNs] Auth method: ${authMethod || "NONE"}`);
  console.log(`[APNs] Title: "${title}"`);
  console.log(`[APNs] Body: "${body}"`);
  console.log(`[APNs] Token count: ${deviceTokens.length}`);
  console.log(`[APNs] Bundle ID: ${bundleId}`);
  console.log(`[APNs] APNS_ENVIRONMENT: ${envSetting}`);
  console.log(`[APNs] Using endpoint: ${useSandbox ? "SANDBOX" : "PRODUCTION"}`);

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
      batch.map((token) => sendApnsRequest(token, payload, bundleId, useSandbox)),
    );
    for (const result of results) {
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
  }

  console.log(`[APNs] Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

export function isApnsConfigured(): boolean {
  return isCertAuthConfigured() || isJwtAuthConfigured();
}
