import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import { fetchWeather, getWindDirection } from "@/services/weatherService";
import type { WeatherData } from "@/services/weatherService";
import type { Trip } from "@shared/schema";
import type { TripDataPoint, TripEndReason, WeatherSnapshot } from "@/types/TripReport";

const LOCAL_TRIPS_KEY = "@blade_local_trips";
const ACTIVE_TRIP_KEY = "@blade_active_trip";
const TRIP_DATA_POINTS_KEY = "@blade_trip_data_points";
const TRIP_WEATHER_KEY = "@blade_trip_weather";
const DATA_RECORDING_INTERVAL = 4000;
const WEATHER_RECORDING_INTERVAL = 60 * 60 * 1000;
const MAX_TRIP_DURATION = 8 * 60 * 60;
const INACTIVITY_TIMEOUT = 600;
const MIN_TRIP_DURATION = 60;

function weatherDataToSnapshot(data: WeatherData): WeatherSnapshot {
  return {
    timestamp: new Date(),
    temperature: data.current.temp,
    humidity: data.current.humidity,
    windSpeed: data.current.wind_speed,
    windDirection: getWindDirection(data.current.wind_deg),
    conditions: data.current.weather[0]?.description || null,
    pressure: data.current.pressure,
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
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { motor, telemetry, location } = useMotor();
  const { user } = useUser();
  
  const [activeTrip, setActiveTrip] = useState<ExtendedTripLocal | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
          const trip = JSON.parse(stored) as Trip;
          if (trip.isActive && trip.userId === user.id) {
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
    const phoneSpeed = loc?.speed ? loc.speed * 3.6 : null;
    const outboardSpeed = telem?.gnss?.speed ?? null;
    const speed = outboardSpeed || phoneSpeed || 0;
    
    const voltage = telem?.bms?.voltage || 48;
    const current = Math.abs(telem?.vesc?.current || telem?.bms?.current || 0);
    const power = voltage * current;
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
      driveMode: null,
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
      lastActivityTimeRef.current = Date.now();
      console.log("[Trip] Trip stats RESET to zero");

      // Start recording
      setActiveTrip(newTrip);
      setIsRecording(true);

      console.log("=== [Trip] TRIP STARTED SUCCESSFULLY ===");
      console.log("[Trip] Recording is now ACTIVE for trip:", tripId);
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
                }
              : t
          );
        }
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));
      }
      
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      
      // Reset refs
      dataPointsRef.current = [];
      hourlyWeatherRef.current = [];
      startWeatherRef.current = null;
      
      setActiveTrip(null);
      setIsRecording(false);

      console.log("=== [Trip] TRIP ENDED SUCCESSFULLY ===");
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
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be within TripProvider");
  return ctx;
}
