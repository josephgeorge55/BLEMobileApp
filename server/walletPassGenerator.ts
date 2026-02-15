import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import jwt from "jsonwebtoken";
import { PKPass } from "passkit-generator";
import { execSync } from "child_process";

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
  const ukcaLogoPath = path.join(process.cwd(), "assets", "images", "ukca-logo.png");

  debugLog(`Icon source path: ${iconSourcePath}, exists: ${fs.existsSync(iconSourcePath)}`);
  debugLog(`Logo source path: ${logoSourcePath}, exists: ${fs.existsSync(logoSourcePath)}`);
  debugLog(`UKCA logo path: ${ukcaLogoPath}, exists: ${fs.existsSync(ukcaLogoPath)}`);

  try {
    if (fs.existsSync(iconSourcePath)) {
      images["icon.png"] = await sharp(iconSourcePath).resize(29, 29, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["icon@2x.png"] = await sharp(iconSourcePath).resize(58, 58, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["icon@3x.png"] = await sharp(iconSourcePath).resize(87, 87, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      debugLog(`Prepared icon images: ${Object.keys(images).filter(k => k.startsWith("icon")).map(k => `${k}(${images[k].length}b)`).join(", ")}`);
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

  try {
    if (fs.existsSync(ukcaLogoPath)) {
      const bgColor = { r: 10, g: 22, b: 40 };
      const invertedLogo = await sharp(ukcaLogoPath)
        .negate({ alpha: false })
        .resize(70, 70, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      images["thumbnail.png"] = await sharp({
        create: { width: 90, height: 90, channels: 4, background: { ...bgColor, alpha: 1 } }
      }).composite([{ input: invertedLogo, gravity: "centre" }]).png().toBuffer();
      
      const invertedLogo2x = await sharp(ukcaLogoPath)
        .negate({ alpha: false })
        .resize(140, 140, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      images["thumbnail@2x.png"] = await sharp({
        create: { width: 180, height: 180, channels: 4, background: { ...bgColor, alpha: 1 } }
      }).composite([{ input: invertedLogo2x, gravity: "centre" }]).png().toBuffer();
      
      debugLog(`Prepared UKCA thumbnail images (white on navy): thumbnail.png(${images["thumbnail.png"].length}b), thumbnail@2x.png(${images["thumbnail@2x.png"].length}b)`);
    } else {
      debugLog("WARN: ukca-logo.png not found, using icon as thumbnail fallback");
      if (fs.existsSync(iconSourcePath)) {
        images["thumbnail.png"] = await sharp(iconSourcePath).resize(90, 90, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        images["thumbnail@2x.png"] = await sharp(iconSourcePath).resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      }
    }
  } catch (e: any) {
    debugLog(`ERROR preparing thumbnail images: ${e.message}`);
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

  const result: Record<string, any> = {
    passTypeIdentifier: passTypeId || "NOT SET",
    teamIdentifier: teamId || "NOT SET",
    wwdr: { fileExists: wwdrExists, envExists: wwdrEnvExists },
    signerCert: { fileExists: certFileExists, envExists: certEnvExists },
    signerKey: { fileExists: keyFileExists, envExists: keyEnvExists },
    images: {
      iconSource: fs.existsSync(path.join(process.cwd(), "server", "wallet-assets", "icon-source.png")),
      logoSource: fs.existsSync(path.join(process.cwd(), "server", "wallet-assets", "logo-source.png")),
    },
    ready: !!((wwdrExists || wwdrEnvExists) && (certFileExists || certEnvExists) && (keyFileExists || keyEnvExists)),
    library: "passkit-generator (PKPass v3)",
  };

  const signerCert = loadCertFromFileOrEnv(certPath, "APPLE_PASS_CERTIFICATE_PEM");
  if (signerCert) {
    const extracted = extractCertInfo(signerCert);
    result.certExtracted = extracted;
  }

  return result;
}

export async function generateAppleWalletPass(passportData: WalletPassportData): Promise<{ buffer: Buffer } | { error: string }> {
  debugLog("=== Starting Apple Wallet pass generation (passkit-generator) ===");
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

  const certInfo = extractCertInfo(signerCert);
  const passTypeId = certInfo.passTypeId || process.env.APPLE_PASS_TYPE_IDENTIFIER;
  const teamId = certInfo.teamId || process.env.APPLE_TEAM_IDENTIFIER;

  if (!passTypeId || !teamId) {
    debugLog(`ERROR: Missing identifiers - passTypeId=${passTypeId}, teamId=${teamId}`);
    return { error: `Could not determine passTypeIdentifier or teamIdentifier. passTypeId=${passTypeId}, teamId=${teamId}` };
  }

  debugLog(`Using passTypeIdentifier: ${passTypeId}, teamIdentifier: ${teamId}`);

  try {
    const images = await prepareWalletImages();

    const domain = process.env.EXPO_PUBLIC_DOMAIN || "bladephoneapp.replit.app";
    const qrUrl = `https://${domain}/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;
    debugLog(`QR URL: ${qrUrl}`);

    const pass = new PKPass(
      images,
      {
        wwdr,
        signerCert,
        signerKey,
      },
      {
        formatVersion: 1,
        serialNumber: `blade-${passportData.serialNumber}-${passportData.ownerId}`.substring(0, 64),
        description: "Blade Outboard Digital Passport",
        organizationName: "Blade Marine Technologies",
        passTypeIdentifier: passTypeId,
        teamIdentifier: teamId,
        foregroundColor: "rgb(255, 255, 255)",
        backgroundColor: "rgb(10, 22, 40)",
        labelColor: "rgb(164, 208, 139)",
        logoText: "Blade Outboards",
      }
    );

    pass.type = "generic";

    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: qrUrl,
      messageEncoding: "iso-8859-1",
      altText: `S/N: ${passportData.serialNumber}`,
    });

    pass.headerFields.push({
      key: "passport",
      label: "PASSPORT",
      value: "Digital",
    });

    pass.primaryFields.push({
      key: "product",
      label: passportData.serialNumber,
      value: passportData.productName || "Blade Halo 6",
    });

    pass.secondaryFields.push(
      {
        key: "purchased",
        label: "DATE OF PURCHASE",
        value: passportData.purchaseDate,
      },
      {
        key: "warranty",
        label: "WARRANTY EXPIRY",
        value: passportData.warrantyExpires,
      }
    );

    pass.auxiliaryFields.push(
      {
        key: "owner",
        label: "REGISTERED OWNER",
        value: passportData.ownerEmail,
      },
      {
        key: "vessel",
        label: "VESSEL",
        value: passportData.vesselName && passportData.vesselName !== "Not available"
          ? `${passportData.vesselName} (${passportData.vesselType || "N/A"})`
          : "Not Registered",
      }
    );

    pass.backFields.push(
      {
        key: "title",
        label: "BLADE OUTBOARD DIGITAL PASSPORT",
        value: "Official Certificate of Ownership & Registration",
      },
      {
        key: "divider1",
        label: " ",
        value: "________________________________________",
      },
      {
        key: "ownerSection",
        label: "OWNER DETAILS",
        value: `${passportData.ownerEmail}\nAccount: ${passportData.ownerId}`,
      },
      {
        key: "motorSection",
        label: "MOTOR SPECIFICATIONS",
        value: `${passportData.productName || "Blade Halo 6"}\nSerial: ${passportData.serialNumber}\nContinuous Power: ${passportData.maxPower || "3000W"}\nBattery: ${passportData.batteryCapacity || "1700Wh"}`,
      },
      {
        key: "warrantySection",
        label: "WARRANTY COVERAGE",
        value: `Purchase Date: ${passportData.purchaseDate}\nExpiry Date: ${passportData.warrantyExpires}`,
      },
      {
        key: "divider2",
        label: " ",
        value: "________________________________________",
      },
      {
        key: "vesselSection",
        label: "REGISTERED VESSEL",
        value: `Name: ${passportData.vesselName || "Not Registered"}\nType: ${passportData.vesselType || "Not Specified"}\nLength: ${passportData.vesselLength || "Not Specified"}\nHIN: ${passportData.vesselHin || "Not Registered"}`,
      },
      {
        key: "divider3",
        label: " ",
        value: "________________________________________",
      },
      {
        key: "compliance",
        label: "REGULATORY COMPLIANCE",
        value: "CE Marked | UKCA Certified | RoHS Compliant\nConforms to ISO 16315 & IEC 60335-2-56",
      },
      {
        key: "qrInfo",
        label: "QR CODE VERIFICATION",
        value: "Present this pass at any authorized Blade service center worldwide for warranty verification, service history, and eligibility for promotional prizes at international boat shows and tradeshows.",
      },
      {
        key: "divider4",
        label: " ",
        value: "________________________________________",
      },
      {
        key: "issuer",
        label: "ISSUED BY",
        value: "Blade Marine Technologies Limited\nbladeoutboards.com",
      },
      {
        key: "trademark",
        label: "LEGAL",
        value: "Blade Outboards\u2122 2026. All rights reserved.\nThis digital passport is non-transferable and remains the property of Blade Marine Technologies Limited.",
      }
    );

    debugLog("PKPass object configured, generating buffer...");
    const buffer = pass.getAsBuffer();
    debugLog(`=== Pass generated successfully: ${buffer.length} bytes (passkit-generator) ===`);
    return { buffer: Buffer.from(buffer) };
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

    const sanitizedSerial = passportData.serialNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedOwner = passportData.ownerId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 8);
    const classId = `${issuerId}.blade-outboard-passport`;
    const objectId = `${issuerId}.blade-passport-${sanitizedSerial}-${sanitizedOwner}`;

    const domain = process.env.EXPO_PUBLIC_DOMAIN || "bladephoneapp.replit.app";
    const qrUrl = `https://${domain}/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;

    const genericClass = {
      id: classId,
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['serial']" }],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['owner']" }],
                  },
                },
              },
            },
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['warranty']" }],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['power']" }],
                  },
                },
              },
            },
            {
              oneItem: {
                item: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['vessel']" }],
                  },
                },
              },
            },
          ],
        },
      },
    };

    const genericObject = {
      id: objectId,
      classId: classId,
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
        genericClasses: [genericClass],
        genericObjects: [genericObject],
      },
    };

    const token = jwt.sign(claims, keyData.private_key, { algorithm: "RS256" });
    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    debugLog(`Google Wallet URL generated for serial=${passportData.serialNumber}, objectId=${objectId}`);
    return { url: saveUrl };
  } catch (e: any) {
    console.error("[Google Wallet] Generation error:", e);
    return { error: `Failed to generate Google Wallet pass: ${e.message}` };
  }
}
