import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { usePhoneSpeed } from "@/hooks/usePhoneSpeed";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

interface SpeedCardProps {
  motorSpeed: number;
  isConnected: boolean;
}

export function SpeedCard({ motorSpeed, isConnected }: SpeedCardProps) {
  const { theme } = useTheme();
  const phoneSpeed = usePhoneSpeed(isConnected);
  
  // Defensive null check for motorSpeed
  const safeMotorSpeed = typeof motorSpeed === "number" && !isNaN(motorSpeed) ? motorSpeed : 0;
  const displayMotorSpeed = safeMotorSpeed.toFixed(1);
  const displayPhoneSpeed = phoneSpeed.speed !== null && !isNaN(phoneSpeed.speed) ? phoneSpeed.speed.toFixed(1) : "--";
  
  const getSpeedColor = (speed: number) => {
    if (speed > 20) return BladeColors.accent;
    if (speed > 5) return BladeColors.marine;
    return theme.textSecondary;
  };

  return (
    <View style={[styles.container, { backgroundColor: "#181F27" }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: BladeColors.marine + "25" }]}>
          <Feather name="navigation" size={18} color={BladeColors.marine} />
        </View>
        <ThemedText type="caption" style={[styles.label, { color: "#596F7C" }]}>
          SPEED
        </ThemedText>
      </View>
      
      <View style={styles.speedsContainer}>
        <View style={styles.speedRow}>
          <View style={styles.speedLabelRow}>
            <Feather name="radio" size={12} color={BladeColors.marine} />
            <ThemedText type="caption" style={[styles.speedLabel, { color: "#596F7C" }]}>
              Motor GPS
            </ThemedText>
          </View>
          <View style={styles.speedValueRow}>
            <ThemedText 
              type="h1" 
              style={[
                styles.speedValue, 
                { color: isConnected ? getSpeedColor(safeMotorSpeed) : "#596F7C" }
              ]}
            >
              {isConnected ? displayMotorSpeed : "--"}
            </ThemedText>
            <ThemedText type="small" style={[styles.unit, { color: "#596F7C" }]}>
              km/h
            </ThemedText>
          </View>
        </View>
        
        <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />
        
        <View style={styles.speedRow}>
          <View style={styles.speedLabelRow}>
            <Feather name="smartphone" size={12} color={BladeColors.accent} />
            <ThemedText type="caption" style={[styles.speedLabel, { color: "#596F7C" }]}>
              Phone GPS
            </ThemedText>
            {phoneSpeed.isTracking ? (
              <View style={[styles.liveIndicator, { backgroundColor: BladeColors.success }]} />
            ) : null}
          </View>
          <View style={styles.speedValueRow}>
            <ThemedText 
              type="h2" 
              style={[
                styles.phoneSpeedValue, 
                { color: phoneSpeed.speed !== null ? getSpeedColor(phoneSpeed.speed) : "#596F7C" }
              ]}
            >
              {displayPhoneSpeed}
            </ThemedText>
            <ThemedText type="small" style={[styles.unit, { color: "#596F7C" }]}>
              km/h
            </ThemedText>
          </View>
        </View>
      </View>
      
      <View style={[styles.noteContainer, { backgroundColor: "#1E2832" }]}>
        <Feather name="info" size={12} color="#596F7C" />
        <ThemedText type="caption" style={styles.noteText}>
          Phone GPS is more accurate than motor GPS for speed measurement
        </ThemedText>
      </View>
      
      {phoneSpeed.accuracy !== null ? (
        <View style={styles.accuracyRow}>
          <ThemedText type="caption" style={{ color: "#596F7C" }}>
            Phone accuracy: {phoneSpeed.accuracy.toFixed(0)}m
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.cardPadding,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  speedsContainer: {
    marginBottom: Spacing.md,
  },
  speedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  speedLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  speedLabel: {
    fontSize: 11,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 4,
  },
  speedValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.xs,
  },
  speedValue: {
    fontSize: 32,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  phoneSpeedValue: {
    fontSize: 24,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: 14,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
  },
  noteContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  noteText: {
    color: "#596F7C",
    fontSize: 10,
    flex: 1,
  },
  accuracyRow: {
    marginTop: Spacing.xs,
    alignItems: "flex-end",
  },
});
