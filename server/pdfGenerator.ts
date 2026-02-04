import PDFDocument from 'pdfkit';
import type { Response } from 'express';

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
  startWeather?: { conditions?: string; temperature?: number; humidity?: number; windSpeed?: number; windDirection?: string };
  endWeather?: { conditions?: string; temperature?: number; humidity?: number; windSpeed?: number; windDirection?: string };
}

const BLADE_GREEN = '#1a5f2a';
const BLADE_DARK = '#0d2f15';

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

function kmToMiles(km: number): number {
  return km * 0.621371;
}

function kmToNauticalMiles(km: number): number {
  return km * 0.539957;
}

export function generateTripPDF(res: Response, trip: TripData): void {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 40,
    info: {
      Title: `Blade Outboards Trip Report - ${trip.id}`,
      Author: 'Blade Outboards',
      Subject: 'Trip Report',
      Creator: 'Blade Outboards App',
    }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Blade_Trip_Report_${trip.id}.pdf"`);
  
  doc.pipe(res);

  const pageWidth = doc.page.width - 80;
  const now = new Date();
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;

  // Page 1 - Introduction
  doc.rect(0, 0, doc.page.width, 60).fill(BLADE_GREEN);
  doc.fontSize(24).fillColor('white').text('BLADE OUTBOARDS', 40, 20);
  doc.fontSize(10).text('TRIP REPORT', 40, 45);
  doc.fontSize(8).fillColor('white').text(`Report ID: ${reportId}`, doc.page.width - 200, 25, { align: 'right' });
  doc.text(`Serial: ${trip.motorSerialNumber || 'N/A'}`, doc.page.width - 200, 40, { align: 'right' });

  doc.fillColor(BLADE_DARK);
  doc.moveDown(3);

  doc.fontSize(18).text('Introduction', 40, 80);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#333');
  doc.text(`This report provides a comprehensive summary of your trip recorded by the Blade Outboards mobile application.`, 40);
  doc.moveDown(1);

  // Device Info Table
  doc.fontSize(12).fillColor(BLADE_GREEN).text('Device Information', 40);
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#333');
  
  const deviceInfo = [
    ['Motor Serial Number', trip.motorSerialNumber || 'N/A'],
    ['Trip ID', trip.tripId || trip.id],
    ['Trip Name', trip.name || 'Trip'],
    ['Report Generated', now.toLocaleString()],
    ['Report ID', reportId],
  ];

  let yPos = doc.y;
  deviceInfo.forEach(([label, value], i) => {
    doc.fillColor(i % 2 === 0 ? '#f5f5f5' : '#fff').rect(40, yPos, pageWidth, 18).fill();
    doc.fillColor('#333').text(label, 50, yPos + 4);
    doc.text(String(value), 250, yPos + 4);
    yPos += 18;
  });

  doc.moveDown(2);

  // Trip Times
  doc.fontSize(12).fillColor(BLADE_GREEN).text('Trip Times', 40, yPos + 10);
  yPos = doc.y + 5;
  
  const tripTimes = [
    ['Start Time', new Date(trip.startTime).toLocaleString()],
    ['End Time', trip.endTime ? new Date(trip.endTime).toLocaleString() : 'In Progress'],
    ['Duration', formatDuration(trip.startTime, trip.endTime)],
  ];

  tripTimes.forEach(([label, value], i) => {
    doc.fillColor(i % 2 === 0 ? '#f5f5f5' : '#fff').rect(40, yPos, pageWidth, 18).fill();
    doc.fillColor('#333').fontSize(9).text(label, 50, yPos + 4);
    doc.text(String(value), 250, yPos + 4);
    yPos += 18;
  });

  // Footer
  doc.fontSize(7).fillColor('#999');
  doc.text('CE | UKCA | RoHS Compliant', 40, doc.page.height - 30);
  doc.text(`Page 1 | Generated: ${now.toISOString()}`, doc.page.width - 200, doc.page.height - 30, { align: 'right' });

  // Page 2 - Trip Summary
  doc.addPage();
  
  doc.rect(0, 0, doc.page.width, 60).fill(BLADE_GREEN);
  doc.fontSize(24).fillColor('white').text('BLADE OUTBOARDS', 40, 20);
  doc.fontSize(10).text('TRIP SUMMARY', 40, 45);
  doc.fontSize(8).text(`Report ID: ${reportId}`, doc.page.width - 200, 25, { align: 'right' });
  doc.text(`Serial: ${trip.motorSerialNumber || 'N/A'}`, doc.page.width - 200, 40, { align: 'right' });

  doc.fillColor(BLADE_DARK);
  doc.moveDown(3);

  // Weather Section
  doc.fontSize(12).fillColor(BLADE_GREEN).text('Weather Conditions', 40, 80);
  doc.moveDown(0.3);
  yPos = doc.y;

  const weatherRows = [
    ['', 'Conditions', 'Temperature', 'Wind', 'Humidity'],
    ['Start', trip.startWeather?.conditions || 'N/A', `${trip.startWeather?.temperature || 'N/A'}°C`, `${trip.startWeather?.windSpeed || 'N/A'} km/h ${trip.startWeather?.windDirection || ''}`, `${trip.startWeather?.humidity || 'N/A'}%`],
    ['End', trip.endWeather?.conditions || 'N/A', `${trip.endWeather?.temperature || 'N/A'}°C`, `${trip.endWeather?.windSpeed || 'N/A'} km/h ${trip.endWeather?.windDirection || ''}`, `${trip.endWeather?.humidity || 'N/A'}%`],
  ];

  weatherRows.forEach((row, i) => {
    const isHeader = i === 0;
    doc.fillColor(isHeader ? BLADE_GREEN : (i % 2 === 0 ? '#f5f5f5' : '#fff')).rect(40, yPos, pageWidth, 18).fill();
    doc.fillColor(isHeader ? 'white' : '#333').fontSize(isHeader ? 8 : 9);
    row.forEach((cell, j) => {
      doc.text(cell, 50 + j * 140, yPos + 4, { width: 130 });
    });
    yPos += 18;
  });

  doc.moveDown(2);

  // Distance & Speed Section
  doc.fontSize(12).fillColor(BLADE_GREEN).text('Distance & Speed', 40, yPos + 10);
  yPos = doc.y + 5;

  const distSpeed = [
    ['Metric', 'km / km/h', 'mi / mph', 'nm / knots'],
    ['Total Distance', `${safeNum(trip.totalDistanceKm).toFixed(2)} km`, `${kmToMiles(safeNum(trip.totalDistanceKm)).toFixed(2)} mi`, `${kmToNauticalMiles(safeNum(trip.totalDistanceKm)).toFixed(2)} nm`],
    ['Max Speed', `${safeNum(trip.maxSpeedKmh).toFixed(1)} km/h`, `${(safeNum(trip.maxSpeedKmh) * 0.621371).toFixed(1)} mph`, `${(safeNum(trip.maxSpeedKmh) * 0.539957).toFixed(1)} kn`],
    ['Avg Speed', `${safeNum(trip.avgSpeedKmh).toFixed(1)} km/h`, `${(safeNum(trip.avgSpeedKmh) * 0.621371).toFixed(1)} mph`, `${(safeNum(trip.avgSpeedKmh) * 0.539957).toFixed(1)} kn`],
  ];

  distSpeed.forEach((row, i) => {
    const isHeader = i === 0;
    doc.fillColor(isHeader ? BLADE_GREEN : (i % 2 === 0 ? '#f5f5f5' : '#fff')).rect(40, yPos, pageWidth, 18).fill();
    doc.fillColor(isHeader ? 'white' : '#333').fontSize(isHeader ? 8 : 9);
    row.forEach((cell, j) => {
      doc.text(cell, 50 + j * 170, yPos + 4, { width: 160 });
    });
    yPos += 18;
  });

  doc.moveDown(2);

  // Battery & Energy Section
  doc.fontSize(12).fillColor(BLADE_GREEN).text('Battery & Energy', 40, yPos + 10);
  yPos = doc.y + 5;

  const batteryUsed = safeNum(trip.startBatteryPercent) - safeNum(trip.endBatteryPercent);
  const batteryInfo = [
    ['Starting Battery SOC', `${trip.startBatteryPercent ?? 'N/A'}%`],
    ['Ending Battery SOC', `${trip.endBatteryPercent ?? 'N/A'}%`],
    ['Battery Used', `${batteryUsed > 0 ? batteryUsed.toFixed(1) : 'N/A'}%`],
    ['Total Energy Consumed', `${safeNum(trip.totalEnergyWh).toFixed(1)} Wh`],
  ];

  batteryInfo.forEach(([label, value], i) => {
    doc.fillColor(i % 2 === 0 ? '#f5f5f5' : '#fff').rect(40, yPos, pageWidth / 2, 18).fill();
    doc.fillColor('#333').fontSize(9).text(label, 50, yPos + 4);
    doc.text(String(value), 250, yPos + 4);
    yPos += 18;
  });

  // GPS Section
  doc.fontSize(12).fillColor(BLADE_GREEN).text('GPS Coordinates', 40, yPos + 20);
  yPos = doc.y + 5;

  const gpsInfo = [
    ['Start Position', trip.phoneGPSStart ? `${trip.phoneGPSStart.latitude.toFixed(6)}, ${trip.phoneGPSStart.longitude.toFixed(6)}` : 'N/A'],
    ['End Position', trip.phoneGPSEnd ? `${trip.phoneGPSEnd.latitude.toFixed(6)}, ${trip.phoneGPSEnd.longitude.toFixed(6)}` : 'N/A'],
  ];

  gpsInfo.forEach(([label, value], i) => {
    doc.fillColor(i % 2 === 0 ? '#f5f5f5' : '#fff').rect(40, yPos, pageWidth / 2, 18).fill();
    doc.fillColor('#333').fontSize(9).text(label, 50, yPos + 4);
    doc.text(String(value), 250, yPos + 4);
    yPos += 18;
  });

  // Footer
  doc.fontSize(7).fillColor('#999');
  doc.text('CE | UKCA | RoHS Compliant', 40, doc.page.height - 30);
  doc.text(`Page 2 | Generated: ${now.toISOString()}`, doc.page.width - 200, doc.page.height - 30, { align: 'right' });

  // Page 3 - Conclusion
  doc.addPage();
  
  doc.rect(0, 0, doc.page.width, 60).fill(BLADE_GREEN);
  doc.fontSize(24).fillColor('white').text('BLADE OUTBOARDS', 40, 20);
  doc.fontSize(10).text('CONCLUSION', 40, 45);
  doc.fontSize(8).text(`Report ID: ${reportId}`, doc.page.width - 200, 25, { align: 'right' });
  doc.text(`Serial: ${trip.motorSerialNumber || 'N/A'}`, doc.page.width - 200, 40, { align: 'right' });

  doc.fillColor(BLADE_DARK);
  doc.moveDown(3);

  doc.fontSize(12).fillColor(BLADE_GREEN).text('Trip Summary', 40, 80);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#333');
  doc.text(`Trip "${trip.name || 'Trip'}" completed successfully.`);
  doc.moveDown(0.5);
  doc.text(`Total Distance: ${safeNum(trip.totalDistanceKm).toFixed(2)} km (${kmToMiles(safeNum(trip.totalDistanceKm)).toFixed(2)} mi)`);
  doc.text(`Duration: ${formatDuration(trip.startTime, trip.endTime)}`);
  doc.text(`Energy Consumed: ${safeNum(trip.totalEnergyWh).toFixed(1)} Wh`);
  
  doc.moveDown(2);
  doc.fontSize(12).fillColor(BLADE_GREEN).text('Safety Reminders', 40);
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#333');
  doc.text('EN: Always boat safely. Never boat under the influence. Always wear a life jacket.');
  doc.text('DE: Fahren Sie immer sicher Boot. Fahren Sie niemals unter Alkoholeinfluss. Tragen Sie immer eine Schwimmweste.');
  doc.text('IT: Naviga sempre in sicurezza. Non navigare mai sotto l\'influenza. Indossa sempre un giubbotto di salvataggio.');
  doc.text('ES: Navegue siempre con seguridad. Nunca navegue bajo los efectos del alcohol. Use siempre un chaleco salvavidas.');

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#666');
  doc.text('DISCLAIMER: This report is generated automatically by the Blade Outboards application. Data accuracy depends on sensor readings and GPS signal quality. Blade Outboards is not liable for any inaccuracies in this report.');

  // Footer
  doc.fontSize(7).fillColor('#999');
  doc.text('CE | UKCA | RoHS Compliant', 40, doc.page.height - 30);
  doc.text(`Page 3 | Generated: ${now.toISOString()}`, doc.page.width - 200, doc.page.height - 30, { align: 'right' });

  doc.end();
}
