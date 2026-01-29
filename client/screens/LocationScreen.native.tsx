import React from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OpenStreetMap } from "@/components/OpenStreetMap";
import { FindMyPanel } from "@/components/FindMyPanel";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { BladeColors, Spacing } from "@/constants/theme";

interface LocationQueryData {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
  isLive: boolean;
}

export default function LocationScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { motor, location, setLocation, telemetry } = useMotor();

  const serialNumber = motor?.serialNumber;

  const { data: locationData, refetch } = useQuery<LocationQueryData>({
    queryKey: ["/api/motor", serialNumber, "location"],
    enabled: !!serialNumber && !motor?.isConnected,
    refetchInterval: 10000,
  });

  React.useEffect(() => {
    if (locationData && !motor?.isConnected) {
      setLocation({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        speed: locationData.speed,
        heading: locationData.heading,
        timestamp: new Date(locationData.timestamp),
        isLive: locationData.isLive,
      });
    }
  }, [locationData, motor?.isConnected]);

  const currentLocation = motor?.isConnected && telemetry?.gnss
    ? {
        latitude: telemetry.gnss.latitude,
        longitude: telemetry.gnss.longitude,
        speed: telemetry.gnss.speed,
        heading: telemetry.gnss.course,
        timestamp: new Date(),
        isLive: true,
      }
    : location;

  const handleFind = () => {
    refetch();
  };

  if (!motor) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-location.png")}
          title="No Motor Connected"
          description="Connect to your Blade outboard to view its current or last known location."
        />
      </View>
    );
  }

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
              title: motor.name || "Blade Outboard",
              color: currentLocation.isLive ? BladeColors.success : BladeColors.marine,
              isLive: currentLocation.isLive,
            },
          ]}
          showUserLocation
        />
      </View>

      <View style={[styles.panelContainer, { paddingBottom: insets.bottom }]}>
        <FindMyPanel
          motorName={motor.name || "Blade Outboard"}
          serialNumber={motor.serialNumber}
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
