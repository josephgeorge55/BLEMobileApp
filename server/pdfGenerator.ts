import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

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

interface BoatInfo {
  boatType: string;
  lengthMeters: number;
  weightKg: number;
  vesselName?: string;
  vin?: string;
}

interface ErrorCode {
  code: string;
  description: string;
  timestamp?: string;
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
  maxPhoneSpeedKmh?: number;
  maxOutboardSpeedKmh?: number;
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
  startWeather?: { conditions?: string; temperature?: number; humidity?: number; windSpeed?: number; windDirection?: string; sunrise?: string; sunset?: string };
  endWeather?: { conditions?: string; temperature?: number; humidity?: number; windSpeed?: number; windDirection?: string; sunrise?: string; sunset?: string };
  hourlyWeather?: any[];
  connectionType?: string;
  firmwareVersion?: string;
  phoneAppVersion?: string;
  phoneName?: string;
  phoneDeviceType?: string;
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
  boatInfo?: BoatInfo;
  errorCodesStart?: ErrorCode[];
  errorCodesDuring?: ErrorCode[];
  errorCodesEnd?: ErrorCode[];
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

function calculateCO2Saved(tripDurationMinutes: number): number {
  return tripDurationMinutes * 0.14833;
}

const GS1_SKU = '199284191679';

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

function formatErrorCodes(codes: ErrorCode[] | undefined): string {
  if (!codes || codes.length === 0) return 'None';
  return codes.map(e => e.code).join(', ');
}

function drawQRCode(doc: PDFKit.PDFDocument, x: number, y: number, size: number, data: string) {
  const gridSize = 21;
  const cellSize = size / gridSize;
  const pattern = generateQRPattern(data, gridSize);
  
  doc.fillColor('#fff').rect(x, y, size, size).fill();
  doc.fillColor(BLACK);
  
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (pattern[row * gridSize + col]) {
        doc.rect(x + col * cellSize, y + row * cellSize, cellSize, cellSize).fill();
      }
    }
  }
}

function generateQRPattern(data: string, gridSize: number): boolean[] {
  const pattern = new Array(gridSize * gridSize).fill(false);
  
  // Draw 3 finder patterns (7x7 squares at corners)
  function drawFinderPattern(startRow: number, startCol: number) {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const isBorder = i === 0 || i === 6 || j === 0 || j === 6;
        const isCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        if (isBorder || isCenter) {
          pattern[(startRow + i) * gridSize + (startCol + j)] = true;
        }
      }
    }
  }
  
  drawFinderPattern(0, 0);  // Top-left
  drawFinderPattern(0, 14); // Top-right  
  drawFinderPattern(14, 0); // Bottom-left
  
  // Timing patterns (alternating dots between finder patterns)
  for (let i = 8; i < 13; i++) {
    pattern[6 * gridSize + i] = i % 2 === 0;
    pattern[i * gridSize + 6] = i % 2 === 0;
  }
  
  // Simple data fill based on string hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash = hash & hash;
  }
  
  // Fill center area with sparse pattern
  for (let i = 9; i < 12; i++) {
    for (let j = 9; j < 12; j++) {
      pattern[i * gridSize + j] = ((hash >> ((i + j) % 8)) & 1) === 1;
    }
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

function drawCertificationLogos(doc: PDFKit.PDFDocument, x: number, y: number, height: number) {
  const certLogoPath = path.join(process.cwd(), 'server', 'ceukrohs-logo.png');
  try {
    if (fs.existsSync(certLogoPath)) {
      doc.image(certLogoPath, x, y, { height: height });
    } else {
      doc.font('Helvetica').fontSize(6).fillColor(GRAY);
      doc.text('CE | UKCA | RoHS', x, y + height / 3);
    }
  } catch (e) {
    doc.font('Helvetica').fontSize(6).fillColor(GRAY);
    doc.text('CE | UKCA | RoHS', x, y + height / 3);
  }
}

function drawCELogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  // Kept for backward compatibility but no longer used
}

function drawUKCALogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  // Kept for backward compatibility but no longer used
}

function drawRoHSLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  // Kept for backward compatibility but no longer used
  doc.save();
  doc.rect(x, y, size, size).fillColor('#E8F5E9').fill();
  doc.strokeColor(GREEN).lineWidth(0.5).rect(x, y, size, size).stroke();
  doc.font('Helvetica-Bold').fontSize(size * 0.28).fillColor(GREEN);
  doc.text('RoHS', x, y + size * 0.35, { width: size, align: 'center' });
  doc.restore();
}

interface TileCache {
  tiles: Map<string, Buffer>;
  zoom: number;
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
}

function lon2tile(lon: number, z: number): number {
  return Math.floor((lon + 180) / 360 * Math.pow(2, z));
}

function lat2tile(lat: number, z: number): number {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
}

function tile2lon(x: number, z: number): number {
  return x / Math.pow(2, z) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / Math.pow(2, z)))) * 180 / Math.PI;
}

