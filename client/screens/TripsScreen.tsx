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
import Animated, { FadeInUp } from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserContext";
import { useTrip } from "@/context/TripContext";
import { BladeColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Trip } from "@shared/schema";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const LOCAL_TRIPS_KEY = "@blade_local_trips";

const BG = "#0B1120";
const CARD_BG = "#151D2E";
const CARD_BORDER = "#1E2D44";
const TEXT_PRIMARY = "#F1F5F9";
const TEXT_SECONDARY = "#8899AA";
const TEXT_MUTED = "#556677";
const ACCENT = "#3B9EFF";
const ACCENT_DIM = "rgba(59,158,255,0.10)";
const RECORDING_RED = "#EF4444";
const SUCCESS_GREEN = "#A4D08B";
const STAT_BG = "rgba(255,255,255,0.04)";

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
  const icon = isStart ? "play" : "square";
  const label = isStart ? "Start Recording" : "End Recording";

  return (
    <View>
      <Pressable
        onPress={() => { if (canPress) onPress(); }}
        disabled={!canPress}
        style={({ pressed }) => [
          styles.tripButton,
          isStart 
            ? { backgroundColor: canPress ? SUCCESS_GREEN : "#334155" }
            : { backgroundColor: RECORDING_RED },
          { opacity: pressed ? 0.85 : 1 },
        ]}
        testID={isStart ? "start-trip-btn" : "end-trip-btn"}
      >
        {isLoading ? (
          <ActivityIndicator color={isStart ? "#0B1120" : "#FFF"} size="small" />
        ) : (
          <>
            <View style={[styles.buttonIconWrap, isStart ? { backgroundColor: "rgba(11,17,32,0.15)" } : { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Feather name={icon} size={16} color={isStart ? "#0B1120" : "#FFF"} />
            </View>
            <Text style={[styles.tripButtonText, isStart ? { color: "#0B1120" } : { color: "#FFF" }]}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
      {!canPress && disabledReasons && disabledReasons.length > 0 ? (
        <View style={styles.reasonsContainer}>
          {disabledReasons.map((reason, idx) => (
            <View key={idx} style={styles.reasonRow}>
              <Feather name="info" size={13} color={TEXT_SECONDARY} />
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
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatDuration = (start: string | Date, end: string | Date | null) => {
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    const diff = endMs - startMs;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const renderTrip = ({ item, index }: { item: Trip; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 40).duration(350).springify()}>
      <Pressable
        onPress={() => {
          console.log("[Trips] Trip card pressed, navigating to TripDetail:", item.id);
          navigation.navigate("TripDetail", { tripId: item.id });
        }}
        style={({ pressed }) => [
          styles.tripCard,
          item.isActive ? styles.tripCardActive : null,
          { opacity: pressed ? 0.8 : 1 },
        ]}
        testID={`card-trip-${item.id}`}
      >
        <View style={styles.tripCardHeader}>
          <View style={[styles.tripCardIcon, item.isActive ? { backgroundColor: "rgba(164,208,139,0.12)" } : null]}>
            <Feather 
              name={item.isActive ? "navigation" : "anchor"} 
              size={15} 
              color={item.isActive ? SUCCESS_GREEN : ACCENT} 
            />
          </View>
          <View style={styles.tripCardTitleBlock}>
            <Text style={styles.tripCardTitle}>
              {item.name || `Trip ${new Date(item.startTime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
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
            <Feather name="chevron-right" size={16} color={TEXT_MUTED} />
          )}
        </View>
        <View style={styles.tripStatsRow}>
          <StatCell value={(item.totalDistanceKm || 0).toFixed(1)} label="km" />
          <View style={styles.tripStatDivider} />
          <StatCell value={formatDuration(item.startTime, item.endTime)} label="duration" />
          <View style={styles.tripStatDivider} />
          <StatCell value={(item.maxSpeedKmh || 0).toFixed(1)} label="max km/h" />
          <View style={styles.tripStatDivider} />
          <StatCell value={(item.totalEnergyWh || 0).toFixed(0)} label="Wh" />
        </View>
      </Pressable>
    </Animated.View>
  );

  const ListHeader = () => (
    <View style={styles.headerSection}>
      {isRecording ? (
        <Animated.View entering={FadeInUp.duration(400).springify()}>
          <View style={styles.recordingTile}>
            <View style={styles.recordingHeader}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingLabel}>RECORDING</Text>
              </View>
            </View>
            <Text style={styles.timerText}>
              {formatTime(tripDuration)}
            </Text>
            <View style={styles.liveStatsRow}>
              <LiveStatCell value={tripStats.totalDistanceKm.toFixed(2)} label="km" icon="map-pin" />
              <LiveStatCell value={tripStats.maxSpeedKmh.toFixed(1)} label="max km/h" icon="navigation" />
              <LiveStatCell value={tripStats.totalEnergyWh.toFixed(0)} label="Wh" icon="zap" />
            </View>
            <Text style={styles.recordingHint}>
              Min 60s to save  |  Auto-stop at 8h
            </Text>
          </View>
          <TripButton 
            onPress={handleEndTrip} 
            isLoading={buttonLoading || isLoading} 
            isStart={false} 
          />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInUp.duration(400).springify()}>
          <View style={styles.introTile}>
            <View style={styles.introHeader}>
              <View style={styles.introIconCircle}>
                <Feather name="navigation" size={20} color={ACCENT} />
              </View>
              <View style={styles.introTitleBlock}>
                <Text style={styles.introTitle}>Trip Recorder</Text>
                <Text style={styles.introSubtitle}>Track speed, distance & energy</Text>
              </View>
            </View>
            <View style={styles.introChipsRow}>
              <View style={styles.introChip}>
                <Feather name="clock" size={11} color={TEXT_SECONDARY} />
                <Text style={styles.introChipText}>60s min</Text>
              </View>
              <View style={styles.introChip}>
                <Feather name="clock" size={11} color={TEXT_SECONDARY} />
                <Text style={styles.introChipText}>8h max</Text>
              </View>
              <View style={styles.introChip}>
                <Feather name="zap" size={11} color={TEXT_SECONDARY} />
                <Text style={styles.introChipText}>4s intervals</Text>
              </View>
              <View style={styles.introChip}>
                <Feather name="file-text" size={11} color={TEXT_SECONDARY} />
                <Text style={styles.introChipText}>PDF reports</Text>
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
        </Animated.View>
      )}
      
      {trips.length > 0 ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>TRIP HISTORY</Text>
          <Text style={styles.sectionCount}>{trips.length}</Text>
        </View>
      ) : null}
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Feather name="anchor" size={32} color={ACCENT} />
      </View>
      <Text style={styles.emptyTitle}>No Trips Yet</Text>
      <Text style={styles.emptySubtitle}>
        Connect your Blade outboard and start recording to track your journeys.
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
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); loadTrips(); }}
        showsVerticalScrollIndicator={false}
      />
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : null}
    </View>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tripStatItem}>
      <Text style={styles.tripStatValue}>{value}</Text>
      <Text style={styles.tripStatLabel}>{label}</Text>
    </View>
  );
}

function LiveStatCell({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <View style={styles.liveStat}>
      <Feather name={icon as any} size={13} color={TEXT_MUTED} style={{ marginBottom: 4 }} />
      <Text style={styles.liveStatValue}>{value}</Text>
      <Text style={styles.liveStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: BG,
  },
  listContent: { 
    paddingHorizontal: Spacing.lg, 
    flexGrow: 1 
  },
  headerSection: { 
    marginBottom: Spacing.sm 
  },
  
  tripButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    minHeight: 56,
  },
  buttonIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  tripButtonText: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  
  reasonsContainer: {
    marginTop: -Spacing.sm,
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
    color: TEXT_SECONDARY,
    fontSize: 12,
  },

  introTile: {
    backgroundColor: CARD_BG,
    borderRadius: BorderRadius["2xl"],
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  introHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  introIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACCENT_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitleBlock: {
    flex: 1,
  },
  introTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  introSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginTop: 2,
  },
  introChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  introChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  introChipText: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: "500",
  },

  recordingTile: { 
    backgroundColor: CARD_BG,
    borderRadius: BorderRadius["2xl"],
    padding: Spacing.xl, 
    marginBottom: Spacing.md, 
    borderWidth: 1.5, 
    borderColor: RECORDING_RED,
  },
  recordingHeader: { 
    marginBottom: Spacing.xs,
  },
  recordingIndicator: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8,
  },
  recordingDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: RECORDING_RED,
  },
  recordingLabel: { 
    color: RECORDING_RED, 
    fontSize: 11, 
    fontWeight: "700", 
    letterSpacing: 2,
  },
  timerText: { 
    color: TEXT_PRIMARY,
    fontSize: 48, 
    fontWeight: "200", 
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
    marginBottom: Spacing.lg,
  },
  liveStatsRow: { 
    flexDirection: "row", 
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  liveStat: { 
    flex: 1,
    alignItems: "center",
    backgroundColor: STAT_BG,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  liveStatValue: { 
    color: TEXT_PRIMARY,
    fontSize: 20, 
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  liveStatLabel: { 
    color: TEXT_MUTED,
    fontSize: 10, 
    marginTop: 2,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordingHint: {
    color: TEXT_MUTED,
    fontSize: 11,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    paddingHorizontal: 2,
  },
  sectionTitle: { 
    fontSize: 11, 
    fontWeight: "600", 
    letterSpacing: 1.5,
    color: TEXT_MUTED,
  },
  sectionCount: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },

  tripCard: {
    backgroundColor: CARD_BG,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  tripCardActive: {
    borderColor: SUCCESS_GREEN,
  },
  tripCardHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.md, 
    marginBottom: Spacing.md,
  },
  tripCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  tripCardTitleBlock: {
    flex: 1,
  },
  tripCardTitle: { 
    color: TEXT_PRIMARY,
    fontSize: 15, 
    fontWeight: "600", 
  },
  tripCardDate: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(164,208,139,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SUCCESS_GREEN,
  },
  liveBadgeText: {
    color: SUCCESS_GREEN,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tripStatsRow: { 
    flexDirection: "row", 
    alignItems: "center",
    backgroundColor: STAT_BG,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
  },
  tripStatItem: { 
    flex: 1, 
    alignItems: "center",
  },
  tripStatValue: { 
    color: TEXT_PRIMARY,
    fontSize: 15, 
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  tripStatLabel: { 
    color: TEXT_MUTED,
    fontSize: 10, 
    marginTop: 2,
    fontWeight: "500",
  },
  tripStatDivider: { 
    width: 1, 
    height: 22, 
    backgroundColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: ACCENT_DIM,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: { 
    fontSize: 18, 
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: Spacing.xs,
  },
  emptySubtitle: { 
    fontSize: 14, 
    textAlign: "center", 
    lineHeight: 21,
    color: TEXT_SECONDARY,
  },
  
  loadingOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "rgba(11,17,32,0.7)",
  },
});
