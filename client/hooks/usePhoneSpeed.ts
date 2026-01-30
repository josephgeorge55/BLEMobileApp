import { useState, useEffect, useRef, useCallback } from "react";
import * as Location from "expo-location";
import { AppState, Platform } from "react-native";

interface PhoneSpeedData {
  speed: number | null;
  accuracy: number | null;
  isTracking: boolean;
  hasPermission: boolean;
  error: string | null;
  speedSource: "gps" | "calculated" | null;
}

interface PositionHistory {
  latitude: number;
  longitude: number;
  timestamp: number;
}

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function usePhoneSpeed(enabled: boolean = true): PhoneSpeedData {
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speedSource, setSpeedSource] = useState<"gps" | "calculated" | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const initAttemptRef = useRef(0);
  const lastPositionRef = useRef<PositionHistory | null>(null);
  const speedHistoryRef = useRef<number[]>([]);

  const stopTracking = useCallback(() => {
    try {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (isMountedRef.current) {
        setIsTracking(false);
      }
      lastPositionRef.current = null;
      speedHistoryRef.current = [];
    } catch (err) {
      console.warn("Error stopping GPS tracking:", err);
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    initAttemptRef.current += 1;
    const currentAttempt = initAttemptRef.current;
    
    try {
      if (Platform.OS === "android") {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (!isMountedRef.current || currentAttempt !== initAttemptRef.current) return;
      
      let isEnabled = false;
      try {
        isEnabled = await Location.hasServicesEnabledAsync();
      } catch (serviceError) {
        console.warn("Error checking location services:", serviceError);
        if (isMountedRef.current) {
          setError("Location services unavailable");
          setIsTracking(false);
        }
        return;
      }
      
      if (!isEnabled) {
        if (isMountedRef.current) {
          setError("Location services disabled");
          setIsTracking(false);
        }
        return;
      }

      if (!isMountedRef.current || currentAttempt !== initAttemptRef.current) return;

      let permissionResult;
      try {
        permissionResult = await Location.requestForegroundPermissionsAsync();
      } catch (permError) {
        console.warn("Error requesting location permission:", permError);
        if (isMountedRef.current) {
          setError("Permission request failed");
          setIsTracking(false);
        }
        return;
      }
      
      if (!isMountedRef.current || currentAttempt !== initAttemptRef.current) return;
      
      if (permissionResult.status !== "granted") {
        setHasPermission(false);
        setError("Location permission denied");
        return;
      }
      setHasPermission(true);
      setError(null);
      setIsInitialized(true);

      if (Platform.OS === "android") {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      if (!isMountedRef.current || currentAttempt !== initAttemptRef.current) return;

      lastPositionRef.current = null;
      speedHistoryRef.current = [];

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          if (!isMountedRef.current) return;
          
          try {
            const { latitude, longitude, speed: gpsSpeed, accuracy: locAccuracy } = location.coords;
            const timestamp = location.timestamp;
            
            setAccuracy(locAccuracy);
            setIsTracking(true);
            
            let calculatedSpeed: number | null = null;
            let source: "gps" | "calculated" | null = null;
            
            if (gpsSpeed !== null && gpsSpeed > 0) {
              calculatedSpeed = gpsSpeed * 3.6;
              source = "gps";
            }
            
            if ((calculatedSpeed === null || calculatedSpeed === 0) && lastPositionRef.current) {
              const timeDeltaSeconds = (timestamp - lastPositionRef.current.timestamp) / 1000;
              
              if (timeDeltaSeconds > 0.5 && timeDeltaSeconds < 10) {
                const distanceMeters = calculateHaversineDistance(
                  lastPositionRef.current.latitude,
                  lastPositionRef.current.longitude,
                  latitude,
                  longitude
                );
                
                if (locAccuracy !== null && distanceMeters > locAccuracy * 0.5) {
                  const speedMs = distanceMeters / timeDeltaSeconds;
                  calculatedSpeed = speedMs * 3.6;
                  source = "calculated";
                  
                  if (calculatedSpeed > 100) {
                    calculatedSpeed = null;
                    source = null;
                  }
                }
              }
            }
            
            lastPositionRef.current = { latitude, longitude, timestamp };
            
            if (calculatedSpeed !== null && calculatedSpeed > 0.5) {
              speedHistoryRef.current.push(calculatedSpeed);
              if (speedHistoryRef.current.length > 5) {
                speedHistoryRef.current.shift();
              }
              
              const avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;
              setSpeed(avgSpeed);
              setSpeedSource(source);
            } else if (calculatedSpeed === null || calculatedSpeed < 0.5) {
              if (speedHistoryRef.current.length > 0) {
                speedHistoryRef.current.shift();
              }
              if (speedHistoryRef.current.length === 0) {
                setSpeed(0);
                setSpeedSource(null);
              } else {
                const avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;
                setSpeed(avgSpeed);
              }
            }
          } catch (updateError) {
            console.warn("Error updating GPS state:", updateError);
          }
        }
      );
    } catch (err: any) {
      console.warn("Phone GPS error:", err);
      if (isMountedRef.current) {
        setError(err?.message || "Failed to start GPS tracking");
        setIsTracking(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!enabled) {
      stopTracking();
      return;
    }

    const initDelay = Platform.OS === "android" ? 3000 : 1500;
    const initTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        startTracking();
      }
    }, initDelay);

    const handleAppStateChange = (nextAppState: string) => {
      if (appStateRef.current === "active" && nextAppState !== "active") {
        stopTracking();
      } else if (appStateRef.current !== "active" && nextAppState === "active") {
        startTracking();
      }
      appStateRef.current = nextAppState as typeof appStateRef.current;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      isMountedRef.current = false;
      clearTimeout(initTimeout);
      stopTracking();
      subscription.remove();
    };
  }, [enabled, startTracking, stopTracking]);

  return {
    speed,
    accuracy,
    isTracking,
    hasPermission,
    error,
    speedSource,
  };
}
