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

  function drawTableRow(y: number, cols: string[], widths: number[], isHeader = false, bgColor?: string) {
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

  // ========== PAGE 1: INTRODUCTION ==========
  newPage('INTRODUCTION', 'DE: Einführung | IT: Introduzione | ES: Introducción');
  
  let y = CONTENT_START_Y;
  
  doc.font('Helvetica').fontSize(7).fillColor(GRAY);
  doc.text('This document contains telemetry and trip data collected from a Blade electric outboard during the recorded session. The report includes speed, power, battery usage, and route information for review and documentation purposes. Data accuracy and availability are not guaranteed.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 28;

  // Device Info
  y = drawSection(y, 'Device Information');
  const col1 = CONTENT_WIDTH * 0.35;
  const col2 = CONTENT_WIDTH * 0.65;
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Model Name', 'HALO 6'], [col1, col2]);
  y = drawTableRow(y, ['Model Number', 'BLD2002015'], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Model Year', '2026'], [col1, col2]);
  y = drawTableRow(y, ['Firmware Version', s(trip.firmwareVersion)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Hardware Version', 'H32026'], [col1, col2]);
  y = drawTableRow(y, ['Serial Number', serial], [col1, col2], false, '#fff');
  y += 12;

  // Phone/App Info
  y = drawSection(y, 'Phone & Application');
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['App Version', s(trip.phoneAppVersion)], [col1, col2]);
  y = drawTableRow(y, ['Phone Name', s(trip.phoneName)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Operating System', s(trip.phoneOS)], [col1, col2]);
  y = drawTableRow(y, ['Report Generated (Local)', now.toLocaleString()], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Report Generated (UTC)', now.toISOString()], [col1, col2]);
  y += 12;

  // Report Info
  y = drawSection(y, 'Report Information');
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Trip ID', s(trip.tripId || trip.id)], [col1, col2]);
  y = drawTableRow(y, ['Report ID', reportId], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['User Email', s(trip.userEmail)], [col1, col2]);
  y = drawTableRow(y, ['User ID', s(trip.userFirestoreId)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Total Pages', String(totalPages)], [col1, col2]);
  y = drawTableRow(y, ['Paper Size', 'A4 Landscape'], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Certifications', 'CE, UKCA, RoHS'], [col1, col2]);
  y += 12;

  // Odometer
  const odomEnd = nv(trip.odometerEndKm);
  y = drawSection(y, 'Odometer Reading');
  const col3 = CONTENT_WIDTH / 4;
  y = drawTableRow(y, ['', 'Kilometers', 'Miles', 'Nautical Miles'], [col3, col3, col3, col3], true);
  y = drawTableRow(y, ['End of Trip', `${odomEnd.toFixed(2)} km`, `${kmToMi(odomEnd).toFixed(2)} mi`, `${kmToNm(odomEnd).toFixed(2)} nm`], [col3, col3, col3, col3]);

  // ========== PAGE 2: TRIP SUMMARY ==========
  newPage('TRIP SUMMARY', 'DE: Fahrtzusammenfassung | IT: Riepilogo del Viaggio | ES: Resumen del Viaje');
  
  y = CONTENT_START_Y;
  
  // Times
  const startDt = new Date(trip.startTime);
  const endDt = trip.endTime ? new Date(trip.endTime) : null;
  
  y = drawSection(y, 'Trip Times');
  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Start Time (Local)', startDt.toLocaleString()], [col1, col2]);
  y = drawTableRow(y, ['Start Time (UTC)', startDt.toISOString()], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['End Time (Local)', endDt ? endDt.toLocaleString() : 'In Progress'], [col1, col2]);
  y = drawTableRow(y, ['End Time (UTC)', endDt ? endDt.toISOString() : 'N/A'], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Total Duration', formatDuration(trip.startTime, trip.endTime)], [col1, col2]);
  y = drawTableRow(y, ['Connection Type', s(trip.connectionType, 'Bluetooth Classic')], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['End Reason', s(trip.endReason, 'user_button')], [col1, col2]);
  y += 10;

  // Weather
  y = drawSection(y, 'Weather Conditions');
  y = drawTableRow(y, ['Time', 'Conditions'], [CONTENT_WIDTH * 0.15, CONTENT_WIDTH * 0.85], true);
  y = drawTableRow(y, ['Start', formatWeather(trip.startWeather)], [CONTENT_WIDTH * 0.15, CONTENT_WIDTH * 0.85]);
  y = drawTableRow(y, ['End', formatWeather(trip.endWeather)], [CONTENT_WIDTH * 0.15, CONTENT_WIDTH * 0.85], false, '#fff');
  y += 10;

  // GPS
  y = drawSection(y, 'GPS Locations');
  y = drawTableRow(y, ['Source', 'Coordinates'], [col1, col2], true);
  y = drawTableRow(y, ['Phone GPS Start', formatCoord(trip.phoneGPSStart)], [col1, col2]);
  y = drawTableRow(y, ['Phone GPS End', formatCoord(trip.phoneGPSEnd)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Outboard GPS Start', formatCoord(trip.outboardGPSStart)], [col1, col2]);
  y = drawTableRow(y, ['Outboard GPS End', formatCoord(trip.outboardGPSEnd)], [col1, col2], false, '#fff');
  y += 10;

  // Distance & Speed
  const dist = nv(trip.totalDistanceKm);
  const maxSpd = nv(trip.maxSpeedKmh);
  const avgSpd = nv(trip.avgSpeedKmh);
  
  y = drawSection(y, 'Distance & Speed');
  y = drawTableRow(y, ['Metric', 'km / km/h', 'mi / mph', 'nm / knots'], [col3, col3, col3, col3], true);
  y = drawTableRow(y, ['Total Distance', `${dist.toFixed(2)} km`, `${kmToMi(dist).toFixed(2)} mi`, `${kmToNm(dist).toFixed(2)} nm`], [col3, col3, col3, col3]);
  y = drawTableRow(y, ['Max Speed', `${maxSpd.toFixed(1)} km/h`, `${kmhToMph(maxSpd).toFixed(1)} mph`, `${kmhToKn(maxSpd).toFixed(1)} kn`], [col3, col3, col3, col3], false, '#fff');
  y = drawTableRow(y, ['Avg Speed', `${avgSpd.toFixed(1)} km/h`, `${kmhToMph(avgSpd).toFixed(1)} mph`, `${kmhToKn(avgSpd).toFixed(1)} kn`], [col3, col3, col3, col3]);
  y += 10;

  // Battery
  y = drawSection(y, 'Battery & Energy');
  y = drawTableRow(y, ['Metric', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Starting Battery SOC', `${n(trip.startBatteryPercent, 0)}%`], [col1, col2]);
  y = drawTableRow(y, ['Ending Battery SOC', `${n(trip.endBatteryPercent, 0)}%`], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Energy Consumed', `${n(trip.totalEnergyWh)} Wh`], [col1, col2]);
  y = drawTableRow(y, ['Max Amperage', `${n(trip.maxAmperageDraw)} A`], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Max Consumption', `${n(trip.maxConsumptionKW, 2)} kW`], [col1, col2]);
  y = drawTableRow(y, ['Avg Consumption', `${n(trip.avgConsumptionKW, 2)} kW`], [col1, col2], false, '#fff');
  y += 10;

  // RPM
  y = drawSection(y, 'Motor Performance');
  y = drawTableRow(y, ['Metric', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['RPM Max', n(trip.rpmMax, 0)], [col1, col2]);
  y = drawTableRow(y, ['RPM Average', n(trip.rpmAvg, 0)], [col1, col2], false, '#fff');
  y += 15;

  // Map placeholder
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH * 0.6, 70).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(GRAY);
  doc.text('[Route Map - Start to End Location]', MARGIN_LEFT + 10, y + 30);

  // Graph placeholder
  doc.rect(MARGIN_LEFT + CONTENT_WIDTH * 0.62, y, CONTENT_WIDTH * 0.38, 70).stroke();
  doc.text('[Trip Overview Graph]', MARGIN_LEFT + CONTENT_WIDTH * 0.65, y + 30);

  // ========== PAGE 3+: TRIP DETAIL ==========
  for (let seg = 0; seg < detailPages; seg++) {
    const startSec = seg * 600;
    const endSec = Math.min((seg + 1) * 600, tripSeconds);
    const startTimeStr = `${Math.floor(startSec / 3600).toString().padStart(2, '0')}:${Math.floor((startSec % 3600) / 60).toString().padStart(2, '0')}:${(startSec % 60).toString().padStart(2, '0')}`;
    const endTimeStr = `${Math.floor(endSec / 3600).toString().padStart(2, '0')}:${Math.floor((endSec % 3600) / 60).toString().padStart(2, '0')}:${(endSec % 60).toString().padStart(2, '0')}`;
    
    newPage(`TRIP DETAIL (${startTimeStr} - ${endTimeStr})`, `DE: Fahrtdetails | IT: Dettagli del Viaggio | ES: Detalles del Viaje`);
    
    y = CONTENT_START_Y;
    
    doc.font('Helvetica').fontSize(7).fillColor(BLACK);
    doc.text(`Serial: ${serial}  |  Trip ID: ${s(trip.tripId || trip.id)}  |  Segment: ${startTimeStr} - ${endTimeStr}`, MARGIN_LEFT, y);
    y += 15;

    // Three graph boxes for 200-second segments
    const graphH = 120;
    for (let g = 0; g < 3; g++) {
      const gStart = startSec + (g * 200);
      const gEnd = Math.min(gStart + 200, endSec);
      if (gStart >= endSec) break;
      
      const gStartStr = `${Math.floor(gStart / 60).toString().padStart(2, '0')}:${(gStart % 60).toString().padStart(2, '0')}`;
      const gEndStr = `${Math.floor(gEnd / 60).toString().padStart(2, '0')}:${(gEnd % 60).toString().padStart(2, '0')}`;
      
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
      doc.text(`Segment ${g + 1}: ${gStartStr} - ${gEndStr}`, MARGIN_LEFT, y);
      y += 12;
      
      doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
      doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, graphH).stroke();
      
      // Y-axis labels
      doc.font('Helvetica').fontSize(6).fillColor(GRAY);
      doc.text('Speed | kW | Amps | SOC% | RPM', MARGIN_LEFT + 5, y + 5);
      
      // X-axis
      doc.text('Time', MARGIN_LEFT + CONTENT_WIDTH / 2 - 10, y + graphH - 12);
      
      // Legend
      doc.text('Legend: Speed (blue) | kW (red) | Amps (orange) | SOC (green) | RPM (purple) | N=Normal E=Eco D=Docking S=Sport R=Reverse H=Hydroregen', MARGIN_LEFT + 5, y + graphH - 22, { width: CONTENT_WIDTH - 10 });
      
      y += graphH + 12;
    }
  }

  // ========== FINAL PAGE: CONCLUSION ==========
  newPage('CONCLUSION', 'DE: Abschluss | IT: Conclusione | ES: Conclusión');
  
  y = CONTENT_START_Y;
  
  // Notes box
  y = drawSection(y, 'Notes');
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 50).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(GRAY);
  doc.text('[Notes section - currently blank]', MARGIN_LEFT + 10, y + 20);
  y += 60;

  // Summary
  y = drawSection(y, 'Trip Summary');
  y = drawTableRow(y, ['Metric', 'Kilometers', 'Miles', 'Nautical Miles'], [col3, col3, col3, col3], true);
  y = drawTableRow(y, ['Distance Traveled', `${dist.toFixed(2)} km`, `${kmToMi(dist).toFixed(2)} mi`, `${kmToNm(dist).toFixed(2)} nm`], [col3, col3, col3, col3]);
  y = drawTableRow(y, ['Odometer Start', `${nv(trip.odometerStartKm).toFixed(2)} km`, `${kmToMi(nv(trip.odometerStartKm)).toFixed(2)} mi`, `${kmToNm(nv(trip.odometerStartKm)).toFixed(2)} nm`], [col3, col3, col3, col3], false, '#fff');
  y = drawTableRow(y, ['Odometer End', `${odomEnd.toFixed(2)} km`, `${kmToMi(odomEnd).toFixed(2)} mi`, `${kmToNm(odomEnd).toFixed(2)} nm`], [col3, col3, col3, col3]);
  y += 10;

  y = drawTableRow(y, ['Field', 'Value'], [col1, col2], true);
  y = drawTableRow(y, ['Energy Consumed', `${n(trip.totalEnergyWh)} Wh`], [col1, col2]);
  y = drawTableRow(y, ['Total Duration', formatDuration(trip.startTime, trip.endTime)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Serial Number', serial], [col1, col2]);
  y = drawTableRow(y, ['Trip ID', s(trip.tripId || trip.id)], [col1, col2], false, '#fff');
  y = drawTableRow(y, ['Report ID', reportId], [col1, col2]);
  y = drawTableRow(y, ['Generated (UTC)', now.toISOString()], [col1, col2], false, '#fff');
  y += 15;

  // Disclaimers
  y = drawSection(y, 'Disclaimers');
  doc.font('Helvetica').fontSize(6).fillColor(GRAY);
  doc.text('EN: This report is auto-generated. Data accuracy depends on sensor readings, GPS signal, and environmental conditions. Blade Marine Technologies Limited is not liable for inaccuracies.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 12;
  doc.text('DE: Dieser Bericht wird automatisch erstellt. Die Datengenauigkeit hängt von Sensorwerten, GPS-Signal und Umgebungsbedingungen ab.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 12;
  doc.text('IT: Questo report è generato automaticamente. L\'accuratezza dei dati dipende dalle letture dei sensori e dalla qualità del segnale GPS.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 12;
  doc.text('ES: Este informe se genera automáticamente. La precisión de los datos depende de las lecturas de los sensores y la calidad de la señal GPS.', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 15;

  doc.text('Standards: ISO 8217 (Marine Fuels), ISO 16844 (Road vehicles) | CE/UKCA/RoHS Compliant', MARGIN_LEFT, y);
  y += 15;

  doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
  doc.text('Safe Boating Reminder', MARGIN_LEFT, y);
  y += 10;
  doc.font('Helvetica').fontSize(6).fillColor(GRAY);
  doc.text('EN: Always boat safely. Never boat under the influence. Always wear a life jacket.', MARGIN_LEFT, y);
  doc.text('DE: Fahren Sie immer sicher Boot. Fahren Sie niemals unter Alkoholeinfluss. Tragen Sie immer eine Schwimmweste.', MARGIN_LEFT, y + 9);
  doc.text('IT: Naviga sempre in sicurezza. Non navigare mai sotto l\'influenza. Indossa sempre un giubbotto di salvataggio.', MARGIN_LEFT, y + 18);
  doc.text('ES: Navegue siempre con seguridad. Nunca navegue bajo los efectos del alcohol. Use siempre un chaleco salvavidas.', MARGIN_LEFT, y + 27);

  doc.end();
}
