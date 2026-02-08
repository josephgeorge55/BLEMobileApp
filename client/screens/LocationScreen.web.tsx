import React, { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";

import { OpenStreetMap } from "@/components/OpenStreetMap";
import { FindMyPanel } from "@/components/FindMyPanel";
import { EmptyState } from "@/components/EmptyState";
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
  const { user, isGuestMode } = useUser();

  const [registeredMotors, setRegisteredMotors] = useState<RegisteredMotor[]>([]);
  const [firestoreLocation, setFirestoreLocation] = useState<LocationData | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const isConnected = motor?.isConnected;
  
  // Get the effective serial number:
  // 1. If connected and motor has a valid serial (not Bluetooth MAC address or iOS UUID), use it
  // 2. If connected but motor.serialNumber is a placeholder, check telemetry.tillerSerialNumber (from INFOR G1)
  // 3. Fall back to first registered motor's serial
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

  // Load registered motors for the user
  useEffect(() => {
    const loadRegisteredMotors = async () => {
      if (!user || isGuestMode || user.id === "guest") {
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
  }, [user, isGuestMode]);

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

  // No motor registered and not connected
  if (!motor && registeredMotors.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-location.png")}
          title="No Motor Registered"
          description="Register your Blade outboard in Settings to enable anti-theft GPS tracking."
        />
      </View>
    );
  }

  // Guest mode - can't use anti-theft
  if (isGuestMode) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-location.png")}
          title="Sign In Required"
          description="Anti-theft GPS tracking requires a registered account. Please sign in to track your motor's location."
        />
      </View>
    );
  }

  // Loading state
  if (isLoadingLocation && !currentLocation) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color="#8E8E93" />
        <ThemedText type="body" style={styles.loadingText}>
          Fetching location from Firestore...
        </ThemedText>
      </View>
    );
  }

  // Error state - Device has never connected to GNSS
  if (locationError && !currentLocation) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-location.png")}
          title="No Location Data"
          description={locationError}
        />
      </View>
    );
  }

  // No location data available
  if (!currentLocation) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-location.png")}
          title="No Location Data"
          description="Your outboard hasn't reported its location yet. Make sure the motor is powered on and has cellular connectivity."
        />
      </View>
    );
  }

  const displayName = motor?.name || registeredMotors[0]?.name || "Blade Halo";
  const displaySerial = serialNumber || "--";

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
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
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: "#8E8E93",
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
