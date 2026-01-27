import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import Card from "@/components/Card";
import { BladeColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Trip, TripDataPoint } from "@shared/schema";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

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

  const [trip, setTrip] = useState<Trip | null>(null);
  const [dataPoints, setDataPoints] = useState<TripDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchTripData();
  }, [tripId]);

  const fetchTripData = async () => {
    try {
      const [tripResponse, dataResponse] = await Promise.all([
        fetch(new URL(`/api/trips/${tripId}`, getApiUrl()).toString()),
        fetch(new URL(`/api/trips/${tripId}/data`, getApiUrl()).toString()),
      ]);

      if (tripResponse.ok) {
        const tripData = await tripResponse.json();
        setTrip(tripData);
      }

      if (dataResponse.ok) {
        const pointsData = await dataResponse.json();
        setDataPoints(pointsData);
      }
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
          <View style={[styles.chartBackground, { backgroundColor: theme.backgroundElevated }]}>
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

  const generatePDFHTML = () => {
    if (!trip) return "";

    const batteryUsed = (trip.startBatteryPercent || 0) - (trip.endBatteryPercent || 0);
    const efficiency = trip.totalDistanceNm && trip.totalEnergyKwh
      ? (trip.totalEnergyKwh * 1000) / trip.totalDistanceNm
      : 0;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Trip Report - ${trip.name || "Trip"}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a1a; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #0A4B83; padding-bottom: 20px; }
            .header h1 { color: #0A4B83; margin: 0 0 10px 0; font-size: 28px; }
            .header p { color: #666; margin: 0; }
            .section { margin-bottom: 30px; }
            .section h2 { color: #0A4B83; font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
            .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
            .stat-box { background: #f5f7fa; border-radius: 8px; padding: 15px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: 700; color: #0A4B83; }
            .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
            .footer { text-align: center; margin-top: 40px; color: #999; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${trip.name || "Trip Report"}</h1>
            <p>${formatDateTime(trip.startTime)} - ${trip.endTime ? formatDateTime(trip.endTime) : "In Progress"}</p>
          </div>
          
          <div class="section">
            <h2>Trip Summary</h2>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value">${(trip.totalDistanceNm || 0).toFixed(2)}</div>
                <div class="stat-label">Distance (nm)</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${formatDuration(trip.startTime, trip.endTime)}</div>
                <div class="stat-label">Duration</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${(trip.maxSpeedKts || 0).toFixed(1)}</div>
                <div class="stat-label">Max Speed (kts)</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${(trip.avgSpeedKts || 0).toFixed(1)}</div>
                <div class="stat-label">Avg Speed (kts)</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h2>Energy Consumption</h2>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value">${((trip.totalEnergyKwh || 0) * 1000).toFixed(0)}</div>
                <div class="stat-label">Total Energy (Wh)</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${batteryUsed}</div>
                <div class="stat-label">Battery Used (%)</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${efficiency.toFixed(1)}</div>
                <div class="stat-label">Efficiency (Wh/nm)</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${dataPoints.length}</div>
                <div class="stat-label">Data Points</div>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <p>Generated by Blade Outboards App</p>
            <p>Blade Marine Technologies Limited</p>
          </div>
        </body>
      </html>
    `;
  };

  const handleExportPDF = async () => {
    if (!trip) return;

    setIsExporting(true);
    try {
      const html = generatePDFHTML();
      const { uri } = await Print.printToFileAsync({ html });
      
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = uri;
        link.download = `trip-report-${trip.id}.pdf`;
        link.click();
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Trip Report",
          UTI: "com.adobe.pdf",
        });
      }
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!trip) return;
    
    try {
      await Share.share({
        message: `Blade Outboards Trip Report\n\nTrip: ${trip.name || "Trip"}\nDistance: ${(trip.totalDistanceNm || 0).toFixed(2)} nm\nDuration: ${formatDuration(trip.startTime, trip.endTime)}\nMax Speed: ${(trip.maxSpeedKts || 0).toFixed(1)} kts\nEnergy Used: ${((trip.totalEnergyKwh || 0) * 1000).toFixed(0)} Wh`,
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

  const speedData = dataPoints.filter(p => p.speedKts != null).map(p => p.speedKts!);
  const batteryData = dataPoints.filter(p => p.batteryPercent != null).map(p => p.batteryPercent!);
  const powerData = dataPoints.filter(p => p.vescWattage != null).map(p => p.vescWattage!);
  const batteryUsed = (trip.startBatteryPercent || 0) - (trip.endBatteryPercent || 0);

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
                {(trip.totalDistanceNm || 0).toFixed(2)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>nm</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.primary }]}>
                {formatDuration(trip.startTime, trip.endTime)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Duration</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.accent }]}>
                {(trip.maxSpeedKts || 0).toFixed(1)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Max kts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.accent }]}>
                {(trip.avgSpeedKts || 0).toFixed(1)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Avg kts</Text>
            </View>
          </View>
        </Card>

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
                  {((trip.totalEnergyKwh || 0) * 1000).toFixed(0)} Wh
                </Text>
                <Text style={[styles.energyLabel, { color: theme.textSecondary }]}>
                  Total Energy
                </Text>
              </View>
            </View>
            <View style={styles.energyStat}>
              <Feather name="trending-up" size={20} color={BladeColors.info} />
              <View style={styles.energyStatText}>
                <Text style={[styles.energyValue, { color: theme.text }]}>
                  {trip.totalDistanceNm && trip.totalEnergyKwh
                    ? ((trip.totalEnergyKwh * 1000) / trip.totalDistanceNm).toFixed(1)
                    : "0"} Wh/nm
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
          style={[styles.actionButton, { backgroundColor: theme.backgroundElevated }]}
          testID="share-button"
        >
          <Feather name="share" size={20} color={theme.text} />
          <Text style={[styles.actionButtonText, { color: theme.text }]}>Share</Text>
        </Pressable>
        
        <Pressable
          onPress={handleExportPDF}
          disabled={isExporting}
          testID="export-pdf-button"
        >
          <LinearGradient
            colors={[BladeColors.primary, BladeColors.primaryDark]}
            style={styles.exportButton}
          >
            {isExporting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="file-text" size={20} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Export PDF</Text>
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
