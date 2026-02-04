import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Platform,
  Dimensions,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/hooks/useTheme";
import { useTrip } from "@/context/TripContext";
import { Card } from "@/components/Card";
import { OpenStreetMap } from "@/components/OpenStreetMap";
import { TripReportService } from "@/services/TripReportService";
import { BladeColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Trip } from "@shared/schema";
import type { TripDataPoint, ExtendedTrip } from "@/types/TripReport";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const LOCAL_TRIPS_KEY = "@blade_local_trips";

const ktsToKmh = (kts: number) => kts * 1.852;

type TripDetailRouteProp = RouteProp<RootStackParamList, "TripDetail">;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - Spacing.md * 4;
const CHART_HEIGHT = 120;

export default function TripDetailScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const route = useRoute<TripDetailRouteProp>();
  const navigation = useNavigation();
  const { tripId } = route.params;
  const { getTripDataPoints } = useTrip();

  const [trip, setTrip] = useState<ExtendedTrip | null>(null);
  const [dataPoints, setDataPoints] = useState<TripDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    fetchTripData();
  }, [tripId]);

  const fetchTripData = async () => {
    try {
      const tripsData = await AsyncStorage.getItem(LOCAL_TRIPS_KEY);
      if (tripsData) {
        const trips: ExtendedTrip[] = JSON.parse(tripsData);
        const foundTrip = trips.find(t => t.id === tripId);
        if (foundTrip) {
          setTrip(foundTrip);
        }
      }
      
      const points = await getTripDataPoints(tripId);
      setDataPoints(points);
    } catch (error) {
      console.error("Error fetching trip data:", error);
    } finally {
      setIsLoading(false);
    }
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

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderSparkline = (
    data: number[],
    color: string,
    label: string,
    unit: string,
    maxVal?: number
  ) => {
    if (data.length === 0) return null;

    const max = maxVal || Math.max(...data);
    const min = Math.min(...data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;

    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - ((val - min) / (max - min + 0.001)) * (CHART_HEIGHT - 10);
      return `${x},${y}`;
    });

    return (
      <Card style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={[styles.chartLabel, { color: theme.text }]}>{label}</Text>
          <View style={styles.chartStats}>
            <Text style={[styles.chartStat, { color: theme.textSecondary }]}>
              Max: {max.toFixed(1)}{unit}
            </Text>
            <Text style={[styles.chartStat, { color: theme.textSecondary }]}>
              Avg: {avg.toFixed(1)}{unit}
            </Text>
          </View>
        </View>
        <View style={styles.chartContainer}>
          <View style={[styles.chartBackground, { backgroundColor: theme.surfaceElevated }]}>
            <svg width={CHART_WIDTH} height={CHART_HEIGHT}>
              <polyline
                points={points.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </View>
        </View>
      </Card>
    );
  };

  const handleGenerateReport = async () => {
    if (!trip) return;

    setIsGeneratingReport(true);
    try {
      const result = await TripReportService.generateReport(trip, dataPoints);
      
      if (result.success && result.uri) {
        console.log("[TripDetail] Report generated:", result.uri);
        if (Platform.OS !== "web") {
          Alert.alert(
            "Report Generated",
            "Your professional trip report has been created and is ready to share.",
            [{ text: "OK" }]
          );
        }
      } else {
        console.error("[TripDetail] Report generation failed:", result.error);
        if (Platform.OS !== "web") {
          Alert.alert("Error", "Failed to generate report. Please try again.");
        }
      }
    } catch (error) {
      console.error("[TripDetail] Error generating report:", error);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleShare = async () => {
    if (!trip) return;
    
    try {
      await Share.share({
        message: `Blade Outboards Trip Report\n\nTrip: ${trip.name || "Trip"}\nDistance: ${(trip.totalDistanceKm || 0).toFixed(2)} km\nDuration: ${formatDuration(trip.startTime, trip.endTime)}\nMax Speed: ${(trip.maxSpeedKmh || 0).toFixed(1)} km/h\nEnergy Used: ${(trip.totalEnergyWh || 0).toFixed(0)} Wh`,
        title: "Trip Report",
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={BladeColors.primary} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={48} color={theme.textSecondary} />
        <Text style={[styles.errorText, { color: theme.text }]}>Trip not found</Text>
      </View>
    );
  }

  const speedData = dataPoints.filter(p => p.phoneSpeedKmh != null || p.outboardSpeedKmh != null).map(p => p.phoneSpeedKmh ?? p.outboardSpeedKmh ?? 0);
  const batteryData = dataPoints.filter(p => p.batterySOC != null).map(p => p.batterySOC!);
  const powerData = dataPoints.filter(p => p.consumptionKW != null).map(p => (p.consumptionKW ?? 0) * 1000);
  const batteryUsed = (trip.startBatteryPercent || 0) - (trip.endBatteryPercent || 0);

  const routeCoordinates = useMemo(() => {
    return dataPoints
      .filter(p => (p.phoneLatitude != null && p.phoneLongitude != null) || (p.outboardLatitude != null && p.outboardLongitude != null))
      .map(p => ({
        latitude: p.phoneLatitude ?? p.outboardLatitude ?? 0,
        longitude: p.phoneLongitude ?? p.outboardLongitude ?? 0,
      }));
  }, [dataPoints]);

  const mapRegion = useMemo(() => {
    if (routeCoordinates.length === 0) return null;
    const lats = routeCoordinates.map(c => c.latitude);
    const lngs = routeCoordinates.map(c => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const latDelta = Math.max(0.01, (maxLat - minLat) * 1.3);
    const lngDelta = Math.max(0.01, (maxLng - minLng) * 1.3);
    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [routeCoordinates]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.summaryCard}>
          <View style={styles.tripHeaderRow}>
            <View style={styles.tripTitleSection}>
              <Text style={[styles.tripName, { color: theme.text }]}>
                {trip.name || "Unnamed Trip"}
              </Text>
              <Text style={[styles.tripDate, { color: theme.textSecondary }]}>
                {formatDateTime(trip.startTime)}
              </Text>
            </View>
            {trip.isActive ? (
              <View style={styles.activeBadge}>
                <Feather name="radio" size={14} color="#FFFFFF" />
                <Text style={styles.activeBadgeText}>LIVE</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.primary }]}>
                {(trip.totalDistanceKm || 0).toFixed(2)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>km</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.primary }]}>
                {formatDuration(trip.startTime, trip.endTime)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Duration</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.accent }]}>
                {(trip.maxSpeedKmh || 0).toFixed(1)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Max km/h</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.accent }]}>
                {(trip.avgSpeedKmh || 0).toFixed(1)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Avg km/h</Text>
            </View>
          </View>
        </Card>

        {mapRegion && routeCoordinates.length > 1 ? (
          <Card style={styles.mapCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Route</Text>
            <View style={styles.mapContainer}>
              <OpenStreetMap
                style={styles.routeMap}
                initialRegion={mapRegion}
                polyline={{
                  coordinates: routeCoordinates,
                  strokeColor: BladeColors.primary,
                  strokeWidth: 3,
                }}
                markers={[
                  {
                    coordinate: routeCoordinates[0],
                    title: "Start",
                    color: BladeColors.success,
                  },
                  {
                    coordinate: routeCoordinates[routeCoordinates.length - 1],
                    title: "End",
                    color: BladeColors.error,
                  },
                ]}
              />
            </View>
          </Card>
        ) : null}

        <Card style={styles.energyCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Energy Consumption</Text>
          <View style={styles.energyStats}>
            <View style={styles.energyStat}>
              <Feather name="battery" size={20} color={BladeColors.success} />
              <View style={styles.energyStatText}>
                <Text style={[styles.energyValue, { color: theme.text }]}>
                  {batteryUsed}%
                </Text>
                <Text style={[styles.energyLabel, { color: theme.textSecondary }]}>
                  Battery Used
                </Text>
              </View>
            </View>
            <View style={styles.energyStat}>
              <Feather name="zap" size={20} color={BladeColors.warning} />
              <View style={styles.energyStatText}>
                <Text style={[styles.energyValue, { color: theme.text }]}>
                  {(trip.totalEnergyWh || 0).toFixed(0)} Wh
                </Text>
                <Text style={[styles.energyLabel, { color: theme.textSecondary }]}>
                  Total Energy
                </Text>
              </View>
            </View>
            <View style={styles.energyStat}>
              <Feather name="trending-up" size={20} color={BladeColors.primary} />
              <View style={styles.energyStatText}>
                <Text style={[styles.energyValue, { color: theme.text }]}>
                  {trip.totalDistanceKm && trip.totalEnergyWh
                    ? (trip.totalEnergyWh / trip.totalDistanceKm).toFixed(1)
                    : "0"} Wh/km
                </Text>
                <Text style={[styles.energyLabel, { color: theme.textSecondary }]}>
                  Efficiency
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {speedData.length > 0 ? (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Speed Over Time</Text>
            <View style={styles.chartMini}>
              <View style={styles.miniChartRow}>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: BladeColors.accent }]}>
                    {Math.max(...speedData).toFixed(1)}
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>Max kts</Text>
                </View>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: theme.text }]}>
                    {(speedData.reduce((a, b) => a + b, 0) / speedData.length).toFixed(1)}
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>Avg kts</Text>
                </View>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: theme.text }]}>
                    {speedData.length}
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>Samples</Text>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {batteryData.length > 0 ? (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Battery Level</Text>
            <View style={styles.chartMini}>
              <View style={styles.miniChartRow}>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: BladeColors.success }]}>
                    {trip.startBatteryPercent || batteryData[0]}%
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>Start</Text>
                </View>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: BladeColors.warning }]}>
                    {trip.endBatteryPercent || batteryData[batteryData.length - 1]}%
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>End</Text>
                </View>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: theme.text }]}>
                    {batteryUsed}%
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>Used</Text>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {powerData.length > 0 ? (
          <Card style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Power Output</Text>
            <View style={styles.chartMini}>
              <View style={styles.miniChartRow}>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: BladeColors.error }]}>
                    {Math.max(...powerData)}W
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>Peak</Text>
                </View>
                <View style={styles.miniChartStat}>
                  <Text style={[styles.miniChartValue, { color: theme.text }]}>
                    {Math.floor(powerData.reduce((a, b) => a + b, 0) / powerData.length)}W
                  </Text>
                  <Text style={[styles.miniChartLabel, { color: theme.textSecondary }]}>Average</Text>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        <Card style={styles.dataPointsCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Trip Data</Text>
          <View style={styles.dataPointsInfo}>
            <Feather name="database" size={20} color={theme.textSecondary} />
            <Text style={[styles.dataPointsText, { color: theme.textSecondary }]}>
              {dataPoints.length} data points recorded
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          onPress={handleShare}
          style={[styles.actionButton, { backgroundColor: theme.surfaceElevated }]}
          testID="share-button"
        >
          <Feather name="share" size={20} color={theme.text} />
          <Text style={[styles.actionButtonText, { color: theme.text }]}>Share</Text>
        </Pressable>
        
        <Pressable
          onPress={handleGenerateReport}
          disabled={isGeneratingReport}
          testID="generate-report-button"
        >
          <LinearGradient
            colors={[BladeColors.accent, BladeColors.accentDark || BladeColors.accent]}
            style={styles.exportButton}
          >
            {isGeneratingReport ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="file-text" size={20} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Generate Report</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },
  errorText: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.md,
  },
  summaryCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  tripHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  tripTitleSection: {
    flex: 1,
  },
  tripName: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  tripDate: {
    fontSize: Typography.sizes.sm,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: BladeColors.success,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  activeBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.sm,
  },
  statBox: {
    width: "25%",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  mapCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  mapContainer: {
    height: 200,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  routeMap: {
    flex: 1,
  },
  energyCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  energyStats: {
    gap: Spacing.md,
  },
  energyStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  energyStatText: {
    flex: 1,
  },
  energyValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: "600",
  },
  energyLabel: {
    fontSize: Typography.sizes.sm,
  },
  chartCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  chartLabel: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  chartStats: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  chartStat: {
    fontSize: Typography.sizes.xs,
  },
  chartContainer: {
    marginTop: Spacing.sm,
  },
  chartBackground: {
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    overflow: "hidden",
  },
  chartMini: {
    marginTop: Spacing.sm,
  },
  miniChartRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  miniChartStat: {
    alignItems: "center",
  },
  miniChartValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: "700",
  },
  miniChartLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  dataPointsCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  dataPointsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dataPointsText: {
    fontSize: Typography.sizes.md,
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  exportButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  exportButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
});
