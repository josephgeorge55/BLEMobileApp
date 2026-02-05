export interface TripDataPoint {
  timestamp: Date;
  phoneLatitude: number | null;
  phoneLongitude: number | null;
  phoneSpeedKmh: number | null;
  outboardLatitude: number | null;
  outboardLongitude: number | null;
  outboardSpeedKmh: number | null;
  batterySOC: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  consumptionKW: number | null;
  phaseAmperage: number | null;
  rpm: number | null;
  motorTemp: number | null;
  vescTemp: number | null;
  throttlePercent: number | null;
  driveMode: 'N' | 'E' | 'D' | 'S' | null;
  isReverse: boolean;
  isHydroRegen: boolean;
}

export interface WeatherSnapshot {
  timestamp: Date;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  conditions: string | null;
  pressure: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface ErrorCode {
  code: string;
  description: string;
  timestamp: Date;
}

export type TripEndReason = 
  | 'user_button'
  | 'auto_8hr_limit'
  | 'auto_inactivity_600s'
  | 'app_closure';

export interface BoatInfo {
  boatType: string;
  lengthMeters: number;
  weightKg: number;
  vesselName?: string;
  vin?: string;
}

export interface ExtendedTrip {
  id: string;
  tripId: string;
  userId: string;
  userEmail: string | null;
  userFirestoreId: string | null;
  motorSerialNumber: string;
  name: string;
  
  startTime: Date;
  endTime: Date | null;
  isActive: boolean;
  endReason: TripEndReason | null;
  
  startBatteryPercent: number | null;
  endBatteryPercent: number | null;
  totalDistanceKm: number;
  maxSpeedKmh: number;
  maxPhoneSpeedKmh: number;
  maxOutboardSpeedKmh: number;
  avgSpeedKmh: number;
  totalEnergyWh: number;
  
  startWeather: WeatherSnapshot | null;
  endWeather: WeatherSnapshot | null;
  hourlyWeather: WeatherSnapshot[];
  
  phoneGPSStart: { latitude: number; longitude: number } | null;
  phoneGPSEnd: { latitude: number; longitude: number } | null;
  outboardGPSStart: { latitude: number; longitude: number } | null;
  outboardGPSEnd: { latitude: number; longitude: number } | null;
  
  startLocationAddress: string | null;
  endLocationAddress: string | null;
  
  errorCodesStart: ErrorCode[];
  errorCodesDuring: ErrorCode[];
  errorCodesEnd: ErrorCode[];
  
  maxAmperageDraw: number;
  maxConsumptionKW: number;
  avgConsumptionKW: number;
  rpmMax: number;
  rpmAvg: number;
  
  connectionType: 'Bluetooth Classic' | 'BLE' | 'Demo';
  
  dataPoints: TripDataPoint[];
  
  odometerStartKm: number;
  odometerEndKm: number;
  
  firmwareVersion: string | null;
  hardwareVersion: string;
  phoneAppVersion: string | null;
  phoneName: string | null;
  phoneDeviceType: string | null;
  phoneOS: string | null;
  bluetoothMacAddress: string | null;
  
  boatInfo: BoatInfo | null;
}

export interface TripReportMetadata {
  reportId: string;
  generatedAt: Date;
  generatedAtUTC: string;
  generatedAtLocal: string;
  generatedAtTimezone: string;
  phoneIPAddress: string | null;
  phoneIPLocation: string | null;
  gpsCoordinatesAtGeneration: { latitude: number; longitude: number } | null;
  weatherAtGeneration: WeatherSnapshot | null;
  pageCount: number;
  pdfStandard: string;
  fontsUsed: string[];
  paperSize: string;
}

export interface TripReport {
  trip: ExtendedTrip;
  metadata: TripReportMetadata;
}
