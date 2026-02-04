import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// A4 Landscape dimensions in points (72 points per inch)
const PAGE_WIDTH = 841.89; // A4 landscape width
const PAGE_HEIGHT = 595.28; // A4 landscape height

// Margins: ½" top, 1" bottom, ½" left, 1" right (in landscape)
const MARGIN_TOP = 36; // 0.5 inch
const MARGIN_BOTTOM = 72; // 1 inch
const MARGIN_LEFT = 36; // 0.5 inch
const MARGIN_RIGHT = 72; // 1 inch

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

// Colors
const BLADE_GREEN = '#7CB87C';
const TEXT_BLACK = '#1a1a1a';
const TEXT_GRAY = '#666666';
const LIGHT_GRAY = '#e5e5e5';
const TABLE_HEADER_BG = '#f0f0f0';

interface TripDataPoint {
  timestamp: string;
  phoneSpeed?: number;
  consumptionKW?: number;
  batterySOC?: number;
  rpm?: number;
  phaseAmperage?: number;
  driveMode?: string;
  isReverse?: boolean;
  isHydroRegen?: boolean;
  latitude?: number;
  longitude?: number;
}

interface WeatherData {
  conditions?: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: string;
}

interface GPSCoord {
  latitude: number;
  longitude: number;
}

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
  phoneGPSStart?: GPSCoord;
  phoneGPSEnd?: GPSCoord;
  outboardGPSStart?: GPSCoord;
  outboardGPSEnd?: GPSCoord;
  startWeather?: WeatherData;
  endWeather?: WeatherData;
  hourlyWeather?: WeatherData[];
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
  dataPoints?: TripDataPoint[];
  odometerStartKm?: number;
  odometerEndKm?: number;
}

function safeNum(val: number | null | undefined, def = 0): number {
  return val != null && !isNaN(val) ? val : def;
}

function formatDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getTripDurationSeconds(startTime: string, endTime?: string): number {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  return Math.floor((end - start) / 1000);
}

function kmToMi(km: number): number { return km * 0.621371; }
function kmToNm(km: number): number { return km * 0.539957; }
function kmhToMph(kmh: number): number { return kmh * 0.621371; }
function kmhToKnots(kmh: number): number { return kmh * 0.539957; }

