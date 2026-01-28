export interface GNSSData {
  timeUTC: string;
  latitude: number;
  longitude: number;
  course: number;
  speed: number;
}

export interface BMSData {
  voltage: number;
  capacity: number;
  current: number;
  wattage: number;
  temperature: number;
}

export interface MotorData {
  phaseCurrent: number;
  motorRPM: number;
  temperature: number;
}

export interface VESCData {
  voltage: number;
  current: number;
  wattage: number;
  throttle: number;
  temperature: number;
}

export interface ParsedTelemetry {
  gnss: GNSSData | null;
  bms: BMSData | null;
  motor: MotorData | null;
  vesc: VESCData | null;
  timestamp: Date;
}

export type FrameType = "GNSS" | "BMS" | "MOTOR" | "VESC";

export interface ParseResult {
  type: FrameType;
  group: string;
  data: GNSSData | BMSData | MotorData | VESCData;
}

export function parseGNSSFrame(fields: string[]): GNSSData | null {
  if (fields.length < 5) return null;
  
  const timeUTC = fields[0];
  const latitude = parseFloat(fields[1]);
  const longitude = parseFloat(fields[2]);
  const course = parseFloat(fields[3]);
  const speed = parseFloat(fields[4]);
  
  if (isNaN(latitude) || isNaN(longitude) || isNaN(course) || isNaN(speed)) {
    return null;
  }
  
  return { timeUTC, latitude, longitude, course, speed };
}

export function parseBMSFrame(fields: string[]): BMSData | null {
  if (fields.length < 5) return null;
  
  const voltage = parseFloat(fields[0]);
  const capacity = parseInt(fields[1], 10);
  const current = parseFloat(fields[2]);
  const wattage = parseInt(fields[3], 10);
  const temperature = parseInt(fields[4], 10);
  
  if (isNaN(voltage) || isNaN(capacity) || isNaN(current) || isNaN(wattage) || isNaN(temperature)) {
    return null;
  }
  
  return { voltage, capacity, current, wattage, temperature };
}

export function parseMotorFrame(fields: string[]): MotorData | null {
  if (fields.length < 3) return null;
  
  const phaseCurrent = parseFloat(fields[0]);
  const motorRPM = parseInt(fields[1], 10);
  const temperature = parseInt(fields[2], 10);
  
  if (isNaN(phaseCurrent) || isNaN(motorRPM) || isNaN(temperature)) {
    return null;
  }
  
  return { phaseCurrent, motorRPM, temperature };
}

export function parseVESCFrame(fields: string[]): VESCData | null {
  if (fields.length < 5) return null;
  
  const voltage = parseFloat(fields[0]);
  const current = parseFloat(fields[1]);
  const wattage = parseInt(fields[2], 10);
  const throttle = parseInt(fields[3], 10);
  const temperature = parseInt(fields[4], 10);
  
  if (isNaN(voltage) || isNaN(current) || isNaN(wattage) || isNaN(throttle) || isNaN(temperature)) {
    return null;
  }
  
  return { voltage, current, wattage, throttle, temperature };
}

export function parseBLEFrame(frame: string): ParseResult | null {
  const trimmed = frame.trim();
  
  if (!trimmed.startsWith("$")) {
    console.log(`[BLE-Parser] Frame doesn't start with $: "${trimmed.substring(0, 20)}"`);
    return null;
  }
  
  const parts = trimmed.split(",").map((p) => p.trim());
  
  if (parts.length < 3) {
    console.log(`[BLE-Parser] Not enough parts (${parts.length}): "${trimmed}"`);
    return null;
  }
  
  const frameType = parts[0].substring(1);
  const group = parts[1];
  const dataFields = parts.slice(2);
  
  console.log(`[BLE-Parser] Parsing: type=${frameType}, group=${group}, fields=[${dataFields.join(', ')}]`);
  
  switch (frameType) {
    case "GNSS": {
      const data = parseGNSSFrame(dataFields);
      if (data) {
        console.log(`[BLE-Parser] GNSS parsed OK:`, data);
        return { type: "GNSS", group, data };
      }
      console.log(`[BLE-Parser] GNSS parse failed for fields:`, dataFields);
      break;
    }
    case "BMS": {
      const data = parseBMSFrame(dataFields);
      if (data) {
        console.log(`[BLE-Parser] BMS parsed OK:`, data);
        return { type: "BMS", group, data };
      }
      console.log(`[BLE-Parser] BMS parse failed for fields:`, dataFields);
      break;
    }
    case "MOTOR": {
      const data = parseMotorFrame(dataFields);
      if (data) {
        console.log(`[BLE-Parser] MOTOR parsed OK:`, data);
        return { type: "MOTOR", group, data };
      }
      console.log(`[BLE-Parser] MOTOR parse failed for fields:`, dataFields);
      break;
    }
    case "VESC": {
      const data = parseVESCFrame(dataFields);
      if (data) {
        console.log(`[BLE-Parser] VESC parsed OK:`, data);
        return { type: "VESC", group, data };
      }
      console.log(`[BLE-Parser] VESC parse failed for fields:`, dataFields);
      break;
    }
    default:
      console.log(`[BLE-Parser] Unknown frame type: "${frameType}"`);
  }
  
  return null;
}

export function kphToKnots(kph: number): number {
  return kph * 0.539957;
}

export function rpmToKnots(rpm: number, propPitchInches: number = 12): number {
  const pitchFeet = propPitchInches / 12;
  const feetPerMinute = rpm * pitchFeet;
  const feetPerHour = feetPerMinute * 60;
  const nauticalMilesPerHour = feetPerHour / 6076.12;
  return nauticalMilesPerHour * 0.85;
}

export function formatUTCTime(timeUTC: string): string {
  if (timeUTC.length !== 6) return timeUTC;
  const hours = timeUTC.substring(0, 2);
  const minutes = timeUTC.substring(2, 4);
  const seconds = timeUTC.substring(4, 6);
  return `${hours}:${minutes}:${seconds}`;
}

export function generateMockGNSSFrame(lat: number, lng: number, speedKph: number, course: number): string {
  const now = new Date();
  const timeUTC = now.getUTCHours().toString().padStart(2, "0") +
    now.getUTCMinutes().toString().padStart(2, "0") +
    now.getUTCSeconds().toString().padStart(2, "0");
  return `$GNSS,G1,${timeUTC},${lat.toFixed(6)},${lng.toFixed(6)},${course.toFixed(1)},${speedKph.toFixed(1)}`;
}

export function generateMockBMSFrame(voltage: number, capacity: number, current: number, wattage: number, temp: number): string {
  return `$BMS,G1,${voltage.toFixed(1)},${capacity},${current.toFixed(1)},${wattage},${temp}`;
}

export function generateMockMotorFrame(phaseCurrent: number, rpm: number, temp: number): string {
  return `$MOTOR,G1,${phaseCurrent.toFixed(1)},${rpm},${temp}`;
}

export function generateMockVESCFrame(voltage: number, current: number, wattage: number, throttle: number, temp: number): string {
  return `$VESC,G1,${voltage.toFixed(1)},${current.toFixed(1)},${wattage},${throttle},${temp}`;
}
