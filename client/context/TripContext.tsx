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

  // Sync pending data points to server when online
  const syncPendingData = async () => {
    try {
      const existing = await AsyncStorage.getItem(PENDING_DATA_KEY);
      if (!existing) return;
      
      const pendingData: { tripId: number; dataPoint: Partial<TripDataPoint> }[] = JSON.parse(existing);
      if (pendingData.length === 0) return;

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) return;

      const failedItems: { tripId: number; dataPoint: Partial<TripDataPoint> }[] = [];
      
      for (const item of pendingData) {
        try {
          await apiRequest("POST", `/api/trips/${item.tripId}/data`, item.dataPoint);
        } catch (error) {
          failedItems.push(item);
        }
      }

      if (failedItems.length > 0) {
        await AsyncStorage.setItem(PENDING_DATA_KEY, JSON.stringify(failedItems));
      } else {
        await AsyncStorage.removeItem(PENDING_DATA_KEY);
      }
    } catch (error) {
      console.error("Error syncing pending data:", error);
    }
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

  // Start duration timer when trip starts (regardless of motor connection)
  useEffect(() => {
    if (activeTrip && isRecording) {
      startDurationTimer();
    } else {
      stopDurationTimer();
    }
    return () => stopDurationTimer();
  }, [activeTrip, isRecording, startDurationTimer, stopDurationTimer]);

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
  const createLocalTrip = async (name: string, startBatteryPercent?: number): Promise<Trip> => {
    const localId = `local-${Date.now()}`; // Local ID prefix to distinguish from server-created trips
    const trip: Trip = {
      id: localId,
      userId: user!.id,
      motorSerialNumber: motor!.serialNumber,
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

  // Sync local trips to server when online
  const syncLocalTrips = async () => {
    try {
      const existing = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (!existing) return;

      const localTrips: Trip[] = JSON.parse(existing);
      if (localTrips.length === 0) return;

      const netState = await NetInfo.fetch();
      if (!netState.isConnected) return;

      const remainingTrips: Trip[] = [];

      for (const trip of localTrips) {
        try {
          // Create trip on server
          const response = await apiRequest("POST", "/api/trips/start", {
            userId: trip.userId,
            motorSerialNumber: trip.motorSerialNumber,
            name: trip.name,
            startBatteryPercent: trip.startBatteryPercent,
          });
          const data = await response.json();

          if (data.trip) {
            // Update pending data points with new server trip ID
            const pendingDataStr = await AsyncStorage.getItem(PENDING_DATA_KEY);
            if (pendingDataStr) {
              const pendingData = JSON.parse(pendingDataStr);
              const updatedPending = pendingData.map((item: { tripId: string; dataPoint: Partial<TripDataPoint> }) => 
                item.tripId === trip.id ? { ...item, tripId: data.trip.id } : item
              );
              await AsyncStorage.setItem(PENDING_DATA_KEY, JSON.stringify(updatedPending));
            }

            // If this was the active trip, update the active trip reference
            const activeTripStr = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
            if (activeTripStr) {
              const activeLocalTrip = JSON.parse(activeTripStr);
              if (activeLocalTrip.id === trip.id) {
                setActiveTrip(data.trip);
                await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(data.trip));
              }
            }

            // End the trip on server if it was already ended locally
            if (trip.endTime) {
              await apiRequest("POST", `/api/trips/${data.trip.id}/end`, {
                endBatteryPercent: trip.endBatteryPercent,
                totalDistanceKm: trip.totalDistanceKm,
                maxSpeedKmh: trip.maxSpeedKmh,
                avgSpeedKmh: trip.avgSpeedKmh,
                totalEnergyWh: trip.totalEnergyWh,
              });
            }
          } else {
            remainingTrips.push(trip);
          }
        } catch (error) {
          remainingTrips.push(trip);
        }
      }

      if (remainingTrips.length > 0) {
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(remainingTrips));
      } else {
        await AsyncStorage.removeItem(LOCAL_TRIPS_KEY);
      }

      // Sync pending data points
      await syncPendingData();
    } catch (error) {
      console.error("Error syncing local trips:", error);
    }
  };

  // Sync local trips when network becomes available
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        syncLocalTrips();
      }
    });
    // Also try to sync on mount
    syncLocalTrips();
    return () => unsubscribe();
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
    const tripName = name || `Trip ${new Date().toLocaleDateString()}`;
    const startBatteryPercent = telemetry?.bms?.capacity;

    try {
      // Check if we're online
      const netState = await NetInfo.fetch();
      
      if (netState.isConnected) {
        // Online: create trip on server
        const response = await apiRequest("POST", "/api/trips/start", {
          userId: user.id,
          motorSerialNumber: motor.serialNumber,
          name: tripName,
          startBatteryPercent,
        });

        const data = await response.json();
        if (data.trip) {
          resetTripState();
          setActiveTrip(data.trip);
          setIsRecording(true);
          await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(data.trip));
          return true;
        }
        
        // Server returned but no trip - show error
        Alert.alert(
          "Could Not Start Trip",
          data.error || "An unexpected error occurred. Please try again.",
          [{ text: "OK" }]
        );
        return false;
      } else {
        // Offline: create local trip
        const localTrip = await createLocalTrip(tripName, startBatteryPercent);
        resetTripState();
        setActiveTrip(localTrip);
        setIsRecording(true);
        return true;
      }
    } catch (error) {
      console.error("Error starting trip, trying offline mode:", error);
      
      // Network error: create local trip
      try {
        const localTrip = await createLocalTrip(tripName, startBatteryPercent);
        resetTripState();
        setActiveTrip(localTrip);
        setIsRecording(true);
        return true;
      } catch (localError) {
        console.error("Error creating local trip:", localError);
        Alert.alert(
          "Error",
          "Could not start trip. Please try again.",
          [{ text: "OK" }]
        );
        return false;
      }
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
      // Check if this is a local trip (local- prefix)
      if (String(activeTrip.id).startsWith('local-')) {
        // Update local trip with end data
        const localTripsStr = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
        if (localTripsStr) {
          const localTrips: Trip[] = JSON.parse(localTripsStr);
          const updatedTrips = localTrips.map(trip => 
            trip.id === activeTrip.id
              ? {
                  ...trip,
                  endTime: new Date(),
                  ...tripData,
                }
              : trip
          );
          await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(updatedTrips));
        }
        await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
        setActiveTrip(null);
        setIsRecording(false);
        
        // Try to sync if online
        const netState = await NetInfo.fetch();
        if (netState.isConnected) {
          syncLocalTrips();
        }
        return true;
      }

      // Online trip - try to end on server
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        const response = await apiRequest("POST", `/api/trips/${activeTrip.id}/end`, tripData);
        const data = await response.json();
        if (data.success) {
          await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
          setActiveTrip(null);
          setIsRecording(false);
          return true;
        }
      } else {
        // Offline - store end data locally to sync later
        const localTripsStr = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
        const localTrips: Trip[] = localTripsStr ? JSON.parse(localTripsStr) : [];
        const endedTrip = {
          ...activeTrip,
          endTime: new Date(),
          ...tripData,
        };
        localTrips.push(endedTrip);
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(localTrips));
        await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
        setActiveTrip(null);
        setIsRecording(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error ending trip:", error);
      // Try to save locally on error
      try {
        const localTripsStr = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
        const localTrips: Trip[] = localTripsStr ? JSON.parse(localTripsStr) : [];
        const endedTrip = {
          ...activeTrip,
          endTime: new Date(),
          ...tripData,
        };
        localTrips.push(endedTrip);
        await AsyncStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(localTrips));
        await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
        setActiveTrip(null);
        setIsRecording(false);
        return true;
      } catch (localError) {
        console.error("Error saving trip locally:", localError);
        return false;
      }
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
