import React, { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, Alert, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from "lottie-react-native";
import { Feather } from "@expo/vector-icons";

import { OpenStreetMap } from "@/components/OpenStreetMap";
import { FindMyPanel } from "@/components/FindMyPanel";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useUser } from "@/context/UserContext";
import { BladeColors, Spacing } from "@/constants/theme";
import { 
  getRegisteredMotors, 
  fetchLatestGPSFromFirestore,
  type RegisteredMotor
} from "@/lib/firebase";
import FeatureIntroOverlay, { INTRO_KEY_ANTITHEFT } from "@/components/FeatureIntroOverlay";

interface LocationData {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: Date;
  isLive: boolean;
  status?: string;
}

export default function LocationScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { motor, location, setLocation, telemetry, addDebugLog } = useMotor();
  const { user, isGuestMode, isFirebaseReady } = useUser();

  const [registeredMotors, setRegisteredMotors] = useState<RegisteredMotor[]>([]);
  const [firestoreLocation, setFirestoreLocation] = useState<LocationData | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const isConnected = motor?.isConnected;
  
  const isPlaceholder = (s: string) => s.includes(':') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
  const getEffectiveSerialNumber = (): string | undefined => {
    if (motor?.serialNumber && !isPlaceholder(motor.serialNumber)) {
      return motor.serialNumber;
    }
    if (telemetry?.tillerSerialNumber && !isPlaceholder(telemetry.tillerSerialNumber)) {
      return telemetry.tillerSerialNumber;
    }
    if (registeredMotors.length > 0 && registeredMotors[0]?.serialNumber) {
      return registeredMotors[0].serialNumber;
    }
    return undefined;
  };
  
  const serialNumber = getEffectiveSerialNumber();
  
  useEffect(() => {
    addDebugLog("INFO", `[Location] Serial number resolved: ${serialNumber || 'none'}`);
    addDebugLog("INFO", `[Location] Source: motor=${motor?.serialNumber || 'none'}, telemetry=${telemetry?.tillerSerialNumber || 'none'}, registered=${registeredMotors[0]?.serialNumber || 'none'}`);
  }, [serialNumber, motor?.serialNumber, telemetry?.tillerSerialNumber, registeredMotors]);

  useEffect(() => {
    const loadRegisteredMotors = async () => {
      if (!user || isGuestMode || user.id === "guest" || !isFirebaseReady) {
        if (!isFirebaseReady) return;
        setRegisteredMotors([]);
        return;
      }

      try {
        addDebugLog("INFO", `[Location] Loading registered motors for user: ${user.id}`);
        const motors = await getRegisteredMotors(user.id);
        addDebugLog("INFO", `[Location] Found ${motors.length} registered motors: ${motors.map(m => m.serialNumber).join(', ') || 'none'}`);
        setRegisteredMotors(motors);
      } catch (error: any) {
        console.error("[Location] Error loading registered motors:", error);
        addDebugLog("ERROR", `[Location] Failed to load registered motors: ${error.message || error.code || 'unknown'}`);
      }
    };

    loadRegisteredMotors();
  }, [user, isGuestMode, isFirebaseReady]);

  const fetchFirestoreGPS = async () => {
    addDebugLog("INFO", "--- Firestore GPS Fetch Started ---");
    addDebugLog("INFO", `[Firestore] Target serial: ${serialNumber || 'NONE'}`);
    addDebugLog("INFO", `[Firestore] Query path: devices/${serialNumber || '???'}/telemetry`);
    
    if (!serialNumber) {
      const errorMsg = "No motor serial number available for location lookup";
      addDebugLog("ERROR", `[Firestore] ABORTED: ${errorMsg}`);
      setLocationError(errorMsg);
      Alert.alert("Location Lookup", errorMsg);
      return;
    }

    setIsLoadingLocation(true);
    setLocationError(null);
    addDebugLog("INFO", `[Firestore] Querying Firestore collection: devices/${serialNumber}/telemetry`);
    addDebugLog("INFO", `[Firestore] Looking for most recent document with GPS coordinates...`);

    try {
      const telemetryData = await fetchLatestGPSFromFirestore(serialNumber);
      
      addDebugLog("INFO", `[Firestore] SUCCESS! Retrieved GPS data:`);
      addDebugLog("INFO", `[Firestore]   - Latitude: ${telemetryData.latitude}`);
      addDebugLog("INFO", `[Firestore]   - Longitude: ${telemetryData.longitude}`);
      addDebugLog("INFO", `[Firestore]   - Timestamp: ${telemetryData.timestamp}`);
      addDebugLog("INFO", `[Firestore]   - Status: ${telemetryData.status || 'unknown'}`);
      
      setFirestoreLocation({
        latitude: telemetryData.latitude,
        longitude: telemetryData.longitude,
        timestamp: telemetryData.timestamp,
        isLive: false,
        status: telemetryData.status,
      });

      setLocation({
        latitude: telemetryData.latitude,
        longitude: telemetryData.longitude,
        timestamp: telemetryData.timestamp,
        isLive: false,
      });

      setLocationError(null);
    } catch (error: any) {
      const errorMsg = error.message || "Failed to fetch location";
      addDebugLog("ERROR", `[Firestore] FAILED: ${errorMsg}`);
      addDebugLog("ERROR", `[Firestore] Error code: ${error.code || 'unknown'}`);
      addDebugLog("ERROR", `[Firestore] Check: Is serial number correct? Does Firestore have data for this motor?`);
      console.error("[Firestore] GPS fetch error:", error);
      setLocationError(errorMsg);
      setFirestoreLocation(null);
      Alert.alert("Location Error", errorMsg);
    } finally {
      setIsLoadingLocation(false);
      addDebugLog("INFO", "--- Firestore GPS Fetch Complete ---");
    }
  };

  // Auto-fetch from Firestore when not connected but have a valid serial number
  useEffect(() => {
    if (!isConnected && serialNumber && !isGuestMode) {
      addDebugLog("INFO", "=== AUTO-FETCH TRIGGERED ===");
      addDebugLog("INFO", `[AutoFetch] Conditions met: not connected, have serial, not guest`);
      addDebugLog("INFO", `[AutoFetch] Serial: ${serialNumber}`);
      fetchFirestoreGPS();
    } else if (!serialNumber && registeredMotors.length === 0) {
      addDebugLog("INFO", "[AutoFetch] Waiting: no serial number, no registered motors loaded yet");
    } else if (isConnected) {
      addDebugLog("INFO", "[AutoFetch] Skipped: Motor is connected via Bluetooth (using live GPS)");
    } else if (isGuestMode) {
      addDebugLog("INFO", "[AutoFetch] Skipped: Guest mode - requires signed in user");
    }
  }, [isConnected, serialNumber, isGuestMode, registeredMotors.length]);

  const currentLocation: LocationData | null = isConnected && telemetry?.gnss
    ? {
        latitude: telemetry.gnss.latitude,
        longitude: telemetry.gnss.longitude,
        speed: telemetry.gnss.speed,
        heading: telemetry.gnss.course,
        timestamp: new Date(),
        isLive: true,
      }
    : firestoreLocation || location;

  const handleFind = () => {
    addDebugLog("INFO", "=== FIND BUTTON PRESSED ===");
    addDebugLog("INFO", `[Find] Current state:`);
    addDebugLog("INFO", `[Find]   - isConnected: ${isConnected}`);
    addDebugLog("INFO", `[Find]   - serialNumber: ${serialNumber || 'NONE'}`);
    addDebugLog("INFO", `[Find]   - motor.serialNumber: ${motor?.serialNumber || 'NONE'}`);
    addDebugLog("INFO", `[Find]   - telemetry.tillerSerialNumber: ${telemetry?.tillerSerialNumber || 'NONE'}`);
    addDebugLog("INFO", `[Find]   - registeredMotors: ${registeredMotors.length > 0 ? registeredMotors.map(m => m.serialNumber).join(', ') : 'NONE'}`);
    addDebugLog("INFO", `[Find]   - user.id: ${user?.id || 'NONE'}`);
    addDebugLog("INFO", `[Find]   - isGuestMode: ${isGuestMode}`);
    
    if (isConnected) {
      addDebugLog("INFO", "[Find] ACTION: Motor is connected via Bluetooth - showing live GPS");
      Alert.alert("Live Location", "Motor is connected via Bluetooth. Showing real-time GPS location.");
    } else if (serialNumber) {
      addDebugLog("INFO", `[Find] ACTION: Querying Firestore for serial: ${serialNumber}`);
      addDebugLog("INFO", `[Find] Will search collection: devices/${serialNumber}/telemetry`);
      fetchFirestoreGPS();
    } else {
      addDebugLog("ERROR", "[Find] ACTION: BLOCKED - No serial number available");
      addDebugLog("ERROR", "[Find] Reason: No motor connected, no telemetry serial, no registered motors");
      Alert.alert("No Motor Available", "Please register a motor or connect via Bluetooth to track location.");
    }
  };

  const displayName = motor?.name || registeredMotors[0]?.name || "Blade Halo";
  const displaySerial = serialNumber || "--";

  // Determine what state we're in for overlay rendering
  const showNoMotorState = !motor && registeredMotors.length === 0;
  const showGuestState = isGuestMode && !showNoMotorState;
  const showLoadingState = isLoadingLocation && !currentLocation;
  const showErrorState = locationError && !currentLocation && !showLoadingState;
  const showNoLocationState = !currentLocation && !showLoadingState && !showErrorState && !showNoMotorState && !showGuestState;
  const showMap = currentLocation !== null;

  // Default location for map background (Miami)
  const defaultLocation = { latitude: 25.7617, longitude: -80.1918 };
  const mapLocation = currentLocation || defaultLocation;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FeatureIntroOverlay
        storageKey={INTRO_KEY_ANTITHEFT}
        animation={require("../../assets/lottie/gps.json")}
        pages={[
          {
            title: "Anti-Theft GPS Tracking",
            subtitle: "Your outboard reports its GPS location via cellular even when powered off. Know exactly where your motor is at all times.",
            hints: [
              "The motor sends GPS coordinates hourly via its built-in 4G module",
              "Tracking continues for up to 30 days after the outboard is powered off",
              "A green pin means the motor is live; an amber pin shows last known location",
              "Location data is stored securely in the cloud linked to your account",
            ],
          },
          {
            title: "Reading the Map",
            subtitle: "The map shows your outboard's current or last reported position. Pinch to zoom, and tap the pin for detailed status information.",
            hints: [
              "Pull down to refresh and request the latest GPS position",
              "The timestamp below the map shows when the position was last updated",
              "Your phone's location is also shown so you can see the distance to your motor",
              "If the motor is connected via Bluetooth, live GPS from the motor is used instead",
            ],
          },
          {
            title: "Security Tips",
            subtitle: "Maximise your outboard's security with these practical tips for anti-theft protection.",
            hints: [
              "Register your motor after pairing to enable anti-theft tracking",
              "Check the map regularly when your outboard is stored at a marina",
              "The motor's cellular module activates automatically — no setup needed",
              "Contact Blade support immediately if you notice unexpected movement",
              "Keep your account details secure to protect your motor's location data",
            ],
          },
        ]}
        gradientColors={["#1A2332", "#0F1720"]}
      />
      {/* Always render map in background for smooth transitions */}
      <View style={styles.mapContainer}>
        <OpenStreetMap
          style={styles.map}
          initialRegion={{
            latitude: mapLocation.latitude,
            longitude: mapLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          markers={showMap ? [
            {
              coordinate: {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              },
              title: displayName,
              color: currentLocation.isLive ? BladeColors.success : BladeColors.accent,
              isLive: currentLocation.isLive,
            },
          ] : []}
          showUserLocation
        />
      </View>

      {/* Loading overlay */}
      {showLoadingState ? (
        <View style={styles.overlayContainer}>
          <View style={styles.overlayContent}>
            <ActivityIndicator size="large" color="#8E8E93" />
            <ThemedText type="body" style={styles.loadingText}>
              Fetching location...
            </ThemedText>
          </View>
        </View>
      ) : null}

      {showNoMotorState ? (
        <View style={styles.overlayContainer}>
          <LottieView
            source={require("../../assets/lottie/gps.json")}
            autoPlay
            loop
            style={styles.overlayLottie}
          />
          <View style={styles.overlayContentCentered}>
            <View style={styles.emptyIconCircle}>
              <Feather name="shield-off" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.emptyTitle}>No Motor Registered</Text>
            <Text style={styles.emptyDescription}>
              Register your Blade outboard in Settings to enable anti-theft GPS tracking.
            </Text>
          </View>
        </View>
      ) : null}

      {showGuestState ? (
        <View style={styles.overlayContainer}>
          <LottieView
            source={require("../../assets/lottie/gps.json")}
            autoPlay
            loop
            style={styles.overlayLottie}
          />
          <View style={styles.overlayContentCentered}>
            <View style={styles.emptyIconCircle}>
              <Feather name="shield-off" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.emptyTitle}>Sign In Required</Text>
            <Text style={styles.emptyDescription}>
              Anti-theft GPS tracking requires a registered account. Please sign in to track your motor's location.
            </Text>
          </View>
        </View>
      ) : null}

      {showErrorState ? (
        <View style={styles.overlayContainer}>
          <LottieView
            source={require("../../assets/lottie/gps.json")}
            autoPlay
            loop
            style={styles.overlayLottie}
          />
          <View style={styles.overlayContentCentered}>
            <View style={styles.emptyIconCircle}>
              <Feather name="shield-off" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.emptyTitle}>No Location Data</Text>
            <Text style={styles.emptyDescription}>
              {locationError || "Unable to fetch location"}
            </Text>
          </View>
        </View>
      ) : null}

      {showNoLocationState ? (
        <View style={styles.overlayContainer}>
          <LottieView
            source={require("../../assets/lottie/gps.json")}
            autoPlay
            loop
            style={styles.overlayLottie}
          />
          <View style={styles.overlayContentCentered}>
            <View style={styles.emptyIconCircle}>
              <Feather name="shield-off" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.emptyTitle}>No Location Data</Text>
            <Text style={styles.emptyDescription}>
              Your outboard hasn't reported its location yet. Make sure the motor is powered on and has cellular connectivity.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Panel - only show when we have location */}
      {showMap ? (
        <View style={[styles.panelContainer, { paddingBottom: insets.bottom }]}>
          <FindMyPanel
            motorName={displayName}
            serialNumber={displaySerial}
            latitude={currentLocation.latitude}
            longitude={currentLocation.longitude}
            timestamp={currentLocation.timestamp}
            isLive={currentLocation.isLive}
            onFind={handleFind}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: "#FFFFFF",
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  panelContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#636366",
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden" as const,
  },
  overlayLottie: {
    position: "absolute" as const,
    width: "100%",
    height: "100%",
    opacity: 0.25,
  },
  overlayContentCentered: {
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
    paddingTop: "35%",
    maxWidth: 340,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  emptyDescription: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  overlayContent: {
    backgroundColor: "rgba(30, 45, 65, 0.95)",
    padding: Spacing.xl,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
