import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import { fetchWeather, getWindDirection } from "@/services/weatherService";
import { uploadTripDataToFirestore } from "@/lib/firebase";
import { logTripStarted, logTripEnded } from "@/lib/remote-logger";
import { TripResumePrompt } from "@/components/TripResumePrompt";
import type { WeatherData } from "@/services/weatherService";
import type { Trip } from "@shared/schema";
import type { TripDataPoint, TripEndReason, WeatherSnapshot } from "@/types/TripReport";

const LOCAL_TRIPS_KEY = "@blade_local_trips";
const ACTIVE_TRIP_KEY = "@blade_active_trip";
const TRIP_DATA_POINTS_KEY = "@blade_trip_data_points";
const TRIP_WEATHER_KEY = "@blade_trip_weather";
const TRIP_RECORDING_STATE_KEY = "@blade_trip_recording_state";
const SETTINGS_STORAGE_KEY = "@blade_settings";

async function isDataSharingEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.anonymousDataSharing === true;
    }
    return false;
  } catch {
    return false;
  }
}
const DATA_RECORDING_INTERVAL = 4000;
const WEATHER_RECORDING_INTERVAL = 60 * 60 * 1000;
const MAX_TRIP_DURATION = 8 * 60 * 60;
const INACTIVITY_TIMEOUT = 600;
const MIN_TRIP_DURATION = 60;

function formatUnixToTime(unixTimestamp?: number): string | null {
  if (!unixTimestamp) return null;
  const date = new Date(unixTimestamp * 1000);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function weatherDataToSnapshot(data: WeatherData): WeatherSnapshot {
  return {
    timestamp: new Date(),
    temperature: data.current.temp,
    humidity: data.current.humidity,
    windSpeed: data.current.wind_speed,
    windDirection: getWindDirection(data.current.wind_deg),
    conditions: data.current.weather[0]?.description || null,
    pressure: data.current.pressure,
    sunrise: formatUnixToTime(data.current.sunrise),
    sunset: formatUnixToTime(data.current.sunset),
  };
}

interface TripStats {
  totalDistanceKm: number;
  totalEnergyWh: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxAmperageDraw: number;
  maxConsumptionKW: number;
  avgConsumptionKW: number;
  rpmMax: number;
  rpmAvg: number;
}

interface ExtendedTripLocal extends Trip {
  phoneGPSStart?: { latitude: number; longitude: number } | null;
  phoneGPSEnd?: { latitude: number; longitude: number } | null;
  outboardGPSStart?: { latitude: number; longitude: number } | null;
  outboardGPSEnd?: { latitude: number; longitude: number } | null;
  endReason?: TripEndReason;
  dataPointsCount?: number;
  startWeather?: WeatherSnapshot | null;
  endWeather?: WeatherSnapshot | null;
  hourlyWeather?: WeatherSnapshot[];
  startLocationAddress?: string | null;
  endLocationAddress?: string | null;
  firmwareVersion?: string | null;
  connectionType?: string;
  phoneAppVersion?: string | null;
  phoneName?: string | null;
  phoneDeviceType?: string | null;
  phoneOS?: string | null;
  userEmail?: string | null;
  userFirestoreId?: string | null;
  maxAmperageDraw?: number;
  maxConsumptionKW?: number;
  avgConsumptionKW?: number;
  rpmMax?: number;
  rpmAvg?: number;
  odometerStartKm?: number;
  odometerEndKm?: number;
  maxPhoneSpeedKmh?: number;
  maxOutboardSpeedKmh?: number;
}

async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const addr = results[0];
      const parts = [];
      if (addr.street) parts.push(addr.street);
      if (addr.city) parts.push(addr.city);
      if (addr.region) parts.push(addr.region);
      if (addr.country) parts.push(addr.country);
      return parts.length > 0 ? parts.join(', ') : null;
    }
    return null;
  } catch (error) {
    console.log("[Trip] Reverse geocoding failed:", error);
    return null;
  }
}

interface TripContextType {
  activeTrip: ExtendedTripLocal | null;
  isRecording: boolean;
  tripDuration: number;
  tripStats: TripStats;
  isLoading: boolean;
  startTrip: (name?: string) => Promise<boolean>;
  endTrip: (reason?: TripEndReason) => Promise<boolean>;
  getTripDataPoints: (tripId: string) => Promise<TripDataPoint[]>;
  pendingResumeTrip: ExtendedTripLocal | null;
  showResumePrompt: boolean;
  resumeTrip: () => void;
  dismissResumePrompt: () => void;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { motor, telemetry, location } = useMotor();
  const { user } = useUser();
  
