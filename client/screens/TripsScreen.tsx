import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserContext";
import { useTrip } from "@/context/TripContext";
import { useMotor } from "@/context/MotorContext";
import { getApiUrl } from "@/lib/query-client";
import { Card } from "@/components/Card";
import { BladeColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Trip } from "@shared/schema";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export default function TripsScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user } = useUser();
  const { activeTrip, isRecording, startTrip, endTrip, isLoading: tripLoading, tripDuration, tripStats } = useTrip();
  const { motor } = useMotor();
  
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(
        new URL(`/api/trips/user/${user.id}`, getApiUrl()).toString()
      );
      if (response.ok) {
        const data = await response.json();
        setTrips(data);
      }
    } catch (error) {
      console.error("Error fetching trips:", error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTrips();
    }, [user?.id])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTrips();
  };

  const handleStartTrip = async () => {
    const success = await startTrip();
    if (success) {
      fetchTrips();
    }
  };

  const handleEndTrip = async () => {
    const success = await endTrip();
    if (success) {
      fetchTrips();
    }
  };

  const handleTripPress = (trip: Trip) => {
    navigation.navigate("TripDetail", { tripId: trip.id });
  };

  const formatDuration = (start: Date | string, end: Date | string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diff = endTime - startTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatLiveDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const renderTripItem = ({ item }: { item: Trip }) => {
    const isActive = item.isActive;
    
    return (
      <Pressable onPress={() => handleTripPress(item)} testID={`trip-item-${item.id}`}>
        <Card style={{...styles.tripCard, ...(isActive ? styles.activeTripCard : {})}}>
          <View style={styles.tripHeader}>
            <View style={styles.tripTitleRow}>
              <Feather 
                name={isActive ? "navigation" : "anchor"} 
                size={18} 
                color={isActive ? BladeColors.success : BladeColors.primary} 
              />
              <Text style={[styles.tripName, { color: theme.text }]}>
                {item.name || "Unnamed Trip"}
              </Text>
              {isActive ? (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>RECORDING</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tripDate, { color: theme.textSecondary }]}>
              {formatDate(item.startTime)}
            </Text>
          </View>
          
          <View style={styles.tripStats}>
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
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Feather name="anchor" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No Trips Yet</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Connect your motor and start recording trips to track your journeys
      </Text>
    </View>
  );

  // Button is enabled only when all requirements for starting a trip are met
  const canStartTrip = Boolean(user?.id) && Boolean(motor?.isConnected) && Boolean(motor?.serialNumber) && !isRecording;

  const renderHeader = () => (
    <View style={styles.headerSection}>
      {isRecording ? (
        <>
          <Card style={styles.liveRecordingCard}>
            <View style={styles.liveRecordingHeader}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>RECORDING</Text>
              </View>
              <Text style={[styles.liveDuration, { color: theme.text }]}>
                {formatLiveDuration(tripDuration)}
              </Text>
            </View>
            <View style={styles.liveStats}>
              <View style={styles.liveStatItem}>
                <Text style={[styles.liveStatValue, { color: theme.text }]}>
                  {tripStats.totalDistanceKm.toFixed(2)}
                </Text>
                <Text style={[styles.liveStatLabel, { color: theme.textSecondary }]}>km</Text>
              </View>
              <View style={styles.liveStatItem}>
                <Text style={[styles.liveStatValue, { color: theme.text }]}>
                  {tripStats.maxSpeedKmh.toFixed(1)}
                </Text>
                <Text style={[styles.liveStatLabel, { color: theme.textSecondary }]}>max km/h</Text>
              </View>
              <View style={styles.liveStatItem}>
                <Text style={[styles.liveStatValue, { color: theme.text }]}>
                  {tripStats.totalEnergyWh.toFixed(0)}
                </Text>
                <Text style={[styles.liveStatLabel, { color: theme.textSecondary }]}>Wh</Text>
              </View>
            </View>
          </Card>
          <Pressable
            onPress={handleEndTrip}
            disabled={tripLoading}
            testID="stop-trip-button"
            style={styles.tripButton}
          >
            <LinearGradient
              colors={[BladeColors.error, "#C0392B"]}
              style={styles.tripButtonGradient}
            >
              {tripLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="stop-circle" size={24} color="#FFFFFF" />
                  <Text style={styles.tripButtonText}>End Trip</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </>
      ) : (
        <Pressable
          onPress={handleStartTrip}
          disabled={!canStartTrip || tripLoading}
          style={[styles.tripButton, { opacity: canStartTrip ? 1 : 0.5 }]}
          testID="start-trip-button"
        >
          <LinearGradient
            colors={canStartTrip ? [BladeColors.success, "#27AE60"] : [theme.textSecondary, theme.textSecondary]}
            style={styles.tripButtonGradient}
          >
            {tripLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="play-circle" size={24} color="#FFFFFF" />
                <Text style={styles.tripButtonText}>
                  {canStartTrip 
                    ? "Start Trip" 
                    : !user?.id 
                      ? "Sign In First"
                      : !motor?.isConnected 
                        ? "Connect Motor"
                        : "Motor Not Ready"}
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      )}
      
      {trips.length > 0 ? (
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          TRIP HISTORY
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={renderTripItem}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { 
            paddingTop: headerHeight + Spacing.md, 
            paddingBottom: insets.bottom + 100,
            flexGrow: 1,
          },
        ]}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={isLoading ? null : renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={true}
        testID="trips-list"
      />

      {isLoading ? (
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
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  tripCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  activeTripCard: {
    borderWidth: 2,
    borderColor: BladeColors.success,
  },
  tripHeader: {
    marginBottom: Spacing.sm,
  },
  tripTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  tripName: {
    fontSize: Typography.sizes.lg,
    fontWeight: "600",
    flex: 1,
  },
  activeBadge: {
    backgroundColor: BladeColors.success,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  activeBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  tripDate: {
    fontSize: Typography.sizes.sm,
    marginLeft: 26,
  },
  tripStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(128,128,128,0.2)",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: Typography.sizes.md,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  headerSection: {
    marginBottom: Spacing.lg,
  },
  tripButton: {
    marginBottom: Spacing.md,
  },
  tripButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  tripButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.sizes.lg,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  liveRecordingCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: BladeColors.error,
  },
  liveRecordingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
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
  recordingText: {
    color: BladeColors.error,
    fontSize: Typography.sizes.sm,
    fontWeight: "700",
    letterSpacing: 1,
  },
  liveDuration: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
  },
  liveStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  liveStatItem: {
    alignItems: "center",
  },
  liveStatValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: "700",
  },
  liveStatLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
});
