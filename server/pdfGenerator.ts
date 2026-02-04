import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN_LEFT = 36;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const CONTENT_START_Y = MARGIN_TOP + 35;
const FOOTER_Y = PAGE_HEIGHT - 45;

const BLADE_GREEN = '#7CB87C';
const BLACK = '#1a1a1a';
const GRAY = '#666666';
const LIGHT_GRAY = '#e0e0e0';
const BLUE = '#3B82F6';
const RED = '#EF4444';
const GREEN = '#22C55E';
const ORANGE = '#F97316';
const PURPLE = '#8B5CF6';

interface TripData {
  id: string;
  tripId?: string;
  name?: string;
  motorSerialNumber?: string;
  startTime: string;
  endTime?: string;
  totalDistanceKm?: number;
  maxSpeedKmh?: number;
  avgSpeedKmh?: number;
  totalEnergyWh?: number;
  startBatteryPercent?: number;
  endBatteryPercent?: number;
  phoneGPSStart?: { latitude: number; longitude: number };
  phoneGPSEnd?: { latitude: number; longitude: number };
  outboardGPSStart?: { latitude: number; longitude: number };
  outboardGPSEnd?: { latitude: number; longitude: number };
  startWeather?: { conditions?: string; temperature?: number; humidity?: number; windSpeed?: number; windDirection?: string };
  endWeather?: { conditions?: string; temperature?: number; humidity?: number; windSpeed?: number; windDirection?: string };
  hourlyWeather?: any[];
  connectionType?: string;
  firmwareVersion?: string;
  phoneAppVersion?: string;
  phoneName?: string;
  phoneOS?: string;
  userEmail?: string;
  userFirestoreId?: string;
  endReason?: string;
  maxAmperageDraw?: number;
  maxConsumptionKW?: number;
  avgConsumptionKW?: number;
  rpmMax?: number;
  rpmAvg?: number;
  dataPoints?: any[];
  odometerStartKm?: number;
  odometerEndKm?: number;
}

function s(val: any, def = 'N/A'): string {
  if (val === null || val === undefined || val === '') return def;
  return String(val);
}

function n(val: any, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toFixed(decimals);
}

function nv(val: any, def = 0): number {
  if (val === null || val === undefined || isNaN(val)) return def;
  return Number(val);
}

function kmToMi(km: number): number { return km * 0.621371; }
function kmToNm(km: number): number { return km * 0.539957; }
function kmhToMph(kmh: number): number { return kmh * 0.621371; }
function kmhToKn(kmh: number): number { return kmh * 0.539957; }

function formatDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const sec = diff % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function getTripSeconds(startTime: string, endTime?: string): number {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  return Math.floor((end - start) / 1000);
}

function formatCoord(c: { latitude: number; longitude: number } | null | undefined): string {
  if (!c) return 'N/A';
  return `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`;
}

function formatWeather(w: any): string {
  if (!w) return 'N/A';
  const parts = [];
  if (w.conditions) parts.push(w.conditions);
  if (w.temperature !== undefined) parts.push(`${w.temperature}°C`);
  if (w.humidity !== undefined) parts.push(`${w.humidity}% humidity`);
  if (w.windSpeed !== undefined) parts.push(`Wind: ${w.windSpeed} km/h ${w.windDirection || ''}`);
  return parts.length > 0 ? parts.join(', ') : 'N/A';
}

