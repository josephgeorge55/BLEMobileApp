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
import { OpenStreetMap } from "@/components/OpenStreetMap";
import { TripReportService } from "@/services/TripReportService";
import { BladeColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Trip } from "@shared/schema";
import type { TripDataPoint, ExtendedTrip } from "@/types/TripReport";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const LOCAL_TRIPS_KEY = "@blade_local_trips";

const DARK_TILE = "rgba(44,44,46,0.92)";
const TILE_TEXT = "#FFFFFF";
const TILE_TEXT_SECONDARY = "rgba(255,255,255,0.5)";
const TILE_ACCENT = "#34C759";
const SCREEN_BG = "#F2F2F7";

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
      <View style={styles.tile}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartLabel}>{label}</Text>
          <View style={styles.chartStats}>
            <Text style={styles.chartStat}>
              Max: {max.toFixed(1)}{unit}
            </Text>
            <Text style={styles.chartStat}>
              Avg: {avg.toFixed(1)}{unit}
            </Text>
          </View>
        </View>
        <View style={styles.chartContainer}>
          <View style={styles.chartBackground}>
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
      </View>
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
        const errorMessage = result.error || "Failed to generate report";
        
        let userMessage = "Failed to generate report. Please try again.";
        if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
          userMessage = "Unable to connect to the server. Please check your internet connection and try again.";
        } else if (errorMessage.includes("PDF") || errorMessage.includes("save")) {
          userMessage = "Unable to save the report to your device. Please ensure you have sufficient storage space.";
        }
        
        if (Platform.OS !== "web") {
          Alert.alert("Report Error", userMessage);
        }
      }
    } catch (error: any) {
      console.error("[TripDetail] Error generating report:", error);
      
      const errorMessage = error?.message || String(error);
      let userMessage = "An unexpected error occurred while generating the report.";
      
      if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        userMessage = "Unable to connect to the server. Please check your internet connection.";
      } else if (errorMessage.includes("timeout")) {
        userMessage = "The report is taking too long to generate. Please try again later.";
      }
      
      if (Platform.OS !== "web") {
        Alert.alert("Report Error", userMessage);
      }
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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={TILE_ACCENT} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.errorIconCircle}>
          <Feather name="alert-circle" size={32} color={TILE_ACCENT} />
        </View>
        <Text style={styles.errorText}>Trip not found</Text>
        <Text style={styles.errorSubtext}>This trip may have been deleted</Text>
      </View>
    );
  }

  const speedData = dataPoints.filter(p => p.phoneSpeedKmh != null || p.outboardSpeedKmh != null).map(p => p.phoneSpeedKmh ?? p.outboardSpeedKmh ?? 0);
  const batteryData = dataPoints.filter(p => p.batterySOC != null).map(p => p.batterySOC!);
  const powerData = dataPoints.filter(p => p.consumptionKW != null).map(p => (p.consumptionKW ?? 0) * 1000);
  const batteryUsed = (trip.startBatteryPercent || 0) - (trip.endBatteryPercent || 0);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tile}>
          <View style={styles.tripHeaderRow}>
            <View style={styles.tripTitleSection}>
              <Text style={styles.tripName}>
                {trip.name || "Unnamed Trip"}
              </Text>
              <Text style={styles.tripDate}>
                {formatDateTime(trip.startTime)}
              </Text>
            </View>
            {trip.isActive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: TILE_ACCENT }]}>
                {(trip.totalDistanceKm || 0).toFixed(2)}
              </Text>
              <Text style={styles.statLabel}>km</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: TILE_ACCENT }]}>
                {formatDuration(trip.startTime, trip.endTime)}
              </Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {(trip.maxSpeedKmh || 0).toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>Max km/h</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {(trip.avgSpeedKmh || 0).toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>Avg km/h</Text>
            </View>
          </View>
        </View>

        {mapRegion && routeCoordinates.length > 1 ? (
          <View style={styles.tile}>
            <View style={styles.tileSectionHeader}>
              <View style={styles.tileSectionIcon}>
                <Feather name="map" size={14} color="#5AC8FA" />
              </View>
              <Text style={styles.tileSectionTitle}>Route</Text>
            </View>
            <View style={styles.mapContainer}>
              <OpenStreetMap
                style={styles.routeMap}
                initialRegion={mapRegion}
                polyline={{
                  coordinates: routeCoordinates,
                  strokeColor: TILE_ACCENT,
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
          </View>
        ) : null}

        <View style={styles.tile}>
          <View style={styles.tileSectionHeader}>
            <View style={styles.tileSectionIcon}>
              <Feather name="zap" size={14} color="#FF9500" />
            </View>
            <Text style={styles.tileSectionTitle}>Energy Consumption</Text>
          </View>
          <View style={styles.energyStats}>
            <View style={styles.energyStat}>
              <View style={[styles.energyIconCircle, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                <Feather name="battery" size={16} color={BladeColors.success} />
              </View>
              <View style={styles.energyStatText}>
                <Text style={styles.energyValue}>
                  {batteryUsed}%
                </Text>
                <Text style={styles.energyLabel}>
                  Battery Used
                </Text>
              </View>
            </View>
            <View style={styles.energyStat}>
              <View style={[styles.energyIconCircle, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
                <Feather name="zap" size={16} color={BladeColors.warning} />
              </View>
              <View style={styles.energyStatText}>
                <Text style={styles.energyValue}>
                  {(trip.totalEnergyWh || 0).toFixed(0)} Wh
                </Text>
                <Text style={styles.energyLabel}>
                  Total Energy
                </Text>
              </View>
            </View>
            <View style={styles.energyStat}>
              <View style={[styles.energyIconCircle, { backgroundColor: "rgba(52,199,89,0.15)" }]}>
                <Feather name="trending-up" size={16} color={TILE_ACCENT} />
              </View>
              <View style={styles.energyStatText}>
                <Text style={styles.energyValue}>
                  {trip.totalDistanceKm && trip.totalEnergyWh
                    ? (trip.totalEnergyWh / trip.totalDistanceKm).toFixed(1)
                    : "0"} Wh/km
                </Text>
                <Text style={styles.energyLabel}>
                  Efficiency
                </Text>
              </View>
            </View>
          </View>
        </View>

        {speedData.length > 0 ? (
          <View style={styles.tile}>
            <View style={styles.tileSectionHeader}>
              <View style={styles.tileSectionIcon}>
                <Feather name="activity" size={14} color="#5AC8FA" />
              </View>
              <Text style={styles.tileSectionTitle}>Speed Over Time</Text>
            </View>
            <View style={styles.miniChartRow}>
              <View style={styles.miniChartStat}>
                <Text style={[styles.miniChartValue, { color: TILE_ACCENT }]}>
                  {Math.max(...speedData).toFixed(1)}
                </Text>
                <Text style={styles.miniChartLabel}>Max kts</Text>
              </View>
              <View style={styles.miniStatDivider} />
              <View style={styles.miniChartStat}>
                <Text style={styles.miniChartValue}>
                  {(speedData.reduce((a, b) => a + b, 0) / speedData.length).toFixed(1)}
                </Text>
                <Text style={styles.miniChartLabel}>Avg kts</Text>
              </View>
              <View style={styles.miniStatDivider} />
              <View style={styles.miniChartStat}>
                <Text style={styles.miniChartValue}>
                  {speedData.length}
                </Text>
                <Text style={styles.miniChartLabel}>Samples</Text>
              </View>
            </View>
          </View>
        ) : null}

        {batteryData.length > 0 ? (
          <View style={styles.tile}>
            <View style={styles.tileSectionHeader}>
              <View style={styles.tileSectionIcon}>
                <Feather name="battery-charging" size={14} color={BladeColors.success} />
              </View>
              <Text style={styles.tileSectionTitle}>Battery Level</Text>
            </View>
            <View style={styles.miniChartRow}>
              <View style={styles.miniChartStat}>
                <Text style={[styles.miniChartValue, { color: BladeColors.success }]}>
                  {trip.startBatteryPercent || batteryData[0]}%
                </Text>
                <Text style={styles.miniChartLabel}>Start</Text>
              </View>
              <View style={styles.miniStatDivider} />
              <View style={styles.miniChartStat}>
                <Text style={[styles.miniChartValue, { color: "#F59E0B" }]}>
                  {trip.endBatteryPercent || batteryData[batteryData.length - 1]}%
                </Text>
                <Text style={styles.miniChartLabel}>End</Text>
              </View>
              <View style={styles.miniStatDivider} />
              <View style={styles.miniChartStat}>
                <Text style={styles.miniChartValue}>
                  {batteryUsed}%
                </Text>
                <Text style={styles.miniChartLabel}>Used</Text>
              </View>
            </View>
          </View>
        ) : null}

        {powerData.length > 0 ? (
          <View style={styles.tile}>
            <View style={styles.tileSectionHeader}>
              <View style={styles.tileSectionIcon}>
                <Feather name="cpu" size={14} color="#FF6B6B" />
              </View>
              <Text style={styles.tileSectionTitle}>Power Output</Text>
            </View>
            <View style={styles.miniChartRow}>
              <View style={styles.miniChartStat}>
                <Text style={[styles.miniChartValue, { color: BladeColors.error }]}>
                  {Math.max(...powerData)}W
                </Text>
                <Text style={styles.miniChartLabel}>Peak</Text>
              </View>
              <View style={styles.miniStatDivider} />
              <View style={styles.miniChartStat}>
                <Text style={styles.miniChartValue}>
                  {Math.floor(powerData.reduce((a, b) => a + b, 0) / powerData.length)}W
                </Text>
                <Text style={styles.miniChartLabel}>Average</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.tile}>
          <View style={styles.tileSectionHeader}>
            <View style={styles.tileSectionIcon}>
              <Feather name="database" size={14} color="#AF52DE" />
            </View>
            <Text style={styles.tileSectionTitle}>Trip Data</Text>
          </View>
          <View style={styles.dataPointsInfo}>
            <Text style={styles.dataPointsValue}>{dataPoints.length}</Text>
            <Text style={styles.dataPointsLabel}>data points recorded at 4-second intervals</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.85 : 1 }]}
          testID="share-button"
        >
          <Feather name="share" size={18} color={TILE_TEXT} />
          <Text style={styles.shareButtonText}>Share</Text>
        </Pressable>
        
        <Pressable
          onPress={handleGenerateReport}
          disabled={isGeneratingReport}
          style={({ pressed }) => [styles.reportButton, { opacity: pressed ? 0.85 : 1 }]}
          testID="generate-report-button"
        >
          {isGeneratingReport ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name="file-text" size={18} color="#FFFFFF" />
              <Text style={styles.reportButtonText}>Generate Report</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(44,44,46,0.92)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: Typography.sizes.lg,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  errorSubtext: {
    fontSize: Typography.sizes.sm,
    color: "#64748B",
    marginTop: Spacing.xs,
  },

  tile: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius["2xl"],
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  tripHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  tripTitleSection: {
    flex: 1,
  },
  tripName: {
    fontSize: 22,
    fontWeight: "700",
    color: TILE_TEXT,
    marginBottom: 4,
  },
  tripDate: {
    fontSize: Typography.sizes.sm,
    color: TILE_TEXT_SECONDARY,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
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
  statsGrid: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
    color: TILE_TEXT,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: 3,
    color: TILE_TEXT_SECONDARY,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  tileSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tileSectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileSectionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "600",
    color: TILE_TEXT,
  },

  mapContainer: {
    height: 200,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  routeMap: {
    flex: 1,
  },

  energyStats: {
    gap: Spacing.md,
  },
  energyStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  energyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  energyStatText: {
    flex: 1,
  },
  energyValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: "600",
    color: TILE_TEXT,
  },
  energyLabel: {
    fontSize: Typography.sizes.sm,
    color: TILE_TEXT_SECONDARY,
    marginTop: 1,
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
    color: TILE_TEXT,
  },
  chartStats: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  chartStat: {
    fontSize: Typography.sizes.xs,
    color: TILE_TEXT_SECONDARY,
  },
  chartContainer: {
    marginTop: Spacing.sm,
  },
  chartBackground: {
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  miniChartRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  miniChartStat: {
    flex: 1,
    alignItems: "center",
  },
  miniChartValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: "700",
    color: TILE_TEXT,
    fontVariant: ["tabular-nums"],
  },
  miniChartLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: 3,
    color: TILE_TEXT_SECONDARY,
  },
  miniStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  dataPointsInfo: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.sm,
  },
  dataPointsValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
    color: TILE_ACCENT,
    fontVariant: ["tabular-nums"],
  },
  dataPointsLabel: {
    fontSize: Typography.sizes.sm,
    color: TILE_TEXT_SECONDARY,
    flex: 1,
  },

  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: SCREEN_BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(60,60,67,0.12)",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(44,44,46,0.92)",
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
  reportButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: TILE_ACCENT,
  },
  reportButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.sizes.md,
    fontWeight: "600",
  },
});
