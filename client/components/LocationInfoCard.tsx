import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BladeColors, Shadows } from "@/constants/theme";

interface LocationInfoCardProps {
  latitude: number;
  longitude: number;
  timestamp: Date;
  isLive: boolean;
  speed?: number;
}

export function LocationInfoCard({
  latitude,
  longitude,
  timestamp,
  isLive,
  speed,
}: LocationInfoCardProps) {
  const { theme } = useTheme();

  const formatCoordinate = (coord: number, isLat: boolean) => {
    const direction = isLat ? (coord >= 0 ? "N" : "S") : coord >= 0 ? "E" : "W";
    return `${Math.abs(coord).toFixed(6)}° ${direction}`;
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hr ago`;
    return date.toLocaleDateString();
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      style={[styles.card, { backgroundColor: theme.surface }, Shadows.medium]}
    >
      <View style={styles.header}>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isLive ? BladeColors.live : BladeColors.offline },
            ]}
          />
          <ThemedText
            type="small"
            style={{
              color: isLive ? BladeColors.live : theme.textSecondary,
              fontWeight: "600",
            }}
          >
            {isLive ? "Live" : "Last Known"}
          </ThemedText>
        </View>
        <View style={styles.timestampContainer}>
          <Feather name="clock" size={14} color={theme.textSecondary} />
          <ThemedText
            type="caption"
            style={[styles.timestamp, { color: theme.textSecondary }]}
          >
            {formatTimestamp(timestamp)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.coordinates}>
        <View style={styles.coordRow}>
          <Feather name="map-pin" size={16} color={BladeColors.primary} />
          <ThemedText type="mono" style={styles.coordText}>
            {formatCoordinate(latitude, true)}
          </ThemedText>
        </View>
        <View style={styles.coordRow}>
          <View style={{ width: 16 }} />
          <ThemedText type="mono" style={styles.coordText}>
            {formatCoordinate(longitude, false)}
          </ThemedText>
        </View>
      </View>

      {speed !== undefined && speed > 0 ? (
        <View style={styles.speedContainer}>
          <Feather name="navigation" size={14} color={BladeColors.accent} />
          <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
            {speed.toFixed(1)} knots
          </ThemedText>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    bottom: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  timestamp: {
    marginLeft: Spacing.xs,
  },
  coordinates: {
    gap: Spacing.xs,
  },
  coordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  coordText: {
    fontVariant: ["tabular-nums"],
  },
  speedContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
});
