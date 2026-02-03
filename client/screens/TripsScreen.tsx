import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

  const loadTrips = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (data) {
        const all: Trip[] = JSON.parse(data);
        const userTrips = all
          .filter(t => t.userId === user.id)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        setTrips(userTrips);
      } else {
        setTrips([]);
      }
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadTrips(); }, [loadTrips]));

  const onStartTrip = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const ok = await startTrip();
    if (ok) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      loadTrips();
    }
  };

  const onEndTrip = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const ok = await endTrip();
    if (ok) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      loadTrips();
    }
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDuration = (start: string | Date, end: string | Date | null) => {
    const diff = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const renderTrip = ({ item }: { item: Trip }) => (
    <Pressable onPress={() => navigation.navigate("TripDetail", { tripId: item.id })}>
      <Card style={[styles.card, item.isActive && styles.activeCard]}>
        <View style={styles.cardHeader}>
          <Feather name={item.isActive ? "navigation" : "anchor"} size={18} color={item.isActive ? BladeColors.success : BladeColors.primary} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>{item.name || "Trip"}</Text>
          {item.isActive ? <View style={styles.badge}><Text style={styles.badgeText}>RECORDING</Text></View> : null}
        </View>
        <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
          {new Date(item.startTime).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </Text>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.text }]}>{(item.totalDistanceKm || 0).toFixed(1)}</Text>
            <Text style={[styles.statLbl, { color: theme.textSecondary }]}>km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.text }]}>{formatDuration(item.startTime, item.endTime)}</Text>
            <Text style={[styles.statLbl, { color: theme.textSecondary }]}>duration</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.text }]}>{(item.maxSpeedKmh || 0).toFixed(1)}</Text>
            <Text style={[styles.statLbl, { color: theme.textSecondary }]}>max km/h</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.text }]}>{(item.totalEnergyWh || 0).toFixed(0)}</Text>
            <Text style={[styles.statLbl, { color: theme.textSecondary }]}>Wh</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );

  const header = () => (
    <View style={styles.headerSection}>
      {isRecording ? (
        <>
          <Card style={styles.recordingCard}>
            <View style={styles.recordingHeader}>
              <View style={styles.recordingRow}>
                <View style={styles.dot} />
                <Text style={styles.recordingLabel}>RECORDING</Text>
              </View>
              <Text style={[styles.timer, { color: theme.text }]}>{formatTime(tripDuration)}</Text>
            </View>
            <View style={styles.liveStats}>
              <View style={styles.liveStat}>
                <Text style={[styles.liveVal, { color: theme.text }]}>{tripStats.totalDistanceKm.toFixed(2)}</Text>
                <Text style={[styles.liveLbl, { color: theme.textSecondary }]}>km</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveVal, { color: theme.text }]}>{tripStats.maxSpeedKmh.toFixed(1)}</Text>
                <Text style={[styles.liveLbl, { color: theme.textSecondary }]}>max km/h</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveVal, { color: theme.text }]}>{tripStats.totalEnergyWh.toFixed(0)}</Text>
                <Text style={[styles.liveLbl, { color: theme.textSecondary }]}>Wh</Text>
              </View>
            </View>
          </Card>
          <Pressable onPress={onEndTrip} disabled={isLoading} style={styles.btn} testID="end-trip-btn">
            <LinearGradient colors={[BladeColors.error, "#C0392B"]} style={styles.btnGrad}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Feather name="stop-circle" size={24} color="#FFF" />
                  <Text style={styles.btnTxt}>End Trip</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={onStartTrip} disabled={isLoading || !user?.id} style={[styles.btn, { opacity: user?.id ? 1 : 0.5 }]} testID="start-trip-btn">
          <LinearGradient colors={user?.id ? [BladeColors.success, "#27AE60"] : ["#888", "#666"]} style={styles.btnGrad}>
            {isLoading ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Feather name="play-circle" size={24} color="#FFF" />
                <Text style={styles.btnTxt}>{user?.id ? "Start Trip" : "Sign In First"}</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      )}
      {trips.length > 0 ? <Text style={[styles.section, { color: theme.textSecondary }]}>TRIP HISTORY</Text> : null}
    </View>
  );

  const empty = () => (
    <View style={styles.empty}>
      <Feather name="anchor" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No Trips Yet</Text>
      <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Start recording to track your journeys</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={trips}
        keyExtractor={i => i.id}
        renderItem={renderTrip}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 }]}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? null : empty}
        refreshControl={<PullToRefresh refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTrips(); }} />}
      />
      {loading ? <View style={styles.overlay}><ActivityIndicator size="large" color={BladeColors.primary} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: Spacing.md, flexGrow: 1 },
  headerSection: { marginBottom: Spacing.lg },
  btn: { marginBottom: Spacing.md },
  btnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.lg },
  btnTxt: { color: "#FFF", fontSize: Typography.sizes.lg, fontWeight: "600" },
  recordingCard: { marginBottom: Spacing.md, padding: Spacing.md, borderWidth: 2, borderColor: BladeColors.error },
  recordingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md },
  recordingRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BladeColors.error },
  recordingLabel: { color: BladeColors.error, fontSize: Typography.sizes.sm, fontWeight: "700", letterSpacing: 1 },
  timer: { fontSize: Typography.sizes.xl, fontWeight: "700", fontVariant: ["tabular-nums"] },
  liveStats: { flexDirection: "row", justifyContent: "space-around" },
  liveStat: { alignItems: "center" },
  liveVal: { fontSize: Typography.sizes.lg, fontWeight: "700" },
  liveLbl: { fontSize: Typography.sizes.xs, marginTop: 2 },
  section: { fontSize: Typography.sizes.xs, fontWeight: "600", letterSpacing: 1, marginTop: Spacing.md, marginBottom: Spacing.sm },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  activeCard: { borderWidth: 2, borderColor: BladeColors.success },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.xs },
  cardTitle: { fontSize: Typography.sizes.lg, fontWeight: "600", flex: 1 },
  badge: { backgroundColor: BladeColors.success, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  badgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  cardDate: { fontSize: Typography.sizes.sm, marginLeft: 26, marginBottom: Spacing.sm },
  stats: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center" },
  statVal: { fontSize: Typography.sizes.lg, fontWeight: "700" },
  statLbl: { fontSize: Typography.sizes.xs, marginTop: 2 },
  divider: { width: 1, height: 30, backgroundColor: "rgba(128,128,128,0.2)" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 100, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.sizes.xl, fontWeight: "600", marginTop: Spacing.lg },
  emptySub: { fontSize: Typography.sizes.md, textAlign: "center", marginTop: Spacing.sm },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.1)" },
});