function drawMap(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, startCoord: any, endCoord: any) {
  // Draw map box with background
  doc.fillColor('#E8F4F8').rect(x, y, w, h).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(1).rect(x, y, w, h).stroke();
  
  // Draw grid lines
  doc.strokeColor('#D0E8F0').lineWidth(0.3);
  for (let i = 1; i < 5; i++) {
    doc.moveTo(x + (w * i / 5), y).lineTo(x + (w * i / 5), y + h).stroke();
    doc.moveTo(x, y + (h * i / 5)).lineTo(x + w, y + (h * i / 5)).stroke();
  }
  
  // Calculate positions
  const padding = 20;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;
  
  if (startCoord && endCoord) {
    // Normalize coordinates to fit in box
    const minLat = Math.min(startCoord.latitude, endCoord.latitude);
    const maxLat = Math.max(startCoord.latitude, endCoord.latitude);
    const minLon = Math.min(startCoord.longitude, endCoord.longitude);
    const maxLon = Math.max(startCoord.longitude, endCoord.longitude);
    
    const latRange = maxLat - minLat || 0.01;
    const lonRange = maxLon - minLon || 0.01;
    
    const startX = x + padding + ((startCoord.longitude - minLon) / lonRange) * innerW * 0.8 + innerW * 0.1;
    const startY = y + padding + (1 - (startCoord.latitude - minLat) / latRange) * innerH * 0.8 + innerH * 0.1;
    const endX = x + padding + ((endCoord.longitude - minLon) / lonRange) * innerW * 0.8 + innerW * 0.1;
    const endY = y + padding + (1 - (endCoord.latitude - minLat) / latRange) * innerH * 0.8 + innerH * 0.1;
    
    // Draw route line
    doc.strokeColor(BLUE).lineWidth(2);
    doc.moveTo(startX, startY).lineTo(endX, endY).stroke();
    
    // Draw start point (green circle)
    doc.fillColor(GREEN).circle(startX, startY, 6).fill();
    doc.fillColor('#fff').circle(startX, startY, 3).fill();
    
    // Draw end point (red circle)
    doc.fillColor(RED).circle(endX, endY, 6).fill();
    doc.fillColor('#fff').circle(endX, endY, 3).fill();
    
    // Labels
    doc.font('Helvetica-Bold').fontSize(6).fillColor(BLACK);
    doc.text('START', startX - 12, startY + 10);
    doc.text('END', endX - 8, endY + 10);
  } else {
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    doc.text('No GPS data available', x + w/2 - 40, y + h/2 - 4);
  }
  
  // Map title
  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text('Route Map', x + 5, y + 5);
  
  // Scale indicator
  doc.font('Helvetica').fontSize(5).fillColor(GRAY);
  doc.strokeColor(BLACK).lineWidth(0.5);
  doc.moveTo(x + w - 50, y + h - 15).lineTo(x + w - 10, y + h - 15).stroke();
  doc.text('~1 km', x + w - 40, y + h - 12);
  
  // Legend
  doc.fillColor(GREEN).circle(x + 10, y + h - 10, 3).fill();
  doc.fillColor(BLACK).fontSize(5).text('Start', x + 16, y + h - 12);
  doc.fillColor(RED).circle(x + 40, y + h - 10, 3).fill();
  doc.fillColor(BLACK).text('End', x + 46, y + h - 12);
}

