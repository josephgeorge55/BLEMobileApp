import React, { useEffect, useCallback, useState, useRef } from "react";
import { StyleSheet, View, ScrollView, RefreshControl, Image, Pressable, Modal, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Device from "expo-device";
import * as Location from "expo-location";

import { ThemedText } from "@/components/ThemedText";
import { MetricCard } from "@/components/MetricCard";
import { SpeedCard } from "@/components/SpeedCard";
import { EmptyState } from "@/components/EmptyState";
import { WeatherCard } from "@/components/WeatherCard";
import { OpenStreetMap } from "@/components/OpenStreetMap";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useTrip } from "@/context/TripContext";
import { useDashboardLayout, DashboardSectionId } from "@/hooks/useDashboardLayout";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

interface LocationQueryData {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
  isLive: boolean;
}

type InfoHelpKey = 'weather' | 'conditions' | 'speed' | 'battery' | 'power' | 'throttle' | 'driveMode' | 'deviceInfo' | 'system' | 'bms' | 'motor' | 'vesc';

const INFO_HELP: Record<InfoHelpKey, { title: string; description: string }> = {
  weather: {
    title: "Marine Weather",
    description: "Current weather conditions at your location including temperature, wind speed, and a 3-hour forecast. This helps you plan safe boating trips and stay aware of changing conditions."
  },
  conditions: {
    title: "Conditions at Sea Level",
    description: "Real-time wind speed in knots, visibility distance, and air quality index. Wind direction and gust information helps you understand water conditions for safer navigation."
  },
  speed: {
    title: "Speed",
    description: "Current speed in kilometers per hour (km/h). Data comes from two sources: the motor's built-in GPS sensor (primary) and your phone's GPS (backup). The motor GPS provides more accurate readings when connected via Bluetooth."
  },
  battery: {
    title: "Battery Level",
    description: "State of charge (SoC) percentage showing remaining battery capacity. This reading comes from the Battery Management System (BMS) which monitors individual cell voltages for accurate capacity estimation. Plan your trips based on this to ensure safe return."
  },
  power: {
    title: "Power Output",
    description: "Current power consumption in kilowatts (kW). Calculated from battery voltage multiplied by current draw. Higher throttle and speed increase power usage. Monitor this to optimize efficiency and extend your range."
  },
  throttle: {
    title: "Throttle Position",
    description: "Current throttle input as a percentage (0-100%). This shows how much power you're requesting from the motor. Higher throttle means more power and faster battery drain. Efficient cruising typically uses 30-50% throttle."
  },
  driveMode: {
    title: "Drive Mode",
    description: "Current operating mode of your outboard. ECO mode limits power for extended range. NORMAL mode balances power and efficiency. SPORT mode provides maximum power for performance. Mode affects acceleration response and top speed."
  },
  deviceInfo: {
    title: "Device Information",
    description: "Connection status, firmware version, and runtime hours for your outboard. Firmware updates improve performance and add features. Runtime hours help track maintenance schedules for optimal motor care."
  },
  system: {
    title: "System Status",
    description: "Firmware version and runtime hours for your outboard. Keep firmware updated for best performance and monitor runtime for maintenance scheduling."
  },
  bms: {
    title: "Battery Management",
    description: "Detailed battery cell information including voltage, current, and temperature. The BMS protects your battery from overcharge, over-discharge, and thermal issues."
  },
  motor: {
    title: "Motor Controller",
    description: "Motor temperature, PWM duty cycle, and torque output. High temperatures may indicate heavy load - allow cooling if needed."
  },
  vesc: {
    title: "VESC Controller",
    description: "Electronic speed controller data including MOSFET temperature and motor RPM. This controller manages power delivery to the motor for smooth operation."
  }
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { theme, isDark } = useTheme();
  const { motor, telemetry, isConnecting, startScan, setLocation } =
    useMotor();
  const { isRecording: tripRecording, tripDuration, startTrip, endTrip } = useTrip();

  const formatTripDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  const scrollViewRef = useRef<ScrollView>(null);
  const telemetrySectionY = useRef(0);
  const [infoModal, setInfoModal] = useState<{ visible: boolean; key: InfoHelpKey | null }>({ visible: false, key: null });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { sectionOrder, isEditMode, moveSection, toggleEditMode, resetLayout } = useDashboardLayout();

  const scrollToTelemetry = () => {
    scrollViewRef.current?.scrollTo({ y: telemetrySectionY.current, animated: true });
  };

  const showInfo = (key: InfoHelpKey) => setInfoModal({ visible: true, key });
  const hideInfo = () => setInfoModal({ visible: false, key: null });

  const isConnected = motor?.isConnected ?? false;
  const serialNumber = motor?.serialNumber;

  const { data: locationData, refetch: refetchLocation } = useQuery<LocationQueryData>({
    queryKey: ["/api/motor", serialNumber, "location"],
    enabled: !!serialNumber && !isConnected,
    refetchInterval: isConnected ? false : 60000,
  });

  useEffect(() => {
    if (locationData && !isConnected) {
      setLocation({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        speed: locationData.speed,
        heading: locationData.heading,
        timestamp: new Date(locationData.timestamp),
        isLive: locationData.isLive,
      });
    }
  }, [locationData, isConnected]);

  const mapPreviewLocation = React.useMemo(() => {
    if (isConnected && telemetry?.gnss) {
      return { latitude: telemetry.gnss.latitude, longitude: telemetry.gnss.longitude, hasLocation: true };
    }
    if (locationData) {
      return { latitude: locationData.latitude, longitude: locationData.longitude, hasLocation: true };
    }
    return { latitude: 25.7617, longitude: -80.1918, hasLocation: false };
  }, [isConnected, telemetry?.gnss, locationData]);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchLocation();
    setRefreshing(false);
  }, [refetchLocation]);

  const handleConnect = () => {
    startScan();
    navigation.navigate("BleScanner");
  };

  const generateStatusPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-AU", { 
        year: "numeric", month: "long", day: "numeric" 
      });
      const timeStr = now.toLocaleTimeString("en-AU", { 
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      const fullDateTime = now.toISOString();

      // Get phone GPS location
      let phoneGps = { lat: "--", lon: "--", accuracy: "--" };
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          phoneGps = {
            lat: loc.coords.latitude.toFixed(6),
            lon: loc.coords.longitude.toFixed(6),
            accuracy: `${loc.coords.accuracy?.toFixed(1) ?? "--"}m`
          };
        }
      } catch (e) {
        console.log("[PDF] Could not get phone GPS:", e);
      }

      // Device info
      const deviceName = Device.deviceName ?? "Unknown";
      const deviceModel = Device.modelName ?? "Unknown";
      const deviceBrand = Device.brand ?? "Unknown";
      const osName = Device.osName ?? Platform.OS;
      const osVersion = Device.osVersion ?? "Unknown";

      // Telemetry data with correct property names
      const motorSpeed = telemetry?.gnss?.speed ?? telemetry?.speed ?? 0;
      const battery = telemetry?.stateOfCharge ?? telemetry?.bms?.capacity ?? 0;
      const voltage = telemetry?.bms?.voltage ?? 48;
      const current = telemetry?.vesc?.current ?? telemetry?.bms?.current ?? 0;
      const wattage = telemetry?.vesc?.wattage ?? telemetry?.bms?.wattage ?? (voltage * Math.abs(current));
      const powerKw = (wattage / 1000).toFixed(2);
      const throttle = telemetry?.vesc?.throttle ?? 0;
      const driveMode = telemetry?.driverMode ?? "Normal";
      const firmware = telemetry?.tillerFirmwareVersion ?? motor?.firmwareVersion ?? "1.0.0";
      const odometerVal = telemetry?.odometer ?? 0;
      const motorTemp = telemetry?.motor?.temperature ?? 0;
      const vescTemp = telemetry?.vesc?.temperature ?? 0;
      const motorRpm = telemetry?.motor?.motorRPM ?? 0;
      const bmsTemp = telemetry?.bms?.temperature ?? 0;
      const phaseCurrent = telemetry?.motor?.phaseCurrent ?? 0;
      const errorCode = telemetry?.errorCode ?? null;
      const errorDesc = telemetry?.errorDescription ?? null;

      // Motor GPS
      const motorGps = telemetry?.gnss ? {
        lat: telemetry.gnss.latitude.toFixed(6),
        lon: telemetry.gnss.longitude.toFixed(6),
        course: telemetry.gnss.course?.toFixed(1) ?? "--",
        time: telemetry.gnss.timeUTC ?? "--"
      } : { lat: "--", lon: "--", course: "--", time: "--" };

      const lastUpdated = telemetry?.timestamp 
        ? new Date(telemetry.timestamp).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "--";

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0D1B2A 0%, #1A2633 100%); color: #EBEFF3; padding: 32px; min-height: 100vh; }
            .header { text-align: center; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #0A4D6E; position: relative; }
            .header::after { content: ''; position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); width: 60px; height: 2px; background: #0A9ED1; }
            .logo { font-size: 24px; font-weight: 300; letter-spacing: 3px; color: #0A9ED1; margin-bottom: 6px; }
            .subtitle { font-size: 11px; color: #8FA3AD; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; }
            .timestamp { font-size: 13px; color: #EBEFF3; font-weight: 500; }
            .timestamp-sub { font-size: 10px; color: #596F7C; margin-top: 4px; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 10px; color: #0A9ED1; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
            .section-title::before { content: ''; width: 3px; height: 12px; background: #0A9ED1; border-radius: 2px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
            .grid-2 { grid-template-columns: repeat(2, 1fr); }
            .card { background: rgba(26, 38, 51, 0.9); border-radius: 10px; padding: 14px; border: 1px solid rgba(10, 77, 110, 0.3); }
            .card-highlight { background: linear-gradient(135deg, rgba(10, 158, 209, 0.15) 0%, rgba(26, 38, 51, 0.9) 100%); border-color: rgba(10, 158, 209, 0.4); }
            .card-label { font-size: 9px; color: #596F7C; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .card-value { font-size: 20px; font-weight: 600; color: #EBEFF3; }
            .card-value-sm { font-size: 14px; }
            .card-unit { font-size: 10px; color: #8FA3AD; margin-left: 2px; }
            .card-sub { font-size: 9px; color: #596F7C; margin-top: 2px; }
            .full-width { grid-column: span 4; }
            .half-width { grid-column: span 2; }
            .data-table { background: rgba(26, 38, 51, 0.9); border-radius: 10px; border: 1px solid rgba(10, 77, 110, 0.3); overflow: hidden; }
            .data-row { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid rgba(42, 52, 64, 0.5); }
            .data-row:last-child { border-bottom: none; }
            .data-label { color: #596F7C; font-size: 11px; }
            .data-value { color: #EBEFF3; font-size: 11px; font-family: 'SF Mono', Monaco, monospace; text-align: right; }
            .data-value-highlight { color: #0A9ED1; }
            .gps-section { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .gps-card { background: rgba(26, 38, 51, 0.9); border-radius: 10px; padding: 14px; border: 1px solid rgba(10, 77, 110, 0.3); }
            .gps-title { font-size: 10px; color: #0A9ED1; font-weight: 600; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            .coord-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .coord-label { font-size: 10px; color: #596F7C; }
            .coord-value { font-size: 10px; color: #EBEFF3; font-family: 'SF Mono', Monaco, monospace; }
            .status-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
            .status-connected { background: rgba(52, 199, 89, 0.2); color: #34C759; }
            .status-disconnected { background: rgba(255, 69, 58, 0.2); color: #FF453A; }
            .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(42, 52, 64, 0.5); }
            .disclaimer { font-size: 8px; color: #596F7C; line-height: 1.4; max-width: 500px; margin: 0 auto 12px; }
            .footer-brand { font-size: 9px; color: #8FA3AD; letter-spacing: 1px; }
            .error-box { background: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.3); border-radius: 8px; padding: 10px 14px; margin-top: 10px; }
            .error-text { color: #FF453A; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">BLADE<sup style="font-size: 8px;">®</sup> HALO CONNECT</div>
            <div class="subtitle">Instantaneous Snapshot Report</div>
            <div class="timestamp">${dateStr} at ${timeStr}</div>
            <div class="timestamp-sub">ISO: ${fullDateTime}</div>
          </div>
          
          <div class="section">
            <div class="section-title">Performance Metrics</div>
            <div class="grid">
              <div class="card card-highlight">
                <div class="card-label">Speed</div>
                <div class="card-value">${motorSpeed.toFixed(1)}<span class="card-unit">km/h</span></div>
                <div class="card-sub">Motor GPS</div>
              </div>
              <div class="card card-highlight">
                <div class="card-label">Battery</div>
                <div class="card-value">${battery.toFixed(0)}<span class="card-unit">%</span></div>
                <div class="card-sub">State of Charge</div>
              </div>
              <div class="card">
                <div class="card-label">Power</div>
                <div class="card-value">${powerKw}<span class="card-unit">kW</span></div>
                <div class="card-sub">${wattage.toFixed(0)}W</div>
              </div>
              <div class="card">
                <div class="card-label">Throttle</div>
                <div class="card-value">${throttle.toFixed(0)}<span class="card-unit">%</span></div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">GPS Position Data</div>
            <div class="gps-section">
              <div class="gps-card">
                <div class="gps-title">Outboard GPS</div>
                <div class="coord-row"><span class="coord-label">Latitude</span><span class="coord-value">${motorGps.lat}</span></div>
                <div class="coord-row"><span class="coord-label">Longitude</span><span class="coord-value">${motorGps.lon}</span></div>
                <div class="coord-row"><span class="coord-label">Course</span><span class="coord-value">${motorGps.course}°</span></div>
                <div class="coord-row"><span class="coord-label">GPS Time</span><span class="coord-value">${motorGps.time}</span></div>
              </div>
              <div class="gps-card">
                <div class="gps-title">Phone GPS</div>
                <div class="coord-row"><span class="coord-label">Latitude</span><span class="coord-value">${phoneGps.lat}</span></div>
                <div class="coord-row"><span class="coord-label">Longitude</span><span class="coord-value">${phoneGps.lon}</span></div>
                <div class="coord-row"><span class="coord-label">Accuracy</span><span class="coord-value">${phoneGps.accuracy}</span></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Battery & Power System</div>
            <div class="grid grid-2">
              <div class="data-table">
                <div class="data-row"><span class="data-label">Battery Voltage</span><span class="data-value">${voltage.toFixed(1)} V</span></div>
                <div class="data-row"><span class="data-label">Current Draw</span><span class="data-value">${current.toFixed(1)} A</span></div>
                <div class="data-row"><span class="data-label">BMS Temperature</span><span class="data-value">${bmsTemp.toFixed(1)}°C</span></div>
              </div>
              <div class="data-table">
                <div class="data-row"><span class="data-label">Drive Mode</span><span class="data-value data-value-highlight">${driveMode}</span></div>
                <div class="data-row"><span class="data-label">Phase Current</span><span class="data-value">${phaseCurrent.toFixed(1)} A</span></div>
                <div class="data-row"><span class="data-label">Motor RPM</span><span class="data-value">${motorRpm.toFixed(0)}</span></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Temperature & Controller</div>
            <div class="grid">
              <div class="card">
                <div class="card-label">Motor Temp</div>
                <div class="card-value card-value-sm">${motorTemp.toFixed(1)}<span class="card-unit">°C</span></div>
              </div>
              <div class="card">
                <div class="card-label">VESC Temp</div>
                <div class="card-value card-value-sm">${vescTemp.toFixed(1)}<span class="card-unit">°C</span></div>
              </div>
              <div class="card">
                <div class="card-label">BMS Temp</div>
                <div class="card-value card-value-sm">${bmsTemp.toFixed(1)}<span class="card-unit">°C</span></div>
              </div>
              <div class="card">
                <div class="card-label">Odometer</div>
                <div class="card-value card-value-sm">${odometerVal.toFixed(1)}<span class="card-unit">hrs</span></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Outboard Information</div>
            <div class="data-table">
              <div class="data-row"><span class="data-label">Serial Number</span><span class="data-value data-value-highlight">${motor?.serialNumber ?? '--'}</span></div>
              <div class="data-row"><span class="data-label">Firmware Version</span><span class="data-value">v${firmware}</span></div>
              <div class="data-row"><span class="data-label">Connection Status</span><span class="data-value"><span class="status-badge ${isConnected ? 'status-connected' : 'status-disconnected'}">${isConnected ? 'Connected' : 'Disconnected'}</span></span></div>
              <div class="data-row"><span class="data-label">Last Telemetry</span><span class="data-value">${lastUpdated}</span></div>
            </div>
            ${errorCode ? `<div class="error-box"><span class="error-text">Error ${errorCode}: ${errorDesc ?? 'Unknown error'}</span></div>` : ''}
          </div>

          <div class="section">
            <div class="section-title">Capture Device</div>
            <div class="data-table">
              <div class="data-row"><span class="data-label">Device Name</span><span class="data-value">${deviceName}</span></div>
              <div class="data-row"><span class="data-label">Model</span><span class="data-value">${deviceBrand} ${deviceModel}</span></div>
              <div class="data-row"><span class="data-label">Operating System</span><span class="data-value">${osName} ${osVersion}</span></div>
              <div class="data-row"><span class="data-label">Report Generated</span><span class="data-value">${timeStr}</span></div>
            </div>
          </div>
          
          <div class="footer">
            <div class="disclaimer">Data and weather information are provided for reference only and are not guaranteed. Always operate your vessel safely, comply with all warnings and local laws, and never operate a boat under the influence.</div>
            <div class="footer-brand">BLADE OUTBOARDS • HALO CONNECT • bladeoutboards.com</div>
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Status Report',
          UTI: 'com.adobe.pdf'
        });
      }
    } catch (error) {
      console.error('[Dashboard] PDF generation error:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (!motor) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: "#F2F2F7" }]}
        contentContainerStyle={{
          paddingBottom: tabBarHeight + Spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={[styles.heroArea, { paddingTop: insets.top + Spacing.md }]}>
          <Image
            source={require("../../assets/images/halo-outboard.png")}
            style={styles.heroImage}
            resizeMode="contain"
          />
          <ThemedText style={styles.heroTitle}>Blade Halo Series</ThemedText>
          <ThemedText style={styles.heroSubtitle}>1-6kW Electric Outboard Motors</ThemedText>
          <ThemedText style={styles.heroTagline}>Cutting-edge technology features that enhance the e-boating experience.</ThemedText>
          <View style={styles.heroDeviceRow}>
            <View style={[styles.statusPill, { backgroundColor: BladeColors.offline + "25" }]}>
              <View style={[styles.statusDot, { backgroundColor: BladeColors.offline }]} />
              <ThemedText type="caption" style={{ color: BladeColors.offline, fontWeight: "600" }}>
                Disconnected
              </ThemedText>
            </View>
            <Pressable
              style={[styles.connectButton, { marginTop: 0 }]}
              onPress={handleConnect}
            >
              <Feather name="bluetooth" size={14} color="#FFFFFF" />
              <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600", marginLeft: Spacing.xs }}>
                Scan for Motors
              </ThemedText>
            </Pressable>
          </View>
        </Animated.View>

        <View style={{ paddingHorizontal: Spacing.screenPadding }}>
          <View style={styles.descriptionTile}>
            <Feather name="activity" size={16} color="rgba(255,255,255,0.55)" />
            <ThemedText type="small" style={styles.descriptionTileText}>
              Live telemetry, weather, and system information for your outboard.
            </ThemedText>
          </View>

          <View style={styles.sectionHeader}>
            <Feather name="cloud" size={14} color={theme.textSecondary} />
            <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
              Marine Weather
            </ThemedText>
            <Pressable onPress={() => showInfo('weather')} hitSlop={8}>
              <Feather name="info" size={14} color={theme.textTertiary} />
            </Pressable>
          </View>
          <WeatherCard variant="weather" />

          <View style={styles.sectionHeader}>
            <Feather name="navigation" size={14} color={theme.textSecondary} />
            <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
              Conditions at Sea Level
            </ThemedText>
            <Pressable onPress={() => showInfo('conditions')} hitSlop={8}>
              <Feather name="info" size={14} color={theme.textTertiary} />
            </Pressable>
          </View>
          <WeatherCard variant="conditions" />

          <EmptyState
            image={require("../../assets/images/halo-outboard.png")}
            title="Connect Your Outboard"
            description="Tap the Bluetooth button to scan for nearby Blade outboards and view real-time telemetry."
            actionLabel="Scan for Motors"
            onAction={handleConnect}
          />
        </View>
      </ScrollView>
    );
  }

  const speed = telemetry?.speed ?? 0;
  const soc = telemetry?.stateOfCharge ?? 0;
  const power = telemetry?.powerConsumption ?? 0;
  const firmware = telemetry?.tillerFirmwareVersion ?? motor.firmwareVersion ?? "--";
  const odometer = telemetry?.odometer;
  const driverMode = telemetry?.driverMode;
  const errorCode = telemetry?.errorCode;
  const errorDescription = telemetry?.errorDescription;

  const bms = telemetry?.bms;
  const motorData = telemetry?.motor;
  const vesc = telemetry?.vesc;
  const gnss = telemetry?.gnss;

  const getDriverModeColor = (mode: string | null | undefined) => {
    switch (mode) {
      case "Sport": return BladeColors.error;
      case "Normal": return BladeColors.accent;
      case "Eco": return BladeColors.success;
      case "Docking": return BladeColors.marine;
      default: return theme.textSecondary;
    }
  };

  const getBatteryColor = () => {
    if (soc > 60) return BladeColors.success;
    if (soc > 30) return BladeColors.accent;
    if (soc > 15) return BladeColors.warning;
    return BladeColors.error;
  };

  const getTemperatureColor = (temp: number) => {
    if (temp < 40) return BladeColors.success;
    if (temp < 55) return BladeColors.accent;
    if (temp < 70) return BladeColors.warning;
    return BladeColors.error;
  };

  const renderSection = (sectionId: DashboardSectionId): React.ReactNode => {
    switch (sectionId) {
      case 'description':
        return (
          <View style={styles.descriptionTile}>
            <Feather name="activity" size={16} color="rgba(255,255,255,0.55)" />
            <ThemedText type="small" style={styles.descriptionTileText}>
              Live telemetry, weather, and system information for your outboard.
            </ThemedText>
          </View>
        );
      case 'weather':
        return (
          <View>
            <View style={styles.sectionHeader}>
              <Feather name="cloud" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
                Marine Weather
              </ThemedText>
              <Pressable onPress={() => showInfo('weather')} hitSlop={8}>
                <Feather name="info" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <WeatherCard variant="weather" />
          </View>
        );
      case 'conditions':
        return (
          <View>
            <View style={styles.sectionHeader}>
              <Feather name="navigation" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
                Conditions at Sea Level
              </ThemedText>
              <Pressable onPress={() => showInfo('conditions')} hitSlop={8}>
                <Feather name="info" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <WeatherCard variant="conditions" />
          </View>
        );
      case 'speed':
        return (
          <View style={styles.metricsGrid}>
            <View style={styles.sectionHeader}>
              <Feather name="navigation-2" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
                Speed
              </ThemedText>
              <Pressable onPress={() => showInfo('speed')} hitSlop={8}>
                <Feather name="info" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <SpeedCard
              motorSpeed={speed}
              isConnected={isConnected}
            />
          </View>
        );
      case 'batteryPower':
        return (
          <View style={styles.metricsGrid}>
            <View style={styles.sectionHeader}>
              <Feather name="battery-charging" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
                Battery & Power
              </ThemedText>
              <Pressable onPress={() => showInfo('battery')} hitSlop={8} style={{ marginRight: Spacing.sm }}>
                <Feather name="info" size={14} color={theme.textTertiary} />
              </Pressable>
              <Pressable onPress={() => showInfo('power')} hitSlop={8}>
                <Feather name="zap" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <View style={styles.metricRow}>
              <MetricCard
                icon="battery-charging"
                label="Battery"
                value={Math.round(soc)}
                unit="%"
                iconColor={getBatteryColor()}
                accentGlow={soc < 20}
              />
              <View style={{ width: Spacing.md }} />
              <MetricCard
                icon="zap"
                label="Power"
                value={power.toFixed(1)}
                unit="kW"
                trend={power > 0 ? "up" : "stable"}
                iconColor={BladeColors.accent}
              />
            </View>
          </View>
        );
      case 'throttleMode':
        return (
          <View style={styles.metricsGrid}>
            <View style={styles.sectionHeader}>
              <Feather name="sliders" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
                Throttle & Mode
              </ThemedText>
              <Pressable onPress={() => showInfo('throttle')} hitSlop={8} style={{ marginRight: Spacing.sm }}>
                <Feather name="info" size={14} color={theme.textTertiary} />
              </Pressable>
              <Pressable onPress={() => showInfo('driveMode')} hitSlop={8}>
                <Feather name="disc" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <View style={styles.metricRow}>
              <MetricCard
                icon="percent"
                label="Throttle"
                value={vesc?.throttle ?? 0}
                unit="%"
                iconColor={BladeColors.marine}
                accentGlow={(vesc?.throttle ?? 0) > 80}
              />
              <View style={{ width: Spacing.md }} />
              <MetricCard
                icon={driverMode === "Sport" ? "zap" : driverMode === "Eco" ? "sun" : driverMode === "Docking" ? "anchor" : "disc"}
                label="Drive Mode"
                value={driverMode || "--"}
                iconColor={getDriverModeColor(driverMode)}
                compact
              />
            </View>
          </View>
        );
      case 'motorTelemetry':
        return (
          <View style={styles.statusSection}>
            <View style={styles.sectionHeader}>
              <Feather name="cpu" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
                Motor & Battery Telemetry
              </ThemedText>
              <Pressable onPress={() => showInfo('motor')} hitSlop={8}>
                <Feather name="info" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: "rgba(44,44,46,0.92)",
                  borderColor: "rgba(255,255,255,0.08)",
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "30" }]}>
                    <Feather name="rotate-cw" size={14} color={BladeColors.marine} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    RPM
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                  {motorData?.motorRPM ?? "--"}
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "30" }]}>
                    <Feather name="activity" size={14} color={BladeColors.accent} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Motor Amps (Phase)
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                  {motorData?.phaseCurrent?.toFixed(1) ?? "--"} A
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.warning + "30" }]}>
                    <Feather name="zap" size={14} color={BladeColors.warning} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Battery Amps (BMS)
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                  {bms?.current?.toFixed(1) ?? "--"} A
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "30" }]}>
                    <Feather name="zap" size={14} color={BladeColors.accent} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Voltage (BMS)
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                  {bms?.voltage?.toFixed(1) ?? "--"} V
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.success + "30" }]}>
                    <Feather name="map-pin" size={14} color={BladeColors.success} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    GPS Coordinates
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF", fontSize: 12 }]}>
                  {gnss ? `${gnss.latitude.toFixed(5)}, ${gnss.longitude.toFixed(5)}` : "--"}
                </ThemedText>
              </View>
            </View>
          </View>
        );
      case 'bmsMotor':
        if (!isConnected || !(bms || motorData || vesc)) return null;
        return (
          <View>
            <View style={styles.statusSection}>
              <ThemedText
                type="caption"
                style={[styles.sectionLabel, { color: theme.textTertiary }]}
              >
                BATTERY (BMS)
              </ThemedText>
              <View
                style={[
                  styles.statusCard,
                  {
                    backgroundColor: "rgba(44,44,46,0.92)",
                    borderColor: "rgba(255,255,255,0.08)",
                  },
                ]}
              >
                <View style={styles.statusRow}>
                  <View style={styles.statusLabel}>
                    <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "30" }]}>
                      <Feather name="zap" size={14} color={BladeColors.accent} />
                    </View>
                    <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                      Voltage
                    </ThemedText>
                  </View>
                  <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                    {bms?.voltage.toFixed(1) ?? "--"} V
                  </ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
                <View style={styles.statusRow}>
                  <View style={styles.statusLabel}>
                    <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "30" }]}>
                      <Feather name="activity" size={14} color={BladeColors.marine} />
                    </View>
                    <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                      Current
                    </ThemedText>
                  </View>
                  <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                    {bms?.current.toFixed(1) ?? "--"} A
                  </ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
                <View style={styles.statusRow}>
                  <View style={styles.statusLabel}>
                    <View style={[styles.statusIcon, { backgroundColor: getTemperatureColor(bms?.temperature ?? 0) + "30" }]}>
                      <Feather name="thermometer" size={14} color={getTemperatureColor(bms?.temperature ?? 0)} />
                    </View>
                    <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                      Temperature
                    </ThemedText>
                  </View>
                  <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                    {bms?.temperature ?? "--"}°C
                  </ThemedText>
                </View>
              </View>
            </View>
            <View style={styles.statusSection}>
              <ThemedText
                type="caption"
                style={[styles.sectionLabel, { color: theme.textTertiary }]}
              >
                MOTOR
              </ThemedText>
              <View
                style={[
                  styles.statusCard,
                  {
                    backgroundColor: "rgba(44,44,46,0.92)",
                    borderColor: "rgba(255,255,255,0.08)",
                  },
                ]}
              >
                <View style={styles.statusRow}>
                  <View style={styles.statusLabel}>
                    <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "30" }]}>
                      <Feather name="rotate-cw" size={14} color={BladeColors.marine} />
                    </View>
                    <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                      RPM
                    </ThemedText>
                  </View>
                  <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                    {motorData?.motorRPM ?? "--"}
                  </ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
                <View style={styles.statusRow}>
                  <View style={styles.statusLabel}>
                    <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "30" }]}>
                      <Feather name="activity" size={14} color={BladeColors.accent} />
                    </View>
                    <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                      Phase Current
                    </ThemedText>
                  </View>
                  <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                    {motorData?.phaseCurrent.toFixed(1) ?? "--"} A
                  </ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
                <View style={styles.statusRow}>
                  <View style={styles.statusLabel}>
                    <View style={[styles.statusIcon, { backgroundColor: getTemperatureColor(motorData?.temperature ?? 0) + "30" }]}>
                      <Feather name="thermometer" size={14} color={getTemperatureColor(motorData?.temperature ?? 0)} />
                    </View>
                    <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                      Temperature
                    </ThemedText>
                  </View>
                  <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                    {motorData?.temperature ?? "--"}°C
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
        );
      case 'deviceInfo':
        return (
          <View style={styles.statusSection}>
            <View style={styles.sectionHeader}>
              <Feather name="info" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
                Device Info
              </ThemedText>
              <Pressable onPress={() => showInfo('deviceInfo')} hitSlop={8}>
                <Feather name="info" size={14} color={theme.textTertiary} />
              </Pressable>
            </View>
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: "rgba(44,44,46,0.92)",
                  borderColor: "rgba(255,255,255,0.08)",
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: theme.primary + "30" }]}>
                    <Feather name="hash" size={14} color={theme.primary} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Serial Number
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                  {motor.serialNumber}
                </ThemedText>
              </View>
              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "30" }]}>
                    <Feather name="clock" size={14} color={BladeColors.marine} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Odometer
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                  {odometer != null ? `${odometer.toFixed(1)} hrs` : "--"}
                </ThemedText>
              </View>
              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: theme.primary + "30" }]}>
                    <Feather name="cpu" size={14} color={theme.primary} />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Firmware
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#FFFFFF" }]}>
                  v{firmware}
                </ThemedText>
              </View>
              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View
                    style={[
                      styles.statusIcon,
                      { backgroundColor: (isConnected ? BladeColors.success : BladeColors.offline) + "30" },
                    ]}
                  >
                    <Feather
                      name="bluetooth"
                      size={14}
                      color={isConnected ? BladeColors.success : BladeColors.offline}
                    />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Connection
                  </ThemedText>
                </View>
                <View style={styles.connectionStatus}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: isConnected
                          ? BladeColors.success
                          : BladeColors.offline,
                      },
                    ]}
                  />
                  <ThemedText type="small" style={{ fontWeight: "500", color: "#FFFFFF" }}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </ThemedText>
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                    <Feather name="clock" size={14} color="rgba(255,255,255,0.45)" />
                  </View>
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Last Updated
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ fontWeight: "500", color: "#FFFFFF" }}>
                  {telemetry?.timestamp
                    ? new Date(telemetry.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "--"}
                </ThemedText>
              </View>
            </View>
          </View>
        );
      case 'exportReport':
        return (
          <View style={styles.pdfButtonContainer}>
            <Pressable
              style={[styles.pdfButton, { backgroundColor: "rgba(44,44,46,0.92)" }]}
              onPress={generateStatusPdf}
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? (
                <ActivityIndicator size="small" color={BladeColors.accent} />
              ) : (
                <>
                  <Feather name="file-text" size={16} color={BladeColors.accent} />
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)", marginLeft: Spacing.xs }}>
                    Export Snapshot Report
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <>
    <ScrollView
      ref={scrollViewRef}
      style={[styles.container, { backgroundColor: "#F2F2F7" }]}
      contentContainerStyle={{
        paddingBottom: tabBarHeight + Spacing["4xl"],
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primary}
        />
      }
    >
      <Animated.View entering={FadeIn.duration(600)} style={[styles.heroArea, { paddingTop: insets.top + Spacing.md }]}>
        <Image
          source={require("../../assets/images/halo-outboard.png")}
          style={styles.heroImage}
          resizeMode="contain"
        />
        <ThemedText style={styles.heroTitle}>Blade Halo Series</ThemedText>
        <ThemedText style={styles.heroSubtitle}>1-6kW Electric Outboard Motors</ThemedText>
        <ThemedText style={styles.heroTagline}>Cutting-edge technology features that enhance the e-boating experience.</ThemedText>
        <View style={styles.heroDeviceRow}>
          {isConnected ? (
            <>
              <View style={[styles.statusPill, { backgroundColor: BladeColors.accent + "25" }]}>
                <View style={[styles.statusDot, { backgroundColor: BladeColors.accent }]} />
                <ThemedText type="caption" style={{ color: BladeColors.accent, fontWeight: "600" }}>
                  Live
                </ThemedText>
              </View>
              <ThemedText type="mono" style={styles.heroSerial}>
                {telemetry?.tillerSerialNumber || motor?.serialNumber || "--"}
              </ThemedText>
            </>
          ) : (
            <>
              <View style={[styles.statusPill, { backgroundColor: BladeColors.offline + "25" }]}>
                <View style={[styles.statusDot, { backgroundColor: BladeColors.offline }]} />
                <ThemedText type="caption" style={{ color: BladeColors.offline, fontWeight: "600" }}>
                  Disconnected
                </ThemedText>
              </View>
              <Pressable
                style={[styles.connectButton, { marginTop: 0 }]}
                onPress={handleConnect}
              >
                <Feather name="bluetooth" size={14} color="#FFFFFF" />
                <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600", marginLeft: Spacing.xs }}>
                  Scan for Motors
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </Animated.View>

      <View style={{ paddingHorizontal: Spacing.screenPadding }}>
        <View style={styles.quickActionsGrid}>
          <Pressable
            style={({ pressed }) => [styles.quickActionTileFull, pressed ? { opacity: 0.8 } : null]}
            onPress={() => navigation.navigate("LocationTab" as any)}
          >
            <View style={styles.mapPreview}>
              <OpenStreetMap
                style={styles.mapPreviewMap}
                minimal
                initialRegion={{
                  latitude: mapPreviewLocation.latitude,
                  longitude: mapPreviewLocation.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
                markers={mapPreviewLocation.hasLocation ? [{
                  coordinate: {
                    latitude: mapPreviewLocation.latitude,
                    longitude: mapPreviewLocation.longitude,
                  },
                  title: "Motor",
                  color: isConnected ? BladeColors.accent : BladeColors.marine,
                  isLive: isConnected,
                }] : []}
              />
              <View style={styles.mapPreviewPin}>
                <Feather name="map-pin" size={24} color={BladeColors.accent} />
              </View>
            </View>
            <View style={styles.quickActionRow}>
              <View style={[styles.quickActionIconWrap, { backgroundColor: BladeColors.accent + "20" }]}>
                <Feather name="shield" size={18} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.quickActionLabel}>Maps / Anti-Theft</ThemedText>
                <ThemedText style={styles.quickActionSublabel}>Track motor location</ThemedText>
              </View>
              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.3)" />
            </View>
          </Pressable>

          <View style={styles.quickActionTileFull}>
            <View style={styles.tripPreview}>
              <View style={styles.tripTimerDisplay}>
                <Feather name={tripRecording ? "pause-circle" : "play-circle"} size={28} color={tripRecording ? BladeColors.error : BladeColors.accent} />
                <ThemedText style={styles.tripTimerText}>
                  {formatTripDuration(tripDuration)}
                </ThemedText>
              </View>
              {tripRecording ? (
                <View style={[styles.statusPill, { backgroundColor: BladeColors.accent + "25" }]}>
                  <View style={[styles.statusDot, { backgroundColor: BladeColors.accent }]} />
                  <ThemedText type="caption" style={{ color: BladeColors.accent, fontWeight: "600" }}>Recording</ThemedText>
                </View>
              ) : null}
            </View>
            <View style={styles.tripActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.tripStartStopButton,
                  { backgroundColor: tripRecording ? BladeColors.error : BladeColors.accent },
                  pressed ? { opacity: 0.8 } : null,
                ]}
                onPress={() => {
                  if (tripRecording) {
                    endTrip('user_button');
                  } else {
                    startTrip();
                  }
                }}
              >
                <Feather name={tripRecording ? "square" : "play"} size={16} color="#FFFFFF" />
                <ThemedText style={styles.tripStartStopText}>
                  {tripRecording ? "End Trip" : "Start Trip"}
                </ThemedText>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.tripViewButton, pressed ? { opacity: 0.7 } : null]}
                onPress={() => navigation.navigate("TripsTab" as any)}
              >
                <ThemedText style={styles.tripViewText}>View Trips</ThemedText>
                <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>
          </View>

          <View style={styles.quickActionSplitRow}>
            <Pressable
              style={({ pressed }) => [styles.quickActionTileHalf, pressed ? { opacity: 0.8 } : null]}
              onPress={() => navigation.navigate("UpdatesTab" as any)}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: "#FF950020" }]}>
                <Feather name="download-cloud" size={18} color="#FF9500" />
              </View>
              <ThemedText style={styles.quickActionLabel}>OTA Updates</ThemedText>
              <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickActionTileHalf, pressed ? { opacity: 0.8 } : null]}
              onPress={() => navigation.navigate("SettingsTab" as any)}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: "#8E8E9320" }]}>
                <Feather name="settings" size={18} color="#8E8E93" />
              </View>
              <ThemedText style={styles.quickActionLabel}>More</ThemedText>
              <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
            </Pressable>
          </View>
        </View>

        {errorCode ? (
          <Animated.View
            entering={FadeInUp.duration(300).springify()}
            style={[styles.errorBanner, { backgroundColor: BladeColors.error + "20", borderColor: BladeColors.error }]}
          >
            <View style={styles.errorContent}>
              <Feather name="alert-triangle" size={20} color={BladeColors.error} />
              <View style={styles.errorText}>
                <ThemedText type="body" style={{ color: BladeColors.error, fontWeight: "600" }}>
                  Error {errorCode}
                </ThemedText>
                <ThemedText type="small" style={{ color: BladeColors.error, opacity: 0.9 }}>
                  {errorDescription}
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <View onLayout={(e) => { telemetrySectionY.current = e.nativeEvent.layout.y; }}>
          <View style={styles.telemetrySectionHeader}>
            <View style={styles.telemetryHeaderLine} />
            <ThemedText style={styles.telemetryHeaderLabel}>Live Telemetry</ThemedText>
            <View style={styles.telemetryHeaderLine} />
          </View>

          {sectionOrder.map((sectionId, index) => {
            const isFirst = index === 0;
            const isLast = index === sectionOrder.length - 1;
            const sectionContent = renderSection(sectionId);
            if (!sectionContent) return null;
            return (
              <View key={sectionId}>
                {isEditMode ? (
                  <View style={styles.editSectionWrapper}>
                    <View style={styles.editControls}>
                      <Pressable
                        onPress={() => moveSection(sectionId, 'up')}
                        disabled={isFirst}
                        style={[styles.editArrowButton, isFirst ? styles.editArrowDisabled : null]}
                        hitSlop={8}
                      >
                        <Feather name="chevron-up" size={18} color={isFirst ? "rgba(255,255,255,0.2)" : "#FFFFFF"} />
                      </Pressable>
                      <View style={styles.editDragHandle}>
                        <Feather name="menu" size={16} color="rgba(255,255,255,0.55)" />
                      </View>
                      <Pressable
                        onPress={() => moveSection(sectionId, 'down')}
                        disabled={isLast}
                        style={[styles.editArrowButton, isLast ? styles.editArrowDisabled : null]}
                        hitSlop={8}
                      >
                        <Feather name="chevron-down" size={18} color={isLast ? "rgba(255,255,255,0.2)" : "#FFFFFF"} />
                      </Pressable>
                    </View>
                    <View style={styles.editSectionContent}>
                      {sectionContent}
                    </View>
                  </View>
                ) : sectionContent}
              </View>
            );
          })}

          <Pressable
            style={styles.editLayoutButton}
            onPress={toggleEditMode}
          >
            <Feather name={isEditMode ? "check" : "layout"} size={16} color={BladeColors.accent} />
            <ThemedText type="small" style={{ color: BladeColors.accent, fontWeight: "600", marginLeft: Spacing.xs }}>
              {isEditMode ? "Done" : "Edit Layout"}
            </ThemedText>
          </Pressable>

          {isEditMode ? (
            <Pressable
              style={styles.resetLayoutButton}
              onPress={resetLayout}
            >
              <Feather name="rotate-ccw" size={14} color="rgba(255,255,255,0.55)" />
              <ThemedText type="small" style={{ color: "rgba(255,255,255,0.55)", marginLeft: Spacing.xs }}>
                Reset to Default
              </ThemedText>
            </Pressable>
          ) : null}

          <View style={styles.disclaimerContainer}>
            <ThemedText style={styles.disclaimerText}>
              Data and weather information are provided for reference only and are not guaranteed. Always operate your vessel safely, comply with all warnings and local laws, and never operate a boat under the influence.
            </ThemedText>
          </View>
        </View>
      </View>

      <Modal
        visible={infoModal.visible}
        transparent
        animationType="fade"
        onRequestClose={hideInfo}
      >
        <Pressable style={styles.infoModalOverlay} onPress={hideInfo}>
          <Pressable style={[styles.infoModalContent, { backgroundColor: theme.surfaceElevated }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.infoModalHeader}>
              <View style={[styles.infoModalIcon, { backgroundColor: BladeColors.accent + "20" }]}>
                <Feather name="info" size={20} color={BladeColors.accent} />
              </View>
              <Pressable onPress={hideInfo} hitSlop={12}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ThemedText type="h3" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              {infoModal.key ? INFO_HELP[infoModal.key].title : ''}
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, lineHeight: 22 }}>
              {infoModal.key ? INFO_HELP[infoModal.key].description : ''}
            </ThemedText>
            <Pressable 
              style={[styles.infoModalButton, { backgroundColor: BladeColors.accent }]} 
              onPress={hideInfo}
            >
              <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                Got it
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: Spacing.screenPadding,
  },
  heroArea: {
    alignItems: "center",
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.lg,
  },
  heroImage: {
    width: 240,
    height: 300,
    marginBottom: Spacing.md,
  },
  heroTitle: {
    color: "#1C1C1E",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: Spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 46,
    lineHeight: 36,
  },
  heroSubtitle: {
    color: "#8E8E93",
    fontSize: 15,
    fontWeight: "400",
    textAlign: "center",
  },
  heroTagline: {
    color: "#8E8E93",
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    lineHeight: 18,
  },
  heroDeviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  heroSerial: {
    color: "#8E8E93",
    fontSize: 12,
  },
  heroDisconnectedLabel: {
    color: "#8E8E93",
    fontSize: 12,
  },
  quickActionsGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  quickActionTileFull: {
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  quickActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  quickActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  quickActionSublabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    marginTop: 2,
  },
  quickActionSplitRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  quickActionTileHalf: {
    flex: 1,
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  mapPreview: {
    height: 120,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: "hidden",
    position: "relative",
  },
  mapPreviewMap: {
    flex: 1,
  },
  mapPreviewPin: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -24,
    marginLeft: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BladeColors.accent + "15",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  tripPreview: {
    minHeight: 110,
    backgroundColor: "rgba(30,30,32,0.95)",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.sm,
  },
  tripTimerDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  tripTimerText: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "300",
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 48,
    lineHeight: 40,
  },
  tripActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  tripStartStopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  tripStartStopText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  tripViewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tripViewText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "500",
  },
  telemetrySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  telemetryHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(142,142,147,0.3)",
  },
  telemetryHeaderLabel: {
    color: "#8E8E93",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  descriptionTile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  descriptionTileText: {
    color: "rgba(255,255,255,0.55)",
    flex: 1,
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  infoModalContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  infoModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  infoModalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  infoModalButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  pdfButtonContainer: {
    marginTop: Spacing.lg,
    alignItems: "center",
  },
  pdfButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  disclaimerContainer: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  disclaimerText: {
    fontSize: 10,
    lineHeight: 14,
    color: "#8E8E93",
    textAlign: "center",
    opacity: 0.7,
  },
  metricsGrid: {
    gap: Spacing.md,
  },
  metricRow: {
    flexDirection: "row",
  },
  statusSection: {
    marginTop: Spacing["2xl"],
  },
  sectionLabel: {
    marginBottom: Spacing.md,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  statusCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.cardPadding,
    borderWidth: 1,
    overflow: "hidden",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statusLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusValue: {
    fontWeight: "600",
  },
  connectionStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
  },
  errorBanner: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    flex: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BladeColors.accent,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  editSectionWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: BladeColors.accent + "40",
    borderStyle: "dashed",
    overflow: "hidden",
  },
  editControls: {
    width: 40,
    backgroundColor: "rgba(44,44,46,0.95)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  editArrowButton: {
    width: 32,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  editArrowDisabled: {
    opacity: 0.3,
  },
  editDragHandle: {
    paddingVertical: 2,
  },
  editSectionContent: {
    flex: 1,
    padding: Spacing.sm,
  },
  editLayoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(44,44,46,0.92)",
    marginTop: Spacing.lg,
    alignSelf: "center",
  },
  resetLayoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
});
