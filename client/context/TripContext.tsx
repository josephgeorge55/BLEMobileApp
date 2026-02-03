import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import type { Trip, TripDataPoint } from "@shared/schema";

const ACTIVE_TRIP_KEY = "@blade_active_trip";
const PENDING_DATA_KEY = "@blade_pending_trip_data";
const LOCAL_TRIPS_KEY = "@blade_local_trips";
const TRIP_INTERVAL_MS = 10000;

interface TripContextType {
  activeTrip: Trip | null;
  isRecording: boolean;
  startTrip: (name?: string) => Promise<boolean>;
  endTrip: () => Promise<boolean>;
  isLoading: boolean;
  tripDuration: number;
  tripStats: {
    totalDistanceKm: number;
    totalEnergyWh: number;
    maxSpeedKmh: number;
    avgSpeedKmh: number;
  };
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { motor, telemetry, location } = useMotor();
  const { user } = useUser();
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tripDuration, setTripDuration] = useState(0);
  const [tripStats, setTripStats] = useState({
    totalDistanceKm: 0,
    totalEnergyWh: 0,
    maxSpeedKmh: 0,
    avgSpeedKmh: 0,
  });

  const recordingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const speedSamplesRef = useRef<number[]>([]);
  const activeTripRef = useRef<Trip | null>(null);
  const telemetryRef = useRef(telemetry);
  const locationRef = useRef(location);
  const tripStatsRef = useRef(tripStats);

  // Keep refs in sync with state
  useEffect(() => { telemetryRef.current = telemetry; }, [telemetry]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);
  useEffect(() => { tripStatsRef.current = tripStats; }, [tripStats]);

  useEffect(() => {
    if (user?.id) {
      loadActiveTrip();
    }
  }, [user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (
      appStateRef.current === "active" &&
      (nextAppState === "background" || nextAppState === "inactive") &&
      activeTripRef.current &&
      isRecording
    ) {
      await endTripSilently();
    }
    appStateRef.current = nextAppState;
  };

  const endTripSilently = async () => {
    const trip = activeTripRef.current;
    if (!trip) return;
    stopAllTimers();
    try {
      const localTripsStr = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (localTripsStr) {
        const localTrips: Trip[] = JSON.parse(localTripsStr);
        const stats = tripStatsRef.current;
        const updatedTrips = localTrips.map(t =>
          t.id === trip.id
            ? { ...t, endTime: new Date(), endBatteryPercent: telemetryRef.current?.bms?.capacity ?? null, isActive: false, ...stats }
            : t
        );
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(updatedTrips));
      }
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      setActiveTrip(null);
      setIsRecording(false);
      console.log("[Trip] Ended silently");
    } catch (error) {
      console.error("[Trip] Error auto-ending:", error);
    }
  };

  const loadActiveTrip = async () => {
    if (!user?.id) return;
    try {
      const activeTripStr = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
      if (activeTripStr) {
        const trip: Trip = JSON.parse(activeTripStr);
        if (trip.userId === user.id && trip.isActive) {
          setActiveTrip(trip);
          setIsRecording(true);
          console.log("[Trip] Restored active trip:", trip.id);
        }
      }
    } catch (error) {
      console.error("[Trip] Error loading:", error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const stopAllTimers = useCallback(() => {
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
    if (recordingRef.current) {
      clearInterval(recordingRef.current);
      recordingRef.current = null;
    }
  }, []);

  const resetTripState = useCallback(() => {
    setTripDuration(0);
    setTripStats({ totalDistanceKm: 0, totalEnergyWh: 0, maxSpeedKmh: 0, avgSpeedKmh: 0 });
    lastPositionRef.current = null;
    speedSamplesRef.current = [];
  }, []);

  const recordTelemetryPoint = useCallback(async () => {
    const trip = activeTripRef.current;
    if (!trip) return;

    const telem = telemetryRef.current;
    const loc = locationRef.current;

    const latitude = telem?.gnss?.latitude || loc?.latitude;
    const longitude = telem?.gnss?.longitude || loc?.longitude;
    const speedKmh = telem?.gnss?.speed || 0;
    const batteryVoltage = telem?.bms?.voltage || 48;
    const current = telem?.vesc?.current || telem?.bms?.current || 0;
    const powerW = batteryVoltage * Math.abs(current);
    const energyWhThisInterval = powerW * (TRIP_INTERVAL_MS / 3600000);

    console.log(`[Trip] Recording: ${speedKmh.toFixed(1)} km/h, ${powerW.toFixed(0)}W, ${energyWhThisInterval.toFixed(2)} Wh`);

    if (latitude && longitude && lastPositionRef.current) {
      const distanceKm = calculateDistance(
        lastPositionRef.current.lat,
        lastPositionRef.current.lng,
        latitude,
        longitude
      );
      setTripStats(prev => ({
        ...prev,
        totalDistanceKm: prev.totalDistanceKm + distanceKm,
        totalEnergyWh: prev.totalEnergyWh + energyWhThisInterval,
        maxSpeedKmh: Math.max(prev.maxSpeedKmh, speedKmh),
      }));
    } else {
      setTripStats(prev => ({
        ...prev,
        totalEnergyWh: prev.totalEnergyWh + energyWhThisInterval,
        maxSpeedKmh: Math.max(prev.maxSpeedKmh, speedKmh),
      }));
    }

    if (latitude && longitude) {
      lastPositionRef.current = { lat: latitude, lng: longitude };
    }

    speedSamplesRef.current.push(speedKmh);
    const avgSpeed = speedSamplesRef.current.length > 0
      ? speedSamplesRef.current.reduce((a, b) => a + b, 0) / speedSamplesRef.current.length
      : 0;
    setTripStats(prev => ({ ...prev, avgSpeedKmh: avgSpeed }));

    const dataPoint: Partial<TripDataPoint> = {
      latitude,
      longitude,
      speedKmh,
      course: telem?.gnss?.course || loc?.heading,
      batteryPercent: telem?.bms?.capacity,
      batteryVoltage: telem?.bms?.voltage,
      batteryCurrent: telem?.bms?.current,
      batteryTemp: telem?.bms?.temperature,
      motorRpm: telem?.motor?.motorRPM,
      motorCurrent: telem?.motor?.phaseCurrent,
      motorTemp: telem?.motor?.temperature,
      vescWattage: telem?.vesc?.wattage,
      vescCurrent: telem?.vesc?.current,
      vescTemp: telem?.vesc?.temperature,
      throttlePercent: telem?.vesc?.throttle,
    };

    try {
      const existing = await AsyncStorage.getItem(PENDING_DATA_KEY);
      const pendingData = existing ? JSON.parse(existing) : [];
      pendingData.push({ tripId: trip.id, dataPoint, timestamp: Date.now() });
      await AsyncStorage.setItem(PENDING_DATA_KEY, JSON.stringify(pendingData));
    } catch (e) {
      console.error("[Trip] Error storing data point:", e);
    }
  }, []);

  // Start/stop timers based on recording state ONLY
  useEffect(() => {
    if (activeTrip && isRecording) {
      console.log("[Trip] Starting timers for trip:", activeTrip.id);
      
      if (!durationRef.current) {
        durationRef.current = setInterval(() => {
          setTripDuration(prev => prev + 1);
        }, 1000);
      }
      
      if (!recordingRef.current) {
        recordingRef.current = setInterval(recordTelemetryPoint, TRIP_INTERVAL_MS);
      }
    } else {
      stopAllTimers();
    }

    return () => {
      // Only cleanup on unmount, not on every re-render
    };
  }, [activeTrip?.id, isRecording, recordTelemetryPoint, stopAllTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAllTimers();
  }, [stopAllTimers]);

  const startTrip = async (name?: string): Promise<boolean> => {
    if (!user?.id) {
      console.log("[Trip] Cannot start: no user");
      return false;
    }

    // On native with real motor, use real serial. On web/demo, use fallback
    const serialNumber = telemetry?.tillerSerialNumber || motor?.serialNumber || "DEMO-MOTOR";
    const tripName = name || `Trip ${new Date().toLocaleDateString()}`;
    const tripId = `trip-${Date.now()}`;

    console.log("[Trip] Starting trip:", { tripId, serialNumber, userId: user.id });

    const trip: Trip = {
      id: tripId,
      userId: user.id,
      motorSerialNumber: serialNumber,
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

    setIsLoading(true);
    try {
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      const localTrips: Trip[] = existing ? JSON.parse(existing) : [];
      localTrips.push(trip);
      await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(localTrips));
      await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(trip));

      resetTripState();
      setActiveTrip(trip);
      setIsRecording(true);
      console.log("[Trip] Started successfully:", tripId);
      return true;
    } catch (error) {
      console.error("[Trip] Error starting:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const endTrip = async (): Promise<boolean> => {
    if (!activeTrip) return false;

    console.log("[Trip] Ending trip:", activeTrip.id);
    setIsLoading(true);
    stopAllTimers();

    try {
      const localTripsStr = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (localTripsStr) {
        const localTrips: Trip[] = JSON.parse(localTripsStr);
        const updatedTrips = localTrips.map(trip =>
          trip.id === activeTrip.id
            ? {
                ...trip,
                endTime: new Date(),
                isActive: false,
                endBatteryPercent: telemetry?.bms?.capacity ?? null,
                totalDistanceKm: tripStats.totalDistanceKm,
                maxSpeedKmh: tripStats.maxSpeedKmh,
                avgSpeedKmh: tripStats.avgSpeedKmh,
                totalEnergyWh: tripStats.totalEnergyWh,
              }
            : trip
        );
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(updatedTrips));
      }
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      setActiveTrip(null);
      setIsRecording(false);
      console.log("[Trip] Ended successfully");
      return true;
    } catch (error) {
      console.error("[Trip] Error ending:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TripContext.Provider
      value={{
        activeTrip,
        isRecording,
        startTrip,
        endTrip,
        isLoading,
        tripDuration,
        tripStats,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (context === undefined) {
    throw new Error("useTrip must be used within a TripProvider");
  }
  return context;
}
