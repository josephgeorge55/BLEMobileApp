import { useState, useEffect, useRef, useCallback } from "react";
import * as Location from "expo-location";
import { AppState } from "react-native";

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

  const stopTracking = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setHasPermission(false);
        setError("Location permission denied");
        return;
      }
      setHasPermission(true);
      setError(null);

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
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
      console.error("Phone GPS error:", err);
      setError(err.message || "Failed to start GPS tracking");
      setIsTracking(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopTracking();
      return;
    }

    const handleAppStateChange = (nextAppState: string) => {
      if (appStateRef.current === "active" && nextAppState !== "active") {
        stopTracking();
      } else if (appStateRef.current !== "active" && nextAppState === "active") {
        startTracking();
      }
      appStateRef.current = nextAppState as typeof appStateRef.current;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    
    startTracking();

    return () => {
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
