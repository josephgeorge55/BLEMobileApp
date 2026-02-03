import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import type { Trip, TripDataPoint } from "@shared/schema";

const LOCAL_TRIPS_KEY = "@blade_local_trips";
const ACTIVE_TRIP_KEY = "@blade_active_trip";
const DATA_POINTS_KEY = "@blade_trip_data";

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

  const durationTimer = useRef<NodeJS.Timeout | null>(null);
  const dataTimer = useRef<NodeJS.Timeout | null>(null);
  const lastPos = useRef<{ lat: number; lon: number } | null>(null);
  const speeds = useRef<number[]>([]);

  // Load any active trip on mount
  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
        if (stored) {
          const trip = JSON.parse(stored) as Trip;
          if (trip.isActive && trip.userId === user?.id) {
            setActiveTrip(trip);
            setIsRecording(true);
          }
        }
      } catch (e) {
        console.error("[Trip] Load error:", e);
      }
    };
    if (user?.id) load();
  }, [user?.id]);

  // Duration timer - runs every second when recording
  useEffect(() => {
    if (isRecording && !durationTimer.current) {
      durationTimer.current = setInterval(() => {
        setTripDuration(d => d + 1);
      }, 1000);
    }
    return () => {
      if (durationTimer.current) {
        clearInterval(durationTimer.current);
        durationTimer.current = null;
      }
    };
  }, [isRecording]);

  // Data recording timer - runs every 10 seconds when recording
  useEffect(() => {
    if (isRecording && !dataTimer.current) {
      dataTimer.current = setInterval(() => {
        recordDataPoint();
      }, 10000);
    }
    return () => {
      if (dataTimer.current) {
        clearInterval(dataTimer.current);
        dataTimer.current = null;
      }
    };
  }, [isRecording]);

  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const recordDataPoint = () => {
    const lat = telemetry?.gnss?.latitude || location?.latitude;
    const lon = telemetry?.gnss?.longitude || location?.longitude;
    const speed = telemetry?.gnss?.speed || 0;
    const voltage = telemetry?.bms?.voltage || 48;
    const current = Math.abs(telemetry?.vesc?.current || telemetry?.bms?.current || 0);
    const power = voltage * current;
    const energyWh = power * (10 / 3600);

    let distanceKm = 0;
    if (lat && lon && lastPos.current) {
      distanceKm = haversine(lastPos.current.lat, lastPos.current.lon, lat, lon);
    }
    if (lat && lon) {
      lastPos.current = { lat, lon };
    }

    speeds.current.push(speed);
    const avgSpeed = speeds.current.reduce((a, b) => a + b, 0) / speeds.current.length;

    setTripStats(prev => ({
      totalDistanceKm: prev.totalDistanceKm + distanceKm,
      totalEnergyWh: prev.totalEnergyWh + energyWh,
      maxSpeedKmh: Math.max(prev.maxSpeedKmh, speed),
      avgSpeedKmh: avgSpeed,
    }));
  };

  const startTrip = async (name?: string): Promise<boolean> => {
    if (!user?.id) {
      console.log("[Trip] No user");
      return false;
    }

    setIsLoading(true);
    
    try {
      const serial = telemetry?.tillerSerialNumber || motor?.serialNumber || "DEMO-MOTOR";
      const tripId = `trip_${Date.now()}`;
      const tripName = name || `Trip ${new Date().toLocaleDateString()}`;

      const newTrip: Trip = {
        id: tripId,
        userId: user.id,
        motorSerialNumber: serial,
        name: tripName,
        startTime: new Date(),
        endTime: null,
        startBatteryPercent: telemetry?.bms?.capacity ?? null,
        endBatteryPercent: null,
        totalDistanceKm: 0,
        maxSpeedKmh: 0,
        avgSpeedKmh: 0,
        totalEnergyWh: 0,
        isActive: true,
      };

      // Save to storage
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      const trips: Trip[] = existing ? JSON.parse(existing) : [];
      trips.push(newTrip);
      await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));
      await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(newTrip));

      // Reset state
      setTripDuration(0);
      setTripStats({ totalDistanceKm: 0, totalEnergyWh: 0, maxSpeedKmh: 0, avgSpeedKmh: 0 });
      lastPos.current = null;
      speeds.current = [];

      // Start recording
      setActiveTrip(newTrip);
      setIsRecording(true);

      console.log("[Trip] Started:", tripId);
      return true;
    } catch (e) {
      console.error("[Trip] Start error:", e);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const endTrip = async (): Promise<boolean> => {
    if (!activeTrip) return false;

    setIsLoading(true);

    // Stop timers immediately
    if (durationTimer.current) {
      clearInterval(durationTimer.current);
      durationTimer.current = null;
    }
    if (dataTimer.current) {
      clearInterval(dataTimer.current);
      dataTimer.current = null;
    }

    try {
      // Update trip in storage
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (existing) {
        const trips: Trip[] = JSON.parse(existing);
        const updated = trips.map(t =>
          t.id === activeTrip.id
            ? {
                ...t,
                endTime: new Date(),
                isActive: false,
                endBatteryPercent: telemetry?.bms?.capacity ?? null,
                totalDistanceKm: tripStats.totalDistanceKm,
                maxSpeedKmh: tripStats.maxSpeedKmh,
                avgSpeedKmh: tripStats.avgSpeedKmh,
                totalEnergyWh: tripStats.totalEnergyWh,
              }
            : t
        );
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(updated));
      }
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);

      setActiveTrip(null);
      setIsRecording(false);

      console.log("[Trip] Ended:", activeTrip.id);
      return true;
    } catch (e) {
      console.error("[Trip] End error:", e);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TripContext.Provider value={{ activeTrip, isRecording, tripDuration, tripStats, isLoading, startTrip, endTrip }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip must be within TripProvider");
  return ctx;
}