function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
    https.get(url, {
      headers: { 'User-Agent': 'BladeOutboards/1.0 PDFReport' }
    }, (response) => {
      if (response.statusCode === 200) {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      } else {
        reject(new Error(`Tile fetch failed: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

function extractGPSCoords(dataPoints: any[], startCoord?: any, endCoord?: any): { lat: number; lon: number }[] {
  const coords: { lat: number; lon: number }[] = [];

  if (dataPoints && dataPoints.length > 0) {
    for (const dp of dataPoints) {
      const lat = dp.phoneLatitude ?? dp.outboardLatitude;
      const lon = dp.phoneLongitude ?? dp.outboardLongitude;
      if (lat != null && lon != null && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        coords.push({ lat, lon });
      }
    }
  }

  if (coords.length === 0) {
    if (startCoord && startCoord.latitude && startCoord.longitude) {
      coords.push({ lat: startCoord.latitude, lon: startCoord.longitude });
    }
    if (endCoord && endCoord.latitude && endCoord.longitude) {
      coords.push({ lat: endCoord.latitude, lon: endCoord.longitude });
    }
  }

  return coords;
}

async function prefetchMapTiles(coords: { lat: number; lon: number }[]): Promise<TileCache | null> {
  if (coords.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lon < minLon) minLon = c.lon;
    if (c.lon > maxLon) maxLon = c.lon;
  }

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const latPad = Math.max(latSpan * 0.4, 0.012);
  const lonPad = Math.max(lonSpan * 0.4, 0.012);
  minLat -= latPad;
  maxLat += latPad;
  minLon -= lonPad;
  maxLon += lonPad;

  const targetAspect = 5.2;
  const mercMinY = latToMercY(maxLat);
  const mercMaxY = latToMercY(minLat);
  const mercMinX = lonToMercX(minLon);
  const mercMaxX = lonToMercX(maxLon);
  let mercW = mercMaxX - mercMinX;
  let mercH = mercMaxY - mercMinY;
  const currentAspect = mercW / (mercH || 0.0001);

  if (currentAspect < targetAspect) {
    const neededMercW = mercH * targetAspect;
    const extraLon = ((neededMercW - mercW) / 2) * 360;
    minLon -= extraLon;
    maxLon += extraLon;
  } else if (currentAspect > targetAspect * 1.5) {
    const neededMercH = mercW / targetAspect;
    const extraMerc = (neededMercH - mercH) / 2;
    const centerMercY = (mercMinY + mercMaxY) / 2;
    const newMinMercY = centerMercY - neededMercH / 2;
    const newMaxMercY = centerMercY + neededMercH / 2;
    maxLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * newMinMercY))) * 180 / Math.PI;
    minLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * newMaxMercY))) * 180 / Math.PI;
  }

  let zoom = 14;
  for (let z = 16; z >= 2; z--) {
    const tileXMin = lon2tile(minLon, z);
    const tileXMax = lon2tile(maxLon, z);
    const tileYMin = lat2tile(maxLat, z);
    const tileYMax = lat2tile(minLat, z);
    const spanX = tileXMax - tileXMin + 1;
    const spanY = tileYMax - tileYMin + 1;
    const totalTiles = spanX * spanY;
    if (totalTiles <= 42 && spanX >= 3) {
      zoom = z;
      break;
    }
  }

  const minTileX = lon2tile(minLon, zoom);
  const maxTileX = lon2tile(maxLon, zoom);
  const minTileY = lat2tile(maxLat, zoom);
  const maxTileY = lat2tile(minLat, zoom);

  const tiles = new Map<string, Buffer>();
  const fetchPromises: Promise<void>[] = [];

  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      fetchPromises.push(
        fetchTile(zoom, tx, ty)
          .then(buf => { tiles.set(`${tx}:${ty}`, buf); })
          .catch(err => { console.error(`[PDF] Failed to fetch tile ${zoom}/${tx}/${ty}:`, err.message); })
      );
    }
  }

  await Promise.all(fetchPromises);

  if (tiles.size === 0) return null;

  console.log(`[PDF Generator] Tile cache: ${tiles.size} tiles at zoom ${zoom} (${maxTileX - minTileX + 1}x${maxTileY - minTileY + 1})`);
  return { tiles, zoom, minTileX, maxTileX, minTileY, maxTileY };
}

function lonToMercX(lon: number): number {
  return (lon + 180) / 360;
}

function latToMercY(lat: number): number {
  const latRad = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
}

function drawMap(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number,
                 coords: { lat: number; lon: number }[], tileCache: TileCache | null) {
  doc.fillColor('#E8ECEF').rect(x, y, w, h).fill();

  if (coords.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor('#999');
    doc.text('No GPS data recorded for this trip', x, y + h/2 - 5, { width: w, align: 'center' });
    doc.strokeColor('#ccc').lineWidth(0.5).rect(x, y, w, h).stroke();
    return;
  }

  if (!tileCache || tileCache.tiles.size === 0) {
    doc.font('Helvetica').fontSize(9).fillColor('#999');
    doc.text('Map tiles unavailable', x, y + h/2 - 5, { width: w, align: 'center' });
    doc.strokeColor('#ccc').lineWidth(0.5).rect(x, y, w, h).stroke();

    if (coords.length >= 1) {
      let cMinLat = Infinity, cMaxLat = -Infinity, cMinLon = Infinity, cMaxLon = -Infinity;
      for (const c of coords) {
        if (c.lat < cMinLat) cMinLat = c.lat;
        if (c.lat > cMaxLat) cMaxLat = c.lat;
        if (c.lon < cMinLon) cMinLon = c.lon;
        if (c.lon > cMaxLon) cMaxLon = c.lon;
      }
      const cLatPad = Math.max((cMaxLat - cMinLat) * 0.15, 0.003);
      const cLonPad = Math.max((cMaxLon - cMinLon) * 0.15, 0.003);
      cMinLat -= cLatPad; cMaxLat += cLatPad; cMinLon -= cLonPad; cMaxLon += cLonPad;
      const minMercY = latToMercY(cMaxLat);
      const maxMercY = latToMercY(cMinLat);
      const minMercX = lonToMercX(cMinLon);
      const maxMercX = lonToMercX(cMaxLon);
      const mercRangeX = maxMercX - minMercX || 0.0001;
      const mercRangeY = maxMercY - minMercY || 0.0001;

      const toX = (lon: number) => x + ((lonToMercX(lon) - minMercX) / mercRangeX) * w;
      const toY = (lat: number) => y + ((latToMercY(lat) - minMercY) / mercRangeY) * h;

      if (coords.length >= 2) {
        doc.strokeColor(BLUE).lineWidth(2);
        doc.moveTo(toX(coords[0].lon), toY(coords[0].lat));
        for (let i = 1; i < coords.length; i++) doc.lineTo(toX(coords[i].lon), toY(coords[i].lat));
        doc.stroke();
      }

      doc.fillColor(GREEN).circle(toX(coords[0].lon), toY(coords[0].lat), 5).fill();
      doc.fillColor('#fff').circle(toX(coords[0].lon), toY(coords[0].lat), 2.5).fill();
      if (coords.length >= 2) {
        doc.fillColor(RED).circle(toX(coords[coords.length - 1].lon), toY(coords[coords.length - 1].lat), 5).fill();
        doc.fillColor('#fff').circle(toX(coords[coords.length - 1].lon), toY(coords[coords.length - 1].lat), 2.5).fill();
      }
    }
    return;
  }

  const { zoom, minTileX, maxTileX, minTileY, maxTileY, tiles } = tileCache;
  const n = Math.pow(2, zoom);

  const gridMinMercX = minTileX / n;
  const gridMaxMercX = (maxTileX + 1) / n;
  const gridMinMercY = minTileY / n;
  const gridMaxMercY = (maxTileY + 1) / n;

  const gridMercW = gridMaxMercX - gridMinMercX;
  const gridMercH = gridMaxMercY - gridMinMercY;

  const tileScaleX = w / gridMercW;
  const tileScaleY = h / gridMercH;
  const coverScale = Math.max(tileScaleX, tileScaleY);

  const renderedW = gridMercW * coverScale;
  const renderedH = gridMercH * coverScale;
  const offsetX = x + (w - renderedW) / 2;
  const offsetY = y + (h - renderedH) / 2;

  doc.save();
  doc.rect(x, y, w, h).clip();

  const tilesWide = maxTileX - minTileX + 1;
  const tilesHigh = maxTileY - minTileY + 1;
  const tileDrawW = renderedW / tilesWide;
  const tileDrawH = renderedH / tilesHigh;

  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const key = `${tx}:${ty}`;
      const tileBuf = tiles.get(key);
      const drawX = offsetX + (tx - minTileX) * tileDrawW;
      const drawY = offsetY + (ty - minTileY) * tileDrawH;
      if (tileBuf) {
        try {
          doc.image(tileBuf, drawX, drawY, { width: tileDrawW + 0.5, height: tileDrawH + 0.5 });
        } catch (e) {
          doc.fillColor('#E8ECEF').rect(drawX, drawY, tileDrawW, tileDrawH).fill();
        }
      } else {
        doc.fillColor('#E8ECEF').rect(drawX, drawY, tileDrawW, tileDrawH).fill();
      }
    }
  }

  const toMapX = (lon: number) => offsetX + ((lonToMercX(lon) - gridMinMercX) / gridMercW) * renderedW;
  const toMapY = (lat: number) => offsetY + ((latToMercY(lat) - gridMinMercY) / gridMercH) * renderedH;

  if (coords.length >= 2) {
    doc.strokeColor('#1A73E8').lineWidth(3).opacity(0.3);
    doc.moveTo(toMapX(coords[0].lon), toMapY(coords[0].lat));
    for (let i = 1; i < coords.length; i++) doc.lineTo(toMapX(coords[i].lon), toMapY(coords[i].lat));
    doc.stroke();

    doc.strokeColor('#1A73E8').lineWidth(1.5).opacity(1);
    doc.moveTo(toMapX(coords[0].lon), toMapY(coords[0].lat));
    for (let i = 1; i < coords.length; i++) doc.lineTo(toMapX(coords[i].lon), toMapY(coords[i].lat));
    doc.stroke();
  }

  const markerR = Math.max(4, Math.min(7, h * 0.04));
  if (coords.length >= 1) {
    const sx = toMapX(coords[0].lon);
    const sy = toMapY(coords[0].lat);
    doc.fillColor('#34A853').circle(sx, sy, markerR).fill();
    doc.fillColor('#fff').circle(sx, sy, markerR * 0.45).fill();
    doc.font('Helvetica-Bold').fontSize(6).fillColor('#1a1a1a');
    doc.text('START', sx - 14, sy + markerR + 2);
  }

  if (coords.length >= 2) {
    const ex = toMapX(coords[coords.length - 1].lon);
    const ey = toMapY(coords[coords.length - 1].lat);
    doc.fillColor('#EA4335').circle(ex, ey, markerR).fill();
    doc.fillColor('#fff').circle(ex, ey, markerR * 0.45).fill();
    doc.font('Helvetica-Bold').fontSize(6).fillColor('#1a1a1a');
    doc.text('END', ex - 10, ey + markerR + 2);
  }

  // --- Coordinate grid markers along map edges ---
  const visMinLonRaw = gridMinMercX * 360 - 180;
  const visMaxLonRaw = gridMaxMercX * 360 - 180;
  const visMinLatRaw = Math.atan(Math.sinh(Math.PI * (1 - 2 * gridMaxMercY))) * 180 / Math.PI;
  const visMaxLatRaw = Math.atan(Math.sinh(Math.PI * (1 - 2 * gridMinMercY))) * 180 / Math.PI;

  const lonSpanVis = visMaxLonRaw - visMinLonRaw;
  const latSpanVis = visMaxLatRaw - visMinLatRaw;

  const coordIntervals = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
  const targetTicksLon = Math.max(3, Math.min(6, Math.floor(w / 100)));
  const targetTicksLat = Math.max(2, Math.min(5, Math.floor(h / 60)));

  let lonInterval = 1;
  for (const ci of coordIntervals) {
    if (lonSpanVis / ci <= targetTicksLon + 1) { lonInterval = ci; break; }
  }
  let latInterval = 1;
  for (const ci of coordIntervals) {
    if (latSpanVis / ci <= targetTicksLat + 1) { latInterval = ci; break; }
  }

  function formatCoord(val: number, isLat: boolean): string {
    const absVal = Math.abs(val);
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    if (absVal >= 1) {
      const deg = Math.floor(absVal);
      const min = (absVal - deg) * 60;
      if (min < 0.1) return `${deg}\u00B0${dir}`;
      return `${deg}\u00B0${min.toFixed(1)}'${dir}`;
    }
    const deg = Math.floor(absVal);
    const min = (absVal - deg) * 60;
    return `${deg}\u00B0${min.toFixed(1)}'${dir}`;
  }

  doc.strokeColor('#999999').lineWidth(0.4).opacity(0.5);

  const firstLon = Math.ceil(visMinLonRaw / lonInterval) * lonInterval;
  for (let lon = firstLon; lon <= visMaxLonRaw; lon += lonInterval) {
    const px = toMapX(lon);
    if (px < x + 2 || px > x + w - 2) continue;
    doc.moveTo(px, y).lineTo(px, y + 5).stroke();
    doc.moveTo(px, y + h - 5).lineTo(px, y + h).stroke();
  }

  const firstLat = Math.ceil(visMinLatRaw / latInterval) * latInterval;
  for (let lat = firstLat; lat <= visMaxLatRaw; lat += latInterval) {
    const py = toMapY(lat);
    if (py < y + 2 || py > y + h - 2) continue;
    doc.moveTo(x, py).lineTo(x + 5, py).stroke();
    doc.moveTo(x + w - 5, py).lineTo(x + w, py).stroke();
  }

  doc.opacity(1);
  doc.font('Helvetica').fontSize(4.5);

  for (let lon = firstLon; lon <= visMaxLonRaw; lon += lonInterval) {
    const px = toMapX(lon);
    if (px < x + 2 || px > x + w - 2) continue;
    const label = formatCoord(lon, false);
    doc.fillColor('#ffffff').rect(px - 13, y + h - 13, 26, 8).fill();
    doc.fillColor('#555555').text(label, px - 15, y + h - 13, { width: 30, align: 'center' });
  }

  for (let lat = firstLat; lat <= visMaxLatRaw; lat += latInterval) {
    const py = toMapY(lat);
    if (py < y + 8 || py > y + h - 8) continue;
    const label = formatCoord(lat, true);
    doc.fillColor('#ffffff').rect(x + 1, py - 4, 28, 8).fill();
    doc.fillColor('#555555').text(label, x + 2, py - 4, { width: 28, lineBreak: false });
  }

  // --- Scale bar ---
  const visMinLon = gridMinMercX + ((x - offsetX) / renderedW) * gridMercW;
  const visMaxLon = gridMinMercX + ((x + w - offsetX) / renderedW) * gridMercW;
  const visLonSpanMerc = (visMaxLon - visMinLon) * 360;
  const centerLat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const metersPerDegLon = 111320 * Math.cos(centerLat * Math.PI / 180);
  const visWidthMeters = visLonSpanMerc * metersPerDegLon;

  let scaleMeters: number;
  let scaleLabel: string;
  const targetBarPx = w * 0.15;
  const metersPerPx = visWidthMeters / w;
  const rawScaleMeters = targetBarPx * metersPerPx;

  if (rawScaleMeters >= 5000) {
    scaleMeters = Math.round(rawScaleMeters / 5000) * 5000;
    scaleLabel = `${(scaleMeters / 1000).toFixed(0)} km`;
  } else if (rawScaleMeters >= 1000) {
    scaleMeters = Math.round(rawScaleMeters / 1000) * 1000;
    scaleLabel = `${(scaleMeters / 1000).toFixed(0)} km`;
  } else if (rawScaleMeters >= 100) {
    scaleMeters = Math.round(rawScaleMeters / 100) * 100;
    scaleLabel = `${scaleMeters} m`;
  } else {
    scaleMeters = Math.round(rawScaleMeters / 50) * 50 || 50;
    scaleLabel = `${scaleMeters} m`;
  }

  const scaleBarW = (scaleMeters / metersPerPx);
  const scaleNm = (scaleMeters / 1852);
  if (scaleNm >= 0.1) {
    scaleLabel += ` / ${scaleNm < 1 ? scaleNm.toFixed(1) : scaleNm.toFixed(0)} nm`;
  }

  const scaleBarX = x + w - scaleBarW - 12;
  const scaleBarY = y + h - 14;
  doc.strokeColor('#333').lineWidth(1.5);
  doc.moveTo(scaleBarX, scaleBarY).lineTo(scaleBarX + scaleBarW, scaleBarY).stroke();
  doc.moveTo(scaleBarX, scaleBarY - 3).lineTo(scaleBarX, scaleBarY + 3).stroke();
  doc.moveTo(scaleBarX + scaleBarW, scaleBarY - 3).lineTo(scaleBarX + scaleBarW, scaleBarY + 3).stroke();
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#333');
  doc.text(scaleLabel, scaleBarX, scaleBarY - 10, { width: scaleBarW, align: 'center' });

  doc.restore();

  doc.strokeColor('#bbb').lineWidth(0.5).rect(x, y, w, h).stroke();

  doc.font('Helvetica').fontSize(3.5).fillColor('#999');
  doc.text('CARTO, OpenStreetMap', x + 4, y + h - 9);
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
  
  if (data.speed.length === 0 && data.consumption.length === 0 && data.battery.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GRAY);
    doc.text('No telemetry data recorded', graphX + graphW / 2 - 55, graphY + graphH / 2 - 5);
  } else {
    if (data.speed.length > 0) drawLine(data.speed, BLUE, 100);
    if (data.consumption.length > 0) drawLine(data.consumption.map(v => v * 15), RED, 100);
    if (data.battery.length > 0) drawLine(data.battery, GREEN, 100);
  }
  
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
  const segmentMatch = segmentLabel.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/);
  const segStartSec = segmentMatch ? parseInt(segmentMatch[1]) * 60 + parseInt(segmentMatch[2]) : 0;
  const segEndSec = segmentMatch ? parseInt(segmentMatch[3]) * 60 + parseInt(segmentMatch[4]) : 200;
  const segDuration = segEndSec - segStartSec;

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

  doc.font('Helvetica').fontSize(4).fillColor(GRAY);
  for (let i = 0; i <= 10; i += 2) {
    const tx = graphX + (graphW * i / 10);
    const timeSec = segStartSec + Math.round(segDuration * i / 10);
    const mm = Math.floor(timeSec / 60).toString().padStart(2, '0');
    const ss = (timeSec % 60).toString().padStart(2, '0');
    doc.text(`${mm}:${ss}`, tx - 8, graphY + graphH + 2, { width: 20, align: 'center' });
  }
  
  if (!dataPoints || dataPoints.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GRAY);
    doc.text('No data for this segment', graphX + graphW / 2 - 50, graphY + graphH / 2 - 5);
  } else {
    const metricsConfig = [
      { key: 'speed', color: BLUE, label: 'Speed', maxVal: 100 },
      { key: 'power', color: RED, label: 'kW', maxVal: 20 },
      { key: 'amps', color: ORANGE, label: 'Amps', maxVal: 200 },
      { key: 'soc', color: GREEN, label: 'SOC%', maxVal: 100 },
      { key: 'rpm', color: PURPLE, label: 'RPM', maxVal: 5000 },
    ];

    const extractedData: Record<string, number[]> = {
      speed: dataPoints.map((dp: any) => nv(dp.phoneSpeedKmh ?? dp.outboardSpeedKmh, 0)),
      power: dataPoints.map((dp: any) => nv(dp.consumptionKW, 0)),
      amps: dataPoints.map((dp: any) => nv(dp.phaseAmperage, 0)),
      soc: dataPoints.map((dp: any) => nv(dp.batterySOC, 0)),
      rpm: dataPoints.map((dp: any) => nv(dp.rpm, 0)),
    };

    const step = graphW / Math.max(dataPoints.length - 1, 1);

    metricsConfig.forEach((metric) => {
      const values = extractedData[metric.key];
      if (!values || values.length < 2) return;

      const maxVal = metric.maxVal;
      doc.strokeColor(metric.color).lineWidth(1);
      doc.moveTo(graphX, graphY + graphH - (Math.min(values[0], maxVal) / maxVal) * graphH);
      for (let i = 1; i < values.length; i++) {
        const px = graphX + i * step;
        const py = graphY + graphH - (Math.min(values[i], maxVal) / maxVal) * graphH;
        doc.lineTo(px, py);
      }
      doc.stroke();
    });

    const modeColors: Record<string, string> = { 'N': '#666', 'E': GREEN, 'D': BLUE, 'S': RED, 'R': ORANGE };
    let lastMode = '';
    for (let i = 0; i < dataPoints.length; i++) {
      const mode = dataPoints[i].driveMode;
      if (mode && mode !== lastMode) {
        const fx = graphX + i * step;
        const mColor = modeColors[mode] || '#666';
        doc.fillColor(mColor).circle(fx, graphY + 6, 5).fill();
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(5);
        doc.text(mode, fx - 2, graphY + 4);
        lastMode = mode;
      }
    }
  }

  const metricsLegend = [
    { color: BLUE, label: 'Speed' },
    { color: RED, label: 'kW' },
    { color: ORANGE, label: 'Amps' },
    { color: GREEN, label: 'SOC%' },
    { color: PURPLE, label: 'RPM' },
  ];
  const legendY = y + h - 8;
  doc.font('Helvetica').fontSize(4).fillColor(GRAY);
  let lx = graphX;
  metricsLegend.forEach(m => {
    doc.strokeColor(m.color).lineWidth(1.5);
    doc.moveTo(lx, legendY).lineTo(lx + 12, legendY).stroke();
    doc.fillColor(BLACK).text(m.label, lx + 14, legendY - 2);
    lx += 50;
  });

  doc.fillColor(GRAY).text('Mode: N=Normal E=Eco D=Dock S=Sport R=Rev H=Regen', lx + 30, legendY - 2);
}

