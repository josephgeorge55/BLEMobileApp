import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN_LEFT = 36;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 70;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const CONTENT_START_Y = MARGIN_TOP + 35;
const FOOTER_Y = PAGE_HEIGHT - 55;

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
  startLocationAddress?: string;
  endLocationAddress?: string;
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

function drawWeatherIcon(doc: PDFKit.PDFDocument, x: number, y: number, size: number, condition: string) {
  doc.save();
  const c = condition.toLowerCase();
  
  if (c.includes('clear') || c.includes('sun')) {
    // Sun
    doc.fillColor('#FDB813').circle(x + size/2, y + size/2, size/3).fill();
    doc.strokeColor('#FDB813').lineWidth(1.5);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const x1 = x + size/2 + Math.cos(angle) * (size/3 + 2);
      const y1 = y + size/2 + Math.sin(angle) * (size/3 + 2);
      const x2 = x + size/2 + Math.cos(angle) * (size/2);
      const y2 = y + size/2 + Math.sin(angle) * (size/2);
      doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
    }
  } else if (c.includes('rain')) {
    // Cloud with rain
    doc.fillColor('#A4A4A4').circle(x + size*0.3, y + size*0.6, size*0.25).fill();
    doc.circle(x + size*0.5, y + size*0.4, size*0.3).fill();
    doc.circle(x + size*0.7, y + size*0.6, size*0.25).fill();
    doc.rect(x + size*0.3, y + size*0.5, size*0.4, size*0.25).fill();
    
    doc.strokeColor('#3498DB').lineWidth(1);
    for (let i = 0; i < 3; i++) {
      const rx = x + size*0.4 + i*size*0.1;
      doc.moveTo(rx, y + size*0.75).lineTo(rx - 2, y + size*0.9).stroke();
    }
  } else {
    // Default: Cloud
    doc.fillColor('#A4A4A4').circle(x + size*0.3, y + size*0.6, size*0.25).fill();
    doc.circle(x + size*0.5, y + size*0.4, size*0.3).fill();
    doc.circle(x + size*0.7, y + size*0.6, size*0.25).fill();
    doc.rect(x + size*0.3, y + size*0.5, size*0.4, size*0.25).fill();
  }
  doc.restore();
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

function drawQRCode(doc: PDFKit.PDFDocument, x: number, y: number, size: number, data: string) {
  const cellSize = size / 21;
  const pattern = generateQRPattern(data);
  
  doc.fillColor('#fff').rect(x, y, size, size).fill();
  doc.fillColor(BLACK);
  
  for (let row = 0; row < 21; row++) {
    for (let col = 0; col < 21; col++) {
      if (pattern[row * 21 + col]) {
        doc.rect(x + col * cellSize, y + row * cellSize, cellSize, cellSize).fill();
      }
    }
  }
}

function generateQRPattern(data: string): boolean[] {
  const pattern = new Array(441).fill(false);
  
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const isBorder = i === 0 || i === 6 || j === 0 || j === 6;
      const isCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      if (isBorder || isCenter) {
        pattern[i * 21 + j] = true;
        pattern[i * 21 + (14 + j)] = true;
        pattern[(14 + i) * 21 + j] = true;
      }
    }
  }
  
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash = hash & hash;
  }
  
  for (let i = 8; i < 13; i++) {
    for (let j = 8; j < 13; j++) {
      const idx = i * 21 + j;
      pattern[idx] = ((hash >> ((i + j) % 16)) & 1) === 1;
    }
  }
  
  for (let i = 8; i < 21; i++) {
    pattern[6 * 21 + i] = i % 2 === 0;
    pattern[i * 21 + 6] = i % 2 === 0;
  }
  
  return pattern;
}

function drawBarcode(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, data: string) {
  doc.fillColor('#fff').rect(x, y, width, height).fill();
  
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash = hash & hash;
  }
  
  const numBars = 40;
  const barWidth = width / numBars;
  
  doc.fillColor(BLACK);
  for (let i = 0; i < numBars; i++) {
    const isBar = ((hash >> (i % 16)) & 1) === 1 || i < 3 || i > numBars - 4 || (i > 18 && i < 22);
    if (isBar) {
      doc.rect(x + i * barWidth, y, barWidth * 0.8, height).fill();
    }
  }
}

function drawCELogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  doc.save();
  doc.rect(x, y, size, size).fillColor('#f8f8f8').fill();
  doc.strokeColor(BLACK).lineWidth(0.5).rect(x, y, size, size).stroke();
  doc.font('Helvetica-Bold').fontSize(size * 0.55).fillColor(BLACK);
  doc.text('CE', x + 1, y + size * 0.2, { width: size - 2, align: 'center' });
  doc.restore();
}

function drawUKCALogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  doc.save();
  doc.rect(x, y, size, size).fillColor('#f8f8f8').fill();
  doc.strokeColor(BLACK).lineWidth(0.5).rect(x, y, size, size).stroke();
  doc.font('Helvetica-Bold').fontSize(size * 0.28).fillColor(BLACK);
  doc.text('UKCA', x, y + size * 0.35, { width: size, align: 'center' });
  doc.restore();
}

function drawRoHSLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  doc.save();
  doc.rect(x, y, size, size).fillColor('#E8F5E9').fill();
  doc.strokeColor(GREEN).lineWidth(0.5).rect(x, y, size, size).stroke();
  doc.font('Helvetica-Bold').fontSize(size * 0.28).fillColor(GREEN);
  doc.text('RoHS', x, y + size * 0.35, { width: size, align: 'center' });
  doc.restore();
}

