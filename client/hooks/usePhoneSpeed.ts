import { useState, useEffect, useRef, useCallback } from "react";
import * as Location from "expo-location";
import { AppState, Platform } from "react-native";

interface PhoneSpeedData {
  speed: number | null;
  accuracy: number | null;
  isTracking: boolean;
  hasPermission: boolean;
  error: string | null;
}

export function usePhoneSpeed(enabled: boolean = true): PhoneSpeedData {
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);

  const stopTracking = useCallback(() => {
    try {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (isMountedRef.current) {
        setIsTracking(false);
      }
    } catch (err) {
      console.warn("Error stopping GPS tracking:", err);
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      // Check if location services are available
      const isEnabled = await Location.hasServicesEnabledAsync();
      if (!isEnabled) {
        if (isMountedRef.current) {
          setError("Location services disabled");
          setIsTracking(false);
        }
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMountedRef.current) return;
      
      if (status !== "granted") {
        setHasPermission(false);
        setError("Location permission denied");
        return;
      }
      setHasPermission(true);
      setError(null);

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (location) => {
          if (!isMountedRef.current) return;
          
          const speedMs = location.coords.speed;
          if (speedMs !== null && speedMs >= 0) {
            const speedKmh = speedMs * 3.6;
            setSpeed(speedKmh);
          } else {
            setSpeed(null);
          }
          setAccuracy(location.coords.accuracy);
          setIsTracking(true);
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

    // Delay GPS initialization to prevent startup crashes
    const initTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        startTracking();
      }
    }, 1500);

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
  };
}