export async function generateTripPDF(res: Response, trip: TripData): Promise<void> {
  console.log('[PDF Generator] ====== GENERATING PDF ======');
  console.log('[PDF Generator] Trip ID:', trip.id);
  console.log('[PDF Generator] Motor serial:', trip.motorSerialNumber);
  
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const now = new Date();
  const serial = trip.motorSerialNumber || 'N/A';
  const tripId = trip.tripId || trip.id;
  const tripSeconds = getTripSeconds(trip.startTime, trip.endTime);
  const tripMinutes = tripSeconds / 60;
  const co2Saved = calculateCO2Saved(tripMinutes);
  const detailPages = Math.max(1, Math.ceil(tripSeconds / 600));
  const totalPages = 3 + detailPages + 1; // Page 1: Intro, Page 2: Summary, Page 3: Map Detail, Pages 4+: Trip Detail, Final: Conclusion
  
  console.log('[PDF Generator] Trip seconds:', tripSeconds);
  console.log('[PDF Generator] CO2 saved:', co2Saved, 'kg');
  console.log('[PDF Generator] Total pages:', totalPages);
  
  const logoPath = path.join(process.cwd(), 'server', 'blade-logo.png');
  console.log('[PDF Generator] Logo path:', logoPath);
  
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

  const pdfChunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => pdfChunks.push(chunk));
  const pdfReady = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
    doc.on('error', reject);
  });

  const allDataPoints = trip.dataPoints || [];
  const gpsCoords = extractGPSCoords(allDataPoints, trip.phoneGPSStart, trip.phoneGPSEnd);
  let tileCache: TileCache | null = null;
  try {
    tileCache = await prefetchMapTiles(gpsCoords);
    console.log('[PDF Generator] Tile cache:', tileCache ? `${tileCache.tiles.size} tiles at zoom ${tileCache.zoom}` : 'null');
  } catch (err) {
    console.error('[PDF] Tile pre-fetch error:', err);
  }

  const tripStartMs = new Date(trip.startTime).getTime();

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
    const qrSize = 28;
    drawQRCode(doc, MARGIN_LEFT, y, qrSize, serial);
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
    
    // Certification logos on the right (using actual image, maintain aspect ratio)
    const logoHeight = 18;
    const logoY = y + 2;
    const logosStartX = PAGE_WIDTH - MARGIN_RIGHT - 90;
    
    drawCertificationLogos(doc, logosStartX, logoY, logoHeight);
    
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
  newPage('OUTBOARD TRIP REPORT', 'Electric Motor Performance & Telemetry Documentation');
  
  let y = CONTENT_START_Y;
  
  const introTextEn = 'This document contains telemetry and operational data collected from a Blade electric outboard motor during the recorded session. Data includes speed, power consumption, battery status, GPS coordinates, and environmental conditions. This report is auto-generated and provided for documentation and analysis purposes.';
  const introTextDe = 'Dieses Dokument enthält Telemetrie- und Betriebsdaten eines Blade-Elektro-Außenbordmotors. Automatisch erstellt für Dokumentations- und Analysezwecke.';
  const introTextIt = 'Questo documento contiene dati di telemetria e operativi di un motore fuoribordo elettrico Blade. Generato automaticamente a scopo di documentazione e analisi.';
  const introTextEs = 'Este documento contiene datos telemétricos y operativos de un motor fueraborda eléctrico Blade. Generado automáticamente con fines de documentación y análisis.';

  doc.font('Helvetica').fontSize(5.5).fillColor(GRAY);
  doc.text(`EN: ${introTextEn}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 16;
  doc.text(`DE: ${introTextDe}  IT: ${introTextIt}  ES: ${introTextEs}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 18;

  const leftColX = MARGIN_LEFT;
  const rightColX = MARGIN_LEFT + colHalf + 20;
  let leftY = y;
  let rightY = y;

  // Draw section container for Device Info
  // Height: base 200 (for Device Type row) + 70 for boat info section if present
  const deviceInfoHeight = trip.boatInfo ? 270 : 200;
  drawSectionBox(leftColX - 4, leftY - 2, colHalf + 8, deviceInfoHeight, 'Device Information');
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
  leftY = drawTableRow(leftY, ['Device Name', s(trip.phoneName)], [col2, col2], false, '#fff');
  leftY = drawTableRow(leftY, ['Device Type', s(trip.phoneDeviceType)], [col2, col2]);
  leftY = drawTableRow(leftY, ['Operating System', s(trip.phoneOS)], [col2, col2], false, '#fff');
  leftY = drawTableRow(leftY, ['Connection Type', s(trip.connectionType, 'Bluetooth')], [col2, col2]);
  leftY += 10;

  // Boat Information Section
  console.log('[PDF] Rendering boat info:', trip.boatInfo);
  if (trip.boatInfo) {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK);
    doc.text('Boat Information', leftColX, leftY);
    leftY += 10;
    leftY = drawTableRow(leftY, ['Field', 'Value'], [col2, col2], true);
    if (trip.boatInfo.vesselName) {
      leftY = drawTableRow(leftY, ['Vessel Name', trip.boatInfo.vesselName], [col2, col2]);
    }
    leftY = drawTableRow(leftY, ['Type', trip.boatInfo.boatType], [col2, col2], false, '#fff');
    const lengthFt = (trip.boatInfo.lengthMeters * 3.28084).toFixed(1);
    const lengthM = trip.boatInfo.lengthMeters.toFixed(1);
    leftY = drawTableRow(leftY, ['Length', `${lengthFt} ft (${lengthM} m)`], [col2, col2]);
    const weightLbs = (trip.boatInfo.weightKg * 2.20462).toFixed(0);
    const weightKg = trip.boatInfo.weightKg.toFixed(0);
    leftY = drawTableRow(leftY, ['Weight', `${weightLbs} lbs (${weightKg} kg)`], [col2, col2], false, '#fff');
    if (trip.boatInfo.vin) {
      leftY = drawTableRow(leftY, ['VIN / HIN', trip.boatInfo.vin], [col2, col2]);
    }
  }

  doc.save();
  const origLeft = MARGIN_LEFT;
  (doc as any).x = rightColX;
  
  // Draw section container for Report Info
  drawSectionBox(rightColX - 4, rightY - 2, colHalf + 8, deviceInfoHeight, 'Report Information');
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
    ['GS1 SKU', GS1_SKU],
    ['CO2 Saved', `${co2Saved.toFixed(2)} kg`],
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
  const maxPhoneSpd = nv(trip.maxPhoneSpeedKmh);
  const maxOutboardSpd = nv(trip.maxOutboardSpeedKmh);
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
  doc.text(`Max Speed (Phone GPS): ${maxPhoneSpd.toFixed(1)} km/h / ${kmhToMph(maxPhoneSpd).toFixed(1)} mph / ${kmhToKn(maxPhoneSpd).toFixed(1)} kn`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`Max Speed (Outboard GPS): ${maxOutboardSpd.toFixed(1)} km/h / ${kmhToMph(maxOutboardSpd).toFixed(1)} mph / ${kmhToKn(maxOutboardSpd).toFixed(1)} kn`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`Avg Speed: ${avgSpd.toFixed(1)} km/h / ${kmhToMph(avgSpd).toFixed(1)} mph / ${kmhToKn(avgSpd).toFixed(1)} kn`, leftSummaryX, leftSummaryY, { width: halfWidth - 5 });
  leftSummaryY += 9;
  doc.text(`Odometer: ${odomEnd.toFixed(2)} km`, leftSummaryX, leftSummaryY);
  
  // Right column: Battery, Energy & Weather
  drawSectionBox(rightSummaryX - 4, y - 2, halfWidth + 8, 120, 'Battery, Energy & Weather');
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
  let startWeatherStr = formatWeather(trip.startWeather);
  if (trip.startWeather?.sunrise) startWeatherStr += ` | Rise: ${trip.startWeather.sunrise}`;
  if (trip.startWeather?.sunset) startWeatherStr += ` Set: ${trip.startWeather.sunset}`;
  doc.text(`Start: ${startWeatherStr}`, rightSummaryX + weatherIconSize + 4, rightSummaryY + 2, { width: halfWidth - weatherIconSize - 10 });
  rightSummaryY += 14;
  
  drawWeatherIcon(doc, rightSummaryX, rightSummaryY, weatherIconSize, endWeatherCond);
  let endWeatherStr = formatWeather(trip.endWeather);
  if (trip.endWeather?.sunrise) endWeatherStr += ` | Rise: ${trip.endWeather.sunrise}`;
  if (trip.endWeather?.sunset) endWeatherStr += ` Set: ${trip.endWeather.sunset}`;
  doc.text(`End: ${endWeatherStr}`, rightSummaryX + weatherIconSize + 4, rightSummaryY + 2, { width: halfWidth - weatherIconSize - 10 });
  
  y += 128;
  
  // Error Codes Section
  const errorBoxHeight = 32;
  drawSectionBox(MARGIN_LEFT - 4, y - 2, CONTENT_WIDTH + 8, errorBoxHeight, 'Error Codes (E00-E99)');
  y += 6;
  const errorColWidth = CONTENT_WIDTH / 3;
  doc.font('Helvetica-Bold').fontSize(6).fillColor(BLACK);
  doc.text('At Start', MARGIN_LEFT, y, { width: errorColWidth });
  doc.text('During Trip', MARGIN_LEFT + errorColWidth, y, { width: errorColWidth });
  doc.text('At End', MARGIN_LEFT + errorColWidth * 2, y, { width: errorColWidth });
  y += 10;
  doc.font('Helvetica').fontSize(5.5).fillColor(GRAY);
  doc.text(formatErrorCodes(trip.errorCodesStart), MARGIN_LEFT, y, { width: errorColWidth - 5 });
  doc.text(formatErrorCodes(trip.errorCodesDuring), MARGIN_LEFT + errorColWidth, y, { width: errorColWidth - 5 });
  doc.text(formatErrorCodes(trip.errorCodesEnd), MARGIN_LEFT + errorColWidth * 2, y, { width: errorColWidth - 5 });
  y += errorBoxHeight - 12;
  
  // Locations (full width)
  drawSectionBox(MARGIN_LEFT - 4, y - 2, CONTENT_WIDTH + 8, 32, 'Locations');
  y += 6;
  doc.font('Helvetica').fontSize(5.5).fillColor(BLACK);
  doc.text(`Start: ${s(trip.startLocationAddress, 'GPS coordinates only')}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 8;
  doc.text(`End: ${s(trip.endLocationAddress, 'GPS coordinates only')}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 22;

  // Map (reduced height to account for error codes section)
  const mapH = 140;
  drawMap(doc, MARGIN_LEFT, y, CONTENT_WIDTH, mapH, gpsCoords, tileCache);
  y += mapH + 8;

  // Graph (reduced height, check if fits before footer)
  const graphH = 100;
  const availableHeight = FOOTER_Y - y - 20;
  if (availableHeight > 80) {
    const speedVals = allDataPoints.map((dp: any) => dp.phoneSpeedKmh ?? dp.outboardSpeedKmh).filter((v: any) => v != null && !isNaN(v)).map(Number);
    const consumptionVals = allDataPoints.map((dp: any) => dp.consumptionKW).filter((v: any) => v != null && !isNaN(v)).map(Number);
    const batteryVals = allDataPoints.map((dp: any) => dp.batterySOC).filter((v: any) => v != null && !isNaN(v)).map(Number);
    drawGraph(doc, MARGIN_LEFT, y, CONTENT_WIDTH, Math.min(graphH, availableHeight), 
      { speed: speedVals, consumption: consumptionVals, battery: batteryVals }, 'Trip Overview - Speed, Power & Battery');
  }

  // ========== PAGE 3: MAP DETAIL ==========
  newPage('MAP DETAIL', 'Route Visualization & GPS Coordinates');
  
  y = CONTENT_START_Y;
  
  // Trip info header
  const tripStartUTC = trip.startTime ? new Date(trip.startTime).toISOString() : 'N/A';
  const tripEndUTC = trip.endTime ? new Date(trip.endTime).toISOString() : 'N/A';
  
  doc.font('Helvetica').fontSize(6).fillColor(BLACK);
  doc.text(`Serial: ${serial}  |  Trip ID: ${tripId}`, MARGIN_LEFT, y);
  y += 10;
  doc.text(`Trip Start (UTC): ${tripStartUTC}  |  Trip End (UTC): ${tripEndUTC}`, MARGIN_LEFT, y);
  y += 14;
  
  // Large detailed map (70% of available height)
  const mapDetailHeight = Math.floor((FOOTER_Y - CONTENT_START_Y - 40) * 0.7);
  drawSectionBox(MARGIN_LEFT - 4, y - 2, CONTENT_WIDTH + 8, mapDetailHeight + 10, 'Route Map');
  y += 6;
  drawMap(doc, MARGIN_LEFT, y, CONTENT_WIDTH, mapDetailHeight, gpsCoords, tileCache);
  y += mapDetailHeight + 14;
  
  // Calculate straight-line distance using Haversine formula
  function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  const straightLineKm = (trip.phoneGPSStart && trip.phoneGPSEnd) 
    ? haversineDistance(trip.phoneGPSStart.latitude, trip.phoneGPSStart.longitude, 
                        trip.phoneGPSEnd.latitude, trip.phoneGPSEnd.longitude)
    : 0;
  const totalRouteKm = trip.totalDistanceKm || 0;
  
  // GPS Coordinates and Distance detail
  drawSectionBox(MARGIN_LEFT - 4, y - 2, CONTENT_WIDTH + 8, 70, 'GPS Coordinates & Distance');
  y += 8;
  
  const coordColWidth = CONTENT_WIDTH / 3;
  doc.font('Helvetica-Bold').fontSize(6).fillColor(BLACK);
  doc.text('Start Location', MARGIN_LEFT, y, { width: coordColWidth });
  doc.text('End Location', MARGIN_LEFT + coordColWidth, y, { width: coordColWidth });
  doc.text('Distance Traveled', MARGIN_LEFT + coordColWidth * 2, y, { width: coordColWidth });
  y += 10;
  
  doc.font('Helvetica').fontSize(5.5).fillColor(GRAY);
  const startLat = trip.phoneGPSStart?.latitude?.toFixed(6) || 'N/A';
  const startLon = trip.phoneGPSStart?.longitude?.toFixed(6) || 'N/A';
  const endLat = trip.phoneGPSEnd?.latitude?.toFixed(6) || 'N/A';
  const endLon = trip.phoneGPSEnd?.longitude?.toFixed(6) || 'N/A';
  
  doc.text(`Lat: ${startLat}`, MARGIN_LEFT, y, { width: coordColWidth });
  doc.text(`Lat: ${endLat}`, MARGIN_LEFT + coordColWidth, y, { width: coordColWidth });
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor(BLACK);
  doc.text('Straight Line:', MARGIN_LEFT + coordColWidth * 2, y, { width: coordColWidth });
  y += 8;
  
  doc.font('Helvetica').fontSize(5.5).fillColor(GRAY);
  doc.text(`Lon: ${startLon}`, MARGIN_LEFT, y, { width: coordColWidth });
  doc.text(`Lon: ${endLon}`, MARGIN_LEFT + coordColWidth, y, { width: coordColWidth });
  doc.text(`${straightLineKm.toFixed(2)} km / ${kmToMi(straightLineKm).toFixed(2)} mi / ${kmToNm(straightLineKm).toFixed(2)} NM`, MARGIN_LEFT + coordColWidth * 2, y, { width: coordColWidth });
  y += 10;
  
  doc.text(s(trip.startLocationAddress, 'Address N/A'), MARGIN_LEFT, y, { width: coordColWidth - 5 });
  doc.text(s(trip.endLocationAddress, 'Address N/A'), MARGIN_LEFT + coordColWidth, y, { width: coordColWidth - 5 });
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor(BLACK);
  doc.text('Total Route:', MARGIN_LEFT + coordColWidth * 2, y, { width: coordColWidth });
  y += 8;
  doc.font('Helvetica').fontSize(5.5).fillColor(GRAY);
  doc.text(`${Number(totalRouteKm).toFixed(2)} km / ${kmToMi(Number(totalRouteKm)).toFixed(2)} mi / ${kmToNm(Number(totalRouteKm)).toFixed(2)} NM`, MARGIN_LEFT + coordColWidth * 2, y, { width: coordColWidth });

  // ========== PAGE 4+: TRIP DETAIL ==========
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
      
      const segmentDataPoints = allDataPoints.filter((dp: any) => {
        if (!dp.timestamp) return false;
        const dpMs = new Date(dp.timestamp).getTime();
        const offsetSec = (dpMs - tripStartMs) / 1000;
        return offsetSec >= gStart && offsetSec < gEnd;
      });
      drawDetailGraph(doc, MARGIN_LEFT, y, CONTENT_WIDTH, detailGraphH, 
        `Segment ${g + 1}: ${gStartStr} - ${gEndStr}`, segmentDataPoints);
      
      y += detailGraphH + 6;
    }
  }

  // ========== FINAL PAGE: CONCLUSION (2-column) ==========
  newPage('CONCLUSION & DISCLAIMERS', 'DE: Abschluss | IT: Conclusione | ES: Conclusión');
  
  y = CONTENT_START_Y;
  
  // Row 1: Trip Summary (left) and Data Interpretation Guide (right)
  const row1Height = 175;
  leftY = y;
  rightY = y;

  // LEFT: Trip Summary box
  drawSectionBox(leftColX - 4, leftY - 2, colHalf + 8, row1Height, 'Trip Summary');
  leftY += 8;
  
  // Performance metrics table (compact)
  const perfRows = [
    ['Distance', `${dist.toFixed(2)} km / ${kmToMi(dist).toFixed(2)} mi / ${kmToNm(dist).toFixed(2)} nm`],
    ['Odometer', `${odomEnd.toFixed(2)} km`],
    ['Duration', formatDuration(trip.startTime, trip.endTime)],
    ['Energy', `${n(trip.totalEnergyWh)} Wh`],
    ['Max Speed (Phone)', `${maxPhoneSpd.toFixed(1)} km/h (${kmhToKn(maxPhoneSpd).toFixed(1)} kn)`],
    ['Max Speed (Outboard)', `${maxOutboardSpd.toFixed(1)} km/h (${kmhToKn(maxOutboardSpd).toFixed(1)} kn)`],
    ['Avg Speed', `${avgSpd.toFixed(1)} km/h (${kmhToKn(avgSpd).toFixed(1)} kn)`],
    ['Max Power', `${n(trip.maxConsumptionKW, 2)} kW`],
    ['RPM Max/Avg', `${n(trip.rpmMax, 0)} / ${n(trip.rpmAvg, 0)}`],
    ['Serial', serial],
    ['Trip ID', tripId.substring(0, 20)],
    ['End Reason', s(trip.endReason, 'User')],
  ];
  
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor(BLACK);
  doc.fillColor('#f5f5f5').rect(leftColX, leftY, colHalf, 11).fill();
  doc.fillColor(BLACK).text('Metric', leftColX + 3, leftY + 2, { width: col2 - 6 });
  doc.text('Value', leftColX + col2 + 3, leftY + 2, { width: col2 - 6 });
  leftY += 11;

  perfRows.forEach((row, i) => {
    if (i % 2 === 0) doc.fillColor('#fafafa').rect(leftColX, leftY, colHalf, 11).fill();
    doc.font('Helvetica').fontSize(5.5).fillColor(BLACK);
    doc.text(row[0], leftColX + 3, leftY + 2, { width: col2 - 6 });
    doc.text(row[1], leftColX + col2 + 3, leftY + 2, { width: col2 - 6 });
    leftY += 11;
  });

  // RIGHT: Data Interpretation Guide box
  drawSectionBox(rightColX - 4, rightY - 2, colHalf + 8, row1Height, 'Data Interpretation Guide');
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
    { icon: 'speed', title: 'Speed', text: 'GPS and motor telemetry. Values in km/h, mph, kn.' },
    { icon: 'distance', title: 'Distance', text: 'GPS position changes. Odometer = total motor distance.' },
    { icon: 'battery', title: 'Battery', text: 'BMS state of charge. N/A if not connected.' },
    { icon: 'energy', title: 'Energy/CO2', text: 'Wh consumed. CO2 = minutes × 0.14833 kg.' },
    { icon: 'power', title: 'Power', text: 'Instantaneous kW and A demand from VESC.' },
    { icon: 'rpm', title: 'RPM', text: 'Motor rotational speed from telemetry.' },
    { icon: 'time', title: 'Timing', text: 'Start/end times in local and UTC.' },
    { icon: 'location', title: 'Location', text: 'GPS coordinates from mobile device.' },
    { icon: 'weather', title: 'Weather', text: 'Conditions at trip start/end with sunrise/sunset.' },
    { icon: 'na', title: 'N/A', text: 'Data not reported during this session.' },
  ];
  
  doc.font('Helvetica').fontSize(5).fillColor(BLACK);
  guideItems.forEach(item => {
    drawGuideIcon(rightColX, rightY, item.icon);
    doc.font('Helvetica-Bold').fontSize(5).text(item.title + ':', rightColX + 12, rightY, { continued: true });
    doc.font('Helvetica').text(' ' + item.text, { width: colHalf - 18 });
    rightY += 14;
  });

  // Row 2: Environmental Impact (left) and Report Uses (right)
  const row2Y = CONTENT_START_Y + row1Height + 5;
  const row2Height = 55;
  
  // LEFT: Environmental Impact with leaf icon
  drawSectionBox(leftColX - 4, row2Y - 2, colHalf + 8, row2Height, 'Environmental Impact');
  
  // Draw leaf icon
  const leafX = leftColX + 8;
  const leafY = row2Y + 15;
  doc.save();
  doc.strokeColor('#228B22').fillColor('#228B22').lineWidth(1.5);
  doc.moveTo(leafX, leafY + 12).quadraticCurveTo(leafX + 6, leafY, leafX + 18, leafY + 4)
     .quadraticCurveTo(leafX + 12, leafY + 10, leafX, leafY + 12).fill();
  doc.strokeColor('#228B22').lineWidth(0.8);
  doc.moveTo(leafX + 2, leafY + 10).quadraticCurveTo(leafX + 10, leafY + 6, leafX + 16, leafY + 5).stroke();
  doc.restore();
  
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#228B22');
  doc.text(`${co2Saved.toFixed(2)} kg`, leftColX + 35, row2Y + 12);
  doc.font('Helvetica').fontSize(6).fillColor(GRAY);
  doc.text('CO2 Saved vs Petrol Outboard', leftColX + 35, row2Y + 28);

  // RIGHT: Report Uses
  drawSectionBox(rightColX - 4, row2Y - 2, colHalf + 8, row2Height, 'Report Uses');
  
  doc.font('Helvetica').fontSize(5).fillColor(BLACK);
  const usesText = `Social sharing • Record keeping • Maintenance logs • Efficiency analysis • Warranty documentation • Service records • Insurance claims`;
  doc.text(usesText, rightColX + 2, row2Y + 12, { width: colHalf - 4 });

  // Calculate y for remaining content
  y = row2Y + row2Height + 8;
  
  doc.strokeColor(LIGHT_GRAY).lineWidth(0.5);
  doc.moveTo(MARGIN_LEFT, y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y).stroke();
  y += 5;

  // ISO Standards
  doc.font('Helvetica-Bold').fontSize(5).fillColor(BLACK);
  doc.text('ISO Standards Used:', MARGIN_LEFT, y);
  y += 6;
  doc.font('Helvetica').fontSize(4).fillColor(GRAY);
  doc.text('ISO 8178-4 (CO2 baseline) • ISO 16315 (Electric propulsion) • ISO 12217 (Stability) • ISO 10005 (Quality) • ISO 19650 (Information) • ISO 8601 (Date/time) • WGS 84 (GPS)', MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 8;

  // Legal Disclaimer
  doc.font('Helvetica-Bold').fontSize(5).fillColor(BLACK);
  doc.text('Legal Disclaimer', MARGIN_LEFT, y);
  y += 6;
  
  doc.font('Helvetica').fontSize(4).fillColor(GRAY);
  const disclaimer = `This report is automatically generated by the Blade Outboards mobile application and is provided for informational and documentation purposes only. While Blade Marine Technologies Limited ("Blade") makes reasonable efforts to ensure the accuracy of data collected from the outboard motor's sensors, GPS systems, and battery management components, Blade makes no representations or warranties, express or implied, regarding the completeness, accuracy, reliability, or fitness of this information for any particular purpose. Sensor readings may be affected by environmental conditions, electromagnetic interference, temperature variation, device calibration, and connectivity limitations. GPS accuracy is dependent on satellite availability and atmospheric factors. Users should not rely solely on this report for navigation, safety decisions, operational control, or legal purposes. This document does not constitute a warranty claim, official service record, or regulatory compliance documentation. Blade expressly disclaims any liability for loss, damage, injury, or claims arising from the use of, or reliance upon, any data contained herein. The outboard motor and its components remain subject exclusively to the terms of the original purchase warranty, which this report does not extend, modify, or replace.`;
  doc.text(disclaimer, MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'justify' });
  y += 38;

  // Safe Boating with translations
  doc.font('Helvetica-Bold').fontSize(5).fillColor(BLACK);
  doc.text('SAFE BOATING | SICHERES BOOTFAHREN | NAVIGAZIONE SICURA | NAVEGACIÓN SEGURA', MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 6;
  
  doc.font('Helvetica').fontSize(3.5).fillColor(GRAY);
  const safeBoating = `EN: Always wear an approved personal flotation device. Never operate under the influence of alcohol or drugs. Check weather before departure. File a float plan. Maintain lookout at all times. Know and obey maritime regulations.
DE: Tragen Sie stets eine zugelassene Rettungsweste. Fahren Sie niemals unter Alkohol- oder Drogeneinfluss. Prüfen Sie vor der Abfahrt das Wetter. Hinterlassen Sie einen Fahrtenplan. Halten Sie stets Ausschau. Beachten Sie alle Seeverkehrsvorschriften.
IT: Indossare sempre un dispositivo di galleggiamento approvato. Non navigare sotto l'effetto di alcol o droghe. Controllare il meteo prima della partenza. Lasciare un piano di navigazione. Mantenere sempre la vedetta. Rispettare le norme marittime.
ES: Use siempre un chaleco salvavidas homologado. Nunca opere bajo la influencia del alcohol o drogas. Consulte el clima antes de zarpar. Deje un plan de navegación. Mantenga vigilancia en todo momento. Conozca y obedezca las regulaciones marítimas.`;
  doc.text(safeBoating, MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 28;
  
  // Website
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLADE_GREEN);
  doc.text('bladeoutboards.com', MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: 'center' });

  // Company chop (bottom right, above footer line and UKCA logos)
  const chopPath = path.join(process.cwd(), 'server', 'company-chop.png');
  try {
    if (fs.existsSync(chopPath)) {
      const chopSize = 45;
      const chopX = PAGE_WIDTH - MARGIN_RIGHT - chopSize - 25;
      const chopY = FOOTER_Y - 8 - chopSize - 5; // Above footer line
      doc.image(chopPath, chopX, chopY, { height: chopSize });
    }
  } catch (e) {
    console.error('[PDF] Company chop error:', e);
  }

  console.log('[PDF Generator] ====== PDF GENERATION COMPLETE ======');
  console.log('[PDF Generator] Calling doc.end()...');
  doc.end();

  const pdfBuffer = await pdfReady;
  console.log('[PDF Generator] PDF buffered successfully, size:', pdfBuffer.length, 'bytes');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Blade_Trip_Report_${tripId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.end(pdfBuffer);
  console.log('[PDF Generator] PDF sent to client');
}