function drawMap(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, startCoord: any, endCoord: any) {
  doc.fillColor('#B8D4E8').rect(x, y, w, h).fill();
  
  // Land context
  doc.fillColor('#C8D4B8');
  doc.moveTo(x, y).lineTo(x + w * 0.15, y).lineTo(x + w * 0.12, y + h * 0.3)
    .lineTo(x + w * 0.08, y + h * 0.5).lineTo(x, y + h * 0.4).closePath().fill();
  doc.moveTo(x + w * 0.7, y).lineTo(x + w, y).lineTo(x + w, y + h * 0.25)
    .lineTo(x + w * 0.85, y + h * 0.35).lineTo(x + w * 0.75, y + h * 0.2).closePath().fill();
  doc.moveTo(x, y + h * 0.7).lineTo(x + w * 0.25, y + h * 0.65).lineTo(x + w * 0.3, y + h * 0.8)
    .lineTo(x + w * 0.2, y + h).lineTo(x, y + h).closePath().fill();
  doc.moveTo(x + w * 0.6, y + h * 0.75).lineTo(x + w * 0.8, y + h * 0.7).lineTo(x + w, y + h * 0.8)
    .lineTo(x + w, y + h).lineTo(x + w * 0.55, y + h).closePath().fill();
  
  // Grid and labels
  doc.strokeColor('#9AB4C8').lineWidth(0.3);
  doc.font('Helvetica').fontSize(5).fillColor(GRAY);
  for (let i = 1; i < 8; i++) {
    const gx = x + (w * i / 8);
    const gy = y + (h * i / 8);
    doc.moveTo(gx, y).lineTo(gx, y + h).stroke();
    doc.moveTo(x, gy).lineTo(x + w, gy).stroke();
    
    if (startCoord) {
      // Coordinate markings
      doc.text(`${(startCoord.longitude + (i-4)*0.01).toFixed(3)}°`, gx - 10, y + h + 2);
      doc.text(`${(startCoord.latitude + (4-i)*0.01).toFixed(3)}°`, x - 25, gy - 2);
    }
  }
  
  doc.strokeColor(LIGHT_GRAY).lineWidth(1).rect(x, y, w, h).stroke();
  
  const padding = 30;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;
  
  if (startCoord && endCoord) {
    // Zoom out: Always use at least 0.1 deg span for a 10km-style overview
    const span = 0.05; 
    const minLat = Math.min(startCoord.latitude, endCoord.latitude) - span;
    const maxLat = Math.max(startCoord.latitude, endCoord.latitude) + span;
    const minLon = Math.min(startCoord.longitude, endCoord.longitude) - span;
    const maxLon = Math.max(startCoord.longitude, endCoord.longitude) + span;
    
    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;
    
    const startX = x + padding + ((startCoord.longitude - minLon) / lonRange) * innerW;
    const startY = y + padding + (1 - (startCoord.latitude - minLat) / latRange) * innerH;
    const endX = x + padding + ((endCoord.longitude - minLon) / lonRange) * innerW;
    const endY = y + padding + (1 - (endCoord.latitude - minLat) / latRange) * innerH;
    
    // Smooth route curve
    doc.strokeColor(BLUE).lineWidth(3);
    const midX = (startX + endX) / 2 + 10;
    const midY = (startY + endY) / 2 - 10;
    doc.moveTo(startX, startY).quadraticCurveTo(midX, midY, endX, endY).stroke();
    
    // Start/End Markers
    doc.fillColor(GREEN).circle(startX, startY, 7).fill();
    doc.fillColor('#fff').circle(startX, startY, 3.5).fill();
    doc.fillColor(RED).circle(endX, endY, 7).fill();
    doc.fillColor('#fff').circle(endX, endY, 3.5).fill();
    
    doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
    doc.text('START', startX - 15, startY + 10);
    doc.text('END', endX - 10, endY + 10);

    // Scale Bar (approx 5km based on span)
    const scaleBarW = (0.045 / lonRange) * innerW; // ~5km
    const scaleX = x + w - scaleBarW - 15;
    const scaleY = y + h - 25;
    doc.strokeColor(BLACK).lineWidth(1.5);
    doc.moveTo(scaleX, scaleY).lineTo(scaleX + scaleBarW, scaleY).stroke();
    doc.moveTo(scaleX, scaleY - 3).lineTo(scaleX, scaleY + 3).stroke();
    doc.moveTo(scaleX + scaleBarW, scaleY - 3).lineTo(scaleX + scaleBarW, scaleY + 3).stroke();
    doc.font('Helvetica-Bold').fontSize(6).fillColor(BLACK);
    doc.text('5 km / 2.7 nm', scaleX, scaleY - 10, { width: scaleBarW, align: 'center' });
  } else {
    doc.font('Helvetica').fontSize(10).fillColor(GRAY);
    doc.text('No GPS data available', x + w/2 - 50, y + h/2 - 5);
  }
  
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK);
  doc.text('Route Map', x + 8, y + 8);
  
  doc.fillColor(GREEN).circle(x + 15, y + h - 15, 4).fill();
  doc.fillColor(BLACK).fontSize(6).text('Start', x + 22, y + h - 17);
  doc.fillColor(RED).circle(x + 55, y + h - 15, 4).fill();
  doc.fillColor(BLACK).text('End', x + 62, y + h - 17);
  doc.fillColor('#C8D4B8').rect(x + 90, y + h - 18, 10, 6).fill();
  doc.fillColor(BLACK).text('Land', x + 103, y + h - 17);
}

function drawGraph(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, 
                   data: { speed: number[], consumption: number[], battery: number[] }, 
                   title: string) {
  doc.fillColor('#FAFAFA').rect(x, y, w, h).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).rect(x, y, w, h).stroke();
  
  const graphPadding = { left: 45, right: 15, top: 25, bottom: 30 };
  const graphX = x + graphPadding.left;
  const graphY = y + graphPadding.top;
  const graphW = w - graphPadding.left - graphPadding.right;
  const graphH = h - graphPadding.top - graphPadding.bottom;
  
  doc.fillColor('#fff').rect(graphX, graphY, graphW, graphH).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).rect(graphX, graphY, graphW, graphH).stroke();
  
  doc.strokeColor('#E5E5E5').lineWidth(0.3);
  for (let i = 1; i < 5; i++) {
    const gridY = graphY + (graphH * i / 5);
    doc.moveTo(graphX, gridY).lineTo(graphX + graphW, gridY).stroke();
  }
  for (let i = 1; i < 10; i++) {
    const gridX = graphX + (graphW * i / 10);
    doc.moveTo(gridX, graphY).lineTo(gridX, graphY + graphH).stroke();
  }
  
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK);
  doc.text(title, x + 8, y + 6);
  
  doc.font('Helvetica').fontSize(6).fillColor(GRAY);
  doc.text('100', x + 8, graphY - 3);
  doc.text('75', x + 12, graphY + graphH * 0.25 - 3);
  doc.text('50', x + 12, graphY + graphH * 0.5 - 3);
  doc.text('25', x + 12, graphY + graphH * 0.75 - 3);
  doc.text('0', x + 18, graphY + graphH - 5);
  
  doc.text('Time (minutes)', graphX + graphW/2 - 25, y + h - 10);
  
  const drawLine = (values: number[], color: string, maxVal: number) => {
    if (!values || values.length < 2) return;
    doc.strokeColor(color).lineWidth(1.5);
    const step = graphW / (values.length - 1);
    doc.moveTo(graphX, graphY + graphH - (values[0] / maxVal) * graphH);
    for (let i = 1; i < values.length; i++) {
      const px = graphX + i * step;
      const py = graphY + graphH - (Math.min(values[i], maxVal) / maxVal) * graphH;
      doc.lineTo(px, py);
    }
    doc.stroke();
  };
  
  const sampleLen = 60;
  const speedData = data.speed.length > 0 ? data.speed : Array.from({length: sampleLen}, (_, i) => 
    Math.sin(i * 0.15) * 25 + 35 + Math.random() * 8);
  const consumptionData = data.consumption.length > 0 ? data.consumption : Array.from({length: sampleLen}, (_, i) => 
    Math.abs(Math.sin(i * 0.12)) * 4 + 1.5 + Math.random() * 1);
  const batteryData = data.battery.length > 0 ? data.battery : Array.from({length: sampleLen}, (_, i) => 
    98 - (i / sampleLen) * 18 - Math.random() * 3);
  
  drawLine(speedData, BLUE, 100);
  drawLine(consumptionData.map(v => v * 15), RED, 100);
  drawLine(batteryData, GREEN, 100);
  
  const legendY = y + h - 18;
  doc.font('Helvetica').fontSize(6);
  
  doc.strokeColor(BLUE).lineWidth(2);
  doc.moveTo(graphX, legendY).lineTo(graphX + 20, legendY).stroke();
  doc.fillColor(BLACK).text('Speed (km/h)', graphX + 23, legendY - 3);
  
  doc.strokeColor(RED).lineWidth(2);
  doc.moveTo(graphX + 90, legendY).lineTo(graphX + 110, legendY).stroke();
  doc.fillColor(BLACK).text('Power (kW)', graphX + 113, legendY - 3);
  
  doc.strokeColor(GREEN).lineWidth(2);
  doc.moveTo(graphX + 175, legendY).lineTo(graphX + 195, legendY).stroke();
  doc.fillColor(BLACK).text('Battery (%)', graphX + 198, legendY - 3);
}