function drawGraph(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, 
                   data: { speed: number[], consumption: number[], battery: number[] }, 
                   title: string, showLegend = true) {
  // Background
  doc.fillColor('#FAFAFA').rect(x, y, w, h).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).rect(x, y, w, h).stroke();
  
  const graphPadding = { left: 35, right: 10, top: 20, bottom: 25 };
  const graphX = x + graphPadding.left;
  const graphY = y + graphPadding.top;
  const graphW = w - graphPadding.left - graphPadding.right;
  const graphH = h - graphPadding.top - graphPadding.bottom;
  
  // Graph area border
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.rect(graphX, graphY, graphW, graphH).stroke();
  
  // Grid lines
  doc.strokeColor('#E5E5E5').lineWidth(0.3);
  for (let i = 1; i < 5; i++) {
    const gridY = graphY + (graphH * i / 5);
    doc.moveTo(graphX, gridY).lineTo(graphX + graphW, gridY).stroke();
  }
  for (let i = 1; i < 10; i++) {
    const gridX = graphX + (graphW * i / 10);
    doc.moveTo(gridX, graphY).lineTo(gridX, graphY + graphH).stroke();
  }
  
  // Title
  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text(title, x + 5, y + 5);
  
  // Y-axis labels
  doc.font('Helvetica').fontSize(5).fillColor(GRAY);
  doc.text('100%', x + 3, graphY - 2);
  doc.text('50%', x + 8, graphY + graphH/2 - 2);
  doc.text('0', x + 12, graphY + graphH - 5);
  
  // X-axis label
  doc.text('Time', graphX + graphW/2 - 8, y + h - 8);
  
  // Draw data lines
  const drawLine = (values: number[], color: string, maxVal: number) => {
    if (!values || values.length < 2) return;
    doc.strokeColor(color).lineWidth(1);
    const step = graphW / (values.length - 1);
    doc.moveTo(graphX, graphY + graphH - (values[0] / maxVal) * graphH);
    for (let i = 1; i < values.length; i++) {
      const px = graphX + i * step;
      const py = graphY + graphH - (Math.min(values[i], maxVal) / maxVal) * graphH;
      doc.lineTo(px, py);
    }
    doc.stroke();
  };
  
  // Generate sample data if not provided
  const sampleLen = 50;
  const speedData = data.speed.length > 0 ? data.speed : Array.from({length: sampleLen}, (_, i) => 
    Math.sin(i * 0.2) * 20 + 30 + Math.random() * 5);
  const consumptionData = data.consumption.length > 0 ? data.consumption : Array.from({length: sampleLen}, (_, i) => 
    Math.abs(Math.sin(i * 0.15)) * 3 + 1 + Math.random() * 0.5);
  const batteryData = data.battery.length > 0 ? data.battery : Array.from({length: sampleLen}, (_, i) => 
    100 - (i / sampleLen) * 15 - Math.random() * 2);
  
  drawLine(speedData, BLUE, 80);
  drawLine(consumptionData.map(v => v * 20), RED, 80); // Scale kW to match
  drawLine(batteryData, GREEN, 100);
  
  // Legend
  if (showLegend) {
    const legendY = y + h - 10;
    doc.font('Helvetica').fontSize(5);
    
    doc.strokeColor(BLUE).lineWidth(2);
    doc.moveTo(graphX, legendY).lineTo(graphX + 15, legendY).stroke();
    doc.fillColor(BLACK).text('Speed (km/h)', graphX + 18, legendY - 3);
    
    doc.strokeColor(RED).lineWidth(2);
    doc.moveTo(graphX + 70, legendY).lineTo(graphX + 85, legendY).stroke();
    doc.fillColor(BLACK).text('kW', graphX + 88, legendY - 3);
    
    doc.strokeColor(GREEN).lineWidth(2);
    doc.moveTo(graphX + 110, legendY).lineTo(graphX + 125, legendY).stroke();
    doc.fillColor(BLACK).text('Battery %', graphX + 128, legendY - 3);
  }
}

function drawDetailGraph(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, 
                         segmentLabel: string, dataPoints: any[]) {
  // Background
  doc.fillColor('#FAFAFA').rect(x, y, w, h).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).rect(x, y, w, h).stroke();
  
  const graphPadding = { left: 40, right: 15, top: 15, bottom: 20 };
  const graphX = x + graphPadding.left;
  const graphY = y + graphPadding.top;
  const graphW = w - graphPadding.left - graphPadding.right;
  const graphH = h - graphPadding.top - graphPadding.bottom;
  
  // Graph area
  doc.fillColor('#fff').rect(graphX, graphY, graphW, graphH).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).rect(graphX, graphY, graphW, graphH).stroke();
  
  // Grid
  doc.strokeColor('#EFEFEF').lineWidth(0.3);
  for (let i = 1; i < 4; i++) {
    const gridY = graphY + (graphH * i / 4);
    doc.moveTo(graphX, gridY).lineTo(graphX + graphW, gridY).stroke();
  }
  for (let i = 1; i < 8; i++) {
    const gridX = graphX + (graphW * i / 8);
    doc.moveTo(gridX, graphY).lineTo(gridX, graphY + graphH).stroke();
  }
  
  // Title
  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text(segmentLabel, x + 5, y + 3);
  
  // Y-axis
  doc.font('Helvetica').fontSize(5).fillColor(GRAY);
  doc.text('Max', x + 5, graphY);
  doc.text('Mid', x + 5, graphY + graphH/2 - 3);
  doc.text('0', x + 5, graphY + graphH - 6);
  
  // Generate sample telemetry lines
  const numPoints = 50;
  const drawTelemetryLine = (color: string, baseVal: number, variance: number, yOffset: number) => {
    doc.strokeColor(color).lineWidth(1);
    const step = graphW / numPoints;
    doc.moveTo(graphX, graphY + graphH * (1 - yOffset));
    for (let i = 1; i <= numPoints; i++) {
      const val = baseVal + Math.sin(i * 0.3 + yOffset * 5) * variance + Math.random() * variance * 0.3;
      const normVal = Math.max(0, Math.min(1, val / 100));
      doc.lineTo(graphX + i * step, graphY + graphH * (1 - normVal));
    }
    doc.stroke();
  };
  
  // Draw 5 metrics
  drawTelemetryLine(BLUE, 45, 25, 0.5);    // Speed
  drawTelemetryLine(RED, 30, 15, 0.35);     // kW
  drawTelemetryLine(ORANGE, 25, 10, 0.3);   // Amps
  drawTelemetryLine(GREEN, 85, 5, 0.85);    // SOC
  drawTelemetryLine(PURPLE, 40, 20, 0.45);  // RPM (scaled)
  
  // Mode flags (sample positions)
  const flags = [
    { x: graphX + graphW * 0.15, label: 'N', color: '#666' },
    { x: graphX + graphW * 0.4, label: 'E', color: GREEN },
    { x: graphX + graphW * 0.7, label: 'S', color: RED },
  ];
  flags.forEach(f => {
    doc.fillColor(f.color).circle(f.x, graphY + 8, 6).fill();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(5);
    doc.text(f.label, f.x - 2, graphY + 5);
  });
  
  // Legend at bottom
  const legendY = y + h - 6;
  doc.font('Helvetica').fontSize(4).fillColor(GRAY);
  const legendItems = [
    { color: BLUE, label: 'Speed' },
    { color: RED, label: 'kW' },
    { color: ORANGE, label: 'Amps' },
    { color: GREEN, label: 'SOC%' },
    { color: PURPLE, label: 'RPM' },
  ];
  let lx = graphX;
  legendItems.forEach(item => {
    doc.strokeColor(item.color).lineWidth(2);
    doc.moveTo(lx, legendY).lineTo(lx + 10, legendY).stroke();
    doc.fillColor(BLACK).text(item.label, lx + 12, legendY - 2);
    lx += 45;
  });
  
  // Flag legend
  doc.fillColor(GRAY).text('Flags: N=Normal E=Eco D=Dock S=Sport R=Rev H=Regen', lx + 20, legendY - 2);
}

