import React, { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import LottieView from "lottie-react-native";

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
  type RegisteredMotor,
  type DeviceTelemetry
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
  const { motor, location, setLocation, telemetry } = useMotor();
  const { user, isGuestMode, isFirebaseReady } = useUser();

  const [registeredMotors, setRegisteredMotors] = useState<RegisteredMotor[]>([]);
  const [firestoreLocation, setFirestoreLocation] = useState<LocationData | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const isConnected = motor?.isConnected;
  
  const isPlaceholder = (s: string) => s.includes(':') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
  const getEffectiveSerialNumber = () => {
    if (motor?.serialNumber && !isPlaceholder(motor.serialNumber)) {
      return motor.serialNumber;
    }
    if (telemetry?.tillerSerialNumber && !isPlaceholder(telemetry.tillerSerialNumber)) {
      return telemetry.tillerSerialNumber;
    }
    return registeredMotors[0]?.serialNumber;
  };
  
  const serialNumber = getEffectiveSerialNumber();

  useEffect(() => {
    const loadRegisteredMotors = async () => {
      if (!user || isGuestMode || user.id === "guest" || !isFirebaseReady) {
        if (!isFirebaseReady) return;
        setRegisteredMotors([]);
        return;
      }

      try {
        const motors = await getRegisteredMotors(user.id);
        setRegisteredMotors(motors);
      } catch (error) {
        console.error("[Location] Error loading registered motors:", error);
      }
    };

    loadRegisteredMotors();
  }, [user, isGuestMode, isFirebaseReady]);

  // Fetch GPS from Firestore when not connected via Bluetooth
  const fetchFirestoreGPS = async () => {
    console.log("[Location] fetchFirestoreGPS called with serialNumber:", serialNumber);
    console.log("[Location] motor.serialNumber:", motor?.serialNumber);
    console.log("[Location] telemetry.tillerSerialNumber:", telemetry?.tillerSerialNumber);
    console.log("[Location] registeredMotors:", registeredMotors.map(m => m.serialNumber));
    
    if (!serialNumber) {
      setLocationError("No motor registered for anti-theft tracking");
      return;
    }

    setIsLoadingLocation(true);
    setLocationError(null);

    try {
      console.log("[Location] Fetching GPS from Firestore for serial:", serialNumber);
      const telemetryData = await fetchLatestGPSFromFirestore(serialNumber);
      
      setFirestoreLocation({
        latitude: telemetryData.latitude,
        longitude: telemetryData.longitude,
        timestamp: telemetryData.timestamp,
        isLive: false, // Firestore data is historical (not real-time Bluetooth)
        status: telemetryData.status,
      });

      // Also update the motor context location
      setLocation({
        latitude: telemetryData.latitude,
        longitude: telemetryData.longitude,
        timestamp: telemetryData.timestamp,
        isLive: false,
      });

      setLocationError(null);
    } catch (error: any) {
      console.error("[Location] Firestore GPS fetch error:", error);
      setLocationError(error.message || "Failed to fetch location");
      setFirestoreLocation(null);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Auto-fetch Firestore GPS when not connected and we have a serial number
  useEffect(() => {
    if (!isConnected && serialNumber && !isGuestMode) {
      fetchFirestoreGPS();
    }
  }, [isConnected, serialNumber, isGuestMode]);

  // Determine the current location to display
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
    if (!isConnected) {
      fetchFirestoreGPS();
    }
  };

  if (!motor && registeredMotors.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <LottieView
          source={require("../../assets/lottie/gps.json")}
          autoPlay
          loop
          style={styles.emptyLottie}
        />
        <View style={styles.emptyContent}>
          <View style={styles.emptyIconCircle}>
            <Feather name="shield-off" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>No Motor Registered</Text>
          <Text style={styles.emptyDescription}>
            Register your Blade outboard in Settings to enable anti-theft GPS tracking.
          </Text>
        </View>
      </View>
    );
  }

  if (isGuestMode) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <LottieView
          source={require("../../assets/lottie/gps.json")}
          autoPlay
          loop
          style={styles.emptyLottie}
        />
        <View style={styles.emptyContent}>
          <View style={styles.emptyIconCircle}>
            <Feather name="shield-off" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyDescription}>
            Anti-theft GPS tracking requires a registered account. Please sign in to track your motor's location.
          </Text>
        </View>
      </View>
    );
  }

  if (isLoadingLocation && !currentLocation) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <LottieView
          source={require("../../assets/lottie/gps.json")}
          autoPlay
          loop
          style={styles.emptyLottie}
        />
        <View style={styles.emptyContent}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={[styles.emptyDescription, { marginTop: Spacing.md }]}>
            Fetching location...
          </Text>
        </View>
      </View>
    );
  }

  if (locationError && !currentLocation) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <LottieView
          source={require("../../assets/lottie/gps.json")}
          autoPlay
          loop
          style={styles.emptyLottie}
        />
        <View style={styles.emptyContent}>
          <View style={styles.emptyIconCircle}>
            <Feather name="shield-off" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>No Location Data</Text>
          <Text style={styles.emptyDescription}>{locationError}</Text>
        </View>
      </View>
    );
  }

  if (!currentLocation) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <LottieView
          source={require("../../assets/lottie/gps.json")}
          autoPlay
          loop
          style={styles.emptyLottie}
        />
        <View style={styles.emptyContent}>
          <View style={styles.emptyIconCircle}>
            <Feather name="shield-off" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>No Location Data</Text>
          <Text style={styles.emptyDescription}>
            Your outboard hasn't reported its location yet. Make sure the motor is powered on and has cellular connectivity.
          </Text>
        </View>
      </View>
    );
  }

  const displayName = motor?.name || registeredMotors[0]?.name || "Blade Halo";
  const displaySerial = serialNumber || "--";

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
      <View style={styles.mapContainer}>
        <OpenStreetMap
          style={styles.map}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          markers={[
            {
              coordinate: {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              },
              title: displayName,
              color: currentLocation.isLive ? BladeColors.success : BladeColors.accent,
              isLive: currentLocation.isLive,
            },
          ]}
          showUserLocation
        />
      </View>

      <View style={styles.panelContainer}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    backgroundColor: "#636366",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden" as const,
    paddingBottom: "35%",
  },
  emptyLottie: {
    position: "absolute" as const,
    width: "100%",
    height: "100%",
    opacity: 0.25,
  },
  emptyContent: {
    alignItems: "center" as const,
    paddingHorizontal: Spacing["2xl"],
    zIndex: 1,
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
});
