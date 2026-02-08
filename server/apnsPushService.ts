import * as crypto from "crypto";
import * as http2 from "http2";
import jwt from "jsonwebtoken";

const APNS_HOST_PRODUCTION = "api.push.apple.com";
const APNS_HOST_SANDBOX = "api.sandbox.push.apple.com";
const TOKEN_EXPIRY_MS = 50 * 60 * 1000;

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

function createApnsJwt(): string | null {
  let keyPem = process.env.APPLE_APNS_KEY_P8;
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const teamId = process.env.APPLE_TEAM_IDENTIFIER;

  if (!keyPem || !keyId || !teamId) {
    console.error("[APNs] Missing JWT credentials");
    return null;
  }

  if (cachedJwt && Date.now() - cachedJwt.createdAt < TOKEN_EXPIRY_MS) {
    return cachedJwt.token;
  }

  try {
    keyPem = keyPem.replace(/\\n/g, "\n").trim();

    const base64Content = keyPem
      .replace(/-----BEGIN[^-]*-----/g, "")
      .replace(/-----END[^-]*-----/g, "")
      .replace(/\s+/g, "");

    console.log(`[APNs] Raw base64 key length: ${base64Content.length} chars`);
    console.log(`[APNs] Base64 starts with: ${base64Content.substring(0, 20)}...`);

    const lines: string[] = [];
    for (let i = 0; i < base64Content.length; i += 64) {
      lines.push(base64Content.substring(i, i + 64));
    }
    const formattedPem = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;

    console.log(`[APNs] Reformatted PEM length: ${formattedPem.length} chars, ${lines.length} lines`);

    let privateKey: crypto.KeyObject;
    try {
      privateKey = crypto.createPrivateKey({
        key: formattedPem,
        format: "pem",
      });
    } catch (pemError: any) {
      console.log("[APNs] PEM parse failed, trying DER...");
      const derBuffer = Buffer.from(base64Content, "base64");
      privateKey = crypto.createPrivateKey({
        key: derBuffer,
        format: "der",
        type: "pkcs8",
      });
    }

    const keyExport = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

    const token = jwt.sign({}, keyExport, {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: keyId,
      },
      issuer: teamId,
      expiresIn: "55m",
    });

    cachedJwt = { token, createdAt: Date.now() };
    console.log("[APNs] JWT token generated successfully");
    return token;
  } catch (error: any) {
    console.error("[APNs] Failed to generate JWT:", error.message);
    console.error("[APNs] Stack:", error.stack?.substring(0, 500));

    try {
      console.log("[APNs] Attempting manual JWT signing as final fallback...");
      const rawKeyPem = keyPem!.replace(/\\n/g, "\n").trim();
      const b64 = rawKeyPem
        .replace(/-----BEGIN[^-]*-----/g, "")
        .replace(/-----END[^-]*-----/g, "")
        .replace(/\s+/g, "");
      const fmtLines: string[] = [];
      for (let i = 0; i < b64.length; i += 64) fmtLines.push(b64.substring(i, i + 64));
      const fmtPem = `-----BEGIN PRIVATE KEY-----\n${fmtLines.join("\n")}\n-----END PRIVATE KEY-----\n`;

      const headerB64 = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const claimsB64 = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
      const signingInput = `${headerB64}.${claimsB64}`;

      const sign = crypto.createSign("SHA256");
      sign.update(signingInput);
      const derSignature = sign.sign(fmtPem);

      let offset = 2;
      if (derSignature[1]! & 0x80) offset += (derSignature[1]! & 0x7f);
      const rLen = derSignature[offset + 1]!;
      let rStart = offset + 2;
      let r = derSignature.subarray(rStart, rStart + rLen);
      if (r.length === 33 && r[0] === 0) r = r.subarray(1);
      const sOff = rStart + rLen;
      const sLen = derSignature[sOff + 1]!;
      let sStart = sOff + 2;
      let s = derSignature.subarray(sStart, sStart + sLen);
      if (s.length === 33 && s[0] === 0) s = s.subarray(1);
      const rPad = Buffer.alloc(32); r.copy(rPad, 32 - r.length);
      const sPad = Buffer.alloc(32); s.copy(sPad, 32 - s.length);
      const rawSig = Buffer.concat([rPad, sPad]);

      const signature = rawSig.toString("base64url");
      const manualJwt = `${signingInput}.${signature}`;
      cachedJwt = { token: manualJwt, createdAt: Date.now() };
      console.log("[APNs] Manual JWT signing succeeded as fallback");
      return manualJwt;
    } catch (fallbackError: any) {
      console.error("[APNs] Manual JWT fallback also failed:", fallbackError.message);
      return null;
    }
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
      console.log(`[APNs] HTTP/2 session established to ${host}`);
      resolve(client);
    });

    client.on("error", (err) => {
      clearTimeout(connectTimeout);
      reject(new Error(`HTTP/2 connection error: ${err.message}`));
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
      "apns-expiration": "0",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
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
        reason: `Request error: ${error.message}`,
      });
    });

    req.write(payload);
    req.end();
  });
}

