import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { LocationInfoCard } from "@/components/LocationInfoCard";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { BladeColors, Spacing, BorderRadius } from "@/constants/theme";

export default function LocationScreen() {
  const { theme } = useTheme();
  const { motor, location, setLocation } = useMotor();

  const serialNumber = motor?.serialNumber;

  const { data: locationData } = useQuery({
    queryKey: ["/api/motor", serialNumber, "location"],
    enabled: !!serialNumber,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (locationData) {
      setLocation({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        speed: locationData.speed,
        heading: locationData.heading,
        timestamp: new Date(locationData.timestamp),
        isLive: locationData.isLive,
      });
    }
  }, [locationData]);

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

  if (!location) {
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
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={styles.mapPlaceholder}>
        <View style={[styles.iconContainer, { backgroundColor: BladeColors.primary + "20" }]}>
          <Feather name="map" size={48} color={BladeColors.primary} />
        </View>
        <ThemedText type="h3" style={styles.title}>
          Map View
        </ThemedText>
        <ThemedText type="body" style={[styles.description, { color: theme.textSecondary }]}>
          The interactive map is available when running in Expo Go on your mobile device.
        </ThemedText>
        <View style={[styles.coordinateCard, { backgroundColor: theme.surface }]}>
          <View style={styles.coordinateRow}>
            <Feather name="map-pin" size={16} color={BladeColors.primary} />
            <ThemedText type="mono" style={styles.coordinateText}>
              {location.latitude.toFixed(6)}°, {location.longitude.toFixed(6)}°
            </ThemedText>
          </View>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: location.isLive ? BladeColors.live : BladeColors.offline },
              ]}
            />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {location.isLive ? "Live Location" : "Last Known Location"}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="caption" style={[styles.hint, { color: theme.textSecondary }]}>
          Scan the QR code in the URL bar to open in Expo Go
        </ThemedText>
      </View>

      <LocationInfoCard
        latitude={location.latitude}
        longitude={location.longitude}
        timestamp={location.timestamp}
        isLive={location.isLive}
        speed={location.speed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  title: {
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginBottom: Spacing["2xl"],
  },
  coordinateCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing["2xl"],
    minWidth: 280,
  },
  coordinateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  coordinateText: {
    fontVariant: ["tabular-nums"],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hint: {
    textAlign: "center",
    fontStyle: "italic",
  },
});
