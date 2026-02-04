import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { ExtendedTrip, TripReport, TripReportMetadata, TripDataPoint, WeatherSnapshot } from '@/types/TripReport';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

const BLADE_GREEN = '#8FBC8F';

const TRANSLATIONS = {
  introduction: { de: 'Einführung', it: 'Introduzione', es: 'Introducción' },
  tripSummary: { de: 'Reiseübersicht', it: 'Riepilogo del Viaggio', es: 'Resumen del Viaje' },
  tripDetail: { de: 'Reisedetails', it: 'Dettagli del Viaggio', es: 'Detalles del Viaje' },
  conclusion: { de: 'Fazit', it: 'Conclusione', es: 'Conclusión' },
  boatSafety: { 
    en: 'Always boat safely. Never boat under the influence. Always wear a life jacket.',
    de: 'Fahren Sie immer sicher Boot. Fahren Sie niemals unter Alkoholeinfluss. Tragen Sie immer eine Schwimmweste.',
    it: 'Naviga sempre in sicurezza. Non navigare mai sotto l\'influenza. Indossa sempre un giubbotto di salvataggio.',
    es: 'Navegue siempre con seguridad. Nunca navegue bajo los efectos del alcohol. Use siempre un chaleco salvavidas.'
  }
};

function generateUniqueId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 4 || i === 9 || i === 14) result += '-';
  }
  return result;
}