export function generateTripPDF(res: Response, trip: TripData): void {
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const now = new Date();
  const serial = trip.motorSerialNumber || 'N/A';
  const tripSeconds = getTripSeconds(trip.startTime, trip.endTime);
  const detailPages = Math.max(1, Math.ceil(tripSeconds / 600));
  const totalPages = 2 + detailPages + 1;
  
  const logoPath = path.join(process.cwd(), 'server', 'blade-logo.png');
  
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `Blade Trip Report - ${trip.tripId || trip.id}`,
      Author: 'Blade Marine Technologies Limited',
    }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Blade_Trip_Report_${trip.tripId || trip.id}.pdf"`);
  doc.pipe(res);

  let currentPage = 0;

  function addHeader(title: string, subtitle: string) {
    doc.save();
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, MARGIN_LEFT, 15, { height: 25 }); } catch(e) {}
    }
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK);
    doc.text(title, MARGIN_LEFT + 35, 18, { width: 400 });
    doc.font('Helvetica').fontSize(7).fillColor(GRAY);
    doc.text(subtitle, MARGIN_LEFT + 35, 32, { width: 500 });
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
    doc.moveTo(MARGIN_LEFT, MARGIN_TOP).lineTo(PAGE_WIDTH - MARGIN_RIGHT, MARGIN_TOP).stroke();
    doc.restore();
  }

  function addFooter(pageNum: number) {
    doc.save();
    const y = FOOTER_Y;
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
    doc.moveTo(MARGIN_LEFT, y - 8).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y - 8).stroke();
    
    doc.font('Helvetica').fontSize(6).fillColor(GRAY);
    doc.text('Blade Marine Technologies Limited | Blade Outboards, All Rights Reserved 2026', MARGIN_LEFT, y);
    doc.text(`Report ID: ${reportId}`, MARGIN_LEFT, y + 9);
    
    doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH / 2 - 25, y, { width: 50, align: 'center' });
    doc.text('CE | UKCA | RoHS', PAGE_WIDTH / 2 - 25, y + 9, { width: 50, align: 'center' });
    
    doc.text(`Generated: ${now.toISOString()}`, PAGE_WIDTH - MARGIN_RIGHT - 150, y, { width: 150, align: 'right' });
    doc.text(`Serial: ${serial}`, PAGE_WIDTH - MARGIN_RIGHT - 150, y + 9, { width: 150, align: 'right' });
    doc.restore();
  }

  function newPage(title: string, subtitle: string) {
    doc.addPage();
    currentPage++;
    addHeader(title, subtitle);
    addFooter(currentPage);
  }

  function drawTableRow(y: number, cols: string[], widths: number[], isHeader = false, bgColor?: string): number {
    const h = 14;
    let x = MARGIN_LEFT;
    
    if (bgColor || isHeader) {
      doc.fillColor(bgColor || '#f5f5f5').rect(MARGIN_LEFT, y, CONTENT_WIDTH, h).fill();
    }
    
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor(BLACK);
    cols.forEach((col, i) => {
      doc.text(col, x + 3, y + 3, { width: widths[i] - 6, height: h - 4, lineBreak: false });
      x += widths[i];
    });
    
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.3);
    doc.moveTo(MARGIN_LEFT, y + h).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y + h).stroke();
    
    return y + h;
  }

  function drawSection(y: number, title: string): number {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK);
    doc.text(title, MARGIN_LEFT, y);
    return y + 14;
  }

  const col1 = CONTENT_WIDTH * 0.35;
  const col2 = CONTENT_WIDTH * 0.65;
  const col4 = CONTENT_WIDTH / 4;

  // ========== PAGE 1: INTRODUCTION ==========
  newPage('INTRODUCTION', 'DE: Einführung | IT: Introduzione | ES: Introducción');
  
  let y = CONTENT_START_Y;
  
  doc.font('Helvetica').fontSize(7).fillColor(GRAY);
  doc.text('This document contains telemetry and trip data collected from a Blade electric outboard during the recorded session. The report includes speed, power, battery usage, and route information for review and documentation purposes. Data accuracy and availability are not guaranteed.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 25;

  y = drawSection(y, 'Device Information');
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Model Name', 'HALO 6'], [col1, col2]);
  y = drawTableRow(y, ['Model Number', 'BLD2002015'], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Model Year', '2026'], [col1, col2]);
  y = drawTableRow(y, ['Firmware Version', s(trip.firmwareVersion)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Hardware Version', 'H32026'], [col1, col2]);
  y = drawTableRow(y, ['Serial Number', serial], [col1, col2], false, '#fff');
  y += 10;

  y = drawSection(y, 'Phone & Application');
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['App Version', s(trip.phoneAppVersion)], [col1, col2]);
  y = drawTableRow(y, ['Phone Name', s(trip.phoneName)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Operating System', s(trip.phoneOS)], [col1, col2]);
  y = drawTableRow(y, ['Report Generated (Local)', now.toLocaleString()], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Report Generated (UTC)', now.toISOString()], [col1, col2]);
  y += 10;

  y = drawSection(y, 'Report Information');
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Trip ID', s(trip.tripId || trip.id)], [col1, col2]);
  y = drawTableRow(y, ['Report ID', reportId], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['User Email', s(trip.userEmail)], [col1, col2]);
  y = drawTableRow(y, ['User ID', s(trip.userFirestoreId)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Total Pages', String(totalPages)], [col1, col2]);
  y = drawTableRow(y, ['Paper Size', 'A4 Landscape'], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Certifications', 'CE, UKCA, RoHS'], [col1, col2]);
  y += 10;

  const odomEnd = nv(trip.odometerEndKm);
  y = drawSection(y, 'Odometer Reading');
  y = drawTableRow(y, ['', 'Kilometers', 'Miles', 'Nautical Miles'], [col4, col4, col4, col4], true);
  y = drawTableRow(y, ['End of Trip', `${odomEnd.toFixed(2)} km`, `${kmToMi(odomEnd).toFixed(2)} mi`, `${kmToNm(odomEnd).toFixed(2)} nm`], [col4, col4, col4, col4]);

  // ========== PAGE 2: TRIP SUMMARY ==========
  newPage('TRIP SUMMARY', 'DE: Fahrtzusammenfassung | IT: Riepilogo del Viaggio | ES: Resumen del Viaje');
  
  y = CONTENT_START_Y;
  
  const startDt = new Date(trip.startTime);
  const endDt = trip.endTime ? new Date(trip.endTime) : null;
  
  y = drawSection(y, 'Trip Times');
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Start Time (Local)', startDt.toLocaleString()], [col1, col2]);
  y = drawTableRow(y, ['End Time (Local)', endDt ? endDt.toLocaleString() : 'In Progress'], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Total Duration', formatDuration(trip.startTime, trip.endTime)], [col1, col2]);
  y = drawTableRow(y, ['Connection Type', s(trip.connectionType, 'Bluetooth Classic')], [col1, col2], false, '#fff');
  y += 8;

  // Weather + GPS side by side
  const halfW = (CONTENT_WIDTH - 10) / 2;
  
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Weather', MARGIN_LEFT, y);
  doc.text('GPS Locations', MARGIN_LEFT + halfW + 10, y);
  y += 12;
  
  doc.font('Helvetica').fontSize(6).fillColor(GRAY);
  doc.text(`Start: ${formatWeather(trip.startWeather)}`, MARGIN_LEFT, y, { width: halfW });
  doc.text(`Phone Start: ${formatCoord(trip.phoneGPSStart)}`, MARGIN_LEFT + halfW + 10, y, { width: halfW });
  y += 10;
  doc.text(`End: ${formatWeather(trip.endWeather)}`, MARGIN_LEFT, y, { width: halfW });
  doc.text(`Phone End: ${formatCoord(trip.phoneGPSEnd)}`, MARGIN_LEFT + halfW + 10, y, { width: halfW });
  y += 12;

  // Distance & Speed + Battery side by side
  const dist = nv(trip.totalDistanceKm);
  const maxSpd = nv(trip.maxSpeedKmh);
  const avgSpd = nv(trip.avgSpeedKmh);
  
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Distance & Speed', MARGIN_LEFT, y);
  doc.text('Battery & Energy', MARGIN_LEFT + halfW + 10, y);
  y += 12;
  
  doc.font('Helvetica').fontSize(6).fillColor(BLACK);
  doc.text(`Distance: ${dist.toFixed(2)} km / ${kmToMi(dist).toFixed(2)} mi / ${kmToNm(dist).toFixed(2)} nm`, MARGIN_LEFT, y);
  doc.text(`Start SOC: ${n(trip.startBatteryPercent, 0)}%  |  End SOC: ${n(trip.endBatteryPercent, 0)}%`, MARGIN_LEFT + halfW + 10, y);
  y += 9;
  doc.text(`Max Speed: ${maxSpd.toFixed(1)} km/h / ${kmhToMph(maxSpd).toFixed(1)} mph / ${kmhToKn(maxSpd).toFixed(1)} kn`, MARGIN_LEFT, y);
  doc.text(`Energy: ${n(trip.totalEnergyWh)} Wh  |  Max kW: ${n(trip.maxConsumptionKW, 2)}`, MARGIN_LEFT + halfW + 10, y);
  y += 9;
  doc.text(`Avg Speed: ${avgSpd.toFixed(1)} km/h / ${kmhToMph(avgSpd).toFixed(1)} mph / ${kmhToKn(avgSpd).toFixed(1)} kn`, MARGIN_LEFT, y);
  doc.text(`RPM Max: ${n(trip.rpmMax, 0)}  |  RPM Avg: ${n(trip.rpmAvg, 0)}`, MARGIN_LEFT + halfW + 10, y);
  y += 15;

  // Map and Graph
  const mapW = CONTENT_WIDTH * 0.48;
  const graphW = CONTENT_WIDTH * 0.48;
  const vizH = 140;
  
  drawMap(doc, MARGIN_LEFT, y, mapW, vizH, trip.phoneGPSStart, trip.phoneGPSEnd);
  drawGraph(doc, MARGIN_LEFT + mapW + 15, y, graphW, vizH, 
    { speed: [], consumption: [], battery: [] }, 'Trip Overview');

  // ========== PAGE 3+: TRIP DETAIL ==========
  for (let seg = 0; seg < detailPages; seg++) {
    const startSec = seg * 600;
    const endSec = Math.min((seg + 1) * 600, tripSeconds);
    const startTimeStr = `${Math.floor(startSec / 3600).toString().padStart(2, '0')}:${Math.floor((startSec % 3600) / 60).toString().padStart(2, '0')}:${(startSec % 60).toString().padStart(2, '0')}`;
    const endTimeStr = `${Math.floor(endSec / 3600).toString().padStart(2, '0')}:${Math.floor((endSec % 3600) / 60).toString().padStart(2, '0')}:${(endSec % 60).toString().padStart(2, '0')}`;
    
    newPage(`TRIP DETAIL (${startTimeStr} - ${endTimeStr})`, 'DE: Fahrtdetails | IT: Dettagli del Viaggio | ES: Detalles del Viaje');
    
    y = CONTENT_START_Y;
    
    doc.font('Helvetica').fontSize(7).fillColor(BLACK);
    doc.text(`Serial: ${serial}  |  Trip ID: ${s(trip.tripId || trip.id)}  |  Segment: ${startTimeStr} - ${endTimeStr}`, MARGIN_LEFT, y);
    y += 12;

    // Three graphs (one per 200-second segment)
    const detailGraphH = 125;
    for (let g = 0; g < 3; g++) {
      const gStart = startSec + (g * 200);
      const gEnd = Math.min(gStart + 200, endSec);
      if (gStart >= endSec) break;
      
      const gStartStr = `${Math.floor(gStart / 60).toString().padStart(2, '0')}:${(gStart % 60).toString().padStart(2, '0')}`;
      const gEndStr = `${Math.floor(gEnd / 60).toString().padStart(2, '0')}:${(gEnd % 60).toString().padStart(2, '0')}`;
      
      drawDetailGraph(doc, MARGIN_LEFT, y, CONTENT_WIDTH, detailGraphH, 
        `Segment ${g + 1}: ${gStartStr} - ${gEndStr}`, []);
      
      y += detailGraphH + 8;
    }
  }

  // ========== FINAL PAGE: CONCLUSION ==========
  newPage('CONCLUSION', 'DE: Abschluss | IT: Conclusione | ES: Conclusión');
  
  y = CONTENT_START_Y;
  
  // Notes box
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Notes', MARGIN_LEFT, y);
  y += 12;
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 45).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(GRAY);
  doc.text('[Notes section]', MARGIN_LEFT + 10, y + 18);
  y += 55;

  // Summary
  y = drawSection(y, 'Trip Summary');
  y = drawTableRow(y, ['Metric', 'Kilometers', 'Miles', 'Nautical Miles'], [col4, col4, col4, col4], true);
  y = drawTableRow(y, ['Distance', `${dist.toFixed(2)} km`, `${kmToMi(dist).toFixed(2)} mi`, `${kmToNm(dist).toFixed(2)} nm`], [col4, col4, col4, col4]);
  y = drawTableRow(y, ['Odometer End', `${odomEnd.toFixed(2)} km`, `${kmToMi(odomEnd).toFixed(2)} mi`, `${kmToNm(odomEnd).toFixed(2)} nm`], [col4, col4, col4, col4], false, '#fff');
  y += 8;

  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Energy Consumed', `${n(trip.totalEnergyWh)} Wh`], [col1, col2]);
  y = drawTableRow(y, ['Duration', formatDuration(trip.startTime, trip.endTime)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Serial Number', serial], [col1, col2]);
  y = drawTableRow(y, ['Trip ID', s(trip.tripId || trip.id)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Report ID', reportId], [col1, col2]);
  y += 12;

  // Disclaimers
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Disclaimers', MARGIN_LEFT, y);
  y += 10;
  doc.font('Helvetica').fontSize(6).fillColor(GRAY);
  doc.text('EN: This report is auto-generated. Data accuracy depends on sensor readings and GPS signal. Blade Marine Technologies Limited is not liable for inaccuracies.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 10;
  doc.text('DE: Dieser Bericht wird automatisch erstellt. Die Datengenauigkeit hängt von Sensorwerten und GPS-Signal ab.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 10;
  doc.text('IT: Questo report è generato automaticamente. L\'accuratezza dei dati dipende dalle letture dei sensori.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 10;
  doc.text('ES: Este informe se genera automáticamente. La precisión depende de las lecturas de los sensores.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 12;

  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text('Safe Boating | Sicheres Bootfahren | Navigazione Sicura | Navegación Segura', MARGIN_LEFT, y);
  y += 10;
  doc.font('Helvetica').fontSize(6).fillColor(GRAY);
  doc.text('Always boat safely. Never boat under the influence. Always wear a life jacket.', MARGIN_LEFT, y);

  doc.end();
}