function generateReportId(): string {
  return `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

function formatCoord(coord: GPSCoord | null | undefined): string {
  if (!coord) return 'N/A';
  return `${coord.latitude.toFixed(6)}, ${coord.longitude.toFixed(6)}`;
}

function formatWeather(w: WeatherData | null | undefined): string {
  if (!w) return 'N/A';
  return `${w.conditions || 'N/A'}, ${w.temperature ?? 'N/A'}°C, ${w.humidity ?? 'N/A'}% humidity, Wind: ${w.windSpeed ?? 'N/A'} km/h ${w.windDirection || ''}`;
}

class TripReportPDF {
  private doc: PDFKit.PDFDocument;
  private trip: TripData;
  private reportId: string;
  private generatedAt: Date;
  private totalPages: number;
  private currentPage: number;
  private logoPath: string;

  constructor(trip: TripData) {
    this.trip = trip;
    this.reportId = generateReportId();
    this.generatedAt = new Date();
    this.currentPage = 0;
    this.logoPath = path.join(process.cwd(), 'server', 'blade-logo.png');
    
    // Calculate total pages: 1 (intro) + 1 (summary) + detail pages + 1 (conclusion)
    const tripSeconds = getTripDurationSeconds(trip.startTime, trip.endTime);
    const detailPages = Math.max(1, Math.ceil(tripSeconds / 600));
    this.totalPages = 1 + 1 + detailPages + 1;

    this.doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: {
        top: MARGIN_TOP,
        bottom: MARGIN_BOTTOM,
        left: MARGIN_LEFT,
        right: MARGIN_RIGHT
      },
      info: {
        Title: `Blade Outboards Trip Report - ${trip.tripId || trip.id}`,
        Author: 'Blade Marine Technologies Limited',
        Subject: 'Trip Report',
        Creator: 'Blade Outboards App',
      },
      autoFirstPage: false
    });
  }

  private addPage(title: string, translations: { de: string; it: string; es: string }): void {
    this.doc.addPage();
    this.currentPage++;
    this.drawHeader(title, translations);
    this.drawFooter();
  }

  private drawHeader(title: string, translations: { de: string; it: string; es: string }): void {
    const y = MARGIN_TOP - 5;
    
    // Logo
    if (fs.existsSync(this.logoPath)) {
      try {
        this.doc.image(this.logoPath, MARGIN_LEFT, y - 15, { height: 30 });
      } catch (e) {
        // Skip logo if can't load
      }
    }
    
    // Title in English
    this.doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT_BLACK);
    this.doc.text(title, MARGIN_LEFT + 45, y, { align: 'left' });
    
    // Translations
    this.doc.font('Helvetica').fontSize(7).fillColor(TEXT_GRAY);
    this.doc.text(`DE: ${translations.de} | IT: ${translations.it} | ES: ${translations.es}`, MARGIN_LEFT + 45, y + 16);
    
    // Thin line
    this.doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
    this.doc.moveTo(MARGIN_LEFT, y + 30).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y + 30).stroke();
  }

  private drawFooter(): void {
    const y = PAGE_HEIGHT - MARGIN_BOTTOM + 15;
    const serial = this.trip.motorSerialNumber || 'N/A';
    
    // Top line
    this.doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
    this.doc.moveTo(MARGIN_LEFT, y - 10).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y - 10).stroke();
    
    // Left section
    this.doc.font('Helvetica').fontSize(6).fillColor(TEXT_GRAY);
    this.doc.text('Blade Marine Technologies Limited', MARGIN_LEFT, y);
    this.doc.text('Blade Outboards, All Rights Reserved 2026', MARGIN_LEFT, y + 8);
    this.doc.text('Auto-generated Report', MARGIN_LEFT, y + 16);
    
    // QR Code placeholder (text representation)
    this.doc.fontSize(5).text(`[QR: ${this.reportId}]`, MARGIN_LEFT, y + 26);
    
    // Center section
    const centerX = PAGE_WIDTH / 2;
    this.doc.fontSize(7).fillColor(TEXT_BLACK);
    this.doc.text(`Page ${this.currentPage} of ${this.totalPages}`, centerX - 30, y + 8, { width: 60, align: 'center' });
    this.doc.fontSize(6).fillColor(TEXT_GRAY);
    this.doc.text('CE | UKCA | RoHS', centerX - 30, y + 20, { width: 60, align: 'center' });
    
    // Right section
    const rightX = PAGE_WIDTH - MARGIN_RIGHT - 120;
    this.doc.fontSize(6).fillColor(TEXT_GRAY);
    this.doc.text(`Generated: ${this.generatedAt.toISOString()}`, rightX, y, { width: 120, align: 'right' });
    this.doc.text(`Serial: ${serial}`, rightX, y + 8, { width: 120, align: 'right' });
    this.doc.text(`Report ID: ${this.reportId}`, rightX, y + 16, { width: 120, align: 'right' });
    
    // Barcode placeholder
    this.doc.fontSize(5).text(`[|||${serial}|||]`, rightX, y + 26, { width: 120, align: 'right' });
  }

  private drawTable(headers: string[], rows: string[][], startY: number, colWidths?: number[]): number {
    const rowHeight = 16;
    const fontSize = 8;
    const numCols = headers.length;
    const defaultColWidth = CONTENT_WIDTH / numCols;
    const widths = colWidths || headers.map(() => defaultColWidth);
    
    let y = startY;
    let x = MARGIN_LEFT;
    
    // Header row
    this.doc.fillColor(TABLE_HEADER_BG);
    this.doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, rowHeight).fill();
    
    this.doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(TEXT_BLACK);
    headers.forEach((header, i) => {
      this.doc.text(header, x + 4, y + 4, { width: widths[i] - 8 });
      x += widths[i];
    });
    y += rowHeight;
    
    // Data rows
    this.doc.font('Helvetica').fontSize(fontSize);
    rows.forEach((row, rowIndex) => {
      if (rowIndex % 2 === 1) {
        this.doc.fillColor('#f9f9f9');
        this.doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, rowHeight).fill();
      }
      
      x = MARGIN_LEFT;
      this.doc.fillColor(TEXT_BLACK);
      row.forEach((cell, i) => {
        this.doc.text(cell, x + 4, y + 4, { width: widths[i] - 8 });
        x += widths[i];
      });
      
      // Row border
      this.doc.strokeColor(LIGHT_GRAY).lineWidth(0.3);
      this.doc.moveTo(MARGIN_LEFT, y + rowHeight).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y + rowHeight).stroke();
      
      y += rowHeight;
    });
    
    return y;
  }

  private drawSection(title: string, y: number): number {
    this.doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_BLACK);
    this.doc.text(title, MARGIN_LEFT, y);
    return y + 16;
  }

  private page1Introduction(): void {
    this.addPage('INTRODUCTION', { de: 'Einführung', it: 'Introduzione', es: 'Introducción' });
    
    let y = MARGIN_TOP + 40;
    
    // Description
    this.doc.font('Helvetica').fontSize(8).fillColor(TEXT_GRAY);
    const description = 'This document contains telemetry and trip data collected from a Blade electric outboard during the recorded session. The report includes speed, power, battery usage, and route information for review and documentation purposes. Data accuracy and availability are not guaranteed.';
    this.doc.text(description, MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'justify' });
    y += 40;
    
    // Device Information
    y = this.drawSection('Device Information', y);
    const deviceRows = [
      ['Model Name', 'HALO 6'],
      ['Model #', 'BLD2002015'],
      ['Model Year', '2026'],
      ['Firmware Version', this.trip.firmwareVersion || 'N/A'],
      ['Hardware Version', 'H32026'],
      ['Serial Number', this.trip.motorSerialNumber || 'N/A'],
      ['Bluetooth MAC', 'N/A'],
    ];
    y = this.drawTable(['Field', 'Value'], deviceRows, y, [CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6]);
    y += 15;
    
    // Phone/App Information
    y = this.drawSection('Phone & App Information', y);
    const phoneRows = [
      ['App Version', this.trip.phoneAppVersion || 'N/A'],
      ['Phone Name', this.trip.phoneName || 'N/A'],
      ['Operating System', this.trip.phoneOS || 'N/A'],
      ['Report Generated (Local)', this.generatedAt.toLocaleString()],
      ['Report Generated (UTC)', this.generatedAt.toISOString()],
      ['Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone],
    ];
    y = this.drawTable(['Field', 'Value'], phoneRows, y, [CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6]);
    y += 15;
    
    // Report Information
    y = this.drawSection('Report Information', y);
    const reportRows = [
      ['Trip ID', this.trip.tripId || this.trip.id],
      ['Report ID', this.reportId],
      ['User Email', this.trip.userEmail || 'N/A'],
      ['User ID', this.trip.userFirestoreId || 'N/A'],
      ['Page Count', String(this.totalPages)],
      ['Paper Size', 'A4 Landscape'],
      ['Certifications', 'CE, UKCA, RoHS'],
    ];
    y = this.drawTable(['Field', 'Value'], reportRows, y, [CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6]);
    y += 15;
    
    // Odometer
    const odomEnd = safeNum(this.trip.odometerEndKm);
    y = this.drawSection('Odometer Reading', y);
    const odomRows = [
      ['End of Trip', `${odomEnd.toFixed(2)} km`, `${kmToMi(odomEnd).toFixed(2)} mi`, `${kmToNm(odomEnd).toFixed(2)} nm`],
    ];
    y = this.drawTable(['', 'Kilometers', 'Miles', 'Nautical Miles'], odomRows, y);
  }

  private page2TripSummary(): void {
    this.addPage('TRIP SUMMARY', { de: 'Fahrtzusammenfassung', it: 'Riepilogo del Viaggio', es: 'Resumen del Viaje' });
    
    let y = MARGIN_TOP + 40;
    const halfWidth = (CONTENT_WIDTH - 20) / 2;
    
    // Two column layout for time and weather
    // Left column - Trip Times
    y = this.drawSection('Trip Times', y);
    const startTime = new Date(this.trip.startTime);
    const endTime = this.trip.endTime ? new Date(this.trip.endTime) : null;
    const duration = formatDuration(this.trip.startTime, this.trip.endTime);
    
    const timeRows = [
      ['Start Time (Local)', startTime.toLocaleString()],
      ['Start Time (UTC)', startTime.toISOString()],
      ['End Time (Local)', endTime ? endTime.toLocaleString() : 'In Progress'],
      ['End Time (UTC)', endTime ? endTime.toISOString() : 'N/A'],
      ['Total Duration', duration],
      ['Connection Type', this.trip.connectionType || 'Bluetooth Classic'],
      ['End Reason', this.trip.endReason || 'user_button'],
    ];
    y = this.drawTable(['Field', 'Value'], timeRows, y, [CONTENT_WIDTH * 0.35, CONTENT_WIDTH * 0.65]);
    y += 12;
    
    // Weather
    y = this.drawSection('Weather Conditions', y);
    const weatherRows = [
      ['Start', formatWeather(this.trip.startWeather)],
      ['End', formatWeather(this.trip.endWeather)],
    ];
    if (this.trip.hourlyWeather && this.trip.hourlyWeather.length > 0) {
      this.trip.hourlyWeather.forEach((w, i) => {
        weatherRows.push([`Hour ${i + 1}`, formatWeather(w)]);
      });
    }
    y = this.drawTable(['Time', 'Conditions'], weatherRows, y, [CONTENT_WIDTH * 0.15, CONTENT_WIDTH * 0.85]);
    y += 12;
    
    // GPS Locations
    y = this.drawSection('GPS Locations', y);
    const gpsRows = [
      ['Phone GPS Start', formatCoord(this.trip.phoneGPSStart)],
      ['Phone GPS End', formatCoord(this.trip.phoneGPSEnd)],
      ['Outboard GPS Start', formatCoord(this.trip.outboardGPSStart)],
      ['Outboard GPS End', formatCoord(this.trip.outboardGPSEnd)],
    ];
    y = this.drawTable(['Source', 'Coordinates'], gpsRows, y, [CONTENT_WIDTH * 0.3, CONTENT_WIDTH * 0.7]);
    y += 12;
    
    // Distance & Speed
    y = this.drawSection('Distance & Speed', y);
    const dist = safeNum(this.trip.totalDistanceKm);
    const maxSpd = safeNum(this.trip.maxSpeedKmh);
    const avgSpd = safeNum(this.trip.avgSpeedKmh);
    
    const distSpeedRows = [
      ['Total Distance', `${dist.toFixed(2)} km`, `${kmToMi(dist).toFixed(2)} mi`, `${kmToNm(dist).toFixed(2)} nm`],
      ['Max Speed', `${maxSpd.toFixed(1)} km/h`, `${kmhToMph(maxSpd).toFixed(1)} mph`, `${kmhToKnots(maxSpd).toFixed(1)} kn`],
      ['Avg Speed', `${avgSpd.toFixed(1)} km/h`, `${kmhToMph(avgSpd).toFixed(1)} mph`, `${kmhToKnots(avgSpd).toFixed(1)} kn`],
    ];
    y = this.drawTable(['Metric', 'Kilometers', 'Miles', 'Nautical'], distSpeedRows, y);
    y += 12;
    
    // Battery & Energy
    y = this.drawSection('Battery & Energy', y);
    const startSOC = this.trip.startBatteryPercent ?? 'N/A';
    const endSOC = this.trip.endBatteryPercent ?? 'N/A';
    const energyWh = safeNum(this.trip.totalEnergyWh);
    
    const batteryRows = [
      ['Starting Battery SOC', `${startSOC}%`],
      ['Ending Battery SOC', `${endSOC}%`],
      ['Energy Consumed', `${energyWh.toFixed(1)} Wh`],
      ['Max Amperage Draw', `${safeNum(this.trip.maxAmperageDraw).toFixed(1)} A`],
      ['Max Consumption', `${safeNum(this.trip.maxConsumptionKW).toFixed(2)} kW`],
      ['Avg Consumption', `${safeNum(this.trip.avgConsumptionKW).toFixed(2)} kW`],
      ['3rd Party Battery', 'False'],
    ];
    y = this.drawTable(['Metric', 'Value'], batteryRows, y, [CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6]);
    y += 12;
    
    // RPM
    y = this.drawSection('Motor Performance', y);
    const rpmRows = [
      ['RPM Max', `${safeNum(this.trip.rpmMax).toFixed(0)}`],
      ['RPM Average', `${safeNum(this.trip.rpmAvg).toFixed(0)}`],
    ];
    y = this.drawTable(['Metric', 'Value'], rpmRows, y, [CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6]);
    
    // Note about map and graph
    y += 20;
    this.doc.font('Helvetica').fontSize(7).fillColor(TEXT_GRAY);
    this.doc.text('[Map visualization and trip overview graph would be rendered here with route data]', MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'center' });
  }

  private page3TripDetail(segmentIndex: number, startSecond: number, endSecond: number): void {
    const startTime = `${Math.floor(startSecond / 3600).toString().padStart(2, '0')}:${Math.floor((startSecond % 3600) / 60).toString().padStart(2, '0')}:${(startSecond % 60).toString().padStart(2, '0')}`;
    const endTime = `${Math.floor(endSecond / 3600).toString().padStart(2, '0')}:${Math.floor((endSecond % 3600) / 60).toString().padStart(2, '0')}:${(endSecond % 60).toString().padStart(2, '0')}`;
    
    this.addPage(`TRIP DETAIL (${startTime} - ${endTime})`, { 
      de: `Fahrtdetails (${startTime} - ${endTime})`, 
      it: `Dettagli del Viaggio (${startTime} - ${endTime})`, 
      es: `Detalles del Viaje (${startTime} - ${endTime})` 
    });
    
    let y = MARGIN_TOP + 40;
    
    // Header info
    this.doc.font('Helvetica').fontSize(8).fillColor(TEXT_BLACK);
    this.doc.text(`Serial Number: ${this.trip.motorSerialNumber || 'N/A'}  |  Trip ID: ${this.trip.tripId || this.trip.id}  |  Segment: ${startTime} - ${endTime}`, MARGIN_LEFT, y);
    y += 20;
    
    // Three graphs for this segment (each 200 seconds)
    const graphHeight = 120;
    const graphSpacing = 15;
    
    for (let graphIndex = 0; graphIndex < 3; graphIndex++) {
      const graphStart = startSecond + (graphIndex * 200);
      const graphEnd = Math.min(graphStart + 200, endSecond);
      
      const graphStartTime = `${Math.floor(graphStart / 60).toString().padStart(2, '0')}:${(graphStart % 60).toString().padStart(2, '0')}`;
      const graphEndTime = `${Math.floor(graphEnd / 60).toString().padStart(2, '0')}:${(graphEnd % 60).toString().padStart(2, '0')}`;
      
      // Graph title
      this.doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_BLACK);
      this.doc.text(`Segment ${graphIndex + 1}: ${graphStartTime} - ${graphEndTime}`, MARGIN_LEFT, y);
      y += 12;
      
      // Graph box
      this.doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
      this.doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, graphHeight).stroke();
      
      // Graph placeholder
      this.doc.font('Helvetica').fontSize(7).fillColor(TEXT_GRAY);
      this.doc.text('[Graph: Speed (km/h), Consumption (kW), Phase Amperage (A), Battery SOC (%), RPM]', MARGIN_LEFT + 10, y + graphHeight / 2 - 10, { width: CONTENT_WIDTH - 20, align: 'center' });
      this.doc.text('[Flags: N=Normal, E=Eco, D=Docking, S=Sport | R=Reverse | H=Hydro-regen]', MARGIN_LEFT + 10, y + graphHeight / 2 + 5, { width: CONTENT_WIDTH - 20, align: 'center' });
      
      y += graphHeight + graphSpacing;
    }
    
    // Key/Legend
    y += 5;
    this.doc.font('Helvetica').fontSize(6).fillColor(TEXT_GRAY);
    this.doc.text('Legend: Speed (Blue) | Consumption (Red) | Phase Amps (Orange) | Battery SOC (Green) | RPM (Purple)', MARGIN_LEFT, y);
    this.doc.text('Drive Mode Flags: (N) Normal | (E) Eco | (D) Docking | (S) Sport | (R) Reverse | (H) Hydro-regen', MARGIN_LEFT, y + 10);
  }

  private page4Conclusion(): void {
    this.addPage('CONCLUSION', { de: 'Abschluss', it: 'Conclusione', es: 'Conclusión' });
    
    let y = MARGIN_TOP + 40;
    
    // Notes box
    y = this.drawSection('Notes', y);
    this.doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
    this.doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 60).stroke();
    this.doc.font('Helvetica').fontSize(8).fillColor(TEXT_GRAY);
    this.doc.text('[Notes section - currently blank]', MARGIN_LEFT + 10, y + 25);
    y += 75;
    
    // Trip Summary
    y = this.drawSection('Trip Summary', y);
    const dist = safeNum(this.trip.totalDistanceKm);
    const odomStart = safeNum(this.trip.odometerStartKm);
    const odomEnd = safeNum(this.trip.odometerEndKm);
    const energyWh = safeNum(this.trip.totalEnergyWh);
    const duration = formatDuration(this.trip.startTime, this.trip.endTime);
    
    const summaryRows = [
      ['Distance Traveled', `${dist.toFixed(2)} km`, `${kmToMi(dist).toFixed(2)} mi`, `${kmToNm(dist).toFixed(2)} nm`],
      ['Odometer Start', `${odomStart.toFixed(2)} km`, `${kmToMi(odomStart).toFixed(2)} mi`, `${kmToNm(odomStart).toFixed(2)} nm`],
      ['Odometer End', `${odomEnd.toFixed(2)} km`, `${kmToMi(odomEnd).toFixed(2)} mi`, `${kmToNm(odomEnd).toFixed(2)} nm`],
    ];
    y = this.drawTable(['Metric', 'Kilometers', 'Miles', 'Nautical Miles'], summaryRows, y);
    y += 15;
    
    const infoRows = [
      ['Energy Consumed', `${energyWh.toFixed(1)} Wh`],
      ['Total Duration', duration],
      ['Serial Number', this.trip.motorSerialNumber || 'N/A'],
      ['Trip ID', this.trip.tripId || this.trip.id],
      ['Report ID', this.reportId],
      ['Generated (UTC)', this.generatedAt.toISOString()],
    ];
    y = this.drawTable(['Field', 'Value'], infoRows, y, [CONTENT_WIDTH * 0.3, CONTENT_WIDTH * 0.7]);
    y += 20;
    
    // Disclaimers
    y = this.drawSection('Disclaimers & Standards', y);
    this.doc.font('Helvetica').fontSize(7).fillColor(TEXT_GRAY);
    
    const disclaimers = [
      'EN: This report is auto-generated. Data accuracy depends on sensor readings, GPS signal quality, and environmental conditions. Blade Marine Technologies Limited is not liable for any inaccuracies.',
      'DE: Dieser Bericht wird automatisch erstellt. Die Datengenauigkeit hängt von Sensorwerten, GPS-Signalqualität und Umgebungsbedingungen ab.',
      'IT: Questo report è generato automaticamente. L\'accuratezza dei dati dipende dalle letture dei sensori, dalla qualità del segnale GPS e dalle condizioni ambientali.',
      'ES: Este informe se genera automáticamente. La precisión de los datos depende de las lecturas de los sensores, la calidad de la señal GPS y las condiciones ambientales.',
    ];
    
    disclaimers.forEach(text => {
      this.doc.text(text, MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'justify' });
      y += 22;
    });
    
    y += 10;
    this.doc.text('Standards: ISO 8217 (Marine Fuels), ISO 16844 (Road vehicles), CE/UKCA/RoHS Compliant', MARGIN_LEFT, y);
    
    y += 20;
    this.doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_BLACK);
    this.doc.text('Safe Boating Reminder', MARGIN_LEFT, y);
    y += 12;
    this.doc.font('Helvetica').fontSize(7).fillColor(TEXT_GRAY);
    this.doc.text('EN: Always boat safely. Never boat under the influence. Always wear a life jacket.', MARGIN_LEFT, y);
    this.doc.text('DE: Fahren Sie immer sicher Boot. Fahren Sie niemals unter Alkoholeinfluss. Tragen Sie immer eine Schwimmweste.', MARGIN_LEFT, y + 10);
    this.doc.text('IT: Naviga sempre in sicurezza. Non navigare mai sotto l\'influenza. Indossa sempre un giubbotto di salvataggio.', MARGIN_LEFT, y + 20);
    this.doc.text('ES: Navegue siempre con seguridad. Nunca navegue bajo los efectos del alcohol. Use siempre un chaleco salvavidas.', MARGIN_LEFT, y + 30);
  }

  public generate(res: Response): void {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Blade_Trip_Report_${this.trip.tripId || this.trip.id}.pdf"`);
    
    this.doc.pipe(res);
    
    // Page 1: Introduction
    this.page1Introduction();
    
    // Page 2: Trip Summary
    this.page2TripSummary();
    
    // Page 3+: Trip Detail (one page per 600 seconds)
    const tripSeconds = getTripDurationSeconds(this.trip.startTime, this.trip.endTime);
    const detailPages = Math.max(1, Math.ceil(tripSeconds / 600));
    
    for (let i = 0; i < detailPages; i++) {
      const startSecond = i * 600;
      const endSecond = Math.min((i + 1) * 600, tripSeconds);
      this.page3TripDetail(i, startSecond, endSecond);
    }
    
    // Final Page: Conclusion
    this.page4Conclusion();
    
    this.doc.end();
  }
}

export function generateTripPDF(res: Response, trip: TripData): void {
  const report = new TripReportPDF(trip);
  report.generate(res);
}
