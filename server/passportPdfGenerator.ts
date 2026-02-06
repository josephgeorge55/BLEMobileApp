import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 55;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const BLADE_GREEN = '#7CB87C';
const BLACK = '#1a1a1a';
const GRAY = '#666666';
const LIGHT_GRAY = '#d4d4d4';
const MID_GRAY = '#999999';

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
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLADE_GREEN);
  doc.text(title.toUpperCase(), MARGIN, y, { characterSpacing: 1.2, lineBreak: false });
  y += 14;
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
  y += 10;
  return y;
}

function drawField(doc: PDFKit.PDFDocument, y: number, label: string, value: string, x: number, width: number): void {
  doc.font('Helvetica').fontSize(8).fillColor(MID_GRAY);
  doc.text(label, x, y, { width, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK);
  doc.text(value || 'N/A', x, y + 12, { width, lineBreak: false });
}

function drawFieldRow(doc: PDFKit.PDFDocument, y: number, fields: { label: string; value: string }[]): number {
  const colWidth = CONTENT_WIDTH / fields.length;
  for (let i = 0; i < fields.length; i++) {
    drawField(doc, y, fields[i].label, fields[i].value, MARGIN + i * colWidth, colWidth - 10);
  }
  return y + 32;
}

export async function generatePassportPDFBuffer(passportData: PassportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: MARGIN,
    bufferPages: true,
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

  // Prevent PDFKit from auto-creating additional pages
  const originalAddPage = doc.addPage.bind(doc);
  let pageCount = 1; // First page already created by constructor
  doc.addPage = function(...args: any[]) {
    pageCount++;
    if (pageCount > 1) {
      return doc; // Block additional pages
    }
    return originalAddPage(...args);
  } as any;

  let y = MARGIN;

  const logoPath = path.join(process.cwd(), 'server', 'blade-passport-logo.png');
  try {
    if (fs.existsSync(logoPath)) {
      const logoWidth = 180;
      const logoHeight = logoWidth / 2.62;
      const logoX = (PAGE_WIDTH - logoWidth) / 2;
      doc.image(logoPath, logoX, y, { width: logoWidth });
      y += logoHeight + 18;
    } else {
      y += 20;
    }
  } catch (e) {
    y += 20;
  }

  doc.font('Helvetica-Bold').fontSize(20).fillColor(BLACK);
  doc.text('OUTBOARD PASSPORT', MARGIN, y, { width: CONTENT_WIDTH, align: 'center', characterSpacing: 2, lineBreak: false });
  y += 26;

  const latinTranslations = [
    'AUSSENBORD-REISEPASS',
    'PASSAPORTO FUORIBORDO',
    'PASAPORTE FUERABORDA',
    'PAS ZA PLAVBU',
    'PASZPORT SILNIKA',
  ];
  
  doc.font('Helvetica').fontSize(6.5).fillColor(GRAY);
  doc.text(latinTranslations.join('  |  '), MARGIN, y, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });
  y += 14;

  doc.font('Helvetica').fontSize(10).fillColor(MID_GRAY);
  doc.text('Digital Ownership Certificate', MARGIN, y, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });
  y += 22;

  doc.strokeColor(BLADE_GREEN).lineWidth(1);
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
  y += 24;

  doc.font('Helvetica-Bold').fontSize(20).fillColor(BLACK);
  doc.text(passportData.productName || 'Blade Halo 6', MARGIN, y, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });
  y += 24;

  const subtitle = `${passportData.maxPower || '3000W Continuous'}  |  ${passportData.batteryCapacity || '1700Wh Battery'}`;
  doc.font('Helvetica').fontSize(10).fillColor(GRAY);
  doc.text(subtitle, MARGIN, y, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });
  y += 28;

  y = drawSectionHeader(doc, y, 'Owner Information');
  y = drawFieldRow(doc, y, [
    { label: 'Email', value: passportData.ownerEmail },
    { label: 'Account ID', value: passportData.ownerId },
  ]);

  y = drawSectionHeader(doc, y, 'Motor Information');
  y = drawFieldRow(doc, y, [
    { label: 'Serial Number', value: passportData.serialNumber },
    { label: 'Purchase Date', value: passportData.purchaseDate },
  ]);
  y = drawFieldRow(doc, y, [
    { label: 'Warranty Expires', value: passportData.warrantyExpires },
  ]);

  y = drawSectionHeader(doc, y, 'Vessel Information');
  y = drawFieldRow(doc, y, [
    { label: 'Vessel Name', value: passportData.vesselName || 'Not Registered' },
    { label: 'Vessel Type', value: passportData.vesselType || 'Not Specified' },
  ]);
  y = drawFieldRow(doc, y, [
    { label: 'Vessel Length', value: passportData.vesselLength || 'Not Specified' },
    { label: 'Hull ID Number (HIN)', value: passportData.vesselHin || 'Not Registered' },
  ]);

  y = drawSectionHeader(doc, y, 'Regulatory Compliance');

  const ukcaLogoPath = path.join(process.cwd(), 'server', 'ukca-logo.png');
  try {
    if (fs.existsSync(ukcaLogoPath)) {
      const ukcaWidth = 140;
      const ukcaHeight = ukcaWidth / 4.8;
      doc.image(ukcaLogoPath, MARGIN, y, { width: ukcaWidth });
      y += ukcaHeight + 20;
    } else {
      y += 10;
    }
  } catch (e) {
    y += 10;
  }

  y = drawSectionHeader(doc, y, 'Warranty & Service');

  const qrUrl = `https://bladeoutboards.com/passport?serial=${encodeURIComponent(passportData.serialNumber)}&owner=${encodeURIComponent(passportData.ownerId)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  const qrSize = 85;
  doc.image(qrBuffer, MARGIN, y, { width: qrSize, height: qrSize });

  const qrTextX = MARGIN + qrSize + 16;
  const qrTextWidth = CONTENT_WIDTH - qrSize - 16;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK);
  doc.text('Scan for Warranty Lookup', qrTextX, y + 4, { width: qrTextWidth, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(GRAY);
  doc.text(
    'Use this QR code at authorized Blade service centers worldwide for warranty verification, service history, and promotional prize eligibility at international boat shows and tradeshows.',
    qrTextX, y + 20, { width: qrTextWidth, lineGap: 2, height: 50 }
  );

  const chopPath = path.join(process.cwd(), 'server', 'company-chop.png');
  try {
    if (fs.existsSync(chopPath)) {
      const chopSize = 65;
      const chopX = PAGE_WIDTH - MARGIN - chopSize;
      const chopY = PAGE_HEIGHT - 130;
      doc.image(chopPath, chopX, chopY, { width: chopSize, height: chopSize });
    }
  } catch (e) {}

  const footerY = PAGE_HEIGHT - 58;
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.moveTo(MARGIN, footerY).lineTo(PAGE_WIDTH - MARGIN, footerY).stroke();

  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK);
  doc.text('Blade Marine Technologies Ltd', MARGIN, footerY + 8, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });

  doc.font('Helvetica').fontSize(7).fillColor(MID_GRAY);
  doc.text(
    'This document serves as a digital ownership certificate for your Blade outboard motor.',
    MARGIN, footerY + 20, { width: CONTENT_WIDTH, align: 'center', lineBreak: false }
  );

  const now = new Date();
  const utcStamp = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  doc.font('Helvetica').fontSize(6.5).fillColor(MID_GRAY);
  doc.text(`Generated: ${utcStamp}  |  bladeoutboards.com`, MARGIN, footerY + 32, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });

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
