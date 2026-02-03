import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import type { Trip, TripDataPoint } from "@shared/schema";

const LOCAL_TRIPS_KEY = "@blade_local_trips";
const ACTIVE_TRIP_KEY = "@blade_active_trip";

interface TripStats {
  totalDistanceKm: number;
  totalEnergyWh: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
}

interface TripContextType {
  activeTrip: Trip | null;
  isRecording: boolean;
  tripDuration: number;
  tripStats: TripStats;
  isLoading: boolean;
  startTrip: (name?: string) => Promise<boolean>;
  endTrip: () => Promise<boolean>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { motor, telemetry, location } = useMotor();
  const { user } = useUser();
  
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tripDuration, setTripDuration] = useState(0);
  const [tripStats, setTripStats] = useState<TripStats>({
    totalDistanceKm: 0,
    totalEnergyWh: 0,
    maxSpeedKmh: 0,
    avgSpeedKmh: 0,
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
  
  // Refs for calculations
  const lastPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const speedSamplesRef = useRef<number[]>([]);

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

  // Record data point - uses refs to get fresh values
  const recordDataPoint = useCallback(() => {
    const telem = telemetryRef.current;
    const loc = locationRef.current;
    
    const lat = telem?.gnss?.latitude || loc?.latitude;
    const lon = telem?.gnss?.longitude || loc?.longitude;
    const speed = telem?.gnss?.speed || 0;
    const voltage = telem?.bms?.voltage || 48;
    const current = Math.abs(telem?.vesc?.current || telem?.bms?.current || 0);
    const power = voltage * current;
    const energyWh = power * (10 / 3600); // 10 second interval

    console.log(`[Trip] Data: ${speed.toFixed(1)} km/h, ${power.toFixed(0)}W, ${energyWh.toFixed(2)} Wh`);

    let distanceKm = 0;
    if (lat && lon && lastPositionRef.current) {
      distanceKm = haversine(lastPositionRef.current.lat, lastPositionRef.current.lon, lat, lon);
    }
    if (lat && lon) {
      lastPositionRef.current = { lat, lon };
    }

    speedSamplesRef.current.push(speed);
    const avgSpeed = speedSamplesRef.current.length > 0
      ? speedSamplesRef.current.reduce((a, b) => a + b, 0) / speedSamplesRef.current.length
      : 0;

    setTripStats(prev => ({
      totalDistanceKm: prev.totalDistanceKm + distanceKm,
      totalEnergyWh: prev.totalEnergyWh + energyWh,
      maxSpeedKmh: Math.max(prev.maxSpeedKmh, speed),
      avgSpeedKmh: avgSpeed,
    }));
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
  }, []);

  // Start/stop timers based on recording state
  useEffect(() => {
    if (isRecording) {
      console.log("[Trip] Starting timers...");
      
      // Duration timer - every 1 second
      if (!durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          setTripDuration(prev => prev + 1);
        }, 1000);
        console.log("[Trip] Duration timer started");
      }
      
      // Data recording timer - every 10 seconds
      if (!dataTimerRef.current) {
        dataTimerRef.current = setInterval(() => {
          recordDataPoint();
        }, 10000);
        console.log("[Trip] Data timer started");
      }
    } else {
      stopTimers();
    }

    // Cleanup on unmount or when recording changes
    return () => {
      // Only stop on unmount, not every render
    };
  }, [isRecording, recordDataPoint, stopTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimers();
    };
  }, [stopTimers]);

  const startTrip = useCallback(async (name?: string): Promise<boolean> => {
    console.log("[Trip] startTrip called");
    
    if (!user?.id) {
      console.log("[Trip] No user, cannot start");
      return false;
    }

    if (isRecording) {
      console.log("[Trip] Already recording");
      return false;
    }

    setIsLoading(true);
    
    try {
      const serial = telemetryRef.current?.tillerSerialNumber || 
                     motorRef.current?.serialNumber || 
                     "DEMO-MOTOR";
      const tripId = `trip_${Date.now()}`;
      const tripName = name || `Trip ${new Date().toLocaleDateString()}`;

      console.log("[Trip] Creating trip:", tripId, "serial:", serial);

      const newTrip: Trip = {
        id: tripId,
        userId: user.id,
        motorSerialNumber: serial,
        name: tripName,
        startTime: new Date(),
        endTime: null,
        startBatteryPercent: telemetryRef.current?.bms?.capacity ?? null,
        endBatteryPercent: null,
        totalDistanceKm: 0,
        maxSpeedKmh: 0,
        avgSpeedKmh: 0,
        totalEnergyWh: 0,
        isActive: true,
      };

      // Save to local storage
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      const trips: Trip[] = existing ? JSON.parse(existing) : [];
      trips.push(newTrip);
      await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));
      await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(newTrip));

      // Reset state
      setTripDuration(0);
      setTripStats({ totalDistanceKm: 0, totalEnergyWh: 0, maxSpeedKmh: 0, avgSpeedKmh: 0 });
      lastPositionRef.current = null;
      speedSamplesRef.current = [];

      // Start recording
      setActiveTrip(newTrip);
      setIsRecording(true);

      console.log("[Trip] Started successfully:", tripId);
      return true;
    } catch (err) {
      console.error("[Trip] Start error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isRecording]);

  const endTrip = useCallback(async (): Promise<boolean> => {
    console.log("[Trip] endTrip called");
    
    const trip = activeTripRef.current;
    if (!trip) {
      console.log("[Trip] No active trip to end");
      return false;
    }

    setIsLoading(true);
    stopTimers();

    try {
      const stats = tripStatsRef.current;
      
      // Update trip in storage
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (existing) {
        const trips: Trip[] = JSON.parse(existing);
        const updated = trips.map(t =>
          t.id === trip.id
            ? {
                ...t,
                endTime: new Date(),
                isActive: false,
                endBatteryPercent: telemetryRef.current?.bms?.capacity ?? null,
                totalDistanceKm: stats.totalDistanceKm,
                maxSpeedKmh: stats.maxSpeedKmh,
                avgSpeedKmh: stats.avgSpeedKmh,
                totalEnergyWh: stats.totalEnergyWh,
              }
            : t
        );
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(updated));
      }
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);

      setActiveTrip(null);
      setIsRecording(false);

      console.log("[Trip] Ended successfully:", trip.id);
      return true;
    } catch (err) {
      console.error("[Trip] End error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [stopTimers]);

  return (
    <TripContext.Provider 
      value={{ 
        activeTrip, 
        isRecording, 
        tripDuration, 
        tripStats, 
        isLoading, 
        startTrip, 
        endTrip 
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
