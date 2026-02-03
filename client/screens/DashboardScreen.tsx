import React, { useEffect, useCallback, useState } from "react";
import { StyleSheet, View, ScrollView, RefreshControl, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { MetricCard } from "@/components/MetricCard";
import { SpeedCard } from "@/components/SpeedCard";
import { EmptyState } from "@/components/EmptyState";
import { DebugLogModal } from "@/components/DebugLogModal";
import { WeatherCard } from "@/components/WeatherCard";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

interface LocationQueryData {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
  isLive: boolean;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { theme, isDark } = useTheme();
  const { motor, telemetry, isConnecting, startScan, setLocation, debugLogs } =
    useMotor();

  const [showDebugModal, setShowDebugModal] = useState(false);
  const isConnected = motor?.isConnected ?? false;
  const serialNumber = motor?.serialNumber;

  const { data: locationData, refetch: refetchLocation } = useQuery<LocationQueryData>({
    queryKey: ["/api/motor", serialNumber, "location"],
    enabled: !!serialNumber && !isConnected,
    refetchInterval: isConnected ? false : 30000,
  });

  useEffect(() => {
    if (locationData && !isConnected) {
      setLocation({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        speed: locationData.speed,
        heading: locationData.heading,
        timestamp: new Date(locationData.timestamp),
        isLive: locationData.isLive,
      });
    }
  }, [locationData, isConnected]);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchLocation();
    setRefreshing(false);
  }, [refetchLocation]);

  const handleConnect = () => {
    startScan();
    navigation.navigate("BleScanner");
  };

  if (!motor) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.screenPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Feather name="cloud" size={14} color={theme.textSecondary} />
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}>
            Marine Weather
          </ThemedText>
        </View>
        <WeatherCard />
        
        <EmptyState
          image={require("../../assets/images/halo-outboard.png")}
          title="Connect Your Outboard"
          description="Tap the Bluetooth button to scan for nearby Blade outboards and view real-time telemetry."
          actionLabel="Scan for Motors"
          onAction={handleConnect}
        />
      </ScrollView>
    );
  }

  const speed = telemetry?.speed ?? 0;
  const soc = telemetry?.stateOfCharge ?? 0;
  const power = telemetry?.powerConsumption ?? 0;
  const firmware = telemetry?.tillerFirmwareVersion ?? motor.firmwareVersion ?? "--";
  const odometer = telemetry?.odometer;
  const driverMode = telemetry?.driverMode;
  const errorCode = telemetry?.errorCode;
  const errorDescription = telemetry?.errorDescription;

  const bms = telemetry?.bms;
  const motorData = telemetry?.motor;
  const vesc = telemetry?.vesc;

  const getDriverModeColor = (mode: string | null | undefined) => {
    switch (mode) {
      case "Sport": return BladeColors.error;
      case "Normal": return BladeColors.accent;
      case "Eco": return BladeColors.success;
      case "Docking": return BladeColors.marine;
      default: return theme.textSecondary;
    }
  };

  const getBatteryColor = () => {
    if (soc > 60) return BladeColors.success;
    if (soc > 30) return BladeColors.accent;
    if (soc > 15) return BladeColors.warning;
    return BladeColors.error;
  };

  const getTemperatureColor = (temp: number) => {
    if (temp < 40) return BladeColors.success;
    if (temp < 55) return BladeColors.accent;
    if (temp < 70) return BladeColors.warning;
    return BladeColors.error;
  };

  return (
    <>
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
      {isConnected ? (
        <Animated.View
          entering={FadeInUp.duration(400).springify()}
          style={[styles.connectedCard, { backgroundColor: "#181F27" }]}
        >
          <View style={styles.connectedCardGlow} />
          <View style={styles.connectedCardContent}>
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.connectedMotorImage}
              resizeMode="contain"
            />
            <View style={styles.connectedMotorInfo}>
              <View style={styles.connectedMotorHeader}>
                <ThemedText type="h3" style={{ color: "#EBEFF3" }}>Blade Halo</ThemedText>
                <View style={[styles.statusPill, { backgroundColor: BladeColors.success + "25" }]}>
                  <View style={[styles.statusDot, { backgroundColor: BladeColors.success }]} />
                  <ThemedText type="caption" style={{ color: BladeColors.success, fontWeight: "600" }}>
                    Live
                  </ThemedText>
                </View>
              </View>
              <ThemedText type="mono" style={styles.connectedSerial}>
                S/N: {telemetry?.tillerSerialNumber || motor?.serialNumber || "--"}
              </ThemedText>
              <View style={styles.connectedMetaRow}>
                <View style={styles.connectedMetaItem}>
                  <Feather name="cpu" size={12} color="#596F7C" />
                  <ThemedText type="caption" style={styles.connectedMetaText}>
                    v{firmware}
                  </ThemedText>
                </View>
                <View style={styles.connectedMetaItem}>
                  <Feather name="clock" size={12} color="#596F7C" />
                  <ThemedText type="caption" style={styles.connectedMetaText}>
                    {odometer != null ? `${odometer.toFixed(0)} hrs` : "-- hrs"}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <Pressable
        onPress={() => setShowDebugModal(true)}
        style={[styles.debugButton, { backgroundColor: theme.surface }]}
      >
        <Feather name="terminal" size={14} color={theme.textSecondary} />
        <ThemedText type="caption" style={{ marginLeft: Spacing.xs, color: theme.textSecondary }}>
          Debug Log ({debugLogs.length})
        </ThemedText>
      </Pressable>

      {errorCode ? (
        <Animated.View
          entering={FadeInUp.duration(300).springify()}
          style={[styles.errorBanner, { backgroundColor: BladeColors.error + "20", borderColor: BladeColors.error }]}
        >
          <View style={styles.errorContent}>
            <Feather name="alert-triangle" size={20} color={BladeColors.error} />
            <View style={styles.errorText}>
              <ThemedText type="body" style={{ color: BladeColors.error, fontWeight: "600" }}>
                Error {errorCode}
              </ThemedText>
              <ThemedText type="small" style={{ color: BladeColors.error, opacity: 0.9 }}>
                {errorDescription}
              </ThemedText>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInUp.delay(50).duration(400).springify()}>
        <View style={styles.sectionHeader}>
          <Feather name="cloud" size={14} color={theme.textSecondary} />
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}>
            Marine Weather
          </ThemedText>
        </View>
        <WeatherCard />
      </Animated.View>

      <View style={styles.metricsGrid}>
        <Animated.View
          entering={FadeInUp.delay(100).duration(400).springify()}
        >
          <SpeedCard 
            motorSpeed={speed} 
            isConnected={isConnected} 
          />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(150).duration(400).springify()}
          style={styles.metricRow}
        >
          <MetricCard
            icon="battery-charging"
            label="Battery"
            value={Math.round(soc)}
            unit="%"
            iconColor={getBatteryColor()}
            accentGlow={soc < 20}
          />
          <View style={{ width: Spacing.md }} />
          <MetricCard
            icon="zap"
            label="Power"
            value={power.toFixed(1)}
            unit="kW"
            trend={power > 0 ? "up" : "stable"}
            iconColor={BladeColors.accent}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(200).duration(400).springify()}
          style={styles.metricRow}
        >
          <MetricCard
            icon="percent"
            label="Throttle"
            value={vesc?.throttle ?? 0}
            unit="%"
            iconColor={BladeColors.marine}
            accentGlow={(vesc?.throttle ?? 0) > 80}
          />
          <View style={{ width: Spacing.md }} />
          <MetricCard
            icon={driverMode === "Sport" ? "zap" : driverMode === "Eco" ? "sun" : driverMode === "Docking" ? "anchor" : "disc"}
            label="Drive Mode"
            value={driverMode || "--"}
            iconColor={getDriverModeColor(driverMode)}
            compact
          />
        </Animated.View>
      </View>

      {isConnected && (bms || motorData || vesc) ? (
        <>
          <Animated.View
            entering={FadeIn.delay(300).duration(400)}
            style={styles.statusSection}
          >
            <ThemedText
              type="caption"
              style={[styles.sectionLabel, { color: theme.textTertiary }]}
            >
              BATTERY (BMS)
            </ThemedText>
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: "#181F27",
                  borderColor: "transparent",
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "25" }]}>
                    <Feather name="zap" size={14} color={BladeColors.accent} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Voltage
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {bms?.voltage.toFixed(1) ?? "--"} V
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "25" }]}>
                    <Feather name="activity" size={14} color={BladeColors.marine} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Current
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {bms?.current.toFixed(1) ?? "--"} A
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: getTemperatureColor(bms?.temperature ?? 0) + "25" }]}>
                    <Feather name="thermometer" size={14} color={getTemperatureColor(bms?.temperature ?? 0)} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Temperature
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {bms?.temperature ?? "--"}°C
                </ThemedText>
              </View>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(400).duration(400)}
            style={styles.statusSection}
          >
            <ThemedText
              type="caption"
              style={[styles.sectionLabel, { color: theme.textTertiary }]}
            >
              MOTOR
            </ThemedText>
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: "#181F27",
                  borderColor: "transparent",
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "25" }]}>
                    <Feather name="rotate-cw" size={14} color={BladeColors.marine} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    RPM
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {motorData?.motorRPM ?? "--"}
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "25" }]}>
                    <Feather name="activity" size={14} color={BladeColors.accent} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Phase Current
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {motorData?.phaseCurrent.toFixed(1) ?? "--"} A
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: getTemperatureColor(motorData?.temperature ?? 0) + "25" }]}>
                    <Feather name="thermometer" size={14} color={getTemperatureColor(motorData?.temperature ?? 0)} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Temperature
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {motorData?.temperature ?? "--"}°C
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        </>
      ) : null}

      <Animated.View
        entering={FadeIn.delay(isConnected ? 600 : 300).duration(400)}
        style={styles.statusSection}
      >
        <ThemedText
          type="caption"
          style={[styles.sectionLabel, { color: theme.textTertiary }]}
        >
          DEVICE INFO
        </ThemedText>
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: "#181F27",
              borderColor: "transparent",
            },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: theme.primary + "25" }]}>
                <Feather name="hash" size={14} color={theme.primary} />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Serial Number
              </ThemedText>
            </View>
            <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
              {motor.serialNumber}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "25" }]}>
                <Feather name="clock" size={14} color={BladeColors.marine} />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Odometer
              </ThemedText>
            </View>
            <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
              {odometer != null ? `${odometer.toFixed(1)} hrs` : "--"}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: theme.primary + "25" }]}>
                <Feather name="cpu" size={14} color={theme.primary} />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Firmware
              </ThemedText>
            </View>
            <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
              v{firmware}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View
                style={[
                  styles.statusIcon,
                  { backgroundColor: (isConnected ? BladeColors.success : BladeColors.offline) + "25" },
                ]}
              >
                <Feather
                  name="bluetooth"
                  size={14}
                  color={isConnected ? BladeColors.success : BladeColors.offline}
                />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
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
              <ThemedText type="small" style={{ fontWeight: "500", color: "#EBEFF3" }}>
                {isConnected ? "Connected" : "Disconnected"}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: "#596F7C" + "25" }]}>
                <Feather name="clock" size={14} color="#596F7C" />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Last Updated
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ fontWeight: "500", color: "#EBEFF3" }}>
              {telemetry?.timestamp
                ? new Date(telemetry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "--"}
            </ThemedText>
          </View>
        </View>
      </Animated.View>
    </ScrollView>
    
    <DebugLogModal 
      visible={showDebugModal} 
      onClose={() => setShowDebugModal(false)} 
    />
  </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: Spacing.screenPadding,
  },
  logoHeader: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#181F27",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 32,
    height: 32,
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
    paddingVertical: Spacing.sm,
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
    gap: Spacing.sm,
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
  debugButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  errorBanner: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    flex: 1,
  },
  connectedCard: {
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    overflow: "hidden",
    position: "relative",
  },
  connectedCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: BladeColors.accent,
    opacity: 0.6,
  },
  connectedCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  connectedMotorImage: {
    width: 80,
    height: 100,
    marginRight: Spacing.md,
  },
  connectedMotorInfo: {
    flex: 1,
  },
  connectedMotorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  connectedSerial: {
    color: "#596F7C",
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  connectedMetaRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  connectedMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  connectedMetaText: {
    color: "#596F7C",
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
