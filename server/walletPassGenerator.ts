import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import sharp from "sharp";
import jwt from "jsonwebtoken";
// @ts-ignore
import { toBuffer as zipToBuffer } from "do-not-zip";

interface WalletPassportData {
  ownerEmail: string;
  ownerId: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyExpires: string;
  productName: string;
  maxPower: string;
  batteryCapacity: string;
  vesselName?: string;
  vesselType?: string;
  vesselLength?: string;
  vesselHin?: string;
}

const walletDebugLog: string[] = [];
const MAX_DEBUG_LOG = 200;

function debugLog(message: string): void {
  const entry = `[${new Date().toISOString()}] ${message}`;
  walletDebugLog.push(entry);
  if (walletDebugLog.length > MAX_DEBUG_LOG) {
    walletDebugLog.splice(0, walletDebugLog.length - MAX_DEBUG_LOG);
  }
  console.log(`[Wallet] ${message}`);
}

export function getWalletDebugLog(): string[] {
  return walletDebugLog.slice(-MAX_DEBUG_LOG);
}

async function prepareWalletImages(): Promise<Record<string, Buffer>> {
  const images: Record<string, Buffer> = {};

  const iconSourcePath = path.join(process.cwd(), "server", "wallet-assets", "icon-source.png");
  const logoSourcePath = path.join(process.cwd(), "server", "wallet-assets", "logo-source.png");

  debugLog(`Icon source path: ${iconSourcePath}, exists: ${fs.existsSync(iconSourcePath)}`);
  debugLog(`Logo source path: ${logoSourcePath}, exists: ${fs.existsSync(logoSourcePath)}`);

  try {
    if (fs.existsSync(iconSourcePath)) {
      images["icon.png"] = await sharp(iconSourcePath).resize(29, 29, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["icon@2x.png"] = await sharp(iconSourcePath).resize(58, 58, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["icon@3x.png"] = await sharp(iconSourcePath).resize(87, 87, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["thumbnail.png"] = await sharp(iconSourcePath).resize(90, 90, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["thumbnail@2x.png"] = await sharp(iconSourcePath).resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      debugLog(`Prepared icon images: ${Object.keys(images).filter(k => k.startsWith("icon") || k.startsWith("thumb")).map(k => `${k}(${images[k].length}b)`).join(", ")}`);
    } else {
      debugLog("WARN: icon-source.png not found");
    }
  } catch (e: any) {
    debugLog(`ERROR preparing icon images: ${e.message}`);
  }

  try {
    if (fs.existsSync(logoSourcePath)) {
      images["logo.png"] = await sharp(logoSourcePath).resize(160, 50, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["logo@2x.png"] = await sharp(logoSourcePath).resize(320, 100, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      debugLog(`Prepared logo images: ${Object.keys(images).filter(k => k.startsWith("logo")).map(k => `${k}(${images[k].length}b)`).join(", ")}`);
    } else {
      debugLog("WARN: logo-source.png not found");
    }
  } catch (e: any) {
    debugLog(`ERROR preparing logo images: ${e.message}`);
  }

  debugLog(`Total images prepared: ${Object.keys(images).length} [${Object.keys(images).join(", ")}]`);
  return images;
}

function loadCertFromFileOrEnv(filePath: string, envVar: string): Buffer | null {
  if (fs.existsSync(filePath)) {
    debugLog(`Loading cert from file: ${filePath}`);
    return fs.readFileSync(filePath);
  }
  const envValue = process.env[envVar];
  if (envValue) {
    debugLog(`Loading cert from env: ${envVar} (${envValue.length} chars)`);
    let pemString = envValue;
    if (!pemString.includes("-----BEGIN")) {
      pemString = pemString.replace(/\\n/g, "\n");
    }
    return Buffer.from(pemString, "utf-8");
  }
  debugLog(`WARN: cert not found at file ${filePath} or env ${envVar}`);
  return null;
}

function extractCertInfo(certBuffer: Buffer): { teamId?: string; passTypeId?: string } {
  try {
    const certStr = certBuffer.toString("utf-8");
    const tempFile = path.join("/tmp", `pass_cert_check_${Date.now()}.pem`);
    fs.writeFileSync(tempFile, certStr);
    const subject = execSync(`openssl x509 -in "${tempFile}" -noout -subject 2>/dev/null`).toString().trim();
    fs.unlinkSync(tempFile);

    let teamId: string | undefined;
    let passTypeId: string | undefined;

    const ouMatch = subject.match(/OU\s*=\s*([A-Z0-9]+)/);
    if (ouMatch) teamId = ouMatch[1];

    const uidMatch = subject.match(/UID\s*=\s*(pass\.[^\s,/]+)/);
    if (uidMatch) passTypeId = uidMatch[1];

    debugLog(`Cert subject: ${subject}`);
    debugLog(`Extracted teamId: ${teamId}, passTypeId: ${passTypeId}`);
    return { teamId, passTypeId };
  } catch (e: any) {
    debugLog(`ERROR extracting cert info: ${e.message}`);
    return {};
  }
}

function verifyCertKeyMatch(certBuffer: Buffer, keyBuffer: Buffer): boolean {
  try {
    const certStr = certBuffer.toString("utf-8");
    const keyStr = keyBuffer.toString("utf-8");
    const certTemp = path.join("/tmp", `cert_check_${Date.now()}.pem`);
    const keyTemp = path.join("/tmp", `key_check_${Date.now()}.pem`);
    fs.writeFileSync(certTemp, certStr);
    fs.writeFileSync(keyTemp, keyStr);
    const certMod = execSync(`openssl x509 -in "${certTemp}" -noout -modulus 2>/dev/null | openssl md5`).toString().trim();
    const keyMod = execSync(`openssl rsa -in "${keyTemp}" -noout -modulus 2>/dev/null | openssl md5`).toString().trim();
    fs.unlinkSync(certTemp);
    fs.unlinkSync(keyTemp);
    const match = certMod === keyMod;
    debugLog(`Cert/key match: ${match} (cert: ${certMod}, key: ${keyMod})`);
    return match;
  } catch (e: any) {
    debugLog(`ERROR verifying cert/key match: ${e.message}`);
    return false;
  }
}

function sha1Hash(data: Buffer): string {
  return crypto.createHash("sha1").update(data).digest("hex");
}

function signManifest(manifestData: Buffer, certBuffer: Buffer, keyBuffer: Buffer, wwdrBuffer: Buffer): Buffer {
  const ts = Date.now();
  const manifestPath = path.join("/tmp", `manifest_${ts}.json`);
  const signaturePath = path.join("/tmp", `signature_${ts}.der`);
  const certPath = path.join("/tmp", `signer_cert_${ts}.pem`);
  const keyPath = path.join("/tmp", `signer_key_${ts}.pem`);
  const wwdrPath = path.join("/tmp", `wwdr_${ts}.pem`);

  try {
    fs.writeFileSync(manifestPath, manifestData);
    fs.writeFileSync(certPath, certBuffer);
    fs.writeFileSync(keyPath, keyBuffer);
    fs.writeFileSync(wwdrPath, wwdrBuffer);

    debugLog(`Temp files written: manifest(${manifestData.length}b), cert(${certBuffer.length}b), key(${keyBuffer.length}b), wwdr(${wwdrBuffer.length}b)`);

    const cmd = `openssl smime -sign -binary -in "${manifestPath}" -signer "${certPath}" -inkey "${keyPath}" -certfile "${wwdrPath}" -outform DER -out "${signaturePath}"`;
    debugLog(`OpenSSL command: ${cmd}`);

    const result = execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] });
    debugLog(`OpenSSL sign completed, stdout: ${result.toString()}`);

    if (!fs.existsSync(signaturePath)) {
      throw new Error("Signature file was not created by openssl");
    }

    const signature = fs.readFileSync(signaturePath);
    debugLog(`Signature generated: ${signature.length} bytes`);
    return signature;
  } finally {
    for (const f of [manifestPath, signaturePath, certPath, keyPath, wwdrPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
    debugLog("Temp files cleaned up");
  }
}

function buildPkpassZip(files: Record<string, Buffer>): Buffer {
  const entries = Object.entries(files).map(([p, data]) => ({ path: p, data }));
  debugLog(`Building ZIP with ${entries.length} entries: ${entries.map(e => `${e.path}(${e.data.length}b)`).join(", ")}`);
  const buf = zipToBuffer(entries);
  debugLog(`ZIP created: ${buf.length} bytes`);
  return buf;
}

export function getWalletPassDiagnostics(): Record<string, any> {
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER;
  const teamId = process.env.APPLE_TEAM_IDENTIFIER;
  const wwdrPath = path.join(process.cwd(), "server", "wwdr.pem");
  const certPath = path.join(process.cwd(), "server", "apple_pass_certificate.pem");
  const keyPath = path.join(process.cwd(), "server", "apple_pass_key.pem");

  const wwdrExists = fs.existsSync(wwdrPath);
  const certFileExists = fs.existsSync(certPath);
  const keyFileExists = fs.existsSync(keyPath);
  const wwdrEnvExists = !!process.env.APPLE_WWDR_CERTIFICATE_PEM;
  const certEnvExists = !!process.env.APPLE_PASS_CERTIFICATE_PEM;
  const keyEnvExists = !!process.env.APPLE_PASS_KEY_PEM;

  let wwdrInfo: any = null;
  if (wwdrExists) {
    try {
      const content = fs.readFileSync(wwdrPath, "utf-8");
      wwdrInfo = { source: "file", hasPemHeader: content.includes("-----BEGIN CERTIFICATE-----"), length: content.length };
    } catch {}
  }

  let certInfo: any = null;
  const signerCert = loadCertFromFileOrEnv(certPath, "APPLE_PASS_CERTIFICATE_PEM");
  if (signerCert) {
    const str = signerCert.toString("utf-8");
    certInfo = { source: certFileExists ? "file" : "env", hasPemHeader: str.includes("-----BEGIN CERTIFICATE-----"), length: str.length };
  }

  let keyInfo: any = null;
  const signerKey = loadCertFromFileOrEnv(keyPath, "APPLE_PASS_KEY_PEM");
  if (signerKey) {
    const str = signerKey.toString("utf-8");
    keyInfo = { source: keyFileExists ? "file" : "env", hasPemHeader: str.includes("-----BEGIN"), length: str.length };
  }

  const iconSourcePath = path.join(process.cwd(), "server", "wallet-assets", "icon-source.png");
  const logoSourcePath = path.join(process.cwd(), "server", "wallet-assets", "logo-source.png");

  const result: Record<string, any> = {
    passTypeIdentifier: passTypeId || "NOT SET",
    teamIdentifier: teamId || "NOT SET",
    wwdr: { fileExists: wwdrExists, envExists: wwdrEnvExists, info: wwdrInfo },
    signerCert: { fileExists: certFileExists, envExists: certEnvExists, info: certInfo },
    signerKey: { fileExists: keyFileExists, envExists: keyEnvExists, info: keyInfo },
    images: {
      iconSource: fs.existsSync(iconSourcePath),
      logoSource: fs.existsSync(logoSourcePath),
    },
    csrExists: fs.existsSync(path.join(process.cwd(), "server", "pass_signing.csr")),
    ready: !!((wwdrExists || wwdrEnvExists) && (certFileExists || certEnvExists || signerCert) && (keyFileExists || keyEnvExists || signerKey)),
  };

  if (signerCert) {
    const extracted = extractCertInfo(signerCert);
    result.certExtracted = extracted;
    if (extracted.teamId && teamId && extracted.teamId !== teamId) {
      result.teamIdMismatch = `Env has ${teamId} but cert has ${extracted.teamId} - will use cert value`;
    }
    if (extracted.passTypeId && passTypeId && extracted.passTypeId !== passTypeId) {
      result.passTypeIdMismatch = `Env has ${passTypeId} but cert has ${extracted.passTypeId} - will use cert value`;
    }
  }
  if (signerCert && signerKey) {
    result.certKeyMatch = verifyCertKeyMatch(signerCert, signerKey);
  }

  return result;
}

export async function generateAppleWalletPass(passportData: WalletPassportData): Promise<{ buffer: Buffer } | { error: string }> {
  debugLog("=== Starting Apple Wallet pass generation ===");
  debugLog(`Passport data: serial=${passportData.serialNumber}, owner=${passportData.ownerEmail}, product=${passportData.productName}`);

  const wwdrPath = path.join(process.cwd(), "server", "wwdr.pem");
  const certPath = path.join(process.cwd(), "server", "apple_pass_certificate.pem");
  const keyPath = path.join(process.cwd(), "server", "apple_pass_key.pem");

  const wwdr = loadCertFromFileOrEnv(wwdrPath, "APPLE_WWDR_CERTIFICATE_PEM");
  const signerCert = loadCertFromFileOrEnv(certPath, "APPLE_PASS_CERTIFICATE_PEM");
  const signerKey = loadCertFromFileOrEnv(keyPath, "APPLE_PASS_KEY_PEM");

  if (!wwdr || !signerCert || !signerKey) {
    let missing = [];
    if (!wwdr) missing.push("WWDR certificate (wwdr.pem or APPLE_WWDR_CERTIFICATE_PEM)");
    if (!signerCert) missing.push("Pass certificate (apple_pass_certificate.pem or APPLE_PASS_CERTIFICATE_PEM)");
    if (!signerKey) missing.push("Pass key (apple_pass_key.pem or APPLE_PASS_KEY_PEM)");
    debugLog(`Missing config: ${missing.join(", ")}`);
    return { error: `Apple Wallet certificates not configured. Missing: ${missing.join(", ")}` };
  }

  const certKeyMatch = verifyCertKeyMatch(signerCert, signerKey);
  if (!certKeyMatch) {
    debugLog("ERROR: Certificate and key do not match");
    return { error: "Pass signing certificate and key do not match. Please ensure the key matches the certificate." };
  }

  const certInfo = extractCertInfo(signerCert);
  const passTypeId = certInfo.passTypeId || process.env.APPLE_PASS_TYPE_IDENTIFIER;
  const teamId = certInfo.teamId || process.env.APPLE_TEAM_IDENTIFIER;

  if (!passTypeId || !teamId) {
    debugLog(`ERROR: Missing identifiers - passTypeId=${passTypeId}, teamId=${teamId}`);
    return { error: `Could not determine passTypeIdentifier or teamIdentifier from certificate. passTypeId=${passTypeId}, teamId=${teamId}` };
  }

  debugLog(`Using passTypeIdentifier: ${passTypeId}, teamIdentifier: ${teamId}`);

  try {
    const images = await prepareWalletImages();

    const domain = process.env.EXPO_PUBLIC_DOMAIN || "bladephoneapp.replit.app";
    const qrUrl = `https://${domain}/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;
    debugLog(`QR URL: ${qrUrl}`);

    const passJson: Record<string, any> = {
      formatVersion: 1,
      serialNumber: `blade-${passportData.serialNumber}-${passportData.ownerId}`.substring(0, 64),
      description: "Blade Outboard Motor Passport",
      organizationName: "Blade Marine Technologies",
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(20, 40, 65)",
      labelColor: "rgb(180, 200, 220)",
      logoText: "Blade Outboards",
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: qrUrl,
          messageEncoding: "iso-8859-1",
          altText: passportData.serialNumber,
        },
      ],
      barcode: {
        format: "PKBarcodeFormatQR",
        message: qrUrl,
        messageEncoding: "iso-8859-1",
        altText: passportData.serialNumber,
      },
      generic: {
        headerFields: [
          {
            key: "warranty",
            label: "WARRANTY",
            value: passportData.warrantyExpires,
          },
        ],
        primaryFields: [
          {
            key: "product",
            label: "OUTBOARD",
            value: passportData.productName || "Blade Halo 6",
          },
        ],
        secondaryFields: [
          {
            key: "serial",
            label: "SERIAL NUMBER",
            value: passportData.serialNumber,
          },
          {
            key: "owner",
            label: "OWNER",
            value: passportData.ownerEmail,
          },
        ],
        auxiliaryFields: [
          {
            key: "power",
            label: "POWER",
            value: passportData.maxPower || "3000W",
          },
          {
            key: "battery",
            label: "BATTERY",
            value: passportData.batteryCapacity || "1700Wh",
          },
          {
            key: "purchased",
            label: "PURCHASED",
            value: passportData.purchaseDate,
          },
        ],
        backFields: [
          {
            key: "ownerEmail",
            label: "Owner Email",
            value: passportData.ownerEmail,
          },
          {
            key: "ownerId",
            label: "Account ID",
            value: passportData.ownerId,
          },
          {
            key: "serialBack",
            label: "Motor Serial Number",
            value: passportData.serialNumber,
          },
          {
            key: "productBack",
            label: "Product",
            value: `${passportData.productName || "Blade Halo 6"} - ${passportData.maxPower || "3000W"} / ${passportData.batteryCapacity || "1700Wh"}`,
          },
          {
            key: "warrantyBack",
            label: "Warranty Period",
            value: `${passportData.purchaseDate} to ${passportData.warrantyExpires}`,
          },
          {
            key: "vesselName",
            label: "Vessel Name",
            value: passportData.vesselName || "Not Registered",
          },
          {
            key: "vesselType",
            label: "Vessel Type",
            value: passportData.vesselType || "Not Specified",
          },
          {
            key: "vesselLength",
            label: "Vessel Length",
            value: passportData.vesselLength || "Not Specified",
          },
          {
            key: "vesselHin",
            label: "Hull Identification Number",
            value: passportData.vesselHin || "Not Registered",
          },
          {
            key: "qrInfo",
            label: "QR Code",
            value: "Scan the QR code on the front of this pass at authorized Blade service centers worldwide for warranty verification, service history, and promotional prize eligibility at international boat shows and tradeshows.",
          },
          {
            key: "company",
            label: "Company",
            value: "Blade Marine Technologies Ltd\nbladeoutboards.com",
          },
        ],
      },
    };

    const passJsonBuffer = Buffer.from(JSON.stringify(passJson), "utf-8");
    debugLog(`pass.json built: ${passJsonBuffer.length} bytes`);
    debugLog(`pass.json content: ${JSON.stringify(passJson).substring(0, 500)}...`);

    const allFiles: Record<string, Buffer> = {
      "pass.json": passJsonBuffer,
      ...images,
    };

    const manifest: Record<string, string> = {};
    for (const [filename, data] of Object.entries(allFiles)) {
      manifest[filename] = sha1Hash(data);
      debugLog(`Manifest hash: ${filename} -> ${manifest[filename]} (${data.length} bytes)`);
    }

    const manifestBuffer = Buffer.from(JSON.stringify(manifest), "utf-8");
    debugLog(`manifest.json built: ${manifestBuffer.length} bytes`);

    debugLog("Signing manifest with openssl...");
    const signatureBuffer = signManifest(manifestBuffer, signerCert, signerKey, wwdr);

    const pkpassFiles: Record<string, Buffer> = {
      ...allFiles,
      "manifest.json": manifestBuffer,
      "signature": signatureBuffer,
    };

    const zipBuffer = buildPkpassZip(pkpassFiles);
    debugLog(`=== Pass generated successfully: ${zipBuffer.length} bytes ===`);
    return { buffer: zipBuffer };
  } catch (e: any) {
    debugLog(`ERROR generating pass: ${e.message}\n${e.stack}`);
    return { error: `Failed to generate Apple Wallet pass: ${e.message}` };
  }
}

export async function generateTestPassDirect(): Promise<{ buffer: Buffer; debugLog: string[] } | { error: string; debugLog: string[] }> {
  debugLog("=== generateTestPassDirect called ===");

  const testData: WalletPassportData = {
    ownerEmail: "test@bladeoutboards.com",
    ownerId: "test-user-001",
    serialNumber: "BLD-TEST-001",
    purchaseDate: "2025-01-01",
    warrantyExpires: "2027-01-01",
    productName: "Blade Halo 6",
    maxPower: "3000W",
    batteryCapacity: "1700Wh",
    vesselName: "Test Vessel",
    vesselType: "RIB",
    vesselLength: "5m",
    vesselHin: "TEST-HIN-001",
  };

  const result = await generateAppleWalletPass(testData);

  if ("error" in result) {
    return { error: result.error, debugLog: getWalletDebugLog() };
  }

  return { buffer: result.buffer, debugLog: getWalletDebugLog() };
}

export async function generateGoogleWalletUrl(passportData: WalletPassportData): Promise<{ url: string } | { error: string }> {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;

  if (!issuerId || !serviceAccountKey) {
    return { error: "Google Wallet credentials not configured. Please add GOOGLE_WALLET_ISSUER_ID and GOOGLE_WALLET_SERVICE_ACCOUNT_KEY to your environment secrets." };
  }

  try {
    let keyData: any;
    try {
      keyData = JSON.parse(serviceAccountKey);
    } catch {
      return { error: "Invalid Google Wallet service account key JSON." };
    }

    const objectId = `${issuerId}.blade-passport-${passportData.serialNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}-${passportData.ownerId.substring(0, 8)}`;

    const domain = process.env.EXPO_PUBLIC_DOMAIN || "bladephoneapp.replit.app";
    const qrUrl = `https://${domain}/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;

    const genericObject = {
      id: objectId,
      classId: `${issuerId}.blade-outboard-passport`,
      genericType: "GENERIC_TYPE_UNSPECIFIED",
      hexBackgroundColor: "#142841",
      logo: {
        sourceUri: {
          uri: "https://bladeoutboards.com/logo-white.png",
        },
        contentDescription: {
          defaultValue: { language: "en", value: "Blade Outboards" },
        },
      },
      cardTitle: {
        defaultValue: { language: "en", value: "Blade Outboard Passport" },
      },
      subheader: {
        defaultValue: { language: "en", value: "OUTBOARD" },
      },
      header: {
        defaultValue: { language: "en", value: passportData.productName || "Blade Halo 6" },
      },
      barcode: {
        type: "QR_CODE",
        value: qrUrl,
        alternateText: passportData.serialNumber,
      },
      textModulesData: [
        {
          id: "serial",
          header: "SERIAL NUMBER",
          body: passportData.serialNumber,
        },
        {
          id: "owner",
          header: "OWNER",
          body: passportData.ownerEmail,
        },
        {
          id: "power",
          header: "SPECIFICATIONS",
          body: `${passportData.maxPower || "3000W"} | ${passportData.batteryCapacity || "1700Wh"}`,
        },
        {
          id: "warranty",
          header: "WARRANTY",
          body: `${passportData.purchaseDate} - ${passportData.warrantyExpires}`,
        },
        {
          id: "vessel",
          header: "VESSEL",
          body: `${passportData.vesselName || "Not Registered"} (${passportData.vesselType || "N/A"})`,
        },
      ],
    };

    const claims = {
      iss: keyData.client_email,
      aud: "google",
      origins: [],
      typ: "savetowallet",
      payload: {
        genericObjects: [genericObject],
      },
    };

    const token = jwt.sign(claims, keyData.private_key, { algorithm: "RS256" });
    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    return { url: saveUrl };
  } catch (e: any) {
    console.error("[Google Wallet] Generation error:", e);
    return { error: `Failed to generate Google Wallet pass: ${e.message}` };
  }
}
