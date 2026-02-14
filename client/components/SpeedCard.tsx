import React, { useCallback } from "react";
import { StyleSheet, View, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { usePhoneSpeed } from "@/hooks/usePhoneSpeed";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

const supportsGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

interface SpeedCardProps {
  motorSpeed: number;
  isConnected: boolean;
}

export function SpeedCard({ motorSpeed, isConnected }: SpeedCardProps) {
  const { theme } = useTheme();
  const { addDebugLog } = useMotor();
  
  // Memoize the callback to prevent unnecessary re-renders
  const handleGPSLog = useCallback((level: "INFO" | "DATA" | "PARSE" | "STATE" | "ERROR", message: string) => {
    addDebugLog(level, message);
  }, [addDebugLog]);
  
  // Always track phone GPS speed, regardless of motor connection
  // Pass the debug log callback to see GPS data in the debug modal
  const phoneSpeed = usePhoneSpeed(true, handleGPSLog);
  
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
    <View style={[styles.container, !supportsGlass && { backgroundColor: "rgba(44,44,46,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }]}>
      {supportsGlass ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor="rgba(20,20,22,0.35)"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: BladeColors.marine + "30" }]}>
          <Feather name="navigation" size={18} color={BladeColors.marine} />
        </View>
        <ThemedText type="caption" style={[styles.label, { color: "rgba(255,255,255,0.55)" }]}>
          SPEED
        </ThemedText>
      </View>
      
      <View style={styles.speedsContainer}>
        <View style={styles.speedRow}>
          <View style={styles.speedLabelRow}>
            <Feather name="radio" size={12} color={BladeColors.marine} />
            <ThemedText type="caption" style={[styles.speedLabel, { color: "rgba(255,255,255,0.55)" }]}>
              Motor GPS
            </ThemedText>
          </View>
          <View style={styles.speedValueRow}>
            <ThemedText 
              type="h1" 
              style={[
                styles.speedValue, 
                { color: isConnected ? getSpeedColor(safeMotorSpeed) : "rgba(255,255,255,0.35)" }
              ]}
            >
              {isConnected ? displayMotorSpeed : "--"}
            </ThemedText>
            <ThemedText type="small" style={[styles.unit, { color: "rgba(255,255,255,0.55)" }]}>
              km/h
            </ThemedText>
          </View>
        </View>
        
        <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
        
        <View style={styles.speedRow}>
          <View style={styles.speedLabelRow}>
            <Feather name="smartphone" size={12} color={BladeColors.accent} />
            <ThemedText type="caption" style={[styles.speedLabel, { color: "rgba(255,255,255,0.55)" }]}>
              Phone GPS{phoneSpeed.speedSource === "calculated" ? " (calc)" : phoneSpeed.speedSource === "gps" ? " (native)" : ""}
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
                { color: phoneSpeed.speed !== null ? getSpeedColor(phoneSpeed.speed) : "rgba(255,255,255,0.35)" }
              ]}
            >
              {displayPhoneSpeed}
            </ThemedText>
            <ThemedText type="small" style={[styles.unit, { color: "rgba(255,255,255,0.55)" }]}>
              km/h
            </ThemedText>
          </View>
        </View>
      </View>
      
      <View style={[styles.noteContainer, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
        <Feather name="info" size={12} color="rgba(255,255,255,0.4)" />
        <ThemedText type="caption" style={styles.noteText}>
          Phone GPS is more accurate than motor GPS for speed measurement
        </ThemedText>
      </View>
      
      {phoneSpeed.accuracy !== null || phoneSpeed.error ? (
        <View style={styles.accuracyRow}>
          {phoneSpeed.accuracy !== null ? (
            <ThemedText type="caption" style={{ color: phoneSpeed.accuracy < 10 ? BladeColors.success : phoneSpeed.accuracy < 30 ? BladeColors.warning : "rgba(255,255,255,0.4)" }}>
              GPS accuracy: {phoneSpeed.accuracy.toFixed(0)}m
            </ThemedText>
          ) : null}
          {phoneSpeed.error ? (
            <ThemedText type="caption" style={{ color: BladeColors.error }}>
              {phoneSpeed.error}
            </ThemedText>
          ) : null}
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
    overflow: "hidden",
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
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    flex: 1,
  },
  accuracyRow: {
    marginTop: Spacing.xs,
    alignItems: "flex-end",
  },
});
