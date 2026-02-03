import React, { useEffect, useCallback, useState } from "react";
import { StyleSheet, View, ScrollView, RefreshControl, Image, Pressable, Modal, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Device from "expo-device";
import * as Location from "expo-location";

import { ThemedText } from "@/components/ThemedText";
import { MetricCard } from "@/components/MetricCard";
import { SpeedCard } from "@/components/SpeedCard";
import { EmptyState } from "@/components/EmptyState";
import { WeatherCard } from "@/components/WeatherCard";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
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
  
  const [infoModal, setInfoModal] = useState<{ visible: boolean; key: InfoHelpKey | null }>({ visible: false, key: null });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const showInfo = (key: InfoHelpKey) => setInfoModal({ visible: true, key });
  const hideInfo = () => setInfoModal({ visible: false, key: null });

  const isConnected = motor?.isConnected ?? false;
  const serialNumber = motor?.serialNumber;

  const { data: locationData, refetch: refetchLocation } = useQuery<LocationQueryData>({
    queryKey: ["/api/motor", serialNumber, "location"],
    enabled: !!serialNumber && !isConnected,
    refetchInterval: isConnected ? false : 30000,
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
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.screenPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.premiumHeader}>
          <LinearGradient
            colors={['rgba(10, 158, 209, 0.15)', 'rgba(10, 77, 110, 0.1)', 'transparent']}
            style={styles.headerGradient}
          />
          <View style={styles.headerContent}>
            <Image 
              source={require("../../assets/images/blade-outboards-logo.png")} 
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <View style={styles.headerDivider} />
            <View style={styles.headerTitleContainer}>
              <ThemedText style={styles.headerTitle}>
                BLADE<ThemedText style={styles.registeredSymbol}>®</ThemedText> HALO CONNECT
              </ThemedText>
              <ThemedText type="caption" style={styles.headerSubtitle}>Dashboard</ThemedText>
            </View>
          </View>
          <View style={styles.headerAccentLine} />
        </Animated.View>
        
        <View style={styles.dashboardDescription}>
          <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center' }}>
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

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing["4xl"],
        paddingHorizontal: Spacing.screenPadding,
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
      <Animated.View entering={FadeIn.duration(600)} style={styles.premiumHeader}>
        <LinearGradient
          colors={['rgba(10, 158, 209, 0.15)', 'rgba(10, 77, 110, 0.1)', 'transparent']}
          style={styles.headerGradient}
        />
        <View style={styles.headerContent}>
          <Image 
            source={require("../../assets/images/blade-outboards-logo.png")} 
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <View style={styles.headerDivider} />
          <View style={styles.headerTitleContainer}>
            <ThemedText style={styles.headerTitle}>
              BLADE<ThemedText style={styles.registeredSymbol}>®</ThemedText> HALO CONNECT
            </ThemedText>
            <ThemedText type="caption" style={styles.headerSubtitle}>Dashboard</ThemedText>
          </View>
        </View>
        <View style={styles.headerAccentLine} />
      </Animated.View>

      {isConnected ? (
        <Animated.View
          entering={FadeInUp.duration(400).springify()}
          style={[styles.connectedCard, { backgroundColor: "#181F27" }]}
        >
          <View style={styles.connectedCardGlow} />
          <View style={styles.connectedCardContent}>
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.connectedMotorImage}
              resizeMode="contain"
            />
            <View style={styles.connectedMotorInfo}>
              <View style={styles.connectedMotorHeader}>
                <ThemedText type="h3" style={{ color: "#EBEFF3" }}>Blade Halo</ThemedText>
                <View style={[styles.statusPill, { backgroundColor: BladeColors.accent + "25" }]}>
                  <View style={[styles.statusDot, { backgroundColor: BladeColors.accent }]} />
                  <ThemedText type="caption" style={{ color: BladeColors.accent, fontWeight: "600" }}>
                    Live
                  </ThemedText>
                </View>
              </View>
              <ThemedText type="mono" style={styles.connectedSerial}>
                S/N: {telemetry?.tillerSerialNumber || motor?.serialNumber || "--"}
              </ThemedText>
              <View style={styles.connectedMetaRow}>
                <View style={styles.connectedMetaItem}>
                  <Feather name="cpu" size={12} color="#596F7C" />
                  <ThemedText type="caption" style={styles.connectedMetaText}>
                    v{firmware}
                  </ThemedText>
                </View>
                <View style={styles.connectedMetaItem}>
                  <Feather name="clock" size={12} color="#596F7C" />
                  <ThemedText type="caption" style={styles.connectedMetaText}>
                    {odometer != null ? `${odometer.toFixed(0)} hrs` : "-- hrs"}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}

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

      <Animated.View entering={FadeInUp.delay(25).duration(400).springify()}>
        <View style={styles.dashboardDescription}>
          <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center' }}>
            Live telemetry, weather, and system information for your outboard.
          </ThemedText>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(50).duration(400).springify()}>
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
      </Animated.View>
      
      <Animated.View entering={FadeInUp.delay(75).duration(400).springify()}>
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
      </Animated.View>

      <View style={styles.metricsGrid}>
        <Animated.View
          entering={FadeInUp.delay(100).duration(400).springify()}
        >
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
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(150).duration(400).springify()}
        >
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
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(200).duration(400).springify()}
        >
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
        </Animated.View>
      </View>

      {isConnected && (bms || motorData || vesc) ? (
        <>
          <Animated.View
            entering={FadeIn.delay(300).duration(400)}
            style={styles.statusSection}
          >
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
                  backgroundColor: "#181F27",
                  borderColor: "transparent",
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "25" }]}>
                    <Feather name="zap" size={14} color={BladeColors.accent} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Voltage
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {bms?.voltage.toFixed(1) ?? "--"} V
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "25" }]}>
                    <Feather name="activity" size={14} color={BladeColors.marine} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Current
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {bms?.current.toFixed(1) ?? "--"} A
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: getTemperatureColor(bms?.temperature ?? 0) + "25" }]}>
                    <Feather name="thermometer" size={14} color={getTemperatureColor(bms?.temperature ?? 0)} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Temperature
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {bms?.temperature ?? "--"}°C
                </ThemedText>
              </View>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(400).duration(400)}
            style={styles.statusSection}
          >
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
                  backgroundColor: "#181F27",
                  borderColor: "transparent",
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "25" }]}>
                    <Feather name="rotate-cw" size={14} color={BladeColors.marine} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    RPM
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {motorData?.motorRPM ?? "--"}
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: BladeColors.accent + "25" }]}>
                    <Feather name="activity" size={14} color={BladeColors.accent} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Phase Current
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {motorData?.phaseCurrent.toFixed(1) ?? "--"} A
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

              <View style={styles.statusRow}>
                <View style={styles.statusLabel}>
                  <View style={[styles.statusIcon, { backgroundColor: getTemperatureColor(motorData?.temperature ?? 0) + "25" }]}>
                    <Feather name="thermometer" size={14} color={getTemperatureColor(motorData?.temperature ?? 0)} />
                  </View>
                  <ThemedText type="small" style={{ color: "#596F7C" }}>
                    Temperature
                  </ThemedText>
                </View>
                <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
                  {motorData?.temperature ?? "--"}°C
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        </>
      ) : null}

      <Animated.View
        entering={FadeIn.delay(isConnected ? 600 : 300).duration(400)}
        style={styles.statusSection}
      >
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
              backgroundColor: "#181F27",
              borderColor: "transparent",
            },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: theme.primary + "25" }]}>
                <Feather name="hash" size={14} color={theme.primary} />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Serial Number
              </ThemedText>
            </View>
            <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
              {motor.serialNumber}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: BladeColors.marine + "25" }]}>
                <Feather name="clock" size={14} color={BladeColors.marine} />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Odometer
              </ThemedText>
            </View>
            <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
              {odometer != null ? `${odometer.toFixed(1)} hrs` : "--"}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: theme.primary + "25" }]}>
                <Feather name="cpu" size={14} color={theme.primary} />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Firmware
              </ThemedText>
            </View>
            <ThemedText type="mono" style={[styles.statusValue, { color: "#EBEFF3" }]}>
              v{firmware}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View
                style={[
                  styles.statusIcon,
                  { backgroundColor: (isConnected ? BladeColors.success : BladeColors.offline) + "25" },
                ]}
              >
                <Feather
                  name="bluetooth"
                  size={14}
                  color={isConnected ? BladeColors.success : BladeColors.offline}
                />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
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
              <ThemedText type="small" style={{ fontWeight: "500", color: "#EBEFF3" }}>
                {isConnected ? "Connected" : "Disconnected"}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: "#2A3440" }]} />

          <View style={styles.statusRow}>
            <View style={styles.statusLabel}>
              <View style={[styles.statusIcon, { backgroundColor: "#596F7C" + "25" }]}>
                <Feather name="clock" size={14} color="#596F7C" />
              </View>
              <ThemedText type="small" style={{ color: "#596F7C" }}>
                Last Updated
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ fontWeight: "500", color: "#EBEFF3" }}>
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
      </Animated.View>

      <Animated.View
        entering={FadeIn.delay(isConnected ? 700 : 400).duration(400)}
        style={styles.pdfButtonContainer}
      >
        <Pressable
          style={[styles.pdfButton, { backgroundColor: theme.surfaceElevated }]}
          onPress={generateStatusPdf}
          disabled={isGeneratingPdf}
        >
          {isGeneratingPdf ? (
            <ActivityIndicator size="small" color={BladeColors.accent} />
          ) : (
            <>
              <Feather name="file-text" size={16} color={BladeColors.accent} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}>
                Export Snapshot Report
              </ThemedText>
            </>
          )}
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={FadeIn.delay(isConnected ? 800 : 500).duration(400)}
        style={styles.disclaimerContainer}
      >
        <ThemedText style={styles.disclaimerText}>
          Data and weather information are provided for reference only and are not guaranteed. Always operate your vessel safely, comply with all warnings and local laws, and never operate a boat under the influence.
        </ThemedText>
      </Animated.View>

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
  premiumHeader: {
    marginBottom: Spacing.xl,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#0D1B2A",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  brandLogo: {
    width: 120,
    height: 40,
  },
  headerDivider: {
    width: 1,
    height: 32,
    backgroundColor: BladeColors.accent,
    opacity: 0.4,
    marginHorizontal: Spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
    letterSpacing: 1.2,
    fontFamily: "System",
  },
  registeredSymbol: {
    fontSize: 8,
    color: BladeColors.accent,
    fontWeight: "400",
    letterSpacing: 0,
  },
  headerSubtitle: {
    color: "#596F7C",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  dashboardDescription: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
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
    color: "#596F7C",
    textAlign: "center",
    opacity: 0.7,
  },
  headerAccentLine: {
    height: 2,
    backgroundColor: BladeColors.accent,
    opacity: 0.6,
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
  connectedCard: {
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    overflow: "hidden",
    position: "relative",
  },
  connectedCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: BladeColors.accent,
    opacity: 0.6,
  },
  connectedCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  connectedMotorImage: {
    width: 80,
    height: 100,
    marginRight: Spacing.md,
  },
  connectedMotorInfo: {
    flex: 1,
  },
  connectedMotorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  connectedSerial: {
    color: "#596F7C",
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  connectedMetaRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  connectedMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  connectedMetaText: {
    color: "#596F7C",
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
