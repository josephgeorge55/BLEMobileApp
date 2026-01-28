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
import { Card } from "@/components/Card";
import { OpenStreetMap } from "@/components/OpenStreetMap";
import { BladeColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { Trip, TripDataPoint } from "@shared/schema";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

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
            * { box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              padding: 0; 
              margin: 0;
              color: #1a1a1a; 
              background: #ffffff;
            }
            .page { padding: 50px; max-width: 800px; margin: 0 auto; }
            .header { 
              background: linear-gradient(135deg, #0A4D6E 0%, #063549 100%);
              color: white;
              padding: 40px;
              margin: -50px -50px 40px -50px;
              text-align: center;
            }
            .header-logo { font-size: 14px; letter-spacing: 3px; opacity: 0.9; margin-bottom: 8px; }
            .header h1 { color: white; margin: 0 0 12px 0; font-size: 32px; font-weight: 700; }
            .header-date { color: rgba(255,255,255,0.85); font-size: 14px; }
            .section { margin-bottom: 35px; }
            .section-title { 
              color: #0A4D6E; 
              font-size: 16px; 
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 20px; 
              padding-bottom: 10px;
              border-bottom: 2px solid #8DC63F;
            }
            .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
            .stats-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
            .stat-box { 
              background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
              border: 1px solid #e2e8f0;
              border-radius: 12px; 
              padding: 24px 16px; 
              text-align: center; 
            }
            .stat-value { font-size: 28px; font-weight: 700; color: #0A4D6E; line-height: 1.2; }
            .stat-value-accent { font-size: 28px; font-weight: 700; color: #8DC63F; line-height: 1.2; }
            .stat-label { font-size: 11px; color: #64748b; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
            .motor-info {
              background: #f8fafc;
              border-radius: 8px;
              padding: 16px 20px;
              margin-bottom: 30px;
              display: flex;
              justify-content: space-between;
              border: 1px solid #e2e8f0;
            }
            .motor-info-item { text-align: center; }
            .motor-info-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            .motor-info-value { font-size: 14px; color: #334155; font-weight: 600; margin-top: 4px; }
            .footer { 
              text-align: center; 
              margin-top: 50px; 
              padding-top: 30px;
              border-top: 1px solid #e2e8f0;
            }
            .footer-brand { color: #0A4D6E; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
            .footer-company { color: #94a3b8; font-size: 11px; }
            .footer-links { margin-top: 12px; font-size: 10px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="header-logo">BLADE OUTBOARDS</div>
              <h1>${trip.name || "Trip Report"}</h1>
              <div class="header-date">${formatDateTime(trip.startTime)} ${trip.endTime ? "- " + formatDateTime(trip.endTime) : "(In Progress)"}</div>
            </div>
            
            <div class="motor-info">
              <div class="motor-info-item">
                <div class="motor-info-label">Motor</div>
                <div class="motor-info-value">${trip.motorSerialNumber || "Unknown"}</div>
              </div>
              <div class="motor-info-item">
                <div class="motor-info-label">Duration</div>
                <div class="motor-info-value">${formatDuration(trip.startTime, trip.endTime)}</div>
              </div>
              <div class="motor-info-item">
                <div class="motor-info-label">Data Points</div>
                <div class="motor-info-value">${dataPoints.length}</div>
              </div>
            </div>
            
            <div class="section">
              <div class="section-title">Trip Summary</div>
              <div class="stats-grid">
                <div class="stat-box">
                  <div class="stat-value">${(trip.totalDistanceNm || 0).toFixed(2)}</div>
                  <div class="stat-label">Distance (nm)</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value-accent">${((trip.maxSpeedKts || 0) * 1.852).toFixed(1)}</div>
                  <div class="stat-label">Max Speed (km/h)</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value">${((trip.avgSpeedKts || 0) * 1.852).toFixed(1)}</div>
                  <div class="stat-label">Avg Speed (km/h)</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value">${formatDuration(trip.startTime, trip.endTime)}</div>
                  <div class="stat-label">Duration</div>
                </div>
              </div>
            </div>
            
            <div class="section">
              <div class="section-title">Energy Consumption</div>
              <div class="stats-grid-3">
                <div class="stat-box">
                  <div class="stat-value">${((trip.totalEnergyKwh || 0) * 1000).toFixed(0)}</div>
                  <div class="stat-label">Total Energy (Wh)</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value">${batteryUsed}%</div>
                  <div class="stat-label">Battery Used</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value-accent">${efficiency.toFixed(1)}</div>
                  <div class="stat-label">Efficiency (Wh/nm)</div>
                </div>
              </div>
            </div>
            
            <div class="section">
              <div class="section-title">Battery Status</div>
              <div class="stats-grid">
                <div class="stat-box">
                  <div class="stat-value">${trip.startBatteryPercent || 0}%</div>
                  <div class="stat-label">Start Level</div>
                </div>
                <div class="stat-box">
                  <div class="stat-value">${trip.endBatteryPercent || 0}%</div>
                  <div class="stat-label">End Level</div>
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-brand">BLADE OUTBOARDS</div>
              <div class="footer-company">Blade Marine Technologies Limited</div>
              <div class="footer-links">www.bladeoutboards.com</div>
            </div>
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
        message: `Blade Outboards Trip Report\n\nTrip: ${trip.name || "Trip"}\nDistance: ${(trip.totalDistanceNm || 0).toFixed(2)} nm\nDuration: ${formatDuration(trip.startTime, trip.endTime)}\nMax Speed: ${ktsToKmh(trip.maxSpeedKts || 0).toFixed(1)} km/h\nEnergy Used: ${((trip.totalEnergyKwh || 0) * 1000).toFixed(0)} Wh`,
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

  const routeCoordinates = useMemo(() => {
    return dataPoints
      .filter(p => p.latitude != null && p.longitude != null)
      .map(p => ({
        latitude: p.latitude!,
        longitude: p.longitude!,
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
                {ktsToKmh(trip.maxSpeedKts || 0).toFixed(1)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Max km/h</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: BladeColors.accent }]}>
                {ktsToKmh(trip.avgSpeedKts || 0).toFixed(1)}
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
                  {((trip.totalEnergyKwh || 0) * 1000).toFixed(0)} Wh
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
          style={[styles.actionButton, { backgroundColor: theme.surfaceElevated }]}
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
