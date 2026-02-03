import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  FlatList,
  Platform,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useUser } from "@/context/UserContext";
import { useTrip } from "@/context/TripContext";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";
import { 
  getRegisteredMotors, 
  registerMotorForUser,
  getFirebaseAuth,
  fetchLatestGPSFromFirestore,
  type RegisteredMotor 
} from "@/lib/firebase";
import { getApiUrl } from "@/lib/query-client";
import type { Trip } from "@shared/schema";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type TabType = "bluetooth" | "antitheft" | "location" | "trips";

interface DebugLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export function DebugLogModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { debugLogs, clearDebugLogs, telemetry, motor, isRealConnection } = useMotor();
  const { user, isGuestMode } = useUser();
  const { activeTrip, isRecording, tripStats, tripDuration } = useTrip();
  
  const [activeTab, setActiveTab] = useState<TabType>("bluetooth");
  const [isExporting, setIsExporting] = useState(false);
  const [antiTheftLogs, setAntiTheftLogs] = useState<DebugLogEntry[]>([]);
  const [locationLogs, setLocationLogs] = useState<DebugLogEntry[]>([]);
  const [tripLogs, setTripLogs] = useState<DebugLogEntry[]>([]);
  const [registeredMotors, setRegisteredMotors] = useState<RegisteredMotor[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLocationResult, setLastLocationResult] = useState<any>(null);

  const addAntiTheftLog = useCallback((level: string, message: string) => {
    setAntiTheftLogs(prev => [...prev.slice(-99), {
      timestamp: new Date().toISOString(),
      level,
      message
    }]);
  }, []);

  const addLocationLog = useCallback((level: string, message: string) => {
    setLocationLogs(prev => [...prev.slice(-99), {
      timestamp: new Date().toISOString(),
      level,
      message
    }]);
  }, []);

  const addTripLog = useCallback((level: string, message: string) => {
    setTripLogs(prev => [...prev.slice(-99), {
      timestamp: new Date().toISOString(),
      level,
      message
    }]);
  }, []);

  const loadRegisteredMotors = useCallback(async () => {
    if (!user?.id || isGuestMode) {
      addAntiTheftLog("INFO", "Cannot load motors: No user or guest mode");
      return;
    }
    
    addAntiTheftLog("INFO", `Loading registered motors for user: ${user.id}`);
    
    try {
      const motors = await getRegisteredMotors(user.id);
      setRegisteredMotors(motors);
      addAntiTheftLog("INFO", `Found ${motors.length} registered motor(s)`);
      motors.forEach((m: RegisteredMotor, i: number) => {
        addAntiTheftLog("DATA", `Motor ${i+1}: ${m.serialNumber} (${m.name || 'unnamed'})`);
      });
    } catch (error: any) {
      addAntiTheftLog("ERROR", `Failed to load motors: ${error.message}`);
    }
  }, [user?.id, isGuestMode, addAntiTheftLog]);

  const loadTrips = useCallback(async () => {
    if (!user?.id) {
      addTripLog("INFO", "Cannot load trips: No user logged in");
      return;
    }
    
    addTripLog("INFO", `Loading trips from local storage for user: ${user.id}`);
    
    try {
      const localTripsStr = await AsyncStorage.getItem("@blade_local_trips");
      if (localTripsStr) {
        const allTrips = JSON.parse(localTripsStr);
        const userTrips = allTrips.filter((trip: any) => trip.userId === user.id);
        setTrips(userTrips);
        addTripLog("INFO", `Found ${userTrips.length} trip(s) in local storage`);
      } else {
        setTrips([]);
        addTripLog("INFO", "No trips found in local storage");
      }
    } catch (error: any) {
      addTripLog("ERROR", `Failed to load trips: ${error.message}`);
    }
  }, [user?.id, addTripLog]);

  const testAntiTheftRegistration = async () => {
    addAntiTheftLog("INFO", "=== TEST: Anti-Theft Registration ===");
    
    // Check Firebase Auth state
    const auth = getFirebaseAuth();
    const currentUser = auth?.currentUser;
    addAntiTheftLog("INFO", `Firebase Auth initialized: ${!!auth}`);
    addAntiTheftLog("INFO", `Firebase currentUser: ${currentUser?.uid || 'null'}`);
    addAntiTheftLog("INFO", `Firebase email: ${currentUser?.email || 'null'}`);
    
    // Check UserContext state
    addAntiTheftLog("INFO", `UserContext user.id: ${user?.id || 'null'}`);
    addAntiTheftLog("INFO", `UserContext isGuestMode: ${isGuestMode}`);
    
    // Check motor state
    const motorSerial = motor?.serialNumber;
    const tillerSerial = telemetry?.tillerSerialNumber;
    const isBluetoothAddress = motorSerial?.includes(':');
    const effectiveSerial = (isBluetoothAddress && tillerSerial) ? tillerSerial : motorSerial;
    
    addAntiTheftLog("INFO", `Motor connected: ${motor?.isConnected}`);
    addAntiTheftLog("INFO", `Motor serialNumber: ${motorSerial || 'null'}`);
    addAntiTheftLog("INFO", `Telemetry tillerSerialNumber: ${tillerSerial || 'null'}`);
    addAntiTheftLog("INFO", `Is Bluetooth address: ${isBluetoothAddress}`);
    addAntiTheftLog("INFO", `Effective serial: ${effectiveSerial || 'null'}`);
    
    // Attempt registration if we have all the pieces
    if (user?.id && !isGuestMode && effectiveSerial && !effectiveSerial.includes(':')) {
      addAntiTheftLog("INFO", "Attempting test registration...");
      try {
        const result = await registerMotorForUser(user.id, effectiveSerial, "Debug Test Motor");
        if (result.success) {
          addAntiTheftLog("INFO", "Registration SUCCESS!");
          loadRegisteredMotors();
        } else {
          addAntiTheftLog("ERROR", `Registration FAILED: ${result.error}`);
        }
      } catch (error: any) {
        addAntiTheftLog("ERROR", `Registration exception: ${error.message}`);
      }
    } else {
      addAntiTheftLog("WARN", "Cannot attempt registration - missing requirements");
      if (!user?.id) addAntiTheftLog("WARN", "- No user ID");
      if (isGuestMode) addAntiTheftLog("WARN", "- Guest mode active");
      if (!effectiveSerial) addAntiTheftLog("WARN", "- No serial number");
      if (effectiveSerial?.includes(':')) addAntiTheftLog("WARN", "- Serial is Bluetooth address");
    }
  };

  const testLocationLookup = async () => {
    addLocationLog("INFO", "=== TEST: Location Lookup ===");
    
    // Get effective serial number
    const motorSerial = motor?.serialNumber;
    const tillerSerial = telemetry?.tillerSerialNumber;
    const isBluetoothAddress = motorSerial?.includes(':');
    const effectiveSerial = (isBluetoothAddress && tillerSerial) ? tillerSerial : motorSerial;
    
    addLocationLog("INFO", `Motor serialNumber: ${motorSerial || 'null'}`);
    addLocationLog("INFO", `Telemetry tillerSerialNumber: ${tillerSerial || 'null'}`);
    addLocationLog("INFO", `Effective serial for lookup: ${effectiveSerial || 'null'}`);
    
    // Try registered motors if no connected motor
    let serialToLookup = effectiveSerial;
    if (!serialToLookup || serialToLookup.includes(':')) {
      if (registeredMotors.length > 0) {
        serialToLookup = registeredMotors[0].serialNumber;
        addLocationLog("INFO", `Using first registered motor: ${serialToLookup}`);
      }
    }
    
    if (!serialToLookup || serialToLookup.includes(':')) {
      addLocationLog("ERROR", "No valid serial number for location lookup");
      return;
    }
    
    // Try backend API first
    addLocationLog("INFO", `Querying backend API for: ${serialToLookup}`);
    try {
      const apiUrl = new URL(`/api/motor/${serialToLookup}/location`, getApiUrl()).toString();
      addLocationLog("INFO", `API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (response.ok) {
        addLocationLog("INFO", `Backend API SUCCESS`);
        addLocationLog("DATA", `Lat: ${data.latitude}, Lng: ${data.longitude}`);
        addLocationLog("DATA", `Timestamp: ${data.timestamp}`);
        setLastLocationResult(data);
      } else {
        addLocationLog("WARN", `Backend API: ${data.error || response.status}`);
      }
    } catch (error: any) {
      addLocationLog("ERROR", `Backend API error: ${error.message}`);
    }
    
    // Try Firestore directly
    addLocationLog("INFO", `Querying Firestore for: ${serialToLookup}`);
    try {
      const location = await fetchLatestGPSFromFirestore(serialToLookup);
      if (location) {
        addLocationLog("INFO", `Firestore SUCCESS`);
        addLocationLog("DATA", `Lat: ${location.latitude}, Lng: ${location.longitude}`);
        addLocationLog("DATA", `Timestamp: ${location.timestamp}`);
        setLastLocationResult(location);
      } else {
        addLocationLog("WARN", "Firestore: No location data found");
      }
    } catch (error: any) {
      addLocationLog("ERROR", `Firestore error: ${error.message}`);
    }
  };

  const testTripRecording = async () => {
    addTripLog("INFO", "=== TEST: Trip Recording State ===");
    
    // Check user state
    addTripLog("INFO", `User ID: ${user?.id || 'null'}`);
    addTripLog("INFO", `Guest mode: ${isGuestMode}`);
    
    // Check motor state
    const motorSerial = motor?.serialNumber;
    const tillerSerial = telemetry?.tillerSerialNumber;
    const isBluetoothAddress = motorSerial?.includes(':');
    const effectiveSerial = (isBluetoothAddress && tillerSerial) ? tillerSerial : motorSerial;
    
    addTripLog("INFO", `Motor connected: ${motor?.isConnected}`);
    addTripLog("INFO", `Motor serialNumber: ${motorSerial || 'null'}`);
    addTripLog("INFO", `Telemetry tillerSerialNumber: ${tillerSerial || 'null'}`);
    addTripLog("INFO", `Effective serial: ${effectiveSerial || 'null'}`);
    
    // Check trip state
    addTripLog("INFO", `Is recording: ${isRecording}`);
    addTripLog("INFO", `Active trip ID: ${activeTrip?.id || 'null'}`);
    addTripLog("INFO", `Trip duration: ${tripDuration}s`);
    
    // Check requirements
    const canStart = Boolean(user?.id) && Boolean(motor?.isConnected) && Boolean(effectiveSerial) && !isRecording;
    addTripLog("INFO", `Can start trip: ${canStart}`);
    
    if (!canStart) {
      if (!user?.id) addTripLog("WARN", "- Missing: user ID");
      if (!motor?.isConnected) addTripLog("WARN", "- Missing: motor connection");
      if (!effectiveSerial) addTripLog("WARN", "- Missing: serial number");
      if (isRecording) addTripLog("WARN", "- Already recording");
    }
    
    // Current trip stats
    if (isRecording) {
      addTripLog("DATA", `Distance: ${tripStats.totalDistanceKm.toFixed(3)} km`);
      addTripLog("DATA", `Max speed: ${tripStats.maxSpeedKmh.toFixed(1)} km/h`);
      addTripLog("DATA", `Energy: ${tripStats.totalEnergyWh.toFixed(0)} Wh`);
    }
    
    // Telemetry state
    if (telemetry) {
      addTripLog("DATA", `Current speed: ${telemetry.speed?.toFixed(2) || 0} km/h`);
      addTripLog("DATA", `Current power: ${telemetry.powerConsumption?.toFixed(2) || 0} kW`);
      addTripLog("DATA", `Battery SOC: ${telemetry.stateOfCharge || 0}%`);
      addTripLog("DATA", `GPS: ${telemetry.gnss?.latitude?.toFixed(6) || 'N/A'}, ${telemetry.gnss?.longitude?.toFixed(6) || 'N/A'}`);
    } else {
      addTripLog("WARN", "No telemetry data available");
    }
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (activeTab === "antitheft") {
      await loadRegisteredMotors();
    } else if (activeTab === "trips") {
      await loadTrips();
    }
    setIsRefreshing(false);
  }, [activeTab, loadRegisteredMotors, loadTrips]);

  useEffect(() => {
    if (visible) {
      if (activeTab === "antitheft") {
        loadRegisteredMotors();
      } else if (activeTab === "trips") {
        loadTrips();
      }
    }
  }, [visible, activeTab, loadRegisteredMotors, loadTrips]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "INFO": return BladeColors.accent;
      case "DATA": return BladeColors.primary;
      case "PARSE": return BladeColors.success;
      case "STATE": return "#9B59B6";
      case "ERROR": return BladeColors.error;
      case "WARN": return BladeColors.warning;
      default: return theme.textSecondary;
    }
  };

  const handleExport = async () => {
    const logs = activeTab === "bluetooth" ? debugLogs :
                 activeTab === "antitheft" ? antiTheftLogs :
                 activeTab === "location" ? locationLogs : tripLogs;
    
    if (logs.length === 0) {
      Alert.alert("No Logs", "There are no debug logs to export.");
      return;
    }

    setIsExporting(true);
    try {
      const statusInfo = [
        `=== BLADE OUTBOARDS DEBUG LOG (${activeTab.toUpperCase()}) ===`,
        `Export Time: ${new Date().toISOString()}`,
        `Motor Connected: ${motor?.isConnected || false}`,
        `Motor Serial: ${motor?.serialNumber || "N/A"}`,
        `Tiller Serial: ${telemetry?.tillerSerialNumber || "N/A"}`,
        `Is Real Connection: ${isRealConnection}`,
        `User ID: ${user?.id || "N/A"}`,
        `Is Guest: ${isGuestMode}`,
        "",
        "=== LOG ENTRIES ===",
        "",
      ].join("\n");

      const logContent = logs.map(log => 
        `[${log.timestamp}] [${log.level}] ${log.message}`
      ).join("\n");

      const fullContent = statusInfo + logContent;
      const fileName = `blade_debug_${activeTab}_${Date.now()}.txt`;
      
      if (Platform.OS === "web") {
        const blob = new Blob([fullContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert("Success", "Log file downloaded.");
      } else {
        const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || "";
        const filePath = `${cacheDir}${fileName}`;
        await FileSystem.writeAsStringAsync(filePath, fullContent);

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: "text/plain",
            dialogTitle: "Export Debug Logs",
          });
        } else {
          Alert.alert("Export Complete", `Log saved to: ${filePath}`);
        }
      }
    } catch (error: any) {
      Alert.alert("Export Error", error.message || "Failed to export logs");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearLogs = () => {
    if (activeTab === "bluetooth") {
      clearDebugLogs();
    } else if (activeTab === "antitheft") {
      setAntiTheftLogs([]);
    } else if (activeTab === "location") {
      setLocationLogs([]);
    } else {
      setTripLogs([]);
    }
  };

  const renderLogItem = ({ item }: { item: DebugLogEntry }) => (
    <View style={[styles.logItem, { borderBottomColor: theme.border }]}>
      <View style={styles.logHeader}>
        <View style={[styles.levelBadge, { backgroundColor: getLevelColor(item.level) + "20" }]}>
          <ThemedText type="caption" style={{ color: getLevelColor(item.level), fontWeight: "600" }}>
            {item.level}
          </ThemedText>
        </View>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </ThemedText>
      </View>
      <ThemedText type="mono" style={[styles.logMessage, { color: theme.text }]}>
        {item.message}
      </ThemedText>
    </View>
  );

  const renderTab = (tab: TabType, label: string, icon: string) => (
    <Pressable
      key={tab}
      style={[
        styles.tab,
        activeTab === tab && { backgroundColor: BladeColors.primary + "20", borderColor: BladeColors.primary }
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <Feather name={icon as any} size={16} color={activeTab === tab ? BladeColors.primary : theme.textSecondary} />
      <ThemedText 
        type="caption" 
        style={{ 
          color: activeTab === tab ? BladeColors.primary : theme.textSecondary,
          marginLeft: 4,
          fontWeight: activeTab === tab ? "600" : "400"
        }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );

  const getCurrentLogs = () => {
    switch (activeTab) {
      case "bluetooth": return debugLogs;
      case "antitheft": return antiTheftLogs;
      case "location": return locationLogs;
      case "trips": return tripLogs;
    }
  };

  const renderTestButton = () => {
    if (activeTab === "antitheft") {
      return (
        <Button variant="outline" onPress={testAntiTheftRegistration} style={{ marginBottom: Spacing.sm }}>
          Test Anti-Theft Registration
        </Button>
      );
    }
    if (activeTab === "location") {
      return (
        <Button variant="outline" onPress={testLocationLookup} style={{ marginBottom: Spacing.sm }}>
          Test Location Lookup
        </Button>
      );
    }
    if (activeTab === "trips") {
      return (
        <Button variant="outline" onPress={testTripRecording} style={{ marginBottom: Spacing.sm }}>
          Test Trip Recording State
        </Button>
      );
    }
    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.headerLeft}>
            <ThemedText type="h2">Debug Console</ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {getCurrentLogs().length} entries
            </ThemedText>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {renderTab("bluetooth", "Bluetooth", "bluetooth")}
          {renderTab("antitheft", "Anti-Theft", "shield")}
          {renderTab("location", "Location", "map-pin")}
          {renderTab("trips", "Trips", "navigation")}
        </ScrollView>

        <View style={[styles.statusBar, { backgroundColor: theme.surface }]}>
          <View style={styles.statusItem}>
            <Feather 
              name={motor?.isConnected ? "check-circle" : "x-circle"} 
              size={14} 
              color={motor?.isConnected ? BladeColors.success : BladeColors.error} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              {motor?.isConnected ? "Connected" : "Disconnected"}
            </ThemedText>
          </View>
          <View style={styles.statusItem}>
            <Feather 
              name="bluetooth" 
              size={14} 
              color={BladeColors.primary} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              {isRealConnection ? "Connected" : "Disconnected"}
            </ThemedText>
          </View>
          <View style={styles.statusItem}>
            <ThemedText type="caption">
              {user?.id === "guest" ? "Guest" : user?.email?.split("@")[0] || "No User"}
            </ThemedText>
          </View>
        </View>

        <View style={styles.testButtonContainer}>
          {renderTestButton()}
        </View>

        <FlatList
          data={[...getCurrentLogs()].reverse()}
          renderItem={renderLogItem}
          keyExtractor={(item, index) => `${item.timestamp}-${index}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="file-text" size={48} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                No logs yet.{"\n"}Tap the test button above to run diagnostics.
              </ThemedText>
            </View>
          }
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: theme.backgroundRoot }]}>
          <Button 
            variant="outline" 
            onPress={handleClearLogs}
            style={{ flex: 1, marginRight: Spacing.sm }}
          >
            Clear Logs
          </Button>
          <Button 
            onPress={handleExport}
            disabled={isExporting}
            style={{ flex: 1 }}
          >
            {isExporting ? "Exporting..." : "Download Log"}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  testButtonContainer: {
    paddingHorizontal: Spacing.lg,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  logItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  logMessage: {
    fontSize: 11,
    lineHeight: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
});