function formatDateUTC(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

function formatDateLocal(date: Date): string {
  return date.toLocaleString();
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function kmToMiles(km: number): number {
  return km * 0.621371;
}

function kmToNauticalMiles(km: number): number {
  return km * 0.539957;
}

function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

function kmhToKnots(kmh: number): number {
  return kmh * 0.539957;
}

function getHeaderHTML(title: string, logoBase64: string): string {
  const translations = TRANSLATIONS[title.toLowerCase().replace(' ', '') as keyof typeof TRANSLATIONS] || {};
  const transText = Object.values(translations).filter(t => typeof t === 'string').join(' | ');
  
  return `
    <div class="header">
      <div class="header-left">
        <img src="${logoBase64}" alt="Blade Outboards" class="header-logo" />
      </div>
      <div class="header-center">
        <div class="header-title">${title}</div>
        ${transText ? `<div class="header-translations">${transText}</div>` : ''}
      </div>
      <div class="header-right"></div>
    </div>
  `;
}

function getFooterHTML(
  pageNum: number, 
  totalPages: number, 
  reportId: string, 
  serialNumber: string, 
  generatedAtUTC: string
): string {
  return `
    <div class="footer">
      <div class="footer-left">
        <div class="footer-qr">[QR: ${reportId}]</div>
      </div>
      <div class="footer-center">
        <div class="footer-company">Blade Marine Technologies Limited</div>
        <div class="footer-copyright">Blade Outboards, All Rights Reserved 2026</div>
        <div class="footer-auto">Auto-generated Report</div>
        <div class="footer-page">Page ${pageNum} of ${totalPages}</div>
        <div class="footer-certs">CE | UKCA | RoHS</div>
        <div class="footer-meta">Generated: ${generatedAtUTC} | S/N: ${serialNumber}</div>
      </div>
      <div class="footer-right">
        <div class="footer-barcode">||||| ${serialNumber} |||||</div>
      </div>
    </div>
  `;
}

function getBaseStyles(): string {
  return `
    @page {
      size: A4 landscape;
      margin: 0.5in 1in 1in 0.5in;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 9pt;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    .page {
      width: 100%;
      min-height: 100%;
      padding: 0.5in 1in 1in 0.5in;
      page-break-after: always;
      position: relative;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #ccc;
      padding-bottom: 8pt;
      margin-bottom: 12pt;
    }
    .header-logo {
      width: 40px;
      height: 40px;
    }
    .header-title {
      font-size: 14pt;
      font-weight: 600;
      text-align: center;
    }
    .header-translations {
      font-size: 7pt;
      color: #666;
      text-align: center;
      margin-top: 2pt;
    }
    .header-left, .header-right {
      width: 60px;
    }
    .header-center {
      flex: 1;
      text-align: center;
    }
    .footer {
      position: absolute;
      bottom: 0.5in;
      left: 0.5in;
      right: 1in;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1px solid #ccc;
      padding-top: 8pt;
      font-size: 7pt;
      color: #666;
    }
    .footer-center {
      text-align: center;
    }
    .footer-company {
      font-weight: 600;
    }
    .footer-qr, .footer-barcode {
      font-family: monospace;
      font-size: 6pt;
    }
    .content {
      margin-bottom: 80pt;
    }
    h2 {
      font-size: 11pt;
      font-weight: 600;
      margin: 12pt 0 6pt 0;
      border-bottom: 1px solid #eee;
      padding-bottom: 4pt;
    }
    h3 {
      font-size: 9pt;
      font-weight: 600;
      margin: 8pt 0 4pt 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 6pt 0;
      font-size: 8pt;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 4pt 6pt;
      text-align: left;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8pt;
      margin: 8pt 0;
    }
    .info-item {
      font-size: 8pt;
    }
    .info-label {
      color: #666;
      font-size: 7pt;
    }
    .info-value {
      font-weight: 500;
    }
    .disclaimer {
      font-size: 7pt;
      color: #666;
      background: #f9f9f9;
      padding: 8pt;
      margin: 8pt 0;
      border-left: 2px solid ${BLADE_GREEN};
    }
    .map-placeholder {
      width: 100%;
      height: 200px;
      background: #f0f0f0;
      border: 1px solid #ddd;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      margin: 8pt 0;
    }
    .graph-placeholder {
      width: 100%;
      height: 120px;
      background: #fafafa;
      border: 1px solid #ddd;
      margin: 8pt 0;
      position: relative;
    }
    .graph-title {
      font-size: 8pt;
      font-weight: 600;
      margin-bottom: 4pt;
    }
    .notes-box {
      border: 1px solid #ddd;
      min-height: 60pt;
      padding: 8pt;
      margin: 8pt 0;
    }
    .safety-reminder {
      font-size: 7pt;
      text-align: center;
      margin: 12pt 0;
      padding: 8pt;
      background: #f0fff0;
      border: 1px solid ${BLADE_GREEN};
    }
    .multi-lang {
      font-size: 7pt;
      color: #888;
    }
  `;
}

function generatePage1(report: TripReport, logoBase64: string): string {
  const { trip, metadata } = report;
  const tripDuration = trip.endTime 
    ? Math.floor((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000)
    : 0;

  return `
    <div class="page">
      ${getHeaderHTML('Introduction', logoBase64)}
      <div class="content">
        <div class="disclaimer">
          This document contains telemetry and trip data collected from a Blade electric outboard during the recorded session. 
          The report includes speed, power, battery usage, and route information for review and documentation purposes. 
          Data accuracy and availability are not guaranteed.
        </div>

        <h2>Model Information</h2>
        <table>
          <tr><th>Field</th><th>Value</th></tr>
          <tr><td>Model Name</td><td>HALO 6</td></tr>
          <tr><td>Model #</td><td>BLD2002015</td></tr>
          <tr><td>Model Year</td><td>2026</td></tr>
        </table>

        <h2>Time Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Phone Time @ Generation</div>
            <div class="info-value">${metadata.generatedAtLocal}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Time Zone</div>
            <div class="info-value">${metadata.generatedAtTimezone}</div>
          </div>
          <div class="info-item">
            <div class="info-label">GPS End Time</div>
            <div class="info-value">${trip.endTime ? formatDateUTC(new Date(trip.endTime)) : 'N/A'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Phone Time UTC</div>
            <div class="info-value">${metadata.generatedAtUTC}</div>
          </div>
        </div>

        <h2>Device Information</h2>
        <table>
          <tr><th>Field</th><th>Value</th></tr>
          <tr><td>Firmware Version</td><td>${trip.firmwareVersion || 'N/A'}</td></tr>
          <tr><td>Hardware Version</td><td>${trip.hardwareVersion}</td></tr>
          <tr><td>Phone App Version</td><td>${trip.phoneAppVersion || 'N/A'}</td></tr>
          <tr><td>Phone Name</td><td>${trip.phoneName || 'N/A'}</td></tr>
          <tr><td>Device Type</td><td>${trip.phoneDeviceType || 'N/A'}</td></tr>
          <tr><td>Operating System</td><td>${trip.phoneOS || 'N/A'}</td></tr>
          <tr><td>Bluetooth MAC Address</td><td>${trip.bluetoothMacAddress || 'N/A'}</td></tr>
          <tr><td>IP Address</td><td>${metadata.phoneIPAddress || 'N/A'}</td></tr>
          <tr><td>IP Location</td><td>${metadata.phoneIPLocation || 'N/A'}</td></tr>
        </table>

        <h2>Report Information</h2>
        <table>
          <tr><th>Field</th><th>Value</th></tr>
          <tr><td>Trip ID</td><td>${trip.tripId}</td></tr>
          <tr><td>Report ID</td><td>${metadata.reportId}</td></tr>
          <tr><td>User Email</td><td>${trip.userEmail || 'Guest'}</td></tr>
          <tr><td>User Firestore ID</td><td>${trip.userFirestoreId || 'N/A'}</td></tr>
          <tr><td>PDF Standard</td><td>${metadata.pdfStandard}</td></tr>
          <tr><td>Font(s) Used</td><td>${metadata.fontsUsed.join(', ')}</td></tr>
          <tr><td>Page Count</td><td>${metadata.pageCount}</td></tr>
          <tr><td>Paper Size</td><td>${metadata.paperSize}</td></tr>
          <tr><td>Certifications</td><td>CE, UKCA, RoHS</td></tr>
        </table>

        <h2>Weather @ Report Generation</h2>
        <p>${metadata.weatherAtGeneration?.conditions || 'N/A'}, ${metadata.weatherAtGeneration?.temperature || 'N/A'}°C</p>

        <h2>Odometer</h2>
        <table>
          <tr><th>Unit</th><th>End Reading</th></tr>
          <tr><td>Kilometers</td><td>${trip.odometerEndKm.toFixed(2)} km</td></tr>
          <tr><td>Miles</td><td>${kmToMiles(trip.odometerEndKm).toFixed(2)} mi</td></tr>
          <tr><td>Nautical Miles</td><td>${kmToNauticalMiles(trip.odometerEndKm).toFixed(2)} nm</td></tr>
        </table>

        <h2>GPS Coordinates @ Generation</h2>
        <p>${metadata.gpsCoordinatesAtGeneration 
          ? `${metadata.gpsCoordinatesAtGeneration.latitude.toFixed(6)}, ${metadata.gpsCoordinatesAtGeneration.longitude.toFixed(6)}`
          : 'N/A'}</p>
      </div>
      ${getFooterHTML(1, metadata.pageCount, metadata.reportId, trip.motorSerialNumber, metadata.generatedAtUTC)}
    </div>
  `;
}

function generatePage2(report: TripReport, logoBase64: string): string {
  const { trip, metadata } = report;
  const tripDurationSec = trip.endTime 
    ? Math.floor((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000)
    : 0;

  return `
    <div class="page">
      ${getHeaderHTML('Trip Summary', logoBase64)}
      <div class="content">
        <h2>Weather Conditions</h2>
        <table>
          <tr><th>Time</th><th>Conditions</th><th>Temp</th><th>Wind</th><th>Humidity</th></tr>
          <tr>
            <td>Start</td>
            <td>${trip.startWeather?.conditions || 'N/A'}</td>
            <td>${trip.startWeather?.temperature || 'N/A'}°C</td>
            <td>${trip.startWeather?.windSpeed || 'N/A'} km/h ${trip.startWeather?.windDirection || ''}</td>
            <td>${trip.startWeather?.humidity || 'N/A'}%</td>
          </tr>
          <tr>
            <td>End</td>
            <td>${trip.endWeather?.conditions || 'N/A'}</td>
            <td>${trip.endWeather?.temperature || 'N/A'}°C</td>
            <td>${trip.endWeather?.windSpeed || 'N/A'} km/h ${trip.endWeather?.windDirection || ''}</td>
            <td>${trip.endWeather?.humidity || 'N/A'}%</td>
          </tr>
          ${trip.hourlyWeather.map((w, i) => `
            <tr>
              <td>Hour ${i + 1}</td>
              <td>${w.conditions || 'N/A'}</td>
              <td>${w.temperature || 'N/A'}°C</td>
              <td>${w.windSpeed || 'N/A'} km/h ${w.windDirection || ''}</td>
              <td>${w.humidity || 'N/A'}%</td>
            </tr>
          `).join('')}
        </table>

        <h2>Trip Times</h2>
        <table>
          <tr><th>Event</th><th>Local Time</th><th>UTC</th></tr>
          <tr>
            <td>Start</td>
            <td>${formatDateLocal(new Date(trip.startTime))}</td>
            <td>${formatDateUTC(new Date(trip.startTime))}</td>
          </tr>
          <tr>
            <td>End</td>
            <td>${trip.endTime ? formatDateLocal(new Date(trip.endTime)) : 'N/A'}</td>
            <td>${trip.endTime ? formatDateUTC(new Date(trip.endTime)) : 'N/A'}</td>
          </tr>
          <tr>
            <td>Duration</td>
            <td colspan="2">${formatDuration(tripDurationSec)}</td>
          </tr>
        </table>

        <h2>Connection & Location</h2>
        <table>
          <tr><th>Field</th><th>Phone GPS</th><th>Outboard GPS</th></tr>
          <tr>
            <td>Start Coordinates</td>
            <td>${trip.phoneGPSStart ? `${trip.phoneGPSStart.latitude.toFixed(6)}, ${trip.phoneGPSStart.longitude.toFixed(6)}` : 'N/A'}</td>
            <td>${trip.outboardGPSStart ? `${trip.outboardGPSStart.latitude.toFixed(6)}, ${trip.outboardGPSStart.longitude.toFixed(6)}` : 'N/A'}</td>
          </tr>
          <tr>
            <td>End Coordinates</td>
            <td>${trip.phoneGPSEnd ? `${trip.phoneGPSEnd.latitude.toFixed(6)}, ${trip.phoneGPSEnd.longitude.toFixed(6)}` : 'N/A'}</td>
            <td>${trip.outboardGPSEnd ? `${trip.outboardGPSEnd.latitude.toFixed(6)}, ${trip.outboardGPSEnd.longitude.toFixed(6)}` : 'N/A'}</td>
          </tr>
          <tr>
            <td>Start Address</td>
            <td colspan="2">${trip.startLocationAddress || 'N/A'}</td>
          </tr>
          <tr>
            <td>End Address</td>
            <td colspan="2">${trip.endLocationAddress || 'N/A'}</td>
          </tr>
          <tr>
            <td>Connection Type</td>
            <td colspan="2">${trip.connectionType}</td>
          </tr>
        </table>

        <h2>Distance & Speed</h2>
        <table>
          <tr><th>Metric</th><th>km/km/h</th><th>mi/mph</th><th>nm/knots</th></tr>
          <tr>
            <td>Total Distance</td>
            <td>${trip.totalDistanceKm.toFixed(2)} km</td>
            <td>${kmToMiles(trip.totalDistanceKm).toFixed(2)} mi</td>
            <td>${kmToNauticalMiles(trip.totalDistanceKm).toFixed(2)} nm</td>
          </tr>
          <tr>
            <td>Max Speed (Phone)</td>
            <td>${trip.maxSpeedKmh.toFixed(1)} km/h</td>
            <td>${kmhToMph(trip.maxSpeedKmh).toFixed(1)} mph</td>
            <td>${kmhToKnots(trip.maxSpeedKmh).toFixed(1)} kn</td>
          </tr>
          <tr>
            <td>Avg Speed (Phone)</td>
            <td>${trip.avgSpeedKmh.toFixed(1)} km/h</td>
            <td>${kmhToMph(trip.avgSpeedKmh).toFixed(1)} mph</td>
            <td>${kmhToKnots(trip.avgSpeedKmh).toFixed(1)} kn</td>
          </tr>
        </table>

        <h2>Battery & Energy</h2>
        <table>
          <tr><th>Field</th><th>Value</th></tr>
          <tr><td>Starting Battery SOC</td><td>${trip.startBatteryPercent ?? 'N/A'}%</td></tr>
          <tr><td>Ending Battery SOC</td><td>${trip.endBatteryPercent ?? 'N/A'}%</td></tr>
          <tr><td>3rd Party Battery?</td><td>False</td></tr>
          <tr><td>Wh Consumed</td><td>${trip.totalEnergyWh.toFixed(1)} Wh</td></tr>
          <tr><td>Max Amperage Draw</td><td>${trip.maxAmperageDraw.toFixed(1)} A</td></tr>
          <tr><td>Max Consumption</td><td>${trip.maxConsumptionKW.toFixed(2)} kW</td></tr>
          <tr><td>Avg Consumption</td><td>${trip.avgConsumptionKW.toFixed(2)} kW</td></tr>
        </table>

        <h2>RPM Statistics</h2>
        <table>
          <tr><th>RPM Max</th><th>RPM Average</th></tr>
          <tr><td>${trip.rpmMax}</td><td>${trip.rpmAvg.toFixed(0)}</td></tr>
        </table>

        <h2>Error Codes</h2>
        <table>
          <tr><th>Phase</th><th>Codes</th></tr>
          <tr><td>Starting</td><td>${trip.errorCodesStart.length > 0 ? trip.errorCodesStart.map(e => e.code).join(', ') : 'None'}</td></tr>
          <tr><td>During</td><td>${trip.errorCodesDuring.length > 0 ? trip.errorCodesDuring.map(e => e.code).join(', ') : 'None'}</td></tr>
          <tr><td>Ending</td><td>${trip.errorCodesEnd.length > 0 ? trip.errorCodesEnd.map(e => e.code).join(', ') : 'None'}</td></tr>
        </table>

        <h2>Route Map</h2>
        <div class="map-placeholder">
          [Route Map: ${trip.phoneGPSStart ? `Start: ${trip.phoneGPSStart.latitude.toFixed(4)}, ${trip.phoneGPSStart.longitude.toFixed(4)}` : 'No GPS'} → 
          ${trip.phoneGPSEnd ? `End: ${trip.phoneGPSEnd.latitude.toFixed(4)}, ${trip.phoneGPSEnd.longitude.toFixed(4)}` : 'No GPS'}]
          <br/>Distance: ${trip.totalDistanceKm.toFixed(2)} km
        </div>

        <h2>Trip Overview Graph</h2>
        <div class="graph-placeholder">
          <div style="padding: 8pt; font-size: 7pt;">
            <strong>Legend:</strong> Speed (km/h) | Consumption (kW) | Battery SOC (%)
            <br/>Time Range: ${formatDuration(0)} - ${formatDuration(tripDurationSec)}
            <br/>Data Points: ${trip.dataPoints.length}
          </div>
        </div>
      </div>
      ${getFooterHTML(2, metadata.pageCount, metadata.reportId, trip.motorSerialNumber, metadata.generatedAtUTC)}
    </div>
  `;
}

function generatePage3(
  report: TripReport, 
  logoBase64: string, 
  pageNum: number, 
  startSec: number, 
  endSec: number,
  totalPages: number
): string {
  const { trip, metadata } = report;
  const startTime = formatDuration(startSec);
  const endTime = formatDuration(endSec);

  const startIndex = Math.floor(startSec / 4);
  const endIndex = Math.ceil(endSec / 4);
  const pageDataPoints = trip.dataPoints.slice(startIndex, endIndex);
  
  const graphs = [];
  for (let i = 0; i < 3; i++) {
    const graphStart = startSec + (i * 200);
    const graphEnd = Math.min(startSec + ((i + 1) * 200), endSec);
    if (graphStart < endSec) {
      graphs.push({ start: graphStart, end: graphEnd });
    }
  }

  return `
    <div class="page">
      ${getHeaderHTML('Trip Detail', logoBase64)}
      <div class="content">
        <table>
          <tr>
            <th>Serial Number</th>
            <th>Trip ID</th>
            <th>Duration Range</th>
          </tr>
          <tr>
            <td>${trip.motorSerialNumber}</td>
            <td>${trip.tripId}</td>
            <td>${startTime} - ${endTime}</td>
          </tr>
        </table>

        ${graphs.map((g, idx) => `
          <div class="graph-title">Graph ${idx + 1}: ${formatDuration(g.start)} - ${formatDuration(g.end)}</div>
          <div class="graph-placeholder">
            <div style="padding: 8pt; font-size: 7pt;">
              <strong>Legend:</strong> Speed (km/h) | Consumption (kW) | Phase Amperage (A) | Battery SOC (%) | RPM
              <br/>Flags: [N] Normal | [E] Eco | [D] Docking | [S] Sport | [R] Reverse | [H] Hydro-Regen
            </div>
          </div>
        `).join('')}
      </div>
      ${getFooterHTML(pageNum, totalPages, metadata.reportId, trip.motorSerialNumber, metadata.generatedAtUTC)}
    </div>
  `;
}

function generatePage4(report: TripReport, logoBase64: string, pageNum: number): string {
  const { trip, metadata } = report;
  const tripDurationSec = trip.endTime 
    ? Math.floor((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000)
    : 0;

  return `
    <div class="page">
      ${getHeaderHTML('Conclusion', logoBase64)}
      <div class="content">
        <h2>Notes</h2>
        <div class="notes-box">
          <p style="color: #999; font-size: 8pt;">(Notes section - currently blank)</p>
        </div>

        <h2>Trip Summary</h2>
        <table>
          <tr><th>Metric</th><th>km</th><th>mi</th><th>nm</th></tr>
          <tr>
            <td>Distance Traveled</td>
            <td>${trip.totalDistanceKm.toFixed(2)}</td>
            <td>${kmToMiles(trip.totalDistanceKm).toFixed(2)}</td>
            <td>${kmToNauticalMiles(trip.totalDistanceKm).toFixed(2)}</td>
          </tr>
          <tr>
            <td>Odometer Start</td>
            <td>${trip.odometerStartKm.toFixed(2)}</td>
            <td>${kmToMiles(trip.odometerStartKm).toFixed(2)}</td>
            <td>${kmToNauticalMiles(trip.odometerStartKm).toFixed(2)}</td>
          </tr>
          <tr>
            <td>Odometer End</td>
            <td>${trip.odometerEndKm.toFixed(2)}</td>
            <td>${kmToMiles(trip.odometerEndKm).toFixed(2)}</td>
            <td>${kmToNauticalMiles(trip.odometerEndKm).toFixed(2)}</td>
          </tr>
        </table>

        <table>
          <tr><th>Field</th><th>Value</th></tr>
          <tr><td>Consumption</td><td>${trip.totalEnergyWh.toFixed(1)} Wh</td></tr>
          <tr><td>Total Trip Time</td><td>${formatDuration(tripDurationSec)}</td></tr>
          <tr><td>Location</td><td>${trip.startLocationAddress || 'N/A'}</td></tr>
          <tr><td>Serial Number</td><td>${trip.motorSerialNumber}</td></tr>
          <tr><td>Trip ID</td><td>${trip.tripId}</td></tr>
          <tr><td>Report ID</td><td>${metadata.reportId}</td></tr>
          <tr><td>Generated</td><td>${metadata.generatedAtUTC}</td></tr>
        </table>

        <h2>Disclaimer</h2>
        <div class="disclaimer" style="font-size: 6pt;">
          This report is generated from data collected by Blade Outboards Connect and associated hardware systems 
          and is provided for informational purposes only. Telemetry, location, battery, performance, and environmental 
          data may be incomplete, delayed, inaccurate, or unavailable due to operating conditions, connectivity, 
          sensor limitations, or system errors. Blade makes no representations or warranties, express or implied, 
          regarding the accuracy, completeness, reliability, or suitability of this information for any purpose. 
          This report is not intended to be used for navigation, safety decisions, regulatory compliance, or 
          operational control. Users are solely responsible for the safe operation of their vessel and equipment, 
          compliance with all applicable laws and regulations, and for verifying all information through independent 
          means. Blade shall not be liable for any loss, damage, injury, or claim arising from the use of this 
          report or reliance on any data contained herein.
        </div>

        <h2>Data Field Explanations</h2>
        <table style="font-size: 7pt;">
          <tr><th>Field</th><th>Description</th></tr>
          <tr><td>SOC</td><td>State of Charge - battery percentage remaining</td></tr>
          <tr><td>kW</td><td>Kilowatts - power consumption measurement</td></tr>
          <tr><td>RPM</td><td>Revolutions Per Minute - motor speed</td></tr>
          <tr><td>Wh</td><td>Watt-hours - energy consumed</td></tr>
          <tr><td>Phase Amperage</td><td>Current draw from motor phases</td></tr>
          <tr><td>Hydro-Regen</td><td>Regenerative charging while moving through water</td></tr>
        </table>

        <h2>ISO Standards</h2>
        <p style="font-size: 7pt;">This report format follows guidelines from ISO 10005 (Quality Plans), ISO 19650 (BIM), and marine vessel documentation standards.</p>

        <div class="safety-reminder">
          <strong>${TRANSLATIONS.boatSafety.en}</strong>
          <br/><span class="multi-lang">${TRANSLATIONS.boatSafety.de}</span>
          <br/><span class="multi-lang">${TRANSLATIONS.boatSafety.it}</span>
          <br/><span class="multi-lang">${TRANSLATIONS.boatSafety.es}</span>
        </div>
      </div>
      ${getFooterHTML(pageNum, metadata.pageCount, metadata.reportId, trip.motorSerialNumber, metadata.generatedAtUTC)}
    </div>
  `;
}

export async function generateTripReportPDF(trip: ExtendedTrip): Promise<string> {
  const reportId = generateUniqueId();
  const now = new Date();
  
  const tripDurationSec = trip.endTime 
    ? Math.floor((new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime()) / 1000)
    : 0;
  
  const detailPages = Math.max(1, Math.ceil(tripDurationSec / 600));
  const totalPages = 2 + detailPages + 1;
  
  const metadata: TripReportMetadata = {
    reportId,
    generatedAt: now,
    generatedAtUTC: formatDateUTC(now),
    generatedAtLocal: formatDateLocal(now),
    generatedAtTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    phoneIPAddress: null,
    phoneIPLocation: null,
    gpsCoordinatesAtGeneration: trip.phoneGPSEnd,
    weatherAtGeneration: trip.endWeather,
    pageCount: totalPages,
    pdfStandard: 'PDF 1.7',
    fontsUsed: ['Inter', 'System'],
    paperSize: 'A4 Landscape',
  };

  const report: TripReport = { trip, metadata };
  
  const logoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  let pagesHtml = '';
  pagesHtml += generatePage1(report, logoBase64);
  pagesHtml += generatePage2(report, logoBase64);
  
  for (let i = 0; i < detailPages; i++) {
    const startSec = i * 600;
    const endSec = Math.min((i + 1) * 600, tripDurationSec);
    pagesHtml += generatePage3(report, logoBase64, 3 + i, startSec, endSec, totalPages);
  }
  
  pagesHtml += generatePage4(report, logoBase64, totalPages);
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Trip Report - ${trip.tripId}</title>
      <style>${getBaseStyles()}</style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({
      html,
      width: 842,
      height: 595,
    });

    return uri;
  } catch (error) {
    console.error('[PDF] Generation error:', error);
    throw error;
  }
}

export async function shareTripReport(pdfUri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Trip Report',
    });
  } else {
    throw new Error('Sharing is not available on this device');
  }
}

export function createExtendedTripFromBasic(
  basicTrip: any,
  dataPoints: TripDataPoint[] = [],
  userEmail: string | null = null
): ExtendedTrip {
  return {
    id: basicTrip.id,
    tripId: basicTrip.id,
    userId: basicTrip.userId || 'guest',
    userEmail,
    userFirestoreId: null,
    motorSerialNumber: basicTrip.motorSerialNumber || 'DEMO-MOTOR',
    name: basicTrip.name || 'Trip',
    
    startTime: new Date(basicTrip.startTime),
    endTime: basicTrip.endTime ? new Date(basicTrip.endTime) : null,
    isActive: basicTrip.isActive || false,
    endReason: basicTrip.endReason || 'user_button',
    
    startBatteryPercent: basicTrip.startBatteryPercent ?? null,
    endBatteryPercent: basicTrip.endBatteryPercent ?? null,
    totalDistanceKm: basicTrip.totalDistanceKm || 0,
    maxSpeedKmh: basicTrip.maxSpeedKmh || 0,
    avgSpeedKmh: basicTrip.avgSpeedKmh || 0,
    totalEnergyWh: basicTrip.totalEnergyWh || 0,
    
    startWeather: null,
    endWeather: null,
    hourlyWeather: [],
    
    phoneGPSStart: basicTrip.phoneGPSStart || null,
    phoneGPSEnd: basicTrip.phoneGPSEnd || null,
    outboardGPSStart: basicTrip.outboardGPSStart || null,
    outboardGPSEnd: basicTrip.outboardGPSEnd || null,
    
    startLocationAddress: null,
    endLocationAddress: null,
    
    errorCodesStart: [],
    errorCodesDuring: [],
    errorCodesEnd: [],
    
    maxAmperageDraw: 0,
    maxConsumptionKW: 0,
    avgConsumptionKW: 0,
    rpmMax: 0,
    rpmAvg: 0,
    
    connectionType: 'Demo',
    
    dataPoints,
    
    odometerStartKm: 0,
    odometerEndKm: basicTrip.totalDistanceKm || 0,
    
    firmwareVersion: null,
    hardwareVersion: 'H32026',
    phoneAppVersion: Constants.expoConfig?.version || '1.0.0',
    phoneName: Device.deviceName || null,
    phoneDeviceType: Device.deviceType ? String(Device.deviceType) : null,
    phoneOS: `${Platform.OS} ${Platform.Version}`,
    bluetoothMacAddress: null,
  };
}

export const TripReportService = {
  generateReport: async (trip: ExtendedTrip, dataPoints: TripDataPoint[]): Promise<{ success: boolean; uri?: string; error?: string }> => {
    try {
      const tripWithDataPoints = { ...trip, dataPoints };
      const uri = await generateTripReportPDF(tripWithDataPoints as ExtendedTrip);
      await shareTripReport(uri);
      return { success: true, uri };
    } catch (error) {
      console.error('[TripReportService] Error generating report:', error);
      return { success: false, error: String(error) };
    }
  },
  share: shareTripReport,
};
