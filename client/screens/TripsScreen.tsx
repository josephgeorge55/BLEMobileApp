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
    ? (canPress ? BladeColors.success : BladeColors.error)
    : BladeColors.error;
  const icon = isStart ? "play-circle" : "stop-circle";
  const label = isStart ? "Start Trip" : "End Trip";

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
          { backgroundColor: bgColor, opacity: pressed ? 0.7 : 1 }
        ]}
        testID={isStart ? "start-trip-btn" : "end-trip-btn"}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Feather name={icon} size={24} color="#FFF" />
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
    <Card 
      style={[styles.card, item.isActive && styles.activeCard]}
      onPress={() => {
        console.log("[Trips] Trip card pressed, navigating to TripDetail:", item.id);
        navigation.navigate("TripDetail", { tripId: item.id });
      }}
    >
        <View style={styles.cardHeader}>
          <Feather 
            name={item.isActive ? "navigation" : "anchor"} 
            size={18} 
            color={item.isActive ? BladeColors.success : BladeColors.primary} 
          />
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            {item.name || "Trip"}
          </Text>
          {item.isActive ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>RECORDING</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
          {new Date(item.startTime).toLocaleDateString(undefined, { 
            weekday: "short", 
            month: "short", 
            day: "numeric" 
          })}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {(item.totalDistanceKm || 0).toFixed(1)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>km</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {formatDuration(item.startTime, item.endTime)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>duration</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {(item.maxSpeedKmh || 0).toFixed(1)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>max km/h</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {(item.totalEnergyWh || 0).toFixed(0)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Wh</Text>
          </View>
        </View>
    </Card>
  );

  const ListHeader = () => (
    <View style={styles.headerSection}>
      {isRecording ? (
        <>
          <Card style={styles.recordingCard}>
            <View style={styles.recordingHeader}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>RECORDING</Text>
              </View>
              <Text style={[styles.timerText, { color: theme.text }]}>
                {formatTime(tripDuration)}
              </Text>
            </View>
            <View style={styles.liveStatsRow}>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: theme.text }]}>
                  {tripStats.totalDistanceKm.toFixed(2)}
                </Text>
                <Text style={[styles.liveStatLabel, { color: theme.textSecondary }]}>km</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: theme.text }]}>
                  {tripStats.maxSpeedKmh.toFixed(1)}
                </Text>
                <Text style={[styles.liveStatLabel, { color: theme.textSecondary }]}>max km/h</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: theme.text }]}>
                  {tripStats.totalEnergyWh.toFixed(0)}
                </Text>
                <Text style={[styles.liveStatLabel, { color: theme.textSecondary }]}>Wh</Text>
              </View>
            </View>
          </Card>
          <TripButton 
            onPress={handleEndTrip} 
            isLoading={buttonLoading || isLoading} 
            isStart={false} 
          />
        </>
      ) : (
        <TripButton 
          onPress={handleStartTrip} 
          isLoading={buttonLoading || isLoading} 
          isStart={true}
          disabled={!user?.id}
          disabledReasons={!user?.id ? ["Sign in required to record trips"] : []}
        />
      )}
      
      {trips.length > 0 ? (
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          TRIP HISTORY
        </Text>
      ) : null}
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="anchor" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No Trips Yet</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Start recording to track your journeys
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
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
    flex: 1 
  },
  listContent: { 
    paddingHorizontal: Spacing.md, 
    flexGrow: 1 
  },
  headerSection: { 
    marginBottom: Spacing.lg 
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
  
  recordingCard: { 
    marginBottom: Spacing.md, 
    padding: Spacing.md, 
    borderWidth: 2, 
    borderColor: BladeColors.error 
  },
  recordingHeader: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: Spacing.md 
  },
  recordingIndicator: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.sm 
  },
  recordingDot: { 
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    backgroundColor: BladeColors.error 
  },
  recordingText: { 
    color: BladeColors.error, 
    fontSize: Typography.sizes.sm, 
    fontWeight: "700", 
    letterSpacing: 1 
  },
  timerText: { 
    fontSize: Typography.sizes.xl, 
    fontWeight: "700", 
    fontVariant: ["tabular-nums"] 
  },
  liveStatsRow: { 
    flexDirection: "row", 
    justifyContent: "space-around" 
  },
  liveStat: { 
    alignItems: "center" 
  },
  liveStatValue: { 
    fontSize: Typography.sizes.lg, 
    fontWeight: "700" 
  },
  liveStatLabel: { 
    fontSize: Typography.sizes.xs, 
    marginTop: 2 
  },
  
  sectionTitle: { 
    fontSize: Typography.sizes.xs, 
    fontWeight: "600", 
    letterSpacing: 1, 
    marginTop: Spacing.md, 
    marginBottom: Spacing.sm 
  },
  
  card: { 
    marginBottom: Spacing.md, 
    padding: Spacing.md 
  },
  activeCard: { 
    borderWidth: 2, 
    borderColor: BladeColors.success 
  },
  cardHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.sm, 
    marginBottom: Spacing.xs 
  },
  cardTitle: { 
    fontSize: Typography.sizes.lg, 
    fontWeight: "600", 
    flex: 1 
  },
  badge: { 
    backgroundColor: BladeColors.success, 
    paddingHorizontal: Spacing.sm, 
    paddingVertical: 2, 
    borderRadius: BorderRadius.sm 
  },
  badgeText: { 
    color: "#FFF", 
    fontSize: 10, 
    fontWeight: "700" 
  },
  cardDate: { 
    fontSize: Typography.sizes.sm, 
    marginLeft: 26, 
    marginBottom: Spacing.sm 
  },
  statsRow: { 
    flexDirection: "row", 
    alignItems: "center" 
  },
  statItem: { 
    flex: 1, 
    alignItems: "center" 
  },
  statValue: { 
    fontSize: Typography.sizes.lg, 
    fontWeight: "700" 
  },
  statLabel: { 
    fontSize: Typography.sizes.xs, 
    marginTop: 2 
  },
  statDivider: { 
    width: 1, 
    height: 30, 
    backgroundColor: "rgba(128,128,128,0.2)" 
  },
  
  emptyContainer: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    paddingTop: 100, 
    paddingHorizontal: Spacing.xl 
  },
  emptyTitle: { 
    fontSize: Typography.sizes.xl, 
    fontWeight: "600", 
    marginTop: Spacing.lg 
  },
  emptySubtitle: { 
    fontSize: Typography.sizes.md, 
    textAlign: "center", 
    marginTop: Spacing.sm 
  },
  
  loadingOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "rgba(0,0,0,0.1)" 
  },
});