function logApnsErrorDetails(reason: string, bundleId: string) {
  const hints: Record<string, string> = {
    BadDeviceToken: "Token may be from wrong environment (sandbox vs production), invalid, or expired",
    TopicDisallowed: `Bundle ID "${bundleId}" does not match APNs certificate/key`,
    InvalidProviderToken: "JWT signing key (.p8) may be wrong, expired, or revoked",
    Unregistered: "Device uninstalled the app or token is no longer valid",
    DeviceTokenNotForTopic: `Token was generated for a different bundle ID than "${bundleId}"`,
    MissingTopic: `The apns-topic header is missing. Bundle ID: "${bundleId}"`,
    BadCertificate: `Certificate is invalid or does not match bundle ID "${bundleId}"`,
    BadCertificateEnvironment: "Certificate environment (sandbox/production) does not match APNs endpoint",
    ExpiredProviderToken: "JWT token has expired - cached token issue",
    Forbidden: "The specified action is not allowed - check certificate/key permissions",
    TooManyRequests: "Too many requests for this device token - rate limited by Apple",
  };

  if (hints[reason]) {
    console.error(`[APNs] ${reason}: ${hints[reason]}`);
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
  console.log(`[APNs] Auth method: ${authMethod || "NONE"}`);
  console.log(`[APNs] Endpoint: ${host} (${useSandbox ? "SANDBOX" : "PRODUCTION"})`);
  console.log(`[APNs] Bundle ID: ${bundleId}`);
  console.log(`[APNs] Token count: ${deviceTokens.length}`);
  console.log(`[APNs] Title: "${title}"`);

  if (!authMethod) {
    console.error("[APNs] No authentication method configured!");
    console.error("[APNs] Need either: APPLE_APNS_KEY_P8 + APPLE_APNS_KEY_ID + APPLE_TEAM_IDENTIFIER (JWT)");
    console.error("[APNs] Or: APPLE_APNS_CERTIFICATE_PEM + APPLE_APNS_PRIVATE_KEY_PEM (Certificate)");
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
  console.log(`[APNs] Payload: ${payloadStr}`);

  let client: http2.ClientHttp2Session;
  try {
    console.log(`[APNs] Connecting HTTP/2 to ${host}...`);
    client = await connectHttp2(host, authMethod);
  } catch (error: any) {
    console.error(`[APNs] Failed to establish HTTP/2 connection: ${error.message}`);
    if (authMethod === "cert") {
      console.error("[APNs] Certificate auth connection failed. Check APPLE_APNS_CERTIFICATE_PEM and APPLE_APNS_PRIVATE_KEY_PEM format.");
      console.error("[APNs] Hint: Certificates must be PEM-encoded (.pem format, not .p12).");
    }
    return { sent: 0, failed: deviceTokens.length };
  }

  const allResults: ApnsSendResult[] = [];
  let sent = 0;
  let failed = 0;

  try {
    const BATCH_SIZE = 50;
    for (let i = 0; i < deviceTokens.length; i += BATCH_SIZE) {
      const batch = deviceTokens.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((token) => {
          const cleanToken = token.replace(/[^a-fA-F0-9]/g, "");
          if (cleanToken.length !== 64) {
            console.warn(`[APNs] Skipping invalid token (length ${cleanToken.length}, expected 64): ${token.substring(0, 16)}...`);
            return Promise.resolve({
              success: false,
              token,
              reason: `Invalid token length: ${cleanToken.length} (expected 64 hex chars)`,
            } as ApnsSendResult);
          }
          return sendSinglePush(client, cleanToken, payloadStr, bundleId, authMethod);
        }),
      );

      for (const result of results) {
        allResults.push(result);
        if (result.success) {
          sent++;
          console.log(`[APNs] SUCCESS: ${result.token.substring(0, 12)}... (apns-id: ${result.apnsId})`);
        } else {
          failed++;
          console.error(`[APNs] FAILED: ${result.token.substring(0, 12)}... - ${result.reason} (HTTP ${result.statusCode || "N/A"})`);
          if (result.reason) {
            logApnsErrorDetails(result.reason, bundleId);
          }
        }
      }
    }
  } finally {
    client.close();
    console.log("[APNs] HTTP/2 session closed");
  }

  console.log(`[APNs] Result: Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed, details: allResults };
}

export async function testApnsConnection(): Promise<{
  authMethod: string | null;
  bundleId: string;
  environment: string;
  host: string;
  connectionOk: boolean;
  jwtOk?: boolean;
  certConfigured: boolean;
  jwtConfigured: boolean;
  error?: string;
}> {
  const authMethod = getAuthMethod();
  const bundleId = process.env.APPLE_BUNDLE_ID || "com.bladeoutboards.app";
  const useSandbox = process.env.APNS_ENVIRONMENT === "sandbox";
  const host = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;

  const result = {
    authMethod,
    bundleId,
    environment: useSandbox ? "sandbox" : "production",
    host,
    connectionOk: false,
    certConfigured: isCertAuthConfigured(),
    jwtConfigured: isJwtAuthConfigured(),
  } as any;

  if (!authMethod) {
    result.error = "No auth method configured";
    return result;
  }

  if (authMethod === "jwt") {
    const token = createApnsJwt();
    result.jwtOk = !!token;
    if (!token) {
      result.error = "JWT generation failed";
      return result;
    }
  }

  try {
    const client = await connectHttp2(host, authMethod);
    result.connectionOk = true;
    client.close();
  } catch (error: any) {
    result.error = `Connection failed: ${error.message}`;
  }

  return result;
}

export function isApnsConfigured(): boolean {
  return isJwtAuthConfigured() || isCertAuthConfigured();
}
