import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { AntiTheftLinkModal } from "@/components/AntiTheftLinkModal";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useUser } from "@/context/UserContext";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";
import {
  initializeBle,
  startScan as startRealScan,
  stopScan as stopRealScan,
  isBleAvailable,
  requestBlePermissions,
  checkBleState,
  BleDevice,
} from "@/lib/ble-service";

interface ScanDevice {
  id: string;
  name: string;
  serialNumber: string;
  rssi: number;
}

const mockDevices: ScanDevice[] = [
  { id: "mock-1", name: "Blade Pro 500", serialNumber: "BLD-2024-0001", rssi: -45 },
  { id: "mock-2", name: "Blade Sport 350", serialNumber: "BLD-2024-0042", rssi: -62 },
  { id: "mock-3", name: "Blade Elite 750", serialNumber: "BLD-2024-0187", rssi: -78 },
];

export default function BleScannerModal() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { connectToMotor, isConnecting, stopScan } = useMotor();
  const { user } = useUser();

  const [isScanning, setIsScanning] = useState(true);
  const [devices, setDevices] = useState<ScanDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showAntiTheftModal, setShowAntiTheftModal] = useState(false);
  const [pairedMotor, setPairedMotor] = useState<{ name: string; serialNumber: string } | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [useMockMode, setUseMockMode] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const [bleDiagnostics, setBleDiagnostics] = useState<{
    initialized: boolean;
    permissions: boolean;
    state: string;
    deviceCount: number;
  }>({ initialized: false, permissions: false, state: "Unknown", deviceCount: 0 });

  const startMockScan = useCallback(() => {
    setIsScanning(true);
    setDevices([]);
    setBleError(null);
    
    setTimeout(() => {
      setDevices(mockDevices);
      setIsScanning(false);
    }, 2000);
  }, []);

  const startBleScan = useCallback(async () => {
    setIsScanning(true);
    setDevices([]);
    setBleError(null);
    setBleDiagnostics(prev => ({ ...prev, deviceCount: 0 }));

    try {
      const initialized = await initializeBle();
      setBleDiagnostics(prev => ({ ...prev, initialized }));
      
      if (!initialized) {
        setUseMockMode(true);
        startMockScan();
        return;
      }

      const hasPermissions = await requestBlePermissions();
      setBleDiagnostics(prev => ({ ...prev, permissions: hasPermissions }));
      
      if (!hasPermissions) {
        setBleError("Bluetooth permissions required");
        setIsScanning(false);
        return;
      }

      const bleState = await checkBleState();
      setBleDiagnostics(prev => ({ ...prev, state: bleState }));
      
      if (bleState !== "PoweredOn") {
        setBleError(
          bleState === "PoweredOff"
            ? "Please turn on Bluetooth"
            : bleState === "Unauthorized"
            ? "Bluetooth permission denied"
            : "Bluetooth not supported"
        );
        setIsScanning(false);
        return;
      }

      const foundDevices: Map<string, ScanDevice> = new Map();

      startRealScan({
        onDeviceFound: (device: BleDevice) => {
          const scanDevice: ScanDevice = {
            id: device.id,
            name: device.name || `Unknown (${device.id.substring(0, 8)})`,
            serialNumber: device.serialNumber || device.id,
            rssi: device.rssi,
          };
          foundDevices.set(device.id, scanDevice);
          const deviceList = Array.from(foundDevices.values()).sort((a, b) => b.rssi - a.rssi);
          setDevices(deviceList);
          setBleDiagnostics(prev => ({ ...prev, deviceCount: deviceList.length }));
        },
        onError: (error: Error) => {
          console.error("BLE scan error:", error);
          setBleError("Scan error: " + error.message);
        },
      });

      setTimeout(() => {
        stopRealScan();
        setIsScanning(false);
        
        if (foundDevices.size === 0) {
          setDevices([]);
        }
      }, 15000);
    } catch (error: any) {
      console.error("BLE initialization error:", error);
      setBleDiagnostics(prev => ({ ...prev, state: "Error: " + error.message }));
      setUseMockMode(true);
      startMockScan();
    }
  }, [startMockScan]);

  useEffect(() => {
    if (Platform.OS === "web") {
      setUseMockMode(true);
      startMockScan();
    } else {
      startBleScan();
    }

    return () => {
      stopRealScan();
      stopScan();
    };
  }, []);

  const handleDevicePress = async (device: ScanDevice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedDevice(device.id);

    try {
      await connectToMotor(device.serialNumber);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      if (user) {
        setPairedMotor({ name: device.name, serialNumber: device.serialNumber });
        setShowAntiTheftModal(true);
      } else {
        navigation.goBack();
      }
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSelectedDevice(null);
    }
  };

  const handleLinkMotor = async () => {
    if (!pairedMotor || !user) return;
    
    setIsLinking(true);
    try {
      await apiRequest("POST", "/api/motors/link", {
        serialNumber: pairedMotor.serialNumber,
        userId: user.id,
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAntiTheftModal(false);
      navigation.goBack();
    } catch (error) {
      console.error("Failed to link motor:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLinking(false);
    }
  };

  const handleSkipLink = () => {
    setShowAntiTheftModal(false);
    navigation.goBack();
  };

  const handleRescan = () => {
    if (useMockMode) {
      startMockScan();
    } else {
      startBleScan();
    }
  };

  const getSignalStrength = (rssi: number) => {
    if (rssi > -50) return "Excellent";
    if (rssi > -65) return "Good";
    if (rssi > -75) return "Fair";
    return "Weak";
  };

  const getSignalColor = (rssi: number) => {
    if (rssi > -50) return BladeColors.success;
    if (rssi > -65) return BladeColors.accent;
    if (rssi > -75) return BladeColors.warning;
    return BladeColors.error;
  };

  const renderDevice = ({ item, index }: { item: ScanDevice; index: number }) => {
    const isSelected = selectedDevice === item.id;
    const isConnectingToThis = isSelected && isConnecting;

    return (
      <Animated.View entering={FadeInUp.delay(index * 100).duration(300)}>
        <Pressable
          onPress={() => handleDevicePress(item)}
          disabled={isConnecting}
          style={({ pressed }) => [
            styles.deviceCard,
            { backgroundColor: theme.surface },
            pressed && { opacity: 0.8 },
            isSelected && { borderColor: BladeColors.primary, borderWidth: 2 },
          ]}
        >
          <View style={styles.deviceInfo}>
            <View style={styles.deviceHeader}>
              <ThemedText type="h4">{item.name}</ThemedText>
              <View
                style={[
                  styles.signalBadge,
                  { backgroundColor: getSignalColor(item.rssi) + "20" },
                ]}
              >
                <Feather
                  name="wifi"
                  size={12}
                  color={getSignalColor(item.rssi)}
                />
                <ThemedText
                  type="caption"
                  style={{ color: getSignalColor(item.rssi), marginLeft: 4 }}
                >
                  {getSignalStrength(item.rssi)}
                </ThemedText>
              </View>
            </View>
            <ThemedText
              type="mono"
              style={{ color: theme.textSecondary, marginTop: 4 }}
            >
              {item.serialNumber}
            </ThemedText>
            {useMockMode && item.id.startsWith("mock") ? (
              <ThemedText
                type="caption"
                style={{ color: BladeColors.warning, marginTop: 4 }}
              >
                Demo device (Expo Go mode)
              </ThemedText>
            ) : null}
          </View>

          {isConnectingToThis ? (
            <ActivityIndicator color={BladeColors.primary} />
          ) : (
            <Feather
              name="chevron-right"
              size={24}
              color={theme.textSecondary}
            />
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const renderModeIndicator = () => {
    if (!useMockMode) return null;

    return (
      <Animated.View 
        entering={FadeIn.duration(300)}
        style={[styles.modeIndicator, { backgroundColor: BladeColors.warning + "20" }]}
      >
        <Feather name="info" size={14} color={BladeColors.warning} />
        <ThemedText type="caption" style={{ color: BladeColors.warning, marginLeft: 6, flex: 1 }}>
          Running in demo mode. Real Bluetooth requires a custom native build.
        </ThemedText>
      </Animated.View>
    );
  };

  const renderDiagnostics = () => {
    if (useMockMode) return null;

    return (
      <View style={[styles.diagnosticsContainer, { backgroundColor: theme.surface }]}>
        <ThemedText type="caption" style={[styles.diagnosticsTitle, { color: theme.textSecondary }]}>
          Bluetooth Diagnostics
        </ThemedText>
        <View style={styles.diagnosticsRow}>
          <View style={styles.diagnosticsItem}>
            <Feather 
              name={bleDiagnostics.initialized ? "check-circle" : "x-circle"} 
              size={14} 
              color={bleDiagnostics.initialized ? BladeColors.success : BladeColors.error} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              BLE Init
            </ThemedText>
          </View>
          <View style={styles.diagnosticsItem}>
            <Feather 
              name={bleDiagnostics.permissions ? "check-circle" : "x-circle"} 
              size={14} 
              color={bleDiagnostics.permissions ? BladeColors.success : BladeColors.error} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              Permissions
            </ThemedText>
          </View>
          <View style={styles.diagnosticsItem}>
            <Feather 
              name={bleDiagnostics.state === "PoweredOn" ? "bluetooth" : "alert-circle"} 
              size={14} 
              color={bleDiagnostics.state === "PoweredOn" ? BladeColors.success : BladeColors.warning} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              {bleDiagnostics.state}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: 4 }}>
          Devices found: {bleDiagnostics.deviceCount}
        </ThemedText>
      </View>
    );
  };

  return (
    <>
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundRoot, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.handle} />
        <ThemedText type="h2" style={styles.title}>
          Nearby Outboards
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          {isScanning
            ? "Scanning for Blade motors..."
            : bleError 
            ? bleError
            : `Found ${devices.length} motor${devices.length !== 1 ? "s" : ""}`}
        </ThemedText>
      </View>

      {renderModeIndicator()}
      {renderDiagnostics()}

      {isScanning ? (
        <Animated.View entering={FadeIn.duration(300)} style={styles.scanning}>
          <ActivityIndicator size="large" color={BladeColors.primary} />
          <ThemedText
            type="body"
            style={[styles.scanningText, { color: theme.textSecondary }]}
          >
            Scanning for all Bluetooth devices...
          </ThemedText>
          <ThemedText
            type="caption"
            style={{ color: theme.textSecondary, marginTop: Spacing.sm }}
          >
            Found {devices.length} device{devices.length !== 1 ? "s" : ""} so far
          </ThemedText>
          <Pressable 
            onPress={handleRescan} 
            style={[styles.refreshButton, { backgroundColor: theme.surface }]}
          >
            <Feather name="refresh-cw" size={16} color={BladeColors.primary} />
            <ThemedText type="link" style={{ marginLeft: Spacing.xs }}>
              Restart Scan
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : bleError ? (
        <View style={styles.emptyState}>
          <Feather
            name="alert-circle"
            size={48}
            color={BladeColors.warning}
            style={{ marginBottom: Spacing.lg }}
          />
          <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>
            Bluetooth Issue
          </ThemedText>
          <ThemedText
            type="body"
            style={{ color: theme.textSecondary, textAlign: "center" }}
          >
            {bleError}
          </ThemedText>
          <View style={styles.rescanButton}>
            <Button onPress={handleRescan}>Try Again</Button>
          </View>
        </View>
      ) : devices.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather
            name="bluetooth"
            size={48}
            color={theme.textSecondary}
            style={{ marginBottom: Spacing.lg }}
          />
          <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>
            No Motors Found
          </ThemedText>
          <ThemedText
            type="body"
            style={{ color: theme.textSecondary, textAlign: "center" }}
          >
            Make sure your Blade outboard is powered on and within Bluetooth
            range.
          </ThemedText>
          <View style={styles.rescanButton}>
            <Button onPress={handleRescan}>Scan Again</Button>
          </View>
        </View>
      ) : (
        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          ListFooterComponent={
            <View style={styles.footer}>
              <Pressable onPress={handleRescan} style={styles.rescanLink}>
                <Feather
                  name="refresh-cw"
                  size={16}
                  color={BladeColors.primary}
                />
                <ThemedText type="link" style={{ marginLeft: Spacing.xs }}>
                  Scan Again
                </ThemedText>
              </Pressable>
            </View>
          }
        />
      )}
    </View>

    {pairedMotor ? (
      <AntiTheftLinkModal
        visible={showAntiTheftModal}
        motorName={pairedMotor.name}
        serialNumber={pairedMotor.serialNumber}
        isLinking={isLinking}
        onLink={handleLinkMotor}
        onSkip={handleSkipLink}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(0,0,0,0.2)",
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    textAlign: "center",
  },
  modeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  diagnosticsContainer: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  diagnosticsTitle: {
    marginBottom: Spacing.sm,
    fontWeight: "600",
  },
  diagnosticsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  diagnosticsItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  scanning: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  scanningText: {
    textAlign: "center",
    marginTop: Spacing.xl,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  rescanButton: {
    marginTop: Spacing["2xl"],
    width: "100%",
    maxWidth: 200,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  signalBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  footer: {
    alignItems: "center",
    marginTop: Spacing["2xl"],
  },
  rescanLink: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
});
