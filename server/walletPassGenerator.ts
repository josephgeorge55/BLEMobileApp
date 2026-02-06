import { PKPass } from "passkit-generator";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";

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

async function prepareWalletImages(): Promise<Record<string, Buffer>> {
  const images: Record<string, Buffer> = {};
  
  const iconSourcePath = path.join(process.cwd(), "server", "wallet-assets", "icon-source.png");
  const logoSourcePath = path.join(process.cwd(), "server", "wallet-assets", "logo-source.png");
  
  try {
    if (fs.existsSync(iconSourcePath)) {
      images["icon.png"] = await sharp(iconSourcePath).resize(29, 29, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["icon@2x.png"] = await sharp(iconSourcePath).resize(58, 58, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["icon@3x.png"] = await sharp(iconSourcePath).resize(87, 87, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["thumbnail.png"] = await sharp(iconSourcePath).resize(90, 90, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["thumbnail@2x.png"] = await sharp(iconSourcePath).resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
  } catch (e) {
    console.error("[Wallet] Error preparing icon images:", e);
  }

  try {
    if (fs.existsSync(logoSourcePath)) {
      images["logo.png"] = await sharp(logoSourcePath).resize(160, 50, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      images["logo@2x.png"] = await sharp(logoSourcePath).resize(320, 100, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
  } catch (e) {
    console.error("[Wallet] Error preparing logo images:", e);
  }

  return images;
}

export async function generateAppleWalletPass(passportData: WalletPassportData): Promise<{ buffer: Buffer } | { error: string }> {
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER;
  const teamId = process.env.APPLE_TEAM_IDENTIFIER;
  const signerCert = process.env.APPLE_PASS_CERTIFICATE_PEM;
  const signerKey = process.env.APPLE_PASS_KEY_PEM;
  const wwdr = process.env.APPLE_WWDR_CERTIFICATE_PEM;

  if (!passTypeId || !teamId || !signerCert || !signerKey || !wwdr) {
    return { error: "Apple Wallet certificates not configured. Please add APPLE_PASS_TYPE_IDENTIFIER, APPLE_TEAM_IDENTIFIER, APPLE_PASS_CERTIFICATE_PEM, APPLE_PASS_KEY_PEM, and APPLE_WWDR_CERTIFICATE_PEM to your environment secrets." };
  }

  try {
    const images = await prepareWalletImages();
    
    const qrUrl = `https://bladeoutboards.com/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;

    const pass = new PKPass(images, {
      wwdr: wwdr,
      signerCert: signerCert,
      signerKey: signerKey,
    }, {
      serialNumber: `blade-${passportData.serialNumber}-${passportData.ownerId}`.substring(0, 64),
      description: "Blade Outboard Passport",
      organizationName: "Blade Marine Technologies",
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(20, 40, 65)",
      labelColor: "rgb(180, 200, 220)",
      logoText: "Blade Outboards",
    });

    pass.type = "generic";

    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: qrUrl,
      messageEncoding: "iso-8859-1",
      altText: passportData.serialNumber,
    });

    pass.headerFields.push({
      key: "warranty",
      label: "WARRANTY",
      value: passportData.warrantyExpires,
    });

    pass.primaryFields.push({
      key: "product",
      label: "OUTBOARD",
      value: passportData.productName || "Blade Halo 6",
    });

    pass.secondaryFields.push(
      {
        key: "serial",
        label: "SERIAL NUMBER",
        value: passportData.serialNumber,
      },
      {
        key: "owner",
        label: "OWNER",
        value: passportData.ownerEmail,
      }
    );

    pass.auxiliaryFields.push(
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
      }
    );

    pass.backFields.push(
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
      }
    );

    const buffer = pass.getAsBuffer();
    return { buffer };
  } catch (e: any) {
    console.error("[Apple Wallet] Generation error:", e);
    return { error: `Failed to generate Apple Wallet pass: ${e.message}` };
  }
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

    const qrUrl = `https://bladeoutboards.com/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;

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
