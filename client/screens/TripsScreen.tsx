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
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUser } from "@/context/UserContext";
import { useTrip } from "@/context/TripContext";
import { BladeColors, Spacing, BorderRadius } from "@/constants/theme";
import type { Trip } from "@shared/schema";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const LOCAL_TRIPS_KEY = "@blade_local_trips";

const BG = "#F2F2F7";
const CARD_BG = "rgba(255,255,255,0.85)";
const CARD_BORDER = "rgba(60,60,67,0.12)";
const TEXT_PRIMARY = "#1C1C1E";
const TEXT_SECONDARY = "#3C3C43";
const TEXT_MUTED = "#8E8E93";
const ACCENT = "#A4D08B";
const ACCENT_LIGHT = "rgba(164,208,139,0.12)";
const RECORDING_RED = "#FF3B30";
const SUCCESS_GREEN = "#34C759";
const STAT_BG = "rgba(120,120,128,0.08)";
const DIVIDER = "rgba(60,60,67,0.12)";

function TripControlTile({ 
  onStart,
  onEnd, 
  isLoading, 
  isRecording, 
  disabled,
  disabledReasons,
}: { 
  onStart: () => void;
  onEnd: () => void; 
  isLoading: boolean; 
  isRecording: boolean; 
  disabled?: boolean;
  disabledReasons?: string[];
}) {
  const canPress = !disabled && !isLoading;

  return (
    <View style={styles.tripControlTile}>
      <View style={styles.tripControlHeader}>
        <View style={styles.tripControlIconCircle}>
          <Feather name="sliders" size={18} color={ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripControlTitle}>Trip Control</Text>
          <Text style={styles.tripControlSubtitle}>
            {isRecording ? "Recording in progress" : "Start or end a trip"}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => { if (canPress) { isRecording ? onEnd() : onStart(); } }}
        disabled={!canPress}
        style={({ pressed }) => [
          styles.tripControlButton,
          isRecording 
            ? { backgroundColor: RECORDING_RED }
            : { backgroundColor: canPress ? ACCENT : "#C8CED8" },
          { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        testID={isRecording ? "end-trip-btn" : "start-trip-btn"}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Feather name={isRecording ? "square" : "play"} size={17} color="#FFF" />
            <Text style={styles.tripControlButtonText}>
              {isRecording ? "End Trip" : "Start Trip"}
            </Text>
          </>
        )}
      </Pressable>
      {!canPress && disabledReasons && disabledReasons.length > 0 ? (
        <View style={styles.reasonsContainer}>
          {disabledReasons.map((reason, idx) => (
            <View key={idx} style={styles.reasonRow}>
              <Feather name="info" size={13} color={TEXT_MUTED} />
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
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
    try { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    try {
      const success = await startTrip();
      if (success) {
        try { if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
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
    try { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    try {
      const success = await endTrip();
      if (success) {
        try { if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
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
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

  const renderTrip = useCallback(({ item }: { item: Trip }) => (
    <Pressable
      onPress={() => navigation.navigate("TripDetail", { tripId: item.id })}
      style={({ pressed }) => [
        styles.tripCard,
        item.isActive ? styles.tripCardActive : null,
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
      testID={`card-trip-${item.id}`}
    >
      <View style={styles.tripCardHeader}>
        <View style={[styles.tripCardIcon, item.isActive ? { backgroundColor: "rgba(10,77,110,0.10)" } : null]}>
          <Feather 
            name={item.isActive ? "navigation" : "anchor"} 
            size={15} 
            color={item.isActive ? BladeColors.success : ACCENT} 
          />
        </View>
        <View style={styles.tripCardTitleBlock}>
          <Text style={styles.tripCardTitle}>
            {item.name || `Trip ${new Date(item.startTime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
          </Text>
          <Text style={styles.tripCardDate}>
            {new Date(item.startTime).toLocaleDateString(undefined, { 
              weekday: "short", month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
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
  ), [navigation]);

  const ListHeader = useCallback(() => (
    <View style={styles.headerSection}>
      <View style={styles.introTile}>
        <View style={styles.introHeader}>
          <View style={styles.introIconCircle}>
            <Feather name="navigation" size={20} color={ACCENT} />
          </View>
          <View style={styles.introTitleBlock}>
            <ThemedText type="h2" style={styles.introTitle}>Trip Recorder</ThemedText>
            <ThemedText type="small" style={styles.introSubtitle}>Track speed, distance & energy</ThemedText>
          </View>
        </View>
        <View style={styles.introChipsRow}>
          <ChipItem icon="clock" text="60s min" />
          <ChipItem icon="clock" text="8h max" />
          <ChipItem icon="zap" text="4s intervals" />
          <ChipItem icon="file-text" text="PDF reports" />
        </View>
      </View>

      {isRecording ? (
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
      ) : null}

      <TripControlTile
        onStart={handleStartTrip}
        onEnd={handleEndTrip}
        isLoading={buttonLoading || isLoading}
        isRecording={isRecording}
        disabled={!user?.id}
        disabledReasons={!user?.id ? ["Sign in required to record trips"] : []}
      />

      {trips.length > 0 ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>HISTORY</Text>
          <View style={styles.sectionCountBadge}>
            <Text style={styles.sectionCount}>{trips.length}</Text>
          </View>
        </View>
      ) : null}
    </View>
  ), [isRecording, tripDuration, tripStats, buttonLoading, isLoading, user?.id, trips.length]);

  const EmptyState = useCallback(() => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Feather name="anchor" size={28} color={ACCENT} />
      </View>
      <Text style={styles.emptyTitle}>No Trips Yet</Text>
      <Text style={styles.emptySubtitle}>
        Connect your Blade outboard and start recording to track your journeys.
      </Text>
    </View>
  ), []);

  return (
    <View style={styles.container}>
      <FlatList
        data={trips}
        keyExtractor={item => item.id}
        renderItem={renderTrip}
        contentContainerStyle={[
          styles.listContent, 
          { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing.xl }
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
      <Feather name={icon as any} size={12} color="rgba(255,255,255,0.4)" style={{ marginBottom: 3 }} />
      <Text style={styles.liveStatValue}>{value}</Text>
      <Text style={styles.liveStatLabel}>{label}</Text>
    </View>
  );
}

function ChipItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.introChip}>
      <Feather name={icon as any} size={11} color="rgba(255,255,255,0.4)" />
      <Text style={styles.introChipText}>{text}</Text>
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
    flexGrow: 1,
  },
  headerSection: { 
    marginBottom: Spacing.sm,
  },
  
  tripControlTile: {
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  tripControlHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  tripControlIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(52,199,89,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  tripControlTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  tripControlSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 2,
  },
  tripControlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.lg,
    minHeight: 50,
  },
  tripControlButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  
  reasonsContainer: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  reasonText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },

  introTile: {
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.xl,
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
    backgroundColor: "rgba(52,199,89,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitleBlock: {
    flex: 1,
  },
  introTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  introSubtitle: {
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  introChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  introChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  introChipText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "500",
  },

  recordingTile: { 
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.xl,
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
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  timerText: { 
    color: "#FFFFFF",
    fontSize: 48, 
    fontWeight: "200", 
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
    marginBottom: Spacing.lg,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  liveStatsRow: { 
    flexDirection: "row", 
    gap: 8,
    marginBottom: Spacing.md,
  },
  liveStat: { 
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  liveStatValue: { 
    color: "#FFFFFF",
    fontSize: 20, 
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  liveStatLabel: { 
    color: "rgba(255,255,255,0.5)",
    fontSize: 10, 
    marginTop: 2,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordingHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    paddingHorizontal: 2,
  },
  sectionTitle: { 
    fontSize: 12, 
    fontWeight: "600", 
    letterSpacing: 1.2,
    color: TEXT_MUTED,
  },
  sectionCountBadge: {
    backgroundColor: ACCENT_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCount: {
    fontSize: 11,
    color: ACCENT,
    fontWeight: "700",
  },

  tripCard: {
    backgroundColor: CARD_BG,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: Spacing.lg,
    marginBottom: 10,
  },
  tripCardActive: {
    borderColor: BladeColors.success,
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
    backgroundColor: ACCENT_LIGHT,
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
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(164,208,139,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BladeColors.success,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
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
    backgroundColor: DIVIDER,
  },
  
  emptyContainer: { 
    alignItems: "center", 
    justifyContent: "center", 
    paddingTop: 60, 
    paddingHorizontal: Spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ACCENT_LIGHT,
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
    backgroundColor: "rgba(245,247,250,0.7)",
  },
});