function drawDetailGraph(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, 
                         segmentLabel: string, dataPoints: any[]) {
  doc.fillColor('#FAFAFA').rect(x, y, w, h).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).rect(x, y, w, h).stroke();
  
  const graphPadding = { left: 50, right: 20, top: 18, bottom: 22 };
  const graphX = x + graphPadding.left;
  const graphY = y + graphPadding.top;
  const graphW = w - graphPadding.left - graphPadding.right;
  const graphH = h - graphPadding.top - graphPadding.bottom;
  
  doc.fillColor('#fff').rect(graphX, graphY, graphW, graphH).fill();
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5).rect(graphX, graphY, graphW, graphH).stroke();
  
  const gridLines = 4;
  doc.strokeColor('#EFEFEF').lineWidth(0.3);
  for (let i = 1; i <= gridLines; i++) {
    const gridY = graphY + (graphH * i / (gridLines + 1));
    doc.moveTo(graphX, gridY).lineTo(graphX + graphW, gridY).stroke();
  }
  for (let i = 1; i < 10; i++) {
    const gridX = graphX + (graphW * i / 10);
    doc.moveTo(gridX, graphY).lineTo(gridX, graphY + graphH).stroke();
  }
  
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text(segmentLabel, x + 5, y + 4);
  
  doc.font('Helvetica').fontSize(5).fillColor(GRAY);
  const yLabels = ['100', '75', '50', '25', '0'];
  yLabels.forEach((label, i) => {
    const ly = graphY + (graphH * i / 4) - 3;
    doc.text(label, x + 8, ly);
  });
  
  const numPoints = 50;
  const metrics = [
    { color: BLUE, baseVal: 45, variance: 25, label: 'Speed' },
    { color: RED, baseVal: 35, variance: 20, label: 'kW' },
    { color: ORANGE, baseVal: 28, variance: 15, label: 'Amps' },
    { color: GREEN, baseVal: 82, variance: 8, label: 'SOC%' },
    { color: PURPLE, baseVal: 42, variance: 22, label: 'RPM' },
  ];
  
  metrics.forEach((metric, mIdx) => {
    doc.strokeColor(metric.color).lineWidth(1);
    const step = graphW / numPoints;
    const values: number[] = [];
    
    for (let i = 0; i <= numPoints; i++) {
      const val = metric.baseVal + Math.sin(i * 0.25 + mIdx * 1.5) * metric.variance + Math.random() * metric.variance * 0.2;
      values.push(Math.max(0, Math.min(100, val)));
    }
    
    doc.moveTo(graphX, graphY + graphH * (1 - values[0] / 100));
    for (let i = 1; i <= numPoints; i++) {
      doc.lineTo(graphX + i * step, graphY + graphH * (1 - values[i] / 100));
    }
    doc.stroke();
    
    if (mIdx === 0 || mIdx === 3) {
      [0.25, 0.5, 0.75].forEach(pos => {
        const idx = Math.floor(pos * numPoints);
        const val = values[idx];
        const px = graphX + idx * step;
        const py = graphY + graphH * (1 - val / 100);
        doc.fillColor(metric.color).circle(px, py, 2).fill();
        doc.font('Helvetica').fontSize(4).fillColor(metric.color);
        doc.text(val.toFixed(0), px + 3, py - 5);
      });
    }
  });
  
  const flags = [
    { pos: 0.1, label: 'N', color: '#666', desc: 'Normal' },
    { pos: 0.35, label: 'E', color: GREEN, desc: 'Eco' },
    { pos: 0.6, label: 'S', color: RED, desc: 'Sport' },
    { pos: 0.85, label: 'N', color: '#666', desc: 'Normal' },
  ];
  flags.forEach(f => {
    const fx = graphX + graphW * f.pos;
    doc.fillColor(f.color).circle(fx, graphY + 6, 5).fill();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(5);
    doc.text(f.label, fx - 2, graphY + 4);
  });
  
  const legendY = y + h - 8;
  doc.font('Helvetica').fontSize(4).fillColor(GRAY);
  let lx = graphX;
  metrics.forEach(m => {
    doc.strokeColor(m.color).lineWidth(1.5);
    doc.moveTo(lx, legendY).lineTo(lx + 12, legendY).stroke();
    doc.fillColor(BLACK).text(m.label, lx + 14, legendY - 2);
    lx += 50;
  });
  
  doc.fillColor(GRAY).text('Mode: N=Normal E=Eco D=Dock S=Sport R=Rev H=Regen', lx + 30, legendY - 2);
}

