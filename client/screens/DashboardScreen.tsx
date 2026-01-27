import React, { useEffect, useCallback } from "react";
import { StyleSheet, View, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { MetricCard } from "@/components/MetricCard";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { EmptyState } from "@/components/EmptyState";
import { MetricCardSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BladeColors } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
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

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={BladeColors.primary}
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
          entering={FadeInUp.delay(100).duration(400)}
          style={styles.metricRow}
        >
          <MetricCard
            icon="navigation"
            label="Speed"
            value={speed.toFixed(1)}
            unit="kts"
            iconColor={BladeColors.primary}
          />
          <View style={{ width: Spacing.md }} />
          <MetricCard
            icon="battery-charging"
            label="Battery"
            value={Math.round(soc)}
            unit="%"
            iconColor={
              soc > 50
                ? BladeColors.success
                : soc > 20
                  ? BladeColors.warning
                  : BladeColors.error
            }
          />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(200).duration(400)}
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
            iconColor={BladeColors.primary}
          />
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeIn.delay(300).duration(400)}
        style={styles.statusSection}
      >
        <ThemedText
          type="caption"
          style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}
        >
          MOTOR STATUS
        </ThemedText>
        <View style={[styles.statusCard, { backgroundColor: theme.surface }]}>
          <View style={styles.statusRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Serial Number
            </ThemedText>
            <ThemedText type="mono">{motor.serialNumber}</ThemedText>
          </View>
          <View style={[styles.statusRow, styles.statusRowBorder]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Connection
            </ThemedText>
            <View style={styles.statusValue}>
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
              <ThemedText type="small">
                {isConnected ? "Connected via BLE" : "Disconnected"}
              </ThemedText>
            </View>
          </View>
          <View style={styles.statusRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Last Updated
            </ThemedText>
            <ThemedText type="small">
              {telemetry?.timestamp
                ? new Date(telemetry.timestamp).toLocaleTimeString()
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
    marginTop: Spacing["2xl"],
  },
  statusCard: {
    borderRadius: 12,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statusRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.05)",
    marginVertical: Spacing.xs,
  },
  statusValue: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
});
