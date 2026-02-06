import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const BLADE_GREEN = '#7CB87C';
const BLACK = '#1a1a1a';
const GRAY = '#666666';
const LIGHT_GRAY = '#e0e0e0';
const DARK_GRAY = '#333333';

interface PassportData {
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

function drawSectionHeader(doc: PDFKit.PDFDocument, y: number, title: string): number {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLADE_GREEN);
  doc.text(title.toUpperCase(), MARGIN, y);
  y += 14;
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
  y += 6;
  return y;
}

function drawLabelValue(doc: PDFKit.PDFDocument, y: number, label: string, value: string, xOffset = 0): number {
  const x = MARGIN + xOffset;
  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  doc.text(label, x, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK);
  doc.text(value || 'N/A', x, y + 11);
  return y + 26;
}

export async function generatePassportPDFBuffer(passportData: PassportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: 'Blade Outboard Passport',
      Author: 'Blade Marine Technologies Ltd',
      Subject: 'Digital Ownership Certificate',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = MARGIN;

  const logoPath = path.join(process.cwd(), 'server', 'blade-passport-logo.png');
  try {
    if (fs.existsSync(logoPath)) {
      const logoHeight = 50;
      const logoWidth = 180;
      const logoX = (PAGE_WIDTH - logoWidth) / 2;
      doc.image(logoPath, logoX, y, { width: logoWidth, height: logoHeight });
      y += logoHeight + 12;
    } else {
      y += 20;
    }
  } catch (e) {
    y += 20;
  }

  doc.font('Helvetica-Bold').fontSize(24).fillColor(BLADE_GREEN);
  doc.text('OUTBOARD PASSPORT', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 28;

  doc.font('Helvetica').fontSize(11).fillColor(GRAY);
  doc.text('Digital Ownership Certificate', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 20;

  doc.strokeColor(BLADE_GREEN).lineWidth(1.5);
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
  y += 20;

  doc.font('Helvetica-Bold').fontSize(22).fillColor(BLACK);
  doc.text(passportData.productName || 'Blade Halo 6', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 26;

  const subtitle = `${passportData.maxPower || '3000W Continuous'} | ${passportData.batteryCapacity || '1700Wh Battery'}`;
  doc.font('Helvetica').fontSize(12).fillColor(GRAY);
  doc.text(subtitle, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 28;

  y = drawSectionHeader(doc, y, 'Owner Information');
  const ownerY = y;
  drawLabelValue(doc, ownerY, 'Email', passportData.ownerEmail);
  drawLabelValue(doc, ownerY, 'Account ID', passportData.ownerId, CONTENT_WIDTH / 2);
  y = ownerY + 30;

  y = drawSectionHeader(doc, y, 'Motor Information');
  const motorY = y;
  drawLabelValue(doc, motorY, 'Serial Number', passportData.serialNumber);
  drawLabelValue(doc, motorY, 'Purchase Date', passportData.purchaseDate, CONTENT_WIDTH / 2);
  y = motorY + 30;
  drawLabelValue(doc, y, 'Warranty Expires', passportData.warrantyExpires);
  y += 30;

  y = drawSectionHeader(doc, y, 'Vessel Information');
  const vesselY = y;
  drawLabelValue(doc, vesselY, 'Vessel Name', passportData.vesselName || 'Not Registered');
  drawLabelValue(doc, vesselY, 'Vessel Type', passportData.vesselType || 'Not Specified', CONTENT_WIDTH / 2);
  y = vesselY + 30;
  const vesselY2 = y;
  drawLabelValue(doc, vesselY2, 'Vessel Length', passportData.vesselLength || 'Not Specified');
  drawLabelValue(doc, vesselY2, 'Hull Identification Number (HIN)', passportData.vesselHin || 'Not Registered', CONTENT_WIDTH / 2);
  y = vesselY2 + 30;

  y = drawSectionHeader(doc, y, 'Regulatory Compliance');

  const ukcaLogoPath = path.join(process.cwd(), 'server', 'ukca-logo.png');
  try {
    if (fs.existsSync(ukcaLogoPath)) {
      const ukcaHeight = 40;
      const ukcaX = (PAGE_WIDTH - 160) / 2;
      doc.image(ukcaLogoPath, ukcaX, y, { width: 160, height: ukcaHeight });
      y += ukcaHeight + 20;
    } else {
      y += 10;
    }
  } catch (e) {
    y += 10;
  }

  y = drawSectionHeader(doc, y, 'Warranty & Service');

  const qrUrl = `https://bladeoutboards.com/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 140, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  const qrSize = 90;
  doc.image(qrBuffer, MARGIN, y, { width: qrSize, height: qrSize });

  const qrTextX = MARGIN + qrSize + 15;
  const qrTextWidth = CONTENT_WIDTH - qrSize - 15;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK);
  doc.text('Scan for Warranty Lookup', qrTextX, y + 2, { width: qrTextWidth });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY);
  doc.text(
    'Use this QR code at authorized Blade service centers worldwide for warranty verification, service history, and promotional prize eligibility at international boat shows and tradeshows.',
    qrTextX, y + 18, { width: qrTextWidth }
  );
  y += qrSize + 15;

  const chopPath = path.join(process.cwd(), 'server', 'company-chop.png');
  try {
    if (fs.existsSync(chopPath)) {
      const chopSize = 80;
      const chopX = PAGE_WIDTH - MARGIN - chopSize;
      doc.image(chopPath, chopX, y, { width: chopSize, height: chopSize });
    }
  } catch (e) {}

  const footerY = PAGE_HEIGHT - 80;
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.moveTo(MARGIN, footerY).lineTo(PAGE_WIDTH - MARGIN, footerY).stroke();

  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_GRAY);
  doc.text('Blade Marine Technologies Ltd', MARGIN, footerY + 8, { width: CONTENT_WIDTH, align: 'center' });

  doc.font('Helvetica').fontSize(7).fillColor(GRAY);
  doc.text(
    'This document serves as a digital ownership certificate for your Blade outboard motor. It is not a legal proof of ownership.',
    MARGIN, footerY + 22, { width: CONTENT_WIDTH, align: 'center' }
  );

  doc.font('Helvetica').fontSize(8).fillColor(BLADE_GREEN);
  doc.text('bladeoutboards.com', MARGIN, footerY + 36, { width: CONTENT_WIDTH, align: 'center' });

  doc.end();

  return pdfPromise;
}

export async function generatePassportPDF(res: Response, passportData: PassportData): Promise<void> {
  const pdfBuffer = await generatePassportPDFBuffer(passportData);
  const base64 = pdfBuffer.toString('base64');

  res.json({
    success: true,
    data: base64,
    filename: `blade-passport-${passportData.serialNumber || 'unknown'}.pdf`,
  });
}