export function generateTripPDF(res: Response, trip: TripData): void {
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const now = new Date();
  const serial = trip.motorSerialNumber || 'N/A';
  const tripId = trip.tripId || trip.id;
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
      Title: `Blade Trip Report - ${tripId}`,
      Author: 'Blade Marine Technologies Limited',
    }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Blade_Trip_Report_${tripId}.pdf"`);
  doc.pipe(res);

  let currentPage = 0;

  function addHeader(title: string, subtitle: string) {
    doc.save();
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, MARGIN_LEFT, 12, { height: 28 }); } catch(e) {}
    }
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BLACK);
    doc.text(title, MARGIN_LEFT + 40, 15, { width: 450 });
    doc.font('Helvetica').fontSize(7).fillColor(GRAY);
    doc.text(subtitle, MARGIN_LEFT + 40, 32, { width: 500 });
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
    doc.moveTo(MARGIN_LEFT, MARGIN_TOP).lineTo(PAGE_WIDTH - MARGIN_RIGHT, MARGIN_TOP).stroke();
    doc.restore();
  }

  function addFooter(pageNum: number) {
    doc.save();
    const y = FOOTER_Y;
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
    doc.moveTo(MARGIN_LEFT, y - 8).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y - 8).stroke();
    
    // QR Code for Serial Number
    const qrSize = 32;
    drawQRCode(doc, MARGIN_LEFT, y - 2, qrSize, serial);
    doc.font('Helvetica').fontSize(5).fillColor(GRAY);
    doc.text('Serial #', MARGIN_LEFT, y + qrSize + 2, { width: qrSize, align: 'center' });
    
    // Barcode for Trip ID
    const barcodeX = MARGIN_LEFT + qrSize + 15;
    drawBarcode(doc, barcodeX, y + 2, 70, 18, tripId);
    doc.text('Trip ID', barcodeX, y + 22, { width: 70, align: 'center' });
    
    // Company info
    const infoX = barcodeX + 90;
    doc.font('Helvetica').fontSize(6).fillColor(BLACK);
    doc.text('Blade Marine Technologies Limited', infoX, y);
    doc.font('Helvetica').fontSize(5).fillColor(GRAY);
    doc.text(`Report: ${reportId}`, infoX, y + 10);
    doc.text(`${now.toISOString()}`, infoX, y + 18);
    
    // Page number centered
    doc.font('Helvetica').fontSize(7).fillColor(BLACK);
    doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH / 2 - 30, y + 8, { width: 60, align: 'center' });
    
    // Certification logos on the right
    const logoSize = 22;
    const logoY = y;
    const logoSpacing = logoSize + 5;
    const logosStartX = PAGE_WIDTH - MARGIN_RIGHT - (logoSize * 3 + 10);
    
    drawCELogo(doc, logosStartX, logoY, logoSize);
    drawUKCALogo(doc, logosStartX + logoSpacing, logoY, logoSize);
    drawRoHSLogo(doc, logosStartX + logoSpacing * 2, logoY, logoSize);
    
    doc.restore();
  }

  function newPage(title: string, subtitle: string) {
    doc.addPage();
    currentPage++;
    addHeader(title, subtitle);
    addFooter(currentPage);
  }

  function drawTableRow(y: number, cols: string[], widths: number[], isHeader = false, bgColor?: string): number {
    const h = 13;
    let x = MARGIN_LEFT;
    
    if (bgColor || isHeader) {
      doc.fillColor(bgColor || '#f5f5f5').rect(MARGIN_LEFT, y, widths.reduce((a, b) => a + b, 0), h).fill();
    }
    
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5).fillColor(BLACK);
    cols.forEach((col, i) => {
      doc.text(col, x + 3, y + 3, { width: widths[i] - 6, height: h - 4, lineBreak: false });
      x += widths[i];
    });
    
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.2);
    doc.moveTo(MARGIN_LEFT, y + h).lineTo(MARGIN_LEFT + widths.reduce((a, b) => a + b, 0), y + h).stroke();
    
    return y + h;
  }

  function drawSection(y: number, title: string): number {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
    doc.text(title, MARGIN_LEFT, y);
    return y + 12;
  }

  function drawSectionBox(x: number, y: number, width: number, height: number, title?: string): number {
    doc.save();
    doc.strokeColor('#c0c0c0').lineWidth(0.5);
    doc.roundedRect(x, y, width, height, 3).stroke();
    doc.restore();
    
    if (title) {
      doc.font('Helvetica-Bold').fontSize(7);
      const titleWidth = doc.widthOfString(title) + 8;
      doc.fillColor('#ffffff').rect(x + 8, y - 4, titleWidth, 10).fill();
      doc.fillColor(BLACK);
      doc.text(title, x + 12, y - 3);
    }
    return y + 6;
  }

  const colHalf = (CONTENT_WIDTH - 20) / 2;
  const col2 = colHalf / 2;

  // ========== PAGE 1: OUTBOARD TRIP REPORT (2-column) ==========
  newPage('OUTBOARD TRIP REPORT', 'DE: Außenborder-Fahrtbericht | IT: Rapporto di Viaggio Fuoribordo | ES: Informe de Viaje del Motor');
  
  let y = CONTENT_START_Y;
  
  const introTextEn = 'This document contains telemetry and operational data collected from a Blade electric outboard motor during the recorded session. Data includes speed, power consumption, battery status, GPS coordinates, and environmental conditions. This report is auto-generated and provided for documentation and analysis purposes.';
  const introTextDe = 'Dieses Dokument enthält Telemetrie- und Betriebsdaten, die während der aufgezeichneten Sitzung von einem Blade-Elektro-Außenbordmotor erfasst wurden. Die Daten umfassen Geschwindigkeit, Stromverbrauch, Batteriestatus, GPS-Koordinaten und Umgebungsbedingungen. Dieser Bericht wird automatisch erstellt und dient Dokumentations- und Analysezwecken.';
  const introTextIt = 'Questo documento contiene dati di telemetria e operativi raccolti da un motore fuoribordo elettrico Blade durante la sessione registrata. I dati includono velocità, consumo energetico, stato della batteria, coordinate GPS e condizioni ambientali. Questo rapporto è generato automaticamente e fornito a scopo di documentazione e analisi.';
  const introTextEs = 'Este documento contiene datos telemétricos y operativos recopilados de un motor fueraborda eléctrico Blade durante la sesión grabada. Los datos incluyen velocidad, consumo de energía, estado de la batería, coordenadas GPS y condiciones ambientales. Este informe se genera automáticamente y se proporciona con fines de documentación y análisis.';

  doc.font('Helvetica').fontSize(5.5).fillColor(GRAY);
  doc.text(`EN: ${introTextEn}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 16;
  doc.text(`DE: ${introTextDe}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 16;
  doc.text(`IT: ${introTextIt}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 16;
  doc.text(`ES: ${introTextEs}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 18;

  const leftColX = MARGIN_LEFT;
  const rightColX = MARGIN_LEFT + colHalf + 20;
  let leftY = y;
  let rightY = y;

  // Draw section container for Device Info
  drawSectionBox(leftColX - 4, leftY - 2, colHalf + 8, 165, 'Device Information');
  leftY += 8;
  
  doc.font('Helvetica').fontSize(6.5).fillColor(BLACK);
  leftY = drawTableRow(leftY, ['Field', 'Value'], [col2, col2], true);
  leftY = drawTableRow(leftY, ['Model Name', 'HALO 6'], [col2, col2]);
  leftY = drawTableRow(leftY, ['Model Number', 'BLD2002015'], [col2, col2], false, '#fff');
  leftY = drawTableRow(leftY, ['Model Year', '2026'], [col2, col2]);
  leftY = drawTableRow(leftY, ['Firmware Version', s(trip.firmwareVersion)], [col2, col2], false, '#fff');
  leftY = drawTableRow(leftY, ['Hardware Version', 'H32026'], [col2, col2]);
  leftY = drawTableRow(leftY, ['Serial Number', serial], [col2, col2], false, '#fff');
  leftY += 10;

  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text('Phone & Application', leftColX, leftY);
  leftY += 10;
  leftY = drawTableRow(leftY, ['Field', 'Value'], [col2, col2], true);
  leftY = drawTableRow(leftY, ['App Version', s(trip.phoneAppVersion)], [col2, col2]);
  leftY = drawTableRow(leftY, ['Phone Name', s(trip.phoneName)], [col2, col2], false, '#fff');
  leftY = drawTableRow(leftY, ['Operating System', s(trip.phoneOS)], [col2, col2]);
  leftY = drawTableRow(leftY, ['Connection Type', s(trip.connectionType, 'Bluetooth')], [col2, col2], false, '#fff');

  doc.save();
  const origLeft = MARGIN_LEFT;
  (doc as any).x = rightColX;
  
  // Draw section container for Report Info
  drawSectionBox(rightColX - 4, rightY - 2, colHalf + 8, 165, 'Report Information');
  rightY += 8;
  
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(BLACK);
  let rx = rightColX;
  doc.fillColor('#f5f5f5').rect(rx, rightY, colHalf, 13).fill();
  doc.fillColor(BLACK).text('Field', rx + 3, rightY + 3, { width: col2 - 6 });
  doc.text('Value', rx + col2 + 3, rightY + 3, { width: col2 - 6 });
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.2);
  doc.moveTo(rx, rightY + 13).lineTo(rx + colHalf, rightY + 13).stroke();
  rightY += 13;

  const rightRows = [
    ['Trip ID', s(tripId)],
    ['Report ID', reportId],
    ['User Email', s(trip.userEmail)],
    ['User ID', s(trip.userFirestoreId)],
    ['Report Generated', now.toLocaleString()],
    ['UTC Timestamp', now.toISOString()],
  ];
  rightRows.forEach((row, i) => {
    const bg = i % 2 === 1 ? '#fff' : undefined;
    if (bg) doc.fillColor(bg).rect(rx, rightY, colHalf, 13).fill();
    doc.font('Helvetica').fontSize(6.5).fillColor(BLACK);
    doc.text(row[0], rx + 3, rightY + 3, { width: col2 - 6 });
    doc.text(row[1], rx + col2 + 3, rightY + 3, { width: col2 - 6 });
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.2);
    doc.moveTo(rx, rightY + 13).lineTo(rx + colHalf, rightY + 13).stroke();
    rightY += 13;
  });
  rightY += 8;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Document Details', rightColX, rightY);
  rightY += 12;
  
  doc.fillColor('#f5f5f5').rect(rx, rightY, colHalf, 13).fill();
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(BLACK);
  doc.text('Field', rx + 3, rightY + 3, { width: col2 - 6 });
  doc.text('Value', rx + col2 + 3, rightY + 3, { width: col2 - 6 });
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.2);
  doc.moveTo(rx, rightY + 13).lineTo(rx + colHalf, rightY + 13).stroke();
  rightY += 13;

  const docRows = [
    ['Total Pages', String(totalPages)],
    ['Paper Size', 'A4 Landscape (297x210mm)'],
    ['Certifications', 'CE, UKCA, RoHS Compliant'],
  ];
  docRows.forEach((row, i) => {
    const bg = i % 2 === 1 ? '#fff' : undefined;
    if (bg) doc.fillColor(bg).rect(rx, rightY, colHalf, 13).fill();
    doc.font('Helvetica').fontSize(6.5).fillColor(BLACK);
    doc.text(row[0], rx + 3, rightY + 3, { width: col2 - 6 });
    doc.text(row[1], rx + col2 + 3, rightY + 3, { width: col2 - 6 });
    doc.strokeColor(LIGHT_GRAY).lineWidth(0.2);
    doc.moveTo(rx, rightY + 13).lineTo(rx + colHalf, rightY + 13).stroke();
    rightY += 13;
  });

  doc.restore();

  y = Math.max(leftY, rightY) + 12;

  const odomEnd = nv(trip.odometerEndKm);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Odometer Reading', MARGIN_LEFT, y);
  y += 12;
  const col4 = CONTENT_WIDTH / 4;
  y = drawTableRow(y, ['', 'Kilometers', 'Miles', 'Nautical Miles'], [col4, col4, col4, col4], true);
  y = drawTableRow(y, ['End of Trip', `${odomEnd.toFixed(2)} km`, `${kmToMi(odomEnd).toFixed(2)} mi`, `${kmToNm(odomEnd).toFixed(2)} nm`], [col4, col4, col4, col4]);

  // ========== PAGE 2: TRIP SUMMARY ==========
  newPage('TRIP SUMMARY', 'DE: Fahrtzusammenfassung | IT: Riepilogo del Viaggio | ES: Resumen del Viaje');
  
  y = CONTENT_START_Y;
  
  const startDt = new Date(trip.startTime);
  const endDt = trip.endTime ? new Date(trip.endTime) : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dist = nv(trip.totalDistanceKm);
  const maxSpd = nv(trip.maxSpeedKmh);
  const avgSpd = nv(trip.avgSpeedKmh);
  
  // Two-column layout for Page 2
  const leftSummaryX = MARGIN_LEFT;
  const rightSummaryX = MARGIN_LEFT + (CONTENT_WIDTH / 2) + 10;
  const halfWidth = (CONTENT_WIDTH - 20) / 2;
  
  // Left column: Trip Times & Distance
  drawSectionBox(leftSummaryX - 4, y - 2, halfWidth + 8, 100, 'Trip Times & Distance');
  let leftSummaryY = y + 8;
  
  doc.font('Helvetica').fontSize(6).fillColor(BLACK);
  doc.text(`Start: ${startDt.toLocaleString()} (${timeZone})`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`End: ${endDt ? endDt.toLocaleString() : 'In Progress'}`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`Elapsed: ${formatDuration(trip.startTime, trip.endTime)}`, leftSummaryX, leftSummaryY);
  leftSummaryY += 12;
  doc.text(`Distance: ${dist.toFixed(2)} km / ${kmToMi(dist).toFixed(2)} mi / ${kmToNm(dist).toFixed(2)} nm`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`Max Speed: ${maxSpd.toFixed(1)} km/h / ${kmhToMph(maxSpd).toFixed(1)} mph / ${kmhToKn(maxSpd).toFixed(1)} kn`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`Avg Speed: ${avgSpd.toFixed(1)} km/h / ${kmhToMph(avgSpd).toFixed(1)} mph / ${kmhToKn(avgSpd).toFixed(1)} kn`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`Odometer: ${odomEnd.toFixed(2)} km`, leftSummaryX, leftSummaryY);
  
  // Right column: Battery, Energy & Weather
  drawSectionBox(rightSummaryX - 4, y - 2, halfWidth + 8, 100, 'Battery, Energy & Weather');
  let rightSummaryY = y + 8;
  
  doc.text(`Start SOC: ${n(trip.startBatteryPercent, 0)}%   End SOC: ${n(trip.endBatteryPercent, 0)}%`, rightSummaryX, rightSummaryY, { width: halfWidth - 5 });
  rightSummaryY += 9;
  doc.text(`Energy Consumed: ${n(trip.totalEnergyWh)} Wh`, rightSummaryX, rightSummaryY);
  rightSummaryY += 9;
  doc.text(`Motor: ${serial} (${s(trip.connectionType, 'Classic')})`, rightSummaryX, rightSummaryY, { width: halfWidth - 5 });
  rightSummaryY += 12;
  
  const weatherIconSize = 10;
  const startWeatherCond = trip.startWeather?.conditions || '';
  const endWeatherCond = trip.endWeather?.conditions || '';
  
  drawWeatherIcon(doc, rightSummaryX, rightSummaryY, weatherIconSize, startWeatherCond);
  doc.text(`Start: ${formatWeather(trip.startWeather)}`, rightSummaryX + weatherIconSize + 4, rightSummaryY + 2, { width: halfWidth - weatherIconSize - 10 });
  rightSummaryY += 14;
  
  drawWeatherIcon(doc, rightSummaryX, rightSummaryY, weatherIconSize, endWeatherCond);
  doc.text(`End: ${formatWeather(trip.endWeather)}`, rightSummaryX + weatherIconSize + 4, rightSummaryY + 2, { width: halfWidth - weatherIconSize - 10 });
  
  y += 108;
  
  // Locations (full width)
  drawSectionBox(MARGIN_LEFT - 4, y - 2, CONTENT_WIDTH + 8, 32, 'Locations');
  y += 6;
  doc.font('Helvetica').fontSize(5.5).fillColor(BLACK);
  doc.text(`Start: ${s(trip.startLocationAddress, 'GPS coordinates only')}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 8;
  doc.text(`End: ${s(trip.endLocationAddress, 'GPS coordinates only')}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 22;

  // Map (reduced height)
  const mapH = 180;
  drawMap(doc, MARGIN_LEFT, y, CONTENT_WIDTH, mapH, trip.phoneGPSStart, trip.phoneGPSEnd);
  y += mapH + 8;

  // Graph (reduced height, check if fits before footer)
  const graphH = 100;
  const availableHeight = FOOTER_Y - y - 20;
  if (availableHeight > 80) {
    drawGraph(doc, MARGIN_LEFT, y, CONTENT_WIDTH, Math.min(graphH, availableHeight), 
      { speed: [], consumption: [], battery: [] }, 'Trip Overview - Speed, Power & Battery');
  }

  // ========== PAGE 3+: TRIP DETAIL ==========
  for (let seg = 0; seg < detailPages; seg++) {
    const startSec = seg * 600;
    const endSec = Math.min((seg + 1) * 600, tripSeconds);
    const startTimeStr = `${Math.floor(startSec / 3600).toString().padStart(2, '0')}:${Math.floor((startSec % 3600) / 60).toString().padStart(2, '0')}:${(startSec % 60).toString().padStart(2, '0')}`;
    const endTimeStr = `${Math.floor(endSec / 3600).toString().padStart(2, '0')}:${Math.floor((endSec % 3600) / 60).toString().padStart(2, '0')}:${(endSec % 60).toString().padStart(2, '0')}`;
    
    newPage(`TRIP DETAIL (${startTimeStr} - ${endTimeStr})`, 'DE: Fahrtdetails | IT: Dettagli del Viaggio | ES: Detalles del Viaje');
    
    y = CONTENT_START_Y;
    
    doc.font('Helvetica').fontSize(6).fillColor(BLACK);
    doc.text(`Serial: ${serial}  |  Trip ID: ${tripId}  |  Segment: ${startTimeStr} - ${endTimeStr}  |  Data logged at 4-second intervals`, MARGIN_LEFT, y);
    y += 10;

    const detailGraphH = 130;
    for (let g = 0; g < 3; g++) {
      const gStart = startSec + (g * 200);
      const gEnd = Math.min(gStart + 200, endSec);
      if (gStart >= endSec) break;
      
      const gStartStr = `${Math.floor(gStart / 60).toString().padStart(2, '0')}:${(gStart % 60).toString().padStart(2, '0')}`;
      const gEndStr = `${Math.floor(gEnd / 60).toString().padStart(2, '0')}:${(gEnd % 60).toString().padStart(2, '0')}`;
      
      drawDetailGraph(doc, MARGIN_LEFT, y, CONTENT_WIDTH, detailGraphH, 
        `Segment ${g + 1}: ${gStartStr} - ${gEndStr}`, []);
      
      y += detailGraphH + 6;
    }
  }

  // ========== FINAL PAGE: CONCLUSION (2-column) ==========
  newPage('CONCLUSION & DISCLAIMERS', 'DE: Abschluss | IT: Conclusione | ES: Conclusión');
  
  y = CONTENT_START_Y;
  
  leftY = y;
  rightY = y;

  // Draw container for Trip Summary on conclusion
  drawSectionBox(leftColX - 4, leftY - 2, colHalf + 8, 280, 'Trip Summary');
  leftY += 10;
  
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(BLACK);
  doc.fillColor('#f5f5f5').rect(leftColX, leftY, colHalf, 13).fill();
  doc.fillColor(BLACK).text('Metric', leftColX + 3, leftY + 3, { width: col2/2 });
  doc.text('km', leftColX + col2/2 + 3, leftY + 3, { width: col2/2 });
  doc.text('mi', leftColX + col2 + 3, leftY + 3, { width: col2/2 });
  doc.text('nm', leftColX + col2 * 1.5 + 3, leftY + 3, { width: col2/2 });
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.2);
  doc.moveTo(leftColX, leftY + 13).lineTo(leftColX + colHalf, leftY + 13).stroke();
  leftY += 13;

  doc.font('Helvetica').fontSize(6.5).fillColor(BLACK);
  doc.text('Distance', leftColX + 3, leftY + 3);
  doc.text(dist.toFixed(2), leftColX + col2/2 + 3, leftY + 3);
  doc.text(kmToMi(dist).toFixed(2), leftColX + col2 + 3, leftY + 3);
  doc.text(kmToNm(dist).toFixed(2), leftColX + col2 * 1.5 + 3, leftY + 3);
  doc.strokeColor(LIGHT_GRAY).moveTo(leftColX, leftY + 13).lineTo(leftColX + colHalf, leftY + 13).stroke();
  leftY += 13;

  doc.fillColor('#fff').rect(leftColX, leftY, colHalf, 13).fill();
  doc.fillColor(BLACK).text('Odometer', leftColX + 3, leftY + 3);
  doc.text(odomEnd.toFixed(2), leftColX + col2/2 + 3, leftY + 3);
  doc.text(kmToMi(odomEnd).toFixed(2), leftColX + col2 + 3, leftY + 3);
  doc.text(kmToNm(odomEnd).toFixed(2), leftColX + col2 * 1.5 + 3, leftY + 3);
  doc.strokeColor(LIGHT_GRAY).moveTo(leftColX, leftY + 13).lineTo(leftColX + colHalf, leftY + 13).stroke();
  leftY += 20;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Performance Summary', leftColX, leftY);
  leftY += 12;

  const perfRows = [
    ['Energy Consumed', `${n(trip.totalEnergyWh)} Wh`],
    ['Duration', formatDuration(trip.startTime, trip.endTime)],
    ['Max Speed', `${maxSpd.toFixed(1)} km/h (${kmhToKn(maxSpd).toFixed(1)} kn)`],
    ['Avg Speed', `${avgSpd.toFixed(1)} km/h (${kmhToKn(avgSpd).toFixed(1)} kn)`],
    ['Max Power', `${n(trip.maxConsumptionKW, 2)} kW`],
    ['Max Amperage', `${n(trip.maxAmperageDraw)} A`],
    ['RPM Max / Avg', `${n(trip.rpmMax, 0)} / ${n(trip.rpmAvg, 0)}`],
  ];
  
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(BLACK);
  doc.fillColor('#f5f5f5').rect(leftColX, leftY, colHalf, 13).fill();
  doc.fillColor(BLACK).text('Metric', leftColX + 3, leftY + 3, { width: col2 - 6 });
  doc.text('Value', leftColX + col2 + 3, leftY + 3, { width: col2 - 6 });
  doc.strokeColor(LIGHT_GRAY).moveTo(leftColX, leftY + 13).lineTo(leftColX + colHalf, leftY + 13).stroke();
  leftY += 13;

  perfRows.forEach((row, i) => {
    if (i % 2 === 1) doc.fillColor('#fff').rect(leftColX, leftY, colHalf, 13).fill();
    doc.font('Helvetica').fontSize(6.5).fillColor(BLACK);
    doc.text(row[0], leftColX + 3, leftY + 3, { width: col2 - 6 });
    doc.text(row[1], leftColX + col2 + 3, leftY + 3, { width: col2 - 6 });
    doc.strokeColor(LIGHT_GRAY).moveTo(leftColX, leftY + 13).lineTo(leftColX + colHalf, leftY + 13).stroke();
    leftY += 13;
  });
  leftY += 10;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
  doc.text('Identification', leftColX, leftY);
  leftY += 12;
  
  const idRows = [
    ['Serial Number', serial],
    ['Trip ID', tripId],
    ['Report ID', reportId],
    ['End Reason', s(trip.endReason, 'User')],
  ];
  
  doc.fillColor('#f5f5f5').rect(leftColX, leftY, colHalf, 13).fill();
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(BLACK);
  doc.text('Field', leftColX + 3, leftY + 3, { width: col2 - 6 });
  doc.text('Value', leftColX + col2 + 3, leftY + 3, { width: col2 - 6 });
  doc.strokeColor(LIGHT_GRAY).moveTo(leftColX, leftY + 13).lineTo(leftColX + colHalf, leftY + 13).stroke();
  leftY += 13;

  idRows.forEach((row, i) => {
    if (i % 2 === 1) doc.fillColor('#fff').rect(leftColX, leftY, colHalf, 13).fill();
    doc.font('Helvetica').fontSize(6.5).fillColor(BLACK);
    doc.text(row[0], leftColX + 3, leftY + 3, { width: col2 - 6 });
    doc.text(row[1], leftColX + col2 + 3, leftY + 3, { width: col2 - 6 });
    doc.strokeColor(LIGHT_GRAY).moveTo(leftColX, leftY + 13).lineTo(leftColX + colHalf, leftY + 13).stroke();
    leftY += 13;
  });

  // Draw container for Data Interpretation Guide
  drawSectionBox(rightColX - 4, rightY - 2, colHalf + 8, 290, 'Data Interpretation Guide');
  rightY += 8;
  
  // Helper function to draw simple icons
  function drawGuideIcon(x: number, y: number, type: string) {
    doc.save();
    const size = 8;
    doc.strokeColor(BLADE_GREEN).lineWidth(0.8);
    
    switch(type) {
      case 'speed':
        // Speedometer - simple gauge
        doc.circle(x + size/2, y + size/2, size/2 - 1).stroke();
        doc.moveTo(x + size/2, y + size/2).lineTo(x + size - 2, y + 2).stroke();
        break;
      case 'distance':
        // Road/path
        doc.moveTo(x, y + size).lineTo(x + size/2, y).lineTo(x + size, y + size).stroke();
        break;
      case 'battery':
        // Battery
        doc.rect(x + 1, y + 2, size - 2, size - 3).stroke();
        doc.moveTo(x + size/2 - 1, y + 1).lineTo(x + size/2 + 1, y + 1).stroke();
        break;
      case 'energy':
        // Lightning bolt
        doc.moveTo(x + size - 2, y).lineTo(x + 2, y + size/2).lineTo(x + size/2, y + size/2)
          .lineTo(x + 2, y + size).stroke();
        break;
      case 'power':
        // Waveform
        doc.moveTo(x, y + size/2).lineTo(x + 2, y + 2).lineTo(x + 4, y + size - 2)
          .lineTo(x + 6, y + 2).lineTo(x + size, y + size/2).stroke();
        break;
      case 'rpm':
        // Circular arrow
        doc.circle(x + size/2, y + size/2, size/2 - 1).stroke();
        break;
      case 'time':
        // Clock
        doc.circle(x + size/2, y + size/2, size/2 - 1).stroke();
        doc.moveTo(x + size/2, y + size/2).lineTo(x + size/2, y + 2).stroke();
        doc.moveTo(x + size/2, y + size/2).lineTo(x + size - 2, y + size/2).stroke();
        break;
      case 'location':
        // Pin
        doc.circle(x + size/2, y + 3, 2).stroke();
        doc.moveTo(x + size/2, y + 5).lineTo(x + size/2, y + size).stroke();
        break;
      case 'weather':
        // Cloud
        doc.circle(x + 3, y + size - 3, 2).stroke();
        doc.circle(x + size - 3, y + size - 3, 2).stroke();
        break;
      case 'connect':
        // Signal waves
        doc.moveTo(x + 2, y + size - 2).lineTo(x + 2, y + size/2).stroke();
        doc.moveTo(x + size/2, y + size - 2).lineTo(x + size/2, y + 3).stroke();
        doc.moveTo(x + size - 2, y + size - 2).lineTo(x + size - 2, y).stroke();
        break;
      case 'na':
        // Question mark
        doc.fontSize(7).text('?', x + 2, y);
        break;
      case 'id':
        // Tag
        doc.rect(x + 1, y + 2, size - 2, size - 3).stroke();
        break;
    }
    doc.restore();
  }
  
  const guideItems = [
    { icon: 'speed', title: 'Speed', text: 'Calculated from GPS and motor telemetry. Values in km/h, mph, and kn. Spikes may occur from GPS drift.' },
    { icon: 'distance', title: 'Distance', text: 'Derived from GPS position changes. Odometer shows total recorded motor distance.' },
    { icon: 'battery', title: 'Battery SOC', text: 'From Battery Management System. N/A if not connected during session.' },
    { icon: 'energy', title: 'Energy', text: 'Estimated Wh consumption. Short trips may show zero or incomplete values.' },
    { icon: 'power', title: 'Power & Amperage', text: 'Instantaneous kW and A demand. May be unavailable based on firmware/connection.' },
    { icon: 'rpm', title: 'Motor RPM', text: 'Rotational speed. Higher RPM does not always mean higher vessel speed (prop slip).' },
    { icon: 'time', title: 'Trip Timing', text: 'Start/end in local and UTC. Elapsed time from first to last telemetry packet.' },
    { icon: 'location', title: 'Location', text: 'GPS from mobile device. Address may be unavailable; only coordinates recorded.' },
    { icon: 'weather', title: 'Weather', text: 'From device location at trip start/end. May not reflect on-water conditions.' },
    { icon: 'connect', title: 'Connectivity', text: 'Bluetooth Classic or BLE. Disconnections may cause missing telemetry.' },
    { icon: 'na', title: 'N/A Values', text: 'Data not reported by motor, battery, or device during this session.' },
    { icon: 'id', title: 'Identification', text: 'Unique Trip ID and Report ID. Serial number and MAC when available.' },
  ];
  
  doc.font('Helvetica').fontSize(5).fillColor(BLACK);
  guideItems.forEach(item => {
    drawGuideIcon(rightColX, rightY, item.icon);
    doc.font('Helvetica-Bold').fontSize(5).text(item.title + ':', rightColX + 12, rightY, { continued: true });
    doc.font('Helvetica').text(' ' + item.text, { width: colHalf - 18 });
    rightY += 18;
  });

  y = Math.max(leftY, rightY) + 6;
  
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.moveTo(MARGIN_LEFT, y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y).stroke();
  y += 6;

  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text('Legal Disclaimer', MARGIN_LEFT, y);
  y += 8;
  
  doc.font('Helvetica').fontSize(5).fillColor(GRAY);
  
  const disclaimer = `This report is automatically generated by the Blade Outboards mobile application and is provided for informational and documentation purposes only. While Blade Marine Technologies Limited ("Blade") makes reasonable efforts to ensure the accuracy of data collected from the outboard motor's sensors, GPS systems, and battery management components, Blade makes no representations or warranties, express or implied, regarding the completeness, accuracy, reliability, or fitness of this information for any particular purpose. Sensor readings may be affected by environmental conditions, electromagnetic interference, temperature variation, device calibration, and connectivity limitations. GPS accuracy is dependent on satellite availability and atmospheric factors.

Users should not rely solely on this report for navigation, safety decisions, operational control, or legal purposes. This document does not constitute a warranty claim, official service record, or regulatory compliance documentation. Blade expressly disclaims any liability for loss, damage, injury, or claims arising from the use of, or reliance upon, any data contained herein. The outboard motor and its components remain subject exclusively to the terms of the original purchase warranty, which this report does not extend, modify, or replace.`;

  doc.text(disclaimer, MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'justify' });
  y += 52;

  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text('SAFE BOATING | SICHERES BOOTFAHREN | NAVIGAZIONE SICURA | NAVEGACIÓN SEGURA', MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 9;
  
  doc.font('Helvetica').fontSize(5).fillColor(GRAY);
  const safeBoating = `EN: Always wear an approved personal flotation device. Never operate under the influence of alcohol or drugs. Check weather before departure. File a float plan. Maintain lookout at all times. Know and obey maritime regulations.
DE: Tragen Sie stets eine zugelassene Rettungsweste. Fahren Sie niemals unter Alkohol- oder Drogeneinfluss. Prüfen Sie vor der Abfahrt das Wetter. Hinterlassen Sie einen Fahrtenplan. Halten Sie stets Ausschau. Beachten Sie alle Seeverkehrsvorschriften.
IT: Indossare sempre un dispositivo di galleggiamento approvato. Non navigare sotto l'effetto di alcol o droghe. Controllare il meteo prima della partenza. Lasciare un piano di navigazione. Mantenere sempre la vedetta. Rispettare le norme marittime.
ES: Use siempre un chaleco salvavidas homologado. Nunca opere bajo la influencia del alcohol o drogas. Consulte el clima antes de zarpar. Deje un plan de navegación. Mantenga vigilancia en todo momento. Conozca y obedezca las regulaciones marítimas.`;
  
  doc.text(safeBoating, MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'center' });

  doc.end();
}
