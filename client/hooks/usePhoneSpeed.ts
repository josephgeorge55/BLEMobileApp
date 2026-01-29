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
  const [isInitialized, setIsInitialized] = useState(false);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const initAttemptRef = useRef(0);

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
    
    // Increment attempt counter
    initAttemptRef.current += 1;
    const currentAttempt = initAttemptRef.current;
    
    try {
      // Add a small delay before checking services to let the system settle
      if (Platform.OS === "android") {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (!isMountedRef.current || currentAttempt !== initAttemptRef.current) return;
      
      // Check if location services are available
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

      // Add delay before starting watch on Android
      if (Platform.OS === "android") {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      if (!isMountedRef.current || currentAttempt !== initAttemptRef.current) return;

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (location) => {
          if (!isMountedRef.current) return;
          
          try {
            const speedMs = location.coords.speed;
            if (speedMs !== null && speedMs >= 0) {
              const speedKmh = speedMs * 3.6;
              setSpeed(speedKmh);
            } else {
              setSpeed(null);
            }
            setAccuracy(location.coords.accuracy);
            setIsTracking(true);
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

    // Delay GPS initialization significantly to prevent startup crashes
    // Android needs more time for the native modules to fully initialize
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
  };
}
