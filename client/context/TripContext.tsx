import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import type { Trip, TripDataPoint } from "@shared/schema";

const ACTIVE_TRIP_KEY = "@blade_active_trip";
const TRIP_INTERVAL_MS = 30000; // Check telemetry every 30 seconds

interface TripContextType {
  activeTrip: Trip | null;
  isRecording: boolean;
  startTrip: (name?: string) => Promise<boolean>;
  endTrip: () => Promise<boolean>;
  isLoading: boolean;
  tripDuration: number; // Duration in seconds, tracked client-side
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

  useEffect(() => {
    if (user?.id) {
      fetchActiveTrip();
    }
  }, [user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [activeTrip]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (
      appStateRef.current === "active" &&
      (nextAppState === "background" || nextAppState === "inactive") &&
      activeTrip &&
      isRecording
    ) {
      await endTripSilently();
    }
    appStateRef.current = nextAppState;
  };

  const endTripSilently = async () => {
    if (!activeTrip) return;
    
    stopDataRecording();
    try {
      await apiRequest("POST", `/api/trips/${activeTrip.id}/end`, {
        endBatteryPercent: telemetry?.bms?.capacity,
      });
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      setActiveTrip(null);
      setIsRecording(false);
    } catch (error) {
      console.error("Error auto-ending trip:", error);
    }
  };

  useEffect(() => {
    if (activeTrip && isRecording && motor?.isConnected) {
      startDataRecording();
    } else {
      stopDataRecording();
    }
    return () => stopDataRecording();
  }, [activeTrip, isRecording, motor?.isConnected]);

  const fetchActiveTrip = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(
        new URL(`/api/trips/user/${user.id}/active`, getApiUrl()).toString()
      );
      if (response.ok) {
        const trip = await response.json();
        if (trip) {
          setActiveTrip(trip);
          setIsRecording(true);
        }
      }
    } catch (error) {
      console.error("Error fetching active trip:", error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const startDurationTimer = useCallback(() => {
    if (durationRef.current) return;
    durationRef.current = setInterval(() => {
      setTripDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
  }, []);

  const startDataRecording = useCallback(() => {
    if (recordingRef.current) return;

    startDurationTimer();

    recordingRef.current = setInterval(async () => {
      if (!activeTrip || !telemetry) return;

      const latitude = telemetry.gnss?.latitude || location?.latitude;
      const longitude = telemetry.gnss?.longitude || location?.longitude;
      const speedKmh = telemetry.gnss?.speed || 0;
      const powerKw = (telemetry.vesc?.wattage || 0) / 1000;
      const energyWhThisInterval = powerKw * (TRIP_INTERVAL_MS / 3600000) * 1000;

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
      } else if (latitude && longitude) {
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
      const avgSpeed = speedSamplesRef.current.reduce((a, b) => a + b, 0) / speedSamplesRef.current.length;
      setTripStats(prev => ({ ...prev, avgSpeedKmh: avgSpeed }));

      try {
        await apiRequest("POST", `/api/trips/${activeTrip.id}/data`, {
          latitude,
          longitude,
          speedKmh,
          course: telemetry.gnss?.course || location?.heading,
          batteryPercent: telemetry.bms?.capacity,
          batteryVoltage: telemetry.bms?.voltage,
          batteryCurrent: telemetry.bms?.current,
          batteryTemp: telemetry.bms?.temperature,
          motorRpm: telemetry.motor?.motorRPM,
          motorCurrent: telemetry.motor?.phaseCurrent,
          motorTemp: telemetry.motor?.temperature,
          vescWattage: telemetry.vesc?.wattage,
          vescCurrent: telemetry.vesc?.current,
          vescTemp: telemetry.vesc?.temperature,
          throttlePercent: telemetry.vesc?.throttle,
        });
      } catch (error) {
        console.error("Error recording trip data:", error);
      }
    }, TRIP_INTERVAL_MS);
  }, [activeTrip, telemetry, location, startDurationTimer]);

  const stopDataRecording = useCallback(() => {
    stopDurationTimer();
    if (recordingRef.current) {
      clearInterval(recordingRef.current);
      recordingRef.current = null;
    }
  }, [stopDurationTimer]);

  const resetTripState = useCallback(() => {
    setTripDuration(0);
    setTripStats({
      totalDistanceKm: 0,
      totalEnergyWh: 0,
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
    });
    lastPositionRef.current = null;
    speedSamplesRef.current = [];
  }, []);

  const startTrip = async (name?: string): Promise<boolean> => {
    // Check for missing requirements and provide user feedback
    if (!user?.id) {
      console.error("Cannot start trip: no user logged in");
      Alert.alert(
        "Sign In Required",
        "Please sign in or continue as guest to record trips.",
        [{ text: "OK" }]
      );
      return false;
    }
    
    if (!motor?.serialNumber) {
      console.error("Cannot start trip: no motor serial number", { motor });
      Alert.alert(
        "Motor Not Ready",
        "Please connect to your outboard motor first. Make sure Bluetooth is connected and the motor is responding.",
        [{ text: "OK" }]
      );
      return false;
    }
    
    if (!motor?.isConnected) {
      console.error("Cannot start trip: motor not connected");
      Alert.alert(
        "Motor Disconnected",
        "Your motor connection was lost. Please reconnect via Bluetooth.",
        [{ text: "OK" }]
      );
      return false;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/trips/start", {
        userId: user.id,
        motorSerialNumber: motor.serialNumber,
        name: name || `Trip ${new Date().toLocaleDateString()}`,
        startBatteryPercent: telemetry?.bms?.capacity,
      });

      const data = await response.json();
      if (data.trip) {
        resetTripState();
        setActiveTrip(data.trip);
        setIsRecording(true);
        return true;
      }
      
      // Server returned but no trip - show error
      Alert.alert(
        "Could Not Start Trip",
        data.error || "An unexpected error occurred. Please try again.",
        [{ text: "OK" }]
      );
      return false;
    } catch (error) {
      console.error("Error starting trip:", error);
      Alert.alert(
        "Connection Error",
        "Could not connect to the server. Please check your internet connection.",
        [{ text: "OK" }]
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const endTrip = async (): Promise<boolean> => {
    if (!activeTrip) return false;

    setIsLoading(true);
    stopDataRecording();
    try {
      const response = await apiRequest("POST", `/api/trips/${activeTrip.id}/end`, {
        endBatteryPercent: telemetry?.bms?.capacity,
        totalDistanceKm: tripStats.totalDistanceKm,
        maxSpeedKmh: tripStats.maxSpeedKmh,
        avgSpeedKmh: tripStats.avgSpeedKmh,
        totalEnergyWh: tripStats.totalEnergyWh,
      });

      const data = await response.json();
      if (data.success) {
        setActiveTrip(null);
        setIsRecording(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error ending trip:", error);
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
