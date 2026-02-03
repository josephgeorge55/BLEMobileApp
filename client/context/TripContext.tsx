import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import type { Trip, TripDataPoint } from "@shared/schema";

const ACTIVE_TRIP_KEY = "@blade_active_trip";
const PENDING_DATA_KEY = "@blade_pending_trip_data";
const LOCAL_TRIPS_KEY = "@blade_local_trips";
const TRIP_INTERVAL_MS = 5000; // Log telemetry every 5 seconds

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
      // Update trip in local storage
      const localTripsStr = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (localTripsStr) {
        const localTrips: Trip[] = JSON.parse(localTripsStr);
        const updatedTrips = localTrips.map(trip => 
          trip.id === activeTrip.id
            ? { ...trip, endTime: new Date(), endBatteryPercent: telemetry?.bms?.capacity ?? null, isActive: false }
            : trip
        );
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(updatedTrips));
      }
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      setActiveTrip(null);
      setIsRecording(false);
      console.log("[TripContext] Trip ended silently");
    } catch (error) {
      console.error("[TripContext] Error auto-ending trip:", error);
    }
  };

  const fetchActiveTrip = async () => {
    if (!user?.id) return;
    try {
      // Check local storage for active trip
      const activeTripStr = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
      if (activeTripStr) {
        const trip: Trip = JSON.parse(activeTripStr);
        if (trip.userId === user.id && trip.isActive) {
          console.log("[TripContext] Restored active trip from local storage:", trip.id);
          setActiveTrip(trip);
          setIsRecording(true);
        }
      }
    } catch (error) {
      console.error("[TripContext] Error fetching active trip:", error);
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

  // Store data point locally for offline support
  const storeDataPointLocally = async (tripId: string, dataPoint: Partial<TripDataPoint>) => {
    try {
      const existing = await AsyncStorage.getItem(PENDING_DATA_KEY);
      let pendingData: { tripId: string; dataPoint: Partial<TripDataPoint> }[] = [];
      try {
        pendingData = existing ? JSON.parse(existing) : [];
      } catch {
        pendingData = [];
      }
      pendingData.push({ tripId, dataPoint });
      await AsyncStorage.setItem(PENDING_DATA_KEY, JSON.stringify(pendingData));
    } catch (error) {
      console.error("Error storing data locally:", error);
    }
  };

  // Data points are stored locally - no server sync needed
  const syncPendingData = async () => {
    // No-op: data is stored locally only
  };

  // Try to sync pending data when network becomes available
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        syncPendingData();
      }
    });
    return () => unsubscribe();
  }, []);

  // Stop all recording (timer and data collection)
  const stopDataRecording = useCallback(() => {
    stopDurationTimer();
    if (recordingRef.current) {
      clearInterval(recordingRef.current);
      recordingRef.current = null;
    }
  }, [stopDurationTimer]);

  // Start duration timer only when motor is connected during an active trip
  useEffect(() => {
    if (activeTrip && isRecording && motor?.isConnected) {
      startDurationTimer();
    } else {
      stopDurationTimer();
    }
    return () => stopDurationTimer();
  }, [activeTrip, isRecording, motor?.isConnected, startDurationTimer, stopDurationTimer]);

  // Start/stop data recording when motor is connected during an active trip
  useEffect(() => {
    if (activeTrip && isRecording && motor?.isConnected) {
      // Only start the data recording interval, timer is already running
      if (!recordingRef.current) {
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

          const dataPoint: Partial<TripDataPoint> = {
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
          };

          await storeDataPointLocally(activeTrip.id, dataPoint);

          const netState = await NetInfo.fetch();
          if (netState.isConnected) {
            syncPendingData();
          }
        }, TRIP_INTERVAL_MS);
      }
    } else if (recordingRef.current) {
      clearInterval(recordingRef.current);
      recordingRef.current = null;
    }
    return () => {
      if (recordingRef.current) {
        clearInterval(recordingRef.current);
        recordingRef.current = null;
      }
    };
  }, [activeTrip, isRecording, motor?.isConnected, telemetry, location]);

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

  // Create a local trip when offline
  const createLocalTrip = async (name: string, serialNumber: string, startBatteryPercent?: number): Promise<Trip> => {
    const localId = `local-${Date.now()}`; // Local ID prefix to distinguish from server-created trips
    const trip: Trip = {
      id: localId,
      userId: user!.id,
      motorSerialNumber: serialNumber,
      name,
      startTime: new Date(),
      endTime: null,
      startBatteryPercent: startBatteryPercent ?? null,
      endBatteryPercent: null,
      totalDistanceKm: 0,
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
      totalEnergyWh: 0,
      isActive: true,
    };

    // Store local trip
    const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
    const localTrips: Trip[] = existing ? JSON.parse(existing) : [];
    localTrips.push(trip);
    await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(localTrips));
    await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(trip));

    return trip;
  };

  // Trips are stored locally only - no server sync needed
  const syncLocalTrips = async () => {
    // No-op: trips are stored locally and don't need server sync
    console.log("[TripContext] Trips are stored locally - no server sync needed");
  };

  const startTrip = async (name?: string): Promise<boolean> => {
    console.log("[TripContext] startTrip called - beginning checks");
    
    // Get the real motor serial number - prefer telemetry data for real Bluetooth connections
    // because motor.serialNumber might be the Bluetooth address initially
    const tillerSerial = telemetry?.tillerSerialNumber;
    const motorSerial = motor?.serialNumber;
    
    // Use tiller serial from telemetry if available and motor serial looks like a BT address
    const isBluetoothAddress = motorSerial?.includes(':');
    const effectiveSerialNumber = (isBluetoothAddress && tillerSerial) ? tillerSerial : motorSerial;
    
    console.log("[TripContext] Serial number resolution:", { 
      userId: user?.id, 
      motorSerial,
      tillerSerial,
      isBluetoothAddress,
      effectiveSerialNumber,
      isConnected: motor?.isConnected,
      hasTelemetry: !!telemetry
    });
    
    // Check for missing requirements and provide user feedback
    if (!user?.id) {
      console.error("[TripContext] Cannot start trip: no user logged in");
      Alert.alert(
        "Sign In Required",
        "Please sign in or continue as guest to record trips.",
        [{ text: "OK" }]
      );
      return false;
    }
    
    if (!motor?.isConnected) {
      console.error("[TripContext] Cannot start trip: motor not connected");
      Alert.alert(
        "Motor Not Connected",
        "Please connect to your outboard motor first. Go to Settings and tap 'Connect Motor' to scan for available devices.",
        [{ text: "OK" }]
      );
      return false;
    }
    
    // Check if we have a real serial number (not a Bluetooth MAC address)
    if (!effectiveSerialNumber) {
      console.error("[TripContext] Cannot start trip: no motor serial number", { motor, telemetry });
      Alert.alert(
        "Motor Not Ready",
        "The motor hasn't sent its identity yet. Please wait a few seconds and try again.",
        [{ text: "OK" }]
      );
      return false;
    }
    
    // If still using Bluetooth address with no tiller serial, allow but warn
    if (isBluetoothAddress && !tillerSerial) {
      console.warn("[TripContext] Warning: Using Bluetooth address as serial - motor INFOR data not yet received");
      // We'll still allow the trip to start but use the Bluetooth address
      // This ensures trips can be recorded even before INFOR frame arrives
    }

    console.log("[TripContext] All checks passed, starting trip with serial:", effectiveSerialNumber);
    setIsLoading(true);
    const tripName = name || `Trip ${new Date().toLocaleDateString()}`;
    const startBatteryPercent = telemetry?.bms?.capacity;
    
    console.log("[TripContext] Trip parameters:", { tripName, startBatteryPercent });

    try {
      // Always use local storage for trips - no server dependency
      console.log("[TripContext] Creating local trip...");
      const localTrip = await createLocalTrip(tripName, effectiveSerialNumber, startBatteryPercent);
      resetTripState();
      setActiveTrip(localTrip);
      setIsRecording(true);
      console.log("[TripContext] Trip started successfully:", localTrip.id);
      return true;
    } catch (error: any) {
      console.error("[TripContext] Error creating trip:", error);
      Alert.alert(
        "Error",
        error.message || "Could not start trip. Please try again.",
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

    const tripData = {
      endBatteryPercent: telemetry?.bms?.capacity ?? null,
      totalDistanceKm: tripStats.totalDistanceKm,
      maxSpeedKmh: tripStats.maxSpeedKmh,
      avgSpeedKmh: tripStats.avgSpeedKmh,
      totalEnergyWh: tripStats.totalEnergyWh,
    };

    try {
      // Update trip in local storage
      const localTripsStr = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (localTripsStr) {
        const localTrips: Trip[] = JSON.parse(localTripsStr);
        const updatedTrips = localTrips.map(trip => 
          trip.id === activeTrip.id
            ? {
                ...trip,
                endTime: new Date(),
                isActive: false,
                ...tripData,
              }
            : trip
        );
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(updatedTrips));
        console.log("[TripContext] Trip ended and saved to local storage:", activeTrip.id);
      }
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      setActiveTrip(null);
      setIsRecording(false);
      return true;
    } catch (error) {
      console.error("[TripContext] Error ending trip:", error);
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
