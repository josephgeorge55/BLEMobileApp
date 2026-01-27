import React, { useEffect, useCallback } from "react";
import { StyleSheet, View, ScrollView, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { MetricCard } from "@/components/MetricCard";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();
  const { motor, telemetry, isConnecting, startScan, setTelemetry, setLocation } =
    useMotor();

  const isConnected = motor?.isConnected ?? false;
  const serialNumber = motor?.serialNumber;

  const { data: locationData, refetch: refetchLocation } = useQuery({
    queryKey: ["/api/motor", serialNumber, "location"],
    enabled: !!serialNumber,
    refetchInterval: isConnected ? 5000 : 30000,
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

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchLocation();
    setRefreshing(false);
  }, [refetchLocation]);

  const handleConnect = () => {
    startScan();
  };

  if (!motor) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View
          style={[
            styles.emptyContainer,
            {
              paddingTop: headerHeight + Spacing.xl,
              paddingBottom: tabBarHeight + Spacing.xl,
            },
          ]}
        >
          <EmptyState
            image={require("../../assets/images/empty-dashboard.png")}
            title="Connect Your Outboard"
            description="Tap the Bluetooth button to scan for nearby Blade outboards and view real-time telemetry."
            actionLabel="Scan for Motors"
            onAction={handleConnect}
          />
        </View>
      </View>
    );
  }

  const speed = telemetry?.speed ?? 0;
  const soc = telemetry?.stateOfCharge ?? 0;
  const power = telemetry?.powerConsumption ?? 0;
  const firmware = motor.firmwareVersion ?? "--";

  const getBatteryColor = () => {
    if (soc > 60) return BladeColors.success;
    if (soc > 30) return BladeColors.accent;
    if (soc > 15) return BladeColors.warning;
    return BladeColors.error;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing["4xl"],
        paddingHorizontal: Spacing.screenPadding,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primary}
        />
      }
    >
      <ConnectionBanner
        isConnected={isConnected}
        isConnecting={isConnecting}
        motorName={motor.name}
        onPress={handleConnect}
      />

      <View style={styles.metricsGrid}>
        <Animated.View
          entering={FadeInUp.delay(100).duration(400).springify()}
          style={styles.metricRow}
        >
          <MetricCard
            icon="navigation"
            label="Speed"
            value={speed.toFixed(1)}
            unit="kts"
            iconColor={BladeColors.marine}
            accentGlow={speed > 0}
          />
          <View style={{ width: Spacing.md }} />
          <MetricCard
            icon="battery-charging"
            label="Battery"
            value={Math.round(soc)}
            unit="%"
            iconColor={getBatteryColor()}
            accentGlow={soc < 20}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(200).duration(400).springify()}
          style={styles.metricRow}
        >
          <MetricCard
            icon="zap"
            label="Power"
            value={power.toFixed(1)}
            unit="kW"
            trend={power > 0 ? "up" : "stable"}
            iconColor={BladeColors.accent}
          />
          <View style={{ width: Spacing.md }} />
          <MetricCard
            icon="cpu"
            label="Firmware"
            value={firmware}
            badge={firmware !== "1.3.0" ? "Update" : undefined}
            badgeColor={BladeColors.warning}
            iconColor={theme.primary}
          />
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeIn.delay(300).duration(400)}
        style={styles.statusSection}
      >
        <ThemedText
          type="caption"
          style={[styles.sectionLabel, { color: theme.textTertiary }]}
        >
          MOTOR STATUS
        </ThemedText>
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: isDark ? theme.border : "transparent",
            },
          ]}
        >
          <LinearGradient
            colors={[theme.cardGradientStart, theme.cardGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          
          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: theme.primary + "15" }]}>
                <Feather name="hash" size={14} color={theme.primary} />
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Serial Number
              </ThemedText>
            </View>
            <ThemedText type="mono" style={styles.statusValue}>
              {motor.serialNumber}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View
                style={[
                  styles.statusIcon,
                  { backgroundColor: (isConnected ? BladeColors.success : BladeColors.offline) + "15" },
                ]}
              >
                <Feather
                  name="bluetooth"
                  size={14}
                  color={isConnected ? BladeColors.success : BladeColors.offline}
                />
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Connection
              </ThemedText>
            </View>
            <View style={styles.connectionStatus}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isConnected
                      ? BladeColors.success
                      : BladeColors.offline,
                  },
                ]}
              />
              <ThemedText type="small" style={{ fontWeight: "500" }}>
                {isConnected ? "Connected" : "Disconnected"}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: theme.textSecondary + "15" }]}>
                <Feather name="clock" size={14} color={theme.textSecondary} />
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Last Updated
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ fontWeight: "500" }}>
              {telemetry?.timestamp
                ? new Date(telemetry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--"}
            </ThemedText>
          </View>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  metricsGrid: {
    gap: Spacing.md,
  },
  metricRow: {
    flexDirection: "row",
  },
  statusSection: {
    marginTop: Spacing["3xl"],
  },
  sectionLabel: {
    marginBottom: Spacing.md,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  statusCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.cardPadding,
    borderWidth: 1,
    overflow: "hidden",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  statusLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusValue: {
    fontWeight: "600",
  },
  connectionStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
  },
});
