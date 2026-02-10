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

export interface INFORG1Data {
  firmwareVersion: string;
  serialNumber: string;
  deviceName: string;
}

export interface INFORG2Data {
  odometer: number;
  driverMode: "Eco" | "Normal" | "Sport" | "Docking";
  errorCode: string | null;
  errorDescription: string | null;
}

export type INFORData = INFORG1Data | INFORG2Data;

export const ERROR_CODES: Record<string, { description: string; cause: string }> = {
  E01: { description: "Overvoltage", cause: "Battery voltage > 65V" },
  E02: { description: "Undervoltage", cause: "Battery voltage < 42V" },
  E03: { description: "BMS over temperature", cause: "Temperature > 85°C" },
  E04: { description: "VESC over temperature", cause: "Temperature > 85°C" },
  E05: { description: "Motor over temperature", cause: "Temperature > 85°C" },
  E06: { description: "GPS not found", cause: "GPS not found" },
  E07: { description: "VESC not found", cause: "VESC not found" },
  E08: { description: "BMS not found", cause: "BMS not found" },
};

export type FrameType = "GNSS" | "BMS" | "MOTOR" | "VESC" | "INFOR";

export interface ParseResult {
  type: FrameType;
  group: string;
  data: GNSSData | BMSData | MotorData | VESCData | INFORData;
}

export function parseGNSSFrame(fields: string[]): GNSSData | null {
  if (fields.length < 5) return null;
  const timeUTC = fields[0];
  const latitude = parseFloat(fields[1]);
  const longitude = parseFloat(fields[2]);
  const course = parseFloat(fields[3]);
  const speed = parseFloat(fields[4]);
  if (isNaN(latitude) || isNaN(longitude) || isNaN(course) || isNaN(speed)) return null;
  return { timeUTC, latitude, longitude, course, speed };
}

export function parseBMSFrame(fields: string[]): BMSData | null {
  if (fields.length < 5) return null;
  const voltage = parseFloat(fields[0]);
  const capacity = parseInt(fields[1], 10);
  const current = parseFloat(fields[2]);
  const wattage = parseInt(fields[3], 10);
  const temperature = parseInt(fields[4], 10);
  if (isNaN(voltage) || isNaN(capacity) || isNaN(current) || isNaN(wattage) || isNaN(temperature)) return null;
  return { voltage, capacity, current, wattage, temperature };
}

export function parseMotorFrame(fields: string[]): MotorData | null {
  if (fields.length < 3) return null;
  const phaseCurrent = parseFloat(fields[0]);
  const motorRPM = parseInt(fields[1], 10);
  const temperature = parseInt(fields[2], 10);
  if (isNaN(phaseCurrent) || isNaN(motorRPM) || isNaN(temperature)) return null;
  return { phaseCurrent, motorRPM, temperature };
}

export function parseVESCFrame(fields: string[]): VESCData | null {
  if (fields.length < 5) return null;
  const voltage = parseFloat(fields[0]);
  const current = parseFloat(fields[1]);
  const wattage = parseInt(fields[2], 10);
  const throttle = parseInt(fields[3], 10);
  const temperature = parseInt(fields[4], 10);
  if (isNaN(voltage) || isNaN(current) || isNaN(wattage) || isNaN(throttle) || isNaN(temperature)) return null;
  return { voltage, current, wattage, throttle, temperature };
}

export function parseINFORG1Frame(fields: string[]): INFORG1Data | null {
  if (fields.length < 2) return null;

  const field0 = fields[0].trim();
  const field1 = fields[1].trim();
  const field2 = fields.length >= 3 ? fields[2].trim() : "";

  if (!field0 || !field1) return null;

  const isVersionPattern = (s: string) => /^v?\d+\.\d+(\.\d+)?$/i.test(s);

  let serialNumber: string;
  let firmwareVersion: string;

  if (isVersionPattern(field0) && !isVersionPattern(field1)) {
    firmwareVersion = field0.replace(/^v/i, "");
    serialNumber = field1;
  } else if (!isVersionPattern(field0) && isVersionPattern(field1)) {
    serialNumber = field0;
    firmwareVersion = field1.replace(/^v/i, "");
  } else {
    serialNumber = field0;
    firmwareVersion = field1.replace(/^v/i, "");
  }

  const deviceName = field2 || "";

  return { firmwareVersion, serialNumber, deviceName };
}

export function parseINFORG2Frame(fields: string[]): INFORG2Data | null {
  if (fields.length < 3) return null;
  const odometer = parseFloat(fields[0]);
  const modeStr = fields[1].trim();
  const errorStr = fields[2].trim();
  if (isNaN(odometer)) return null;

  const validModes = ["Eco", "Normal", "Sport", "Docking"];
  const matchedMode = validModes.find(m => m.toLowerCase() === modeStr.toLowerCase());
  const driverMode = matchedMode
    ? (matchedMode as "Eco" | "Normal" | "Sport" | "Docking")
    : "Normal";

  let errorCode: string | null = null;
  let errorDescription: string | null = null;

  if (errorStr && errorStr.match(/^E0[1-8]$/)) {
    errorCode = errorStr;
    const errorInfo = ERROR_CODES[errorCode];
    if (errorInfo) {
      errorDescription = errorInfo.description;
    }
  }

  return { odometer, driverMode, errorCode, errorDescription };
}

export function parseBLEFrame(frame: string): ParseResult | null {
  const trimmed = frame.trim();
  if (!trimmed.startsWith("$")) return null;

  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length < 3) return null;

  const frameType = parts[0].substring(1);
  const group = parts[1];
  const dataFields = parts.slice(2);

  switch (frameType) {
    case "GNSS": {
      const data = parseGNSSFrame(dataFields);
      if (data) return { type: "GNSS", group, data };
      break;
    }
    case "BMS": {
      const data = parseBMSFrame(dataFields);
      if (data) return { type: "BMS", group, data };
      break;
    }
    case "MOTOR": {
      const data = parseMotorFrame(dataFields);
      if (data) return { type: "MOTOR", group, data };
      break;
    }
    case "VESC": {
      const data = parseVESCFrame(dataFields);
      if (data) return { type: "VESC", group, data };
      break;
    }
    case "INFOR": {
      if (group === "G1") {
        const data = parseINFORG1Frame(dataFields);
        if (data) return { type: "INFOR", group, data };
      } else if (group === "G2") {
        const data = parseINFORG2Frame(dataFields);
        if (data) return { type: "INFOR", group, data };
      }
      break;
    }
  }

  return null;
}
