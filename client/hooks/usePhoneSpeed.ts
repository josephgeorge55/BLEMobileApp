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
  latitude: number | null;
  longitude: number | null;
}

type DebugLogLevel = "INFO" | "DATA" | "PARSE" | "STATE" | "ERROR";
type DebugLogCallback = (level: DebugLogLevel, message: string) => void;

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

export function usePhoneSpeed(enabled: boolean = true, onDebugLog?: DebugLogCallback): PhoneSpeedData {
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speedSource, setSpeedSource] = useState<"gps" | "calculated" | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const lastPositionRef = useRef<PositionHistory | null>(null);
  const speedHistoryRef = useRef<number[]>([]);
  const onDebugLogRef = useRef(onDebugLog);
  
  // Keep the callback ref updated
  useEffect(() => {
    onDebugLogRef.current = onDebugLog;
  }, [onDebugLog]);
  
  // Helper to log to both console and debug modal
  const logGPS = useCallback((level: DebugLogLevel, message: string) => {
    console.log(`[GPS] ${message}`);
    if (onDebugLogRef.current) {
      onDebugLogRef.current(level, `[GPS] ${message}`);
    }
  }, []);

  const stopTracking = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    if (isMountedRef.current) {
      setIsTracking(false);
    }
    lastPositionRef.current = null;
    speedHistoryRef.current = [];
  }, []);

  const startTracking = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    logGPS("INFO", `Starting phone GPS tracking (Platform: ${Platform.OS})`);
    
    try {
      // Check if location services are available
      const isAvailable = await Location.hasServicesEnabledAsync();
      logGPS("INFO", `Location services available: ${isAvailable}`);
      
      if (!isAvailable) {
        logGPS("ERROR", "Location services are disabled on device");
        if (isMountedRef.current) {
          setError("Location services disabled");
          setIsTracking(false);
        }
        return;
      }

      // Request permissions
      logGPS("INFO", "Requesting foreground location permission...");
      const { status } = await Location.requestForegroundPermissionsAsync();
      logGPS("INFO", `Permission status: ${status}`);
      
      if (!isMountedRef.current) return;
      
      if (status !== "granted") {
        setHasPermission(false);
        setError("Location permission denied");
        logGPS("ERROR", "Location permission DENIED by user");
        return;
      }
      
      setHasPermission(true);
      setError(null);
      logGPS("INFO", "Location permission GRANTED");
      
      if (!isMountedRef.current) return;

      // Clear previous data
      lastPositionRef.current = null;
      speedHistoryRef.current = [];
      logGPS("INFO", "Starting position watch with BestForNavigation accuracy...");

      // Start watching position
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          if (!isMountedRef.current) return;
          
          const { latitude: lat, longitude: lng, speed: gpsSpeed, accuracy: locAccuracy } = location.coords;
          const timestamp = location.timestamp;
          
          setAccuracy(locAccuracy);
          setLatitude(lat);
          setLongitude(lng);
          setIsTracking(true);
          
          // Log the raw GPS data received
          logGPS("DATA", `Position: ${lat.toFixed(6)}, ${lng.toFixed(6)} | Accuracy: ${locAccuracy?.toFixed(1) ?? 'N/A'}m | Raw speed: ${gpsSpeed !== null ? (gpsSpeed * 3.6).toFixed(2) + ' km/h' : 'null'}`);
          
          let calculatedSpeed: number | null = null;
          let source: "gps" | "calculated" | null = null;
          
          // Try native GPS speed first
          if (gpsSpeed !== null && gpsSpeed >= 0) {
            calculatedSpeed = gpsSpeed * 3.6; // m/s to km/h
            source = "gps";
          }
          
          // Fallback to calculated speed if GPS speed is not available or zero
          if ((calculatedSpeed === null || calculatedSpeed < 0.5) && lastPositionRef.current) {
            const timeDeltaSeconds = (timestamp - lastPositionRef.current.timestamp) / 1000;
            
            if (timeDeltaSeconds > 0.5 && timeDeltaSeconds < 10) {
              const distanceMeters = calculateHaversineDistance(
                lastPositionRef.current.latitude,
                lastPositionRef.current.longitude,
                lat,
                lng
              );
              
              // Only calculate if distance is significant relative to accuracy
              if (locAccuracy !== null && distanceMeters > Math.max(locAccuracy * 0.3, 1)) {
                const speedMs = distanceMeters / timeDeltaSeconds;
                const calcSpeedKmh = speedMs * 3.6;
                
                // Sanity check - ignore unrealistic speeds
                if (calcSpeedKmh <= 150) {
                  calculatedSpeed = calcSpeedKmh;
                  source = "calculated";
                }
              }
            }
          }
          
          // Update position history
          lastPositionRef.current = { latitude: lat, longitude: lng, timestamp };
          
          // Smooth the speed with a rolling average
          if (calculatedSpeed !== null && calculatedSpeed >= 0) {
            speedHistoryRef.current.push(calculatedSpeed);
            if (speedHistoryRef.current.length > 3) {
              speedHistoryRef.current.shift();
            }
            
            const avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;
            const finalSpeed = avgSpeed < 0.5 ? 0 : avgSpeed;
            setSpeed(finalSpeed);
            setSpeedSource(source);
            
            // Log computed speed
            logGPS("STATE", `Speed: ${finalSpeed.toFixed(2)} km/h (${source}) | History: [${speedHistoryRef.current.map(s => s.toFixed(1)).join(', ')}]`);
          } else {
            // Decay speed gradually
            if (speedHistoryRef.current.length > 0) {
              speedHistoryRef.current.shift();
            }
            if (speedHistoryRef.current.length === 0) {
              setSpeed(0);
              setSpeedSource(null);
              logGPS("STATE", "Speed: 0 km/h (no valid data)");
            } else {
              const avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;
              setSpeed(avgSpeed < 0.5 ? 0 : avgSpeed);
              logGPS("STATE", `Speed decaying: ${avgSpeed.toFixed(2)} km/h`);
            }
          }
        }
      );
      logGPS("INFO", "Position watch started successfully - GPS active");
    } catch (err: any) {
      logGPS("ERROR", `GPS tracking failed: ${err?.message || 'Unknown error'}`);
      if (isMountedRef.current) {
        setError(err?.message || "Failed to start GPS");
        setIsTracking(false);
      }
    }
  }, [logGPS]);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!enabled) {
      stopTracking();
      return;
    }

    // Start tracking immediately
    startTracking();

    // Handle app state changes
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
    latitude,
    longitude,
  };
}
