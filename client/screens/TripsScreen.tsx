import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserContext";
import { useTrip } from "@/context/TripContext";
import { Card } from "@/components/Card";
import { PullToRefresh } from "@/components/PullToRefresh";
import { BladeColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Trip } from "@shared/schema";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const LOCAL_TRIPS_KEY = "@blade_local_trips";

const DARK_TILE = "#0F1A2E";
const DARK_TILE_BORDER = "#1A2A45";
const TILE_TEXT = "#FFFFFF";
const TILE_TEXT_SECONDARY = "rgba(255,255,255,0.55)";
const TILE_ACCENT = "#3B9EFF";
const SCREEN_BG = "#FFFFFF";

function TripButton({ 
  onPress, 
  isLoading, 
  isStart, 
  disabled,
  disabledReasons,
}: { 
  onPress: () => void; 
  isLoading: boolean; 
  isStart: boolean; 
  disabled?: boolean;
  disabledReasons?: string[];
}) {
  const canPress = !disabled && !isLoading;
  const bgColor = isStart 
    ? (canPress ? BladeColors.success : "#94A3B8")
    : BladeColors.error;
  const icon = isStart ? "play-circle" : "stop-circle";
  const label = isStart ? "Start Recording" : "End Recording";

  const handlePress = () => {
    console.log(`[TripButton] ${label} pressed`);
    if (canPress) {
      onPress();
    }
  };

  return (
    <View>
      <Pressable
        onPress={handlePress}
        disabled={!canPress}
        style={({ pressed }) => [
          styles.tripButton,
          { backgroundColor: bgColor, opacity: pressed ? 0.85 : 1 }
        ]}
        testID={isStart ? "start-trip-btn" : "end-trip-btn"}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Feather name={icon} size={22} color="#FFF" />
            <Text style={styles.tripButtonText}>{label}</Text>
          </>
        )}
      </Pressable>
      {!canPress && disabledReasons && disabledReasons.length > 0 ? (
        <View style={styles.reasonsContainer}>
          {disabledReasons.map((reason, idx) => (
            <View key={idx} style={styles.reasonRow}>
              <Feather name="alert-circle" size={14} color={BladeColors.error} />
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function TripsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user } = useUser();
  const { isRecording, tripDuration, tripStats, isLoading, startTrip, endTrip } = useTrip();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);

  const loadTrips = useCallback(async () => {
    console.log("[Trips] loadTrips called, userId:", user?.id);
    if (!user?.id) {
      console.log("[Trips] No user, skipping load");
      setLoading(false);
      return;
    }
    try {
      const data = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (data) {
        const all: Trip[] = JSON.parse(data);
        const userTrips = all
          .filter(t => t.userId === user.id)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        console.log("[Trips] Loaded", userTrips.length, "trips");
        setTrips(userTrips);
      } else {
        console.log("[Trips] No trips in storage");
        setTrips([]);
      }
    } catch (err) {
      console.error("[Trips] Load error:", err);
      setTrips([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { 
    console.log("[Trips] Screen focused");
    loadTrips(); 
  }, [loadTrips]));

  const handleStartTrip = async () => {
    console.log("[Trips] handleStartTrip called");
    
    if (!user?.id) {
      console.log("[Trips] No user, cannot start");
      if (Platform.OS !== "web") {
        Alert.alert("Sign In Required", "Please sign in to record trips");
      }
      return;
    }

    setButtonLoading(true);
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {}

    try {
      console.log("[Trips] Calling startTrip...");
      const success = await startTrip();
      console.log("[Trips] startTrip result:", success);
      
      if (success) {
        try {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } catch {}
        loadTrips();
      }
    } catch (err) {
      console.error("[Trips] Start error:", err);
    } finally {
      setButtonLoading(false);
    }
  };

  const handleEndTrip = async () => {
    console.log("[Trips] handleEndTrip called");
    
    setButtonLoading(true);
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {}

    try {
      console.log("[Trips] Calling endTrip...");
      const success = await endTrip();
      console.log("[Trips] endTrip result:", success);
      
      if (success) {
        try {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } catch {}
        loadTrips();
      }
    } catch (err) {
      console.error("[Trips] End error:", err);
    } finally {
      setButtonLoading(false);
    }
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDuration = (start: string | Date, end: string | Date | null) => {
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    const diff = endMs - startMs;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const renderTrip = ({ item }: { item: Trip }) => (
    <Pressable
      onPress={() => {
        console.log("[Trips] Trip card pressed, navigating to TripDetail:", item.id);
        navigation.navigate("TripDetail", { tripId: item.id });
      }}
      style={({ pressed }) => [
        styles.tripCard,
        item.isActive ? styles.tripCardActive : null,
        { opacity: pressed ? 0.85 : 1 },
      ]}
      testID={`card-trip-${item.id}`}
    >
      <View style={styles.tripCardHeader}>
        <View style={styles.tripCardIcon}>
          <Feather 
            name={item.isActive ? "navigation" : "anchor"} 
            size={16} 
            color={item.isActive ? BladeColors.success : TILE_ACCENT} 
          />
        </View>
        <View style={styles.tripCardTitleBlock}>
          <Text style={styles.tripCardTitle}>
            {item.name || "Trip"}
          </Text>
          <Text style={styles.tripCardDate}>
            {new Date(item.startTime).toLocaleDateString(undefined, { 
              weekday: "short", 
              month: "short", 
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        {item.isActive ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        ) : (
          <Feather name="chevron-right" size={18} color={TILE_TEXT_SECONDARY} />
        )}
      </View>
      <View style={styles.tripStatsRow}>
        <View style={styles.tripStatItem}>
          <Text style={styles.tripStatValue}>
            {(item.totalDistanceKm || 0).toFixed(1)}
          </Text>
          <Text style={styles.tripStatLabel}>km</Text>
        </View>
        <View style={styles.tripStatDivider} />
        <View style={styles.tripStatItem}>
          <Text style={styles.tripStatValue}>
            {formatDuration(item.startTime, item.endTime)}
          </Text>
          <Text style={styles.tripStatLabel}>duration</Text>
        </View>
        <View style={styles.tripStatDivider} />
        <View style={styles.tripStatItem}>
          <Text style={styles.tripStatValue}>
            {(item.maxSpeedKmh || 0).toFixed(1)}
          </Text>
          <Text style={styles.tripStatLabel}>max km/h</Text>
        </View>
        <View style={styles.tripStatDivider} />
        <View style={styles.tripStatItem}>
          <Text style={styles.tripStatValue}>
            {(item.totalEnergyWh || 0).toFixed(0)}
          </Text>
          <Text style={styles.tripStatLabel}>Wh</Text>
        </View>
      </View>
    </Pressable>
  );

  const ListHeader = () => (
    <View style={styles.headerSection}>
      {isRecording ? (
        <>
          <View style={styles.recordingTile}>
            <View style={styles.recordingHeader}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingLabel}>RECORDING TRIP</Text>
              </View>
              <Text style={styles.timerText}>
                {formatTime(tripDuration)}
              </Text>
            </View>
            <View style={styles.liveStatsRow}>
              <View style={styles.liveStat}>
                <Text style={styles.liveStatValue}>
                  {tripStats.totalDistanceKm.toFixed(2)}
                </Text>
                <Text style={styles.liveStatLabel}>km</Text>
              </View>
              <View style={styles.liveStatDivider} />
              <View style={styles.liveStat}>
                <Text style={styles.liveStatValue}>
                  {tripStats.maxSpeedKmh.toFixed(1)}
                </Text>
                <Text style={styles.liveStatLabel}>max km/h</Text>
              </View>
              <View style={styles.liveStatDivider} />
              <View style={styles.liveStat}>
                <Text style={styles.liveStatValue}>
                  {tripStats.totalEnergyWh.toFixed(0)}
                </Text>
                <Text style={styles.liveStatLabel}>Wh</Text>
              </View>
            </View>
            <Text style={styles.recordingHint}>
              Minimum 60 seconds to save. Auto-stops at 8 hours.
            </Text>
          </View>
          <TripButton 
            onPress={handleEndTrip} 
            isLoading={buttonLoading || isLoading} 
            isStart={false} 
          />
        </>
      ) : (
        <>
          <View style={styles.introTile}>
            <View style={styles.introIconRow}>
              <View style={styles.introIconCircle}>
                <Feather name="navigation" size={22} color={TILE_ACCENT} />
              </View>
              <Text style={styles.introTitle}>Trip Recorder</Text>
            </View>
            <Text style={styles.introDescription}>
              Record your journeys with detailed telemetry including speed, distance, energy consumption, and GPS tracking. Generate PDF reports for each trip.
            </Text>
            <View style={styles.introDetailsRow}>
              <View style={styles.introDetail}>
                <Feather name="clock" size={13} color={TILE_TEXT_SECONDARY} />
                <Text style={styles.introDetailText}>Min 60 sec</Text>
              </View>
              <View style={styles.introDot} />
              <View style={styles.introDetail}>
                <Feather name="clock" size={13} color={TILE_TEXT_SECONDARY} />
                <Text style={styles.introDetailText}>Max 8 hours</Text>
              </View>
              <View style={styles.introDot} />
              <View style={styles.introDetail}>
                <Feather name="zap" size={13} color={TILE_TEXT_SECONDARY} />
                <Text style={styles.introDetailText}>4s intervals</Text>
              </View>
            </View>
          </View>
          <TripButton 
            onPress={handleStartTrip} 
            isLoading={buttonLoading || isLoading} 
            isStart={true}
            disabled={!user?.id}
            disabledReasons={!user?.id ? ["Sign in required to record trips"] : []}
          />
        </>
      )}
      
      {trips.length > 0 ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>TRIP HISTORY</Text>
          <Text style={styles.sectionCount}>{trips.length} {trips.length === 1 ? "trip" : "trips"}</Text>
        </View>
      ) : null}
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Feather name="anchor" size={36} color={TILE_ACCENT} />
      </View>
      <Text style={styles.emptyTitle}>No Trips Yet</Text>
      <Text style={styles.emptySubtitle}>
        Connect to your Blade outboard and tap Start Recording to track your first journey.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={trips}
        keyExtractor={item => item.id}
        renderItem={renderTrip}
        contentContainerStyle={[
          styles.listContent, 
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 }
        ]}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={loading ? null : EmptyState}
        refreshControl={
          <PullToRefresh 
            refreshing={refreshing} 
            onRefresh={() => { setRefreshing(true); loadTrips(); }} 
          />
        }
      />
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={BladeColors.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  listContent: { 
    paddingHorizontal: Spacing.md, 
    flexGrow: 1 
  },
  headerSection: { 
    marginBottom: Spacing.md 
  },
  
  tripButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    minHeight: 56,
  },
  tripButtonText: {
    color: "#FFF",
    fontSize: Typography.sizes.lg,
    fontWeight: "600",
  },
  
  reasonsContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 4,
  },
  reasonText: {
    color: BladeColors.error,
    fontSize: Typography.sizes.sm,
  },

  introTile: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius["2xl"],
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  introIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  introIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(59,158,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    color: TILE_TEXT,
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
  },
  introDescription: {
    color: TILE_TEXT_SECONDARY,
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  introDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  introDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  introDetailText: {
    color: TILE_TEXT_SECONDARY,
    fontSize: Typography.sizes.xs,
  },
  introDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TILE_TEXT_SECONDARY,
  },

  recordingTile: { 
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius["2xl"],
    padding: Spacing.lg, 
    marginBottom: Spacing.md, 
    borderWidth: 1.5, 
    borderColor: BladeColors.error,
  },
  recordingHeader: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: Spacing.lg,
  },
  recordingIndicator: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.sm,
  },
  recordingDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    backgroundColor: BladeColors.error,
  },
  recordingLabel: { 
    color: BladeColors.error, 
    fontSize: Typography.sizes.xs, 
    fontWeight: "700", 
    letterSpacing: 1.5,
  },
  timerText: { 
    color: TILE_TEXT,
    fontSize: 28, 
    fontWeight: "700", 
    fontVariant: ["tabular-nums"],
  },
  liveStatsRow: { 
    flexDirection: "row", 
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: Spacing.md,
  },
  liveStat: { 
    alignItems: "center",
    flex: 1,
  },
  liveStatValue: { 
    color: TILE_TEXT,
    fontSize: Typography.sizes.xl, 
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  liveStatLabel: { 
    color: TILE_TEXT_SECONDARY,
    fontSize: Typography.sizes.xs, 
    marginTop: 2,
  },
  liveStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  recordingHint: {
    color: TILE_TEXT_SECONDARY,
    fontSize: Typography.sizes.xs,
    textAlign: "center",
    fontStyle: "italic",
  },
  
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: { 
    fontSize: Typography.sizes.xs, 
    fontWeight: "700", 
    letterSpacing: 1.5,
    color: "#64748B",
  },
  sectionCount: {
    fontSize: Typography.sizes.xs,
    color: "#94A3B8",
  },

  tripCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius["2xl"],
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  tripCardActive: {
    borderWidth: 1.5,
    borderColor: BladeColors.success,
  },
  tripCardHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.sm, 
    marginBottom: Spacing.sm,
  },
  tripCardIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(59,158,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  tripCardTitleBlock: {
    flex: 1,
  },
  tripCardTitle: { 
    color: TILE_TEXT,
    fontSize: Typography.sizes.md, 
    fontWeight: "600", 
  },
  tripCardDate: {
    color: TILE_TEXT_SECONDARY,
    fontSize: Typography.sizes.xs,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BladeColors.success,
  },
  liveBadgeText: {
    color: BladeColors.success,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tripStatsRow: { 
    flexDirection: "row", 
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
  },
  tripStatItem: { 
    flex: 1, 
    alignItems: "center",
  },
  tripStatValue: { 
    color: TILE_TEXT,
    fontSize: Typography.sizes.md, 
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  tripStatLabel: { 
    color: TILE_TEXT_SECONDARY,
    fontSize: 10, 
    marginTop: 2,
  },
  tripStatDivider: { 
    width: 1, 
    height: 24, 
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  
  emptyContainer: { 
    alignItems: "center", 
    justifyContent: "center", 
    paddingTop: 60, 
    paddingHorizontal: Spacing.xl,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DARK_TILE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: { 
    fontSize: Typography.sizes.xl, 
    fontWeight: "700",
    color: DARK_TILE,
  },
  emptySubtitle: { 
    fontSize: Typography.sizes.sm, 
    textAlign: "center", 
    marginTop: Spacing.sm,
    lineHeight: 20,
    color: "#64748B",
  },
  
  loadingOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "rgba(255,255,255,0.6)",
  },
});