  const [activeTrip, setActiveTrip] = useState<ExtendedTripLocal | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingResumeTrip, setPendingResumeTrip] = useState<ExtendedTripLocal | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [tripDuration, setTripDuration] = useState(0);
  const [tripStats, setTripStats] = useState<TripStats>({
    totalDistanceKm: 0,
    totalEnergyWh: 0,
    maxSpeedKmh: 0,
    avgSpeedKmh: 0,
    maxAmperageDraw: 0,
    maxConsumptionKW: 0,
    avgConsumptionKW: 0,
    rpmMax: 0,
    rpmAvg: 0,
  });

  // Refs to store current values for use in interval callbacks
  const telemetryRef = useRef(telemetry);
  const locationRef = useRef(location);
  const motorRef = useRef(motor);
  const tripStatsRef = useRef(tripStats);
  const activeTripRef = useRef(activeTrip);
  
  // Refs for timers
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Refs for calculations
  const lastPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const speedSamplesRef = useRef<number[]>([]);
  const consumptionSamplesRef = useRef<number[]>([]);
  const rpmSamplesRef = useRef<number[]>([]);
  const dataPointsRef = useRef<TripDataPoint[]>([]);
  const maxPhoneSpeedRef = useRef<number>(0);
  const maxOutboardSpeedRef = useRef<number>(0);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const endTripRef = useRef<((reason?: TripEndReason) => Promise<boolean>) | null>(null);
  const weatherTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hourlyWeatherRef = useRef<WeatherSnapshot[]>([]);
  const startWeatherRef = useRef<WeatherSnapshot | null>(null);

  // Keep refs in sync with state/props
  useEffect(() => { telemetryRef.current = telemetry; }, [telemetry]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { motorRef.current = motor; }, [motor]);
  useEffect(() => { tripStatsRef.current = tripStats; }, [tripStats]);
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);

  // Load active trip on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const loadActiveTrip = async () => {
      try {
        const stored = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
        if (stored) {
          const trip = JSON.parse(stored) as ExtendedTripLocal;
          if (trip.isActive && trip.userId === user.id) {
            const recordingState = await AsyncStorage.getItem(TRIP_RECORDING_STATE_KEY);
            if (recordingState) {
              const state = JSON.parse(recordingState);
              if (state.tripId === trip.id) {
                console.log("[Trip] Orphaned active trip detected, showing resume prompt:", trip.id);
                setPendingResumeTrip(trip);
                setShowResumePrompt(true);
                return;
              }
            }
            console.log("[Trip] Restored active trip:", trip.id);
            setActiveTrip(trip);
            setIsRecording(true);
          }
        }
      } catch (err) {
        console.error("[Trip] Load error:", err);
      }
    };
    
    loadActiveTrip();
  }, [user?.id]);

  // Haversine distance calculation
  const haversine = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Record data point - uses refs to get fresh values (every 4 seconds per spec)
  const recordDataPoint = useCallback(() => {
    console.log("--- [Trip] RECORDING DATA POINT (4s interval) ---");
    const telem = telemetryRef.current;
    const loc = locationRef.current;
    
    const phoneLat = loc?.latitude ?? null;
    const phoneLon = loc?.longitude ?? null;
    const outboardLat = telem?.gnss?.latitude ?? null;
    const outboardLon = telem?.gnss?.longitude ?? null;
    
    const lat = outboardLat || phoneLat;
    const lon = outboardLon || phoneLon;
    let rawPhoneSpeed = loc?.speed ? loc.speed * 3.6 : null;
    // Filter unrealistic GPS speeds (>80 km/h impossible for electric outboard boats)
    const phoneSpeed = rawPhoneSpeed !== null && rawPhoneSpeed <= 80 ? rawPhoneSpeed : (rawPhoneSpeed !== null && rawPhoneSpeed > 80 ? null : null);
    const outboardSpeed = telem?.gnss?.speed ?? null;
    const filteredOutboardSpeed = outboardSpeed !== null && outboardSpeed <= 80 ? outboardSpeed : null;
    const speed = filteredOutboardSpeed || phoneSpeed || 0;
    
    if (phoneSpeed !== null && phoneSpeed > maxPhoneSpeedRef.current) {
      maxPhoneSpeedRef.current = phoneSpeed;
    }
    if (filteredOutboardSpeed !== null && filteredOutboardSpeed > maxOutboardSpeedRef.current) {
      maxOutboardSpeedRef.current = filteredOutboardSpeed;
    }
    
    const voltage = telem?.bms?.voltage || 48;
    const current = Math.abs(telem?.vesc?.current || telem?.bms?.current || 0);
    // Use direct wattage reading from VESC or BMS for accuracy, fallback to V*I
    const power = Math.abs(telem?.vesc?.wattage ?? telem?.bms?.wattage ?? (voltage * current));
    const consumptionKW = power / 1000;
    const energyWh = power * (4 / 3600);
    const rpm = telem?.motor?.motorRPM || 0;
    const batterySOC = telem?.bms?.capacity ?? null;
    
    const isActivity = consumptionKW > 0.1 || rpm > 0 || speed > 1;
    if (isActivity) {
      lastActivityTimeRef.current = Date.now();
    }

    const dataPoint: TripDataPoint = {
      timestamp: new Date(),
      phoneLatitude: phoneLat,
      phoneLongitude: phoneLon,
      phoneSpeedKmh: phoneSpeed,
      outboardLatitude: outboardLat,
      outboardLongitude: outboardLon,
      outboardSpeedKmh: outboardSpeed,
      batterySOC,
      batteryVoltage: voltage,
      batteryCurrent: current,
      consumptionKW,
      phaseAmperage: telem?.vesc?.current ?? null,
      rpm,
      motorTemp: telem?.motor?.temperature ?? null,
      vescTemp: telem?.vesc?.temperature ?? null,
      throttlePercent: telem?.vesc?.throttle ?? null,
      driveMode: (() => {
        const mode = telemetryRef.current?.driverMode;
        if (!mode) return null;
        const modeMap: Record<string, 'N' | 'E' | 'D' | 'S'> = { 'Normal': 'N', 'Eco': 'E', 'Docking': 'D', 'Sport': 'S' };
        return modeMap[mode] || null;
      })(),
      isReverse: rpm < 0,
      isHydroRegen: current < 0 && rpm > 0,
    };
    
    dataPointsRef.current.push(dataPoint);

    let distanceKm = 0;
    if (lat && lon && lastPositionRef.current) {
      distanceKm = haversine(lastPositionRef.current.lat, lastPositionRef.current.lon, lat, lon);
    }
    if (lat && lon) {
      lastPositionRef.current = { lat, lon };
    }

    speedSamplesRef.current.push(speed);
    consumptionSamplesRef.current.push(consumptionKW);
    rpmSamplesRef.current.push(Math.abs(rpm));
    
    const avgSpeed = speedSamplesRef.current.length > 0
      ? speedSamplesRef.current.reduce((a, b) => a + b, 0) / speedSamplesRef.current.length
      : 0;
    const avgConsumption = consumptionSamplesRef.current.length > 0
      ? consumptionSamplesRef.current.reduce((a, b) => a + b, 0) / consumptionSamplesRef.current.length
      : 0;
    const avgRpm = rpmSamplesRef.current.length > 0
      ? rpmSamplesRef.current.reduce((a, b) => a + b, 0) / rpmSamplesRef.current.length
      : 0;

    setTripStats(prev => {
      const newStats = {
        totalDistanceKm: prev.totalDistanceKm + distanceKm,
        totalEnergyWh: prev.totalEnergyWh + energyWh,
        maxSpeedKmh: Math.max(prev.maxSpeedKmh, speed),
        avgSpeedKmh: avgSpeed,
        maxAmperageDraw: Math.max(prev.maxAmperageDraw, current),
        maxConsumptionKW: Math.max(prev.maxConsumptionKW, consumptionKW),
        avgConsumptionKW: avgConsumption,
        rpmMax: Math.max(prev.rpmMax, Math.abs(rpm)),
        rpmAvg: avgRpm,
      };
      console.log("[Trip] Data points:", dataPointsRef.current.length);
      return newStats;
    });
  }, [haversine]);

  // Stop all timers
  const stopTimers = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
      console.log("[Trip] Duration timer stopped");
    }
    if (dataTimerRef.current) {
      clearInterval(dataTimerRef.current);
      dataTimerRef.current = null;
      console.log("[Trip] Data timer stopped");
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
      console.log("[Trip] Inactivity timer stopped");
    }
    if (weatherTimerRef.current) {
      clearInterval(weatherTimerRef.current);
      weatherTimerRef.current = null;
      console.log("[Trip] Weather timer stopped");
    }
  }, []);

  // Start/stop timers based on recording state
  useEffect(() => {
    if (isRecording) {
      console.log("[Trip] Starting timers (4s data interval per spec)...");
      
      // Duration timer - every 1 second
      if (!durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          setTripDuration(prev => {
            const newDuration = prev + 1;
            // Auto-end at 8 hour max
            if (newDuration >= MAX_TRIP_DURATION) {
              console.log("[Trip] 8 hour limit reached, auto-ending trip");
              endTripRef.current?.('auto_8hr_limit');
            }
            return newDuration;
          });
        }, 1000);
        console.log("[Trip] Duration timer started");
      }
      
      // Data recording timer - every 4 seconds (per PDF spec)
      if (!dataTimerRef.current) {
        dataTimerRef.current = setInterval(() => {
          recordDataPoint();
          
          // Check inactivity (600 seconds)
          const inactiveTime = (Date.now() - lastActivityTimeRef.current) / 1000;
          if (inactiveTime >= INACTIVITY_TIMEOUT) {
            console.log("[Trip] 600s inactivity timeout, auto-ending trip");
            endTripRef.current?.('auto_inactivity_600s');
          }
        }, DATA_RECORDING_INTERVAL);
        console.log("[Trip] Data timer started (4s intervals)");
      }
      
      // Weather recording timer - every hour
      if (!weatherTimerRef.current) {
        weatherTimerRef.current = setInterval(async () => {
          const loc = locationRef.current;
          if (loc) {
            console.log("[Trip] Fetching hourly weather...");
            const weatherResult = await fetchWeather(loc.latitude, loc.longitude);
            if (weatherResult.success && weatherResult.data) {
              const snapshot = weatherDataToSnapshot(weatherResult.data);
              hourlyWeatherRef.current.push(snapshot);
              console.log("[Trip] Hourly weather captured:", snapshot.conditions);
            }
          }
        }, WEATHER_RECORDING_INTERVAL);
        console.log("[Trip] Weather timer started (1h intervals)");
      }
    } else {
      stopTimers();
    }

    return () => {};
  }, [isRecording, recordDataPoint, stopTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimers();
    };
  }, [stopTimers]);

  // Persist trip state when app goes to background
  const persistTripState = useCallback(async () => {
    const trip = activeTripRef.current;
    if (!trip || !isRecording) return;
    
    console.log("[Trip] Persisting trip state to storage (background)...");
    try {
      // Save current data points
      const tripDataPointsKey = `${TRIP_DATA_POINTS_KEY}_${trip.id}`;
      await AsyncStorage.setItem(tripDataPointsKey, JSON.stringify(dataPointsRef.current));
      
      // Save recording state (stats, samples, etc.)
      const recordingState = {
        tripId: trip.id,
        tripDuration: tripDuration,
        tripStats: tripStatsRef.current,
        speedSamples: speedSamplesRef.current,
        consumptionSamples: consumptionSamplesRef.current,
        rpmSamples: rpmSamplesRef.current,
        lastPosition: lastPositionRef.current,
        lastActivityTime: lastActivityTimeRef.current,
        startWeather: startWeatherRef.current,
        hourlyWeather: hourlyWeatherRef.current,
        dataPointsCount: dataPointsRef.current.length,
        persistedAt: Date.now(),
      };
      await AsyncStorage.setItem(TRIP_RECORDING_STATE_KEY, JSON.stringify(recordingState));
      console.log("[Trip] State persisted successfully, dataPoints:", dataPointsRef.current.length);
    } catch (err) {
      console.error("[Trip] Failed to persist state:", err);
    }
  }, [isRecording, tripDuration]);

  // Restore trip state when app returns from background
  const restoreTripState = useCallback(async () => {
    const trip = activeTripRef.current;
    if (!trip) return;
    
    console.log("[Trip] Restoring trip state from storage (foreground)...");
    try {
      const stateJson = await AsyncStorage.getItem(TRIP_RECORDING_STATE_KEY);
      if (!stateJson) return;
      
      const state = JSON.parse(stateJson);
      if (state.tripId !== trip.id) {
        console.log("[Trip] Stored state is for different trip, ignoring");
        return;
      }
      
      // Restore data points
      const tripDataPointsKey = `${TRIP_DATA_POINTS_KEY}_${trip.id}`;
      const dataPointsJson = await AsyncStorage.getItem(tripDataPointsKey);
      if (dataPointsJson) {
        dataPointsRef.current = JSON.parse(dataPointsJson);
      }
      
      // Restore other state
      speedSamplesRef.current = state.speedSamples || [];
      consumptionSamplesRef.current = state.consumptionSamples || [];
      rpmSamplesRef.current = state.rpmSamples || [];
      lastPositionRef.current = state.lastPosition || null;
      lastActivityTimeRef.current = state.lastActivityTime || Date.now();
      startWeatherRef.current = state.startWeather || null;
      hourlyWeatherRef.current = state.hourlyWeather || [];
      
      // Calculate actual duration (persisted + time since persisted)
      const timeSincePersisted = Math.floor((Date.now() - state.persistedAt) / 1000);
      const actualDuration = state.tripDuration + timeSincePersisted;
      setTripDuration(actualDuration);
      setTripStats(state.tripStats);
      
      console.log("[Trip] State restored, duration:", actualDuration, "dataPoints:", dataPointsRef.current.length);
    } catch (err) {
      console.error("[Trip] Failed to restore state:", err);
    }
  }, []);

  // Handle AppState changes for background/foreground transitions
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };
    
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      console.log("[Trip] AppState changed:", appStateRef.current, "->", nextAppState);
      
      if (isRecording) {
        if (appStateRef.current === "active" && nextAppState.match(/inactive|background/)) {
          // App going to background - persist state
          console.log("[Trip] App going to background, persisting state...");
          await persistTripState();
        } else if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
          // App returning to foreground - restore state and continue
          console.log("[Trip] App returning to foreground, restoring state...");
          await restoreTripState();
        }
      }
      
      appStateRef.current = nextAppState;
    };
    
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [isRecording, persistTripState, restoreTripState]);

  const startTrip = useCallback(async (name?: string): Promise<boolean> => {
    console.log("=== [Trip] START TRIP INITIATED ===");
    console.log("[Trip] User ID:", user?.id);
    console.log("[Trip] Already recording:", isRecording);
    
    if (!user?.id) {
      console.log("[Trip] FAILED: No user signed in");
      return false;
    }

    if (isRecording) {
      console.log("[Trip] FAILED: Already recording a trip");
      return false;
    }

    setIsLoading(true);
    console.log("[Trip] Loading state set to true");
    
    try {
      const serial = telemetryRef.current?.tillerSerialNumber || 
                     motorRef.current?.serialNumber || 
                     "DEMO-MOTOR";
      const tripId = `trip_${Date.now()}`;
      const tripName = name || `Trip ${new Date().toLocaleDateString()}`;

      const loc = locationRef.current;
      const telem = telemetryRef.current;
      const phoneGPSStart = loc ? { latitude: loc.latitude, longitude: loc.longitude } : null;
      const outboardGPSStart = telem?.gnss ? { latitude: telem.gnss.latitude, longitude: telem.gnss.longitude } : null;

      // Capture device & metadata at trip start
      const firmwareVersion = telem?.tillerFirmwareVersion || motorRef.current?.firmwareVersion || null;
      const phoneAppVersion = Constants.expoConfig?.version || '1.0.0';
      const phoneName = Device.deviceName || null;
      const phoneDeviceType = Device.deviceType !== null && Device.deviceType !== undefined ? String(Device.deviceType) : null;
      const phoneOS = `${Platform.OS} ${Platform.Version}`;
      const userEmail = user?.email || null;
      const userFirestoreId = user?.id || null;
      const odometerStartKm = telem?.odometer ?? 0;
      const connectionType = motor?.isConnected ? (Platform.OS === 'ios' ? 'BLE' : 'Bluetooth Classic') : 'Demo';

      // Reverse geocode start location
      let startLocationAddress: string | null = null;
      if (loc) {
        console.log("[Trip] Reverse geocoding start location...");
        startLocationAddress = await reverseGeocode(loc.latitude, loc.longitude);
        console.log("[Trip] Start location address:", startLocationAddress);
      }

      // Fetch start weather
      let startWeather: WeatherSnapshot | null = null;
      if (loc) {
        console.log("[Trip] Fetching start weather...");
        const weatherResult = await fetchWeather(loc.latitude, loc.longitude);
        if (weatherResult.success && weatherResult.data) {
          startWeather = weatherDataToSnapshot(weatherResult.data);
          console.log("[Trip] Start weather captured:", startWeather.conditions);
        }
      }
      startWeatherRef.current = startWeather;
      hourlyWeatherRef.current = [];

      console.log("[Trip] Creating new trip object:");
      console.log("[Trip]   - ID:", tripId);
      console.log("[Trip]   - Name:", tripName);
      console.log("[Trip]   - Motor Serial:", serial);
      console.log("[Trip]   - User ID:", user.id);
      console.log("[Trip]   - Start Battery:", telem?.bms?.capacity ?? "N/A");
      console.log("[Trip]   - Phone GPS:", phoneGPSStart);
      console.log("[Trip]   - Outboard GPS:", outboardGPSStart);
      console.log("[Trip]   - Start Weather:", startWeather?.conditions ?? "N/A");

      const newTrip: ExtendedTripLocal = {
        id: tripId,
        userId: user.id,
        motorSerialNumber: serial,
        name: tripName,
        startTime: new Date(),
        endTime: null,
        startBatteryPercent: telem?.bms?.capacity ?? null,
        endBatteryPercent: null,
        totalDistanceKm: 0,
        maxSpeedKmh: 0,
        avgSpeedKmh: 0,
        totalEnergyWh: 0,
        isActive: true,
        phoneGPSStart,
        outboardGPSStart,
        phoneGPSEnd: null,
        outboardGPSEnd: null,
        endReason: undefined,
        dataPointsCount: 0,
        startWeather,
        endWeather: null,
        hourlyWeather: [],
        startLocationAddress,
        endLocationAddress: null,
        firmwareVersion,
        connectionType,
        phoneAppVersion,
        phoneName,
        phoneDeviceType,
        phoneOS,
        userEmail,
        userFirestoreId,
        odometerStartKm,
        odometerEndKm: 0,
        maxAmperageDraw: 0,
        maxConsumptionKW: 0,
        avgConsumptionKW: 0,
        rpmMax: 0,
        rpmAvg: 0,
        maxPhoneSpeedKmh: 0,
        maxOutboardSpeedKmh: 0,
      };

      // Save to local storage
      console.log("[Trip] Saving trip to AsyncStorage...");
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      const trips: Trip[] = existing ? JSON.parse(existing) : [];
      trips.push(newTrip);
      await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));
      console.log("[Trip] Trip SAVED to local trips list (total:", trips.length, "trips)");
      
      await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(newTrip));
      console.log("[Trip] Active trip marker SAVED");

      // Reset state
      setTripDuration(0);
      setTripStats({ 
        totalDistanceKm: 0, 
        totalEnergyWh: 0, 
        maxSpeedKmh: 0, 
        avgSpeedKmh: 0,
        maxAmperageDraw: 0,
        maxConsumptionKW: 0,
        avgConsumptionKW: 0,
        rpmMax: 0,
        rpmAvg: 0,
      });
      lastPositionRef.current = null;
      speedSamplesRef.current = [];
      consumptionSamplesRef.current = [];
      rpmSamplesRef.current = [];
      dataPointsRef.current = [];
      maxPhoneSpeedRef.current = 0;
      maxOutboardSpeedRef.current = 0;
      lastActivityTimeRef.current = Date.now();
      console.log("[Trip] Trip stats RESET to zero");

      // Start recording
      setActiveTrip(newTrip);
      setIsRecording(true);

      console.log("=== [Trip] TRIP STARTED SUCCESSFULLY ===");
      console.log("[Trip] Recording is now ACTIVE for trip:", tripId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      logTripStarted(tripId, serial);
      return true;
    } catch (err) {
      console.error("[Trip] START FAILED with error:", err);
      return false;
    } finally {
      setIsLoading(false);
      console.log("[Trip] Loading state set to false");
    }
  }, [user?.id, isRecording]);

  const endTrip = useCallback(async (reason: TripEndReason = 'user_button'): Promise<boolean> => {
    console.log("=== [Trip] END TRIP INITIATED ===");
    console.log("[Trip] End reason:", reason);
    
    const trip = activeTripRef.current;
    if (!trip) {
      console.log("[Trip] FAILED: No active trip to end");
      return false;
    }

    const tripDurationSec = Math.floor((Date.now() - new Date(trip.startTime).getTime()) / 1000);
    
    // Delete trips under 60 seconds (per spec)
    if (tripDurationSec < MIN_TRIP_DURATION && reason === 'user_button') {
      console.log("[Trip] Trip under 60 seconds, will be deleted");
    }

    console.log("[Trip] Ending trip:", trip.id, "Duration:", tripDurationSec, "s");
    setIsLoading(true);
    
    stopTimers();

    try {
      const stats = tripStatsRef.current;
      const loc = locationRef.current;
      const telem = telemetryRef.current;
      
      // Get end GPS positions
      const phoneGPSEnd = loc ? { latitude: loc.latitude, longitude: loc.longitude } : null;
      const outboardGPSEnd = telem?.gnss ? { latitude: telem.gnss.latitude, longitude: telem.gnss.longitude } : null;
      
      // Reverse geocode end location
      let endLocationAddress: string | null = null;
      if (loc) {
        console.log("[Trip] Reverse geocoding end location...");
        endLocationAddress = await reverseGeocode(loc.latitude, loc.longitude);
        console.log("[Trip] End location address:", endLocationAddress);
      }
      
      // Fetch end weather
      let endWeather: WeatherSnapshot | null = null;
      if (loc) {
        console.log("[Trip] Fetching end weather...");
        const weatherResult = await fetchWeather(loc.latitude, loc.longitude);
        if (weatherResult.success && weatherResult.data) {
          endWeather = weatherDataToSnapshot(weatherResult.data);
          console.log("[Trip] End weather captured:", endWeather.conditions);
        }
      }
      
      // Save data points
      const tripDataPointsKey = `${TRIP_DATA_POINTS_KEY}_${trip.id}`;
      await AsyncStorage.setItem(tripDataPointsKey, JSON.stringify(dataPointsRef.current));
      console.log("[Trip] Saved", dataPointsRef.current.length, "data points");
      
      // Save weather data
      const weatherDataKey = `${TRIP_WEATHER_KEY}_${trip.id}`;
      const weatherData = {
        startWeather: startWeatherRef.current,
        endWeather,
        hourlyWeather: hourlyWeatherRef.current,
      };
      await AsyncStorage.setItem(weatherDataKey, JSON.stringify(weatherData));
      console.log("[Trip] Saved weather data (start + end + ", hourlyWeatherRef.current.length, " hourly)");
      
      // Update trip in storage
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (existing) {
        let trips: ExtendedTripLocal[] = JSON.parse(existing);
        
        // Remove if under 60 seconds
        if (tripDurationSec < MIN_TRIP_DURATION) {
          trips = trips.filter(t => t.id !== trip.id);
          await AsyncStorage.removeItem(tripDataPointsKey);
          await AsyncStorage.removeItem(weatherDataKey);
          console.log("[Trip] Trip deleted (under 60 seconds)");
        } else {
          trips = trips.map(t =>
            t.id === trip.id
              ? {
                  ...t,
                  endTime: new Date(),
                  isActive: false,
                  endBatteryPercent: telem?.bms?.capacity ?? null,
                  totalDistanceKm: stats.totalDistanceKm,
                  maxSpeedKmh: stats.maxSpeedKmh,
                  avgSpeedKmh: stats.avgSpeedKmh,
                  totalEnergyWh: stats.totalEnergyWh,
                  phoneGPSEnd,
                  outboardGPSEnd,
                  endReason: reason,
                  dataPointsCount: dataPointsRef.current.length,
                  startWeather: startWeatherRef.current,
                  endWeather,
                  hourlyWeather: hourlyWeatherRef.current,
                  endLocationAddress,
                  maxAmperageDraw: stats.maxAmperageDraw,
                  maxConsumptionKW: stats.maxConsumptionKW,
                  avgConsumptionKW: stats.avgConsumptionKW,
                  rpmMax: stats.rpmMax,
                  rpmAvg: stats.rpmAvg,
                  odometerEndKm: telemetryRef.current?.odometer ?? t.odometerStartKm ?? 0,
                  maxPhoneSpeedKmh: maxPhoneSpeedRef.current,
                  maxOutboardSpeedKmh: maxOutboardSpeedRef.current,
                }
              : t
          );
        }
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));
      }
      
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      
      if (tripDurationSec >= MIN_TRIP_DURATION) {
        const sharingEnabled = await isDataSharingEnabled();
        if (sharingEnabled && user) {
          console.log("[DataShare] Uploading trip data to Firestore...");
          const savedDataPoints = [...dataPointsRef.current];
          uploadTripDataToFirestore(user.id, {
            motorSerialNumber: trip.motorSerialNumber,
            startTime: trip.startTime,
            endTime: new Date(),
            totalDistanceKm: stats.totalDistanceKm,
            maxSpeedKmh: stats.maxSpeedKmh,
            avgSpeedKmh: stats.avgSpeedKmh,
            totalEnergyWh: stats.totalEnergyWh,
            startBatteryPercent: trip.startBatteryPercent,
            endBatteryPercent: telem?.bms?.capacity ?? null,
            maxAmperageDraw: stats.maxAmperageDraw,
            maxConsumptionKW: stats.maxConsumptionKW,
            avgConsumptionKW: stats.avgConsumptionKW,
            rpmMax: stats.rpmMax,
            rpmAvg: stats.rpmAvg,
            odometerStartKm: trip.odometerStartKm,
            odometerEndKm: telem?.odometer ?? trip.odometerStartKm ?? 0,
            phoneGPSStart: trip.phoneGPSStart,
            phoneGPSEnd: phoneGPSEnd,
            outboardGPSStart: trip.outboardGPSStart,
            outboardGPSEnd: outboardGPSEnd,
            startLocationAddress: trip.startLocationAddress,
            endLocationAddress,
          }, savedDataPoints).then(result => {
            if (result.success) {
              console.log("[DataShare] Trip data uploaded successfully");
            } else {
              console.log("[DataShare] Trip upload failed:", result.error);
            }
          }).catch(err => {
            console.log("[DataShare] Trip upload error:", err);
          });
        }
      }

      // Reset refs
      dataPointsRef.current = [];
      hourlyWeatherRef.current = [];
      startWeatherRef.current = null;
      
      setActiveTrip(null);
      setIsRecording(false);

      console.log("=== [Trip] TRIP ENDED SUCCESSFULLY ===");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      logTripEnded(trip.id, trip.motorSerialNumber, tripDurationSec, reason);
      return true;
    } catch (err) {
      console.error("[Trip] END FAILED:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [stopTimers]);
  
  // Keep endTripRef in sync
  useEffect(() => { endTripRef.current = endTrip; }, [endTrip]);
  
  const resumeTrip = useCallback(async () => {
    if (!pendingResumeTrip) return;
    console.log("[Trip] User chose to resume trip:", pendingResumeTrip.id);
    setActiveTrip(pendingResumeTrip);
    setIsRecording(true);
    setShowResumePrompt(false);
    setPendingResumeTrip(null);

    try {
      const stateJson = await AsyncStorage.getItem(TRIP_RECORDING_STATE_KEY);
      if (stateJson) {
        const state = JSON.parse(stateJson);
        if (state.tripId === pendingResumeTrip.id) {
          const tripDataPointsKey = `${TRIP_DATA_POINTS_KEY}_${pendingResumeTrip.id}`;
          const dataPointsJson = await AsyncStorage.getItem(tripDataPointsKey);
          if (dataPointsJson) {
            dataPointsRef.current = JSON.parse(dataPointsJson);
          }
          speedSamplesRef.current = state.speedSamples || [];
          consumptionSamplesRef.current = state.consumptionSamples || [];
          rpmSamplesRef.current = state.rpmSamples || [];
          lastPositionRef.current = state.lastPosition || null;
          lastActivityTimeRef.current = Date.now();
          startWeatherRef.current = state.startWeather || null;
          hourlyWeatherRef.current = state.hourlyWeather || [];
          const timeSincePersisted = Math.floor((Date.now() - state.persistedAt) / 1000);
          const actualDuration = state.tripDuration + timeSincePersisted;
          setTripDuration(actualDuration);
          setTripStats(state.tripStats);
          console.log("[Trip] State restored after resume, duration:", actualDuration);
        }
      }
    } catch (err) {
      console.error("[Trip] Failed to restore state on resume:", err);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pendingResumeTrip]);

  const dismissResumePrompt = useCallback(async () => {
    if (!pendingResumeTrip) return;
    console.log("[Trip] User dismissed resume prompt, ending orphaned trip");

    const tripToEnd = { ...pendingResumeTrip, isActive: false, endTime: new Date() };

    try {
      const existingTrips = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      const trips: ExtendedTripLocal[] = existingTrips ? JSON.parse(existingTrips) : [];
      const idx = trips.findIndex(t => t.id === tripToEnd.id);
      if (idx >= 0) {
        trips[idx] = { ...trips[idx], ...tripToEnd, endReason: 'auto_crash_recovery' };
      } else {
        trips.unshift({ ...tripToEnd, endReason: 'auto_crash_recovery' } as ExtendedTripLocal);
      }
      await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));

      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      await AsyncStorage.removeItem(TRIP_RECORDING_STATE_KEY);
      await AsyncStorage.removeItem(`${TRIP_DATA_POINTS_KEY}_${tripToEnd.id}`);
    } catch (err) {
      console.error("[Trip] Error cleaning up orphaned trip:", err);
    }

    setShowResumePrompt(false);
    setPendingResumeTrip(null);
  }, [pendingResumeTrip]);

  // Get trip data points for PDF generation
  const getTripDataPoints = useCallback(async (tripId: string): Promise<TripDataPoint[]> => {
    try {
      const key = `${TRIP_DATA_POINTS_KEY}_${tripId}`;
      const data = await AsyncStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
      return [];
    } catch (err) {
      console.error("[Trip] Failed to get data points:", err);
      return [];
    }
  }, []);

  return (
    <TripContext.Provider 
      value={{ 
        activeTrip, 
        isRecording, 
        tripDuration, 
        tripStats, 
        isLoading, 
        startTrip, 
        endTrip,
        getTripDataPoints,
        pendingResumeTrip,
        showResumePrompt,
        resumeTrip,
        dismissResumePrompt,
      }}
    >
      {children}
      <TripResumePrompt
        visible={showResumePrompt}
        tripName={pendingResumeTrip?.name || "Unnamed Trip"}
        onResume={resumeTrip}
        onDiscard={dismissResumePrompt}
      />
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be within TripProvider");
  return ctx;
}
