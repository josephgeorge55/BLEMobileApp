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
  connectToDevice as connectToBleDevice,
  disconnect as disconnectBle,
  BleDevice,
} from "@/lib/ble-service";
import {
  initializeClassic,
  isClassicEnabled,
  getBondedDevices,
  startDiscovery,
  cancelDiscovery,
  getClassicDiagnostics,
  connectToClassicDevice,
  disconnectClassic,
  ClassicDevice,
} from "@/lib/bluetooth-classic-service";
import { ParseResult } from "@/lib/ble-parser";

interface ScanDevice {
  id: string;
  name: string;
  serialNumber: string;
  rssi: number;
  type: "ble" | "classic";
}

const mockDevices: ScanDevice[] = [
  { id: "mock-1", name: "Blade Pro 500", serialNumber: "BLD-2024-0001", rssi: -45, type: "ble" },
  { id: "mock-2", name: "Blade Sport 350", serialNumber: "BLD-2024-0042", rssi: -62, type: "classic" },
  { id: "mock-3", name: "Blade Elite 750", serialNumber: "BLD-2024-0187", rssi: -78, type: "ble" },
];

export default function BleScannerModal() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { connectToMotor, isConnecting, stopScan, processParsedData, disconnectMotor, addDebugLog } = useMotor();
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
    bleInitialized: boolean;
    classicInitialized: boolean;
    permissions: boolean;
    bleState: string;
    classicEnabled: boolean;
    bleDeviceCount: number;
    classicDeviceCount: number;
  }>({ 
    bleInitialized: false, 
    classicInitialized: false, 
    permissions: false, 
    bleState: "Unknown", 
    classicEnabled: false,
    bleDeviceCount: 0,
    classicDeviceCount: 0,
  });

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
    setBleDiagnostics(prev => ({ 
      ...prev, 
      bleDeviceCount: 0, 
      classicDeviceCount: 0 
    }));

    const foundDevices: Map<string, ScanDevice> = new Map();
    let bleInitSuccess = false;
    let classicInitSuccess = false;

    try {
      const [bleInitialized, classicInitialized] = await Promise.all([
        initializeBle(),
        initializeClassic(),
      ]);
      
      bleInitSuccess = bleInitialized;
      classicInitSuccess = classicInitialized;
      
      setBleDiagnostics(prev => ({ 
        ...prev, 
        bleInitialized,
        classicInitialized,
      }));
      
      if (!bleInitialized && !classicInitialized) {
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

      if (bleInitSuccess) {
        const bleState = await checkBleState();
        setBleDiagnostics(prev => ({ ...prev, bleState }));
        
        if (bleState === "PoweredOn") {
          startRealScan({
            onDeviceFound: (device: BleDevice) => {
              const scanDevice: ScanDevice = {
                id: device.id,
                name: device.name || `Device ${device.id.substring(0, 8)}`,
                serialNumber: device.serialNumber || device.id,
                rssi: device.rssi,
                type: "ble",
              };
              foundDevices.set(`ble-${device.id}`, scanDevice);
              updateDeviceList(foundDevices);
            },
            onError: (error: Error) => {
              console.error("BLE scan error:", error);
            },
          });
        }
      }

      if (classicInitSuccess) {
        const classicEnabled = await isClassicEnabled();
        setBleDiagnostics(prev => ({ ...prev, classicEnabled }));
        
        if (classicEnabled) {
          const bondedDevices = await getBondedDevices();
          bondedDevices.forEach((device: ClassicDevice) => {
            const scanDevice: ScanDevice = {
              id: device.address,
              name: device.name,
              serialNumber: device.address,
              rssi: device.rssi || -50,
              type: "classic",
            };
            foundDevices.set(`classic-${device.address}`, scanDevice);
          });
          updateDeviceList(foundDevices);
          
          startDiscovery({
            onDeviceFound: (device: ClassicDevice) => {
              const scanDevice: ScanDevice = {
                id: device.address,
                name: device.name,
                serialNumber: device.address,
                rssi: device.rssi || -70,
                type: "classic",
              };
              foundDevices.set(`classic-${device.address}`, scanDevice);
              updateDeviceList(foundDevices);
            },
            onError: (error: Error) => {
              console.error("Classic scan error:", error);
            },
          });
        }
      }

      function updateDeviceList(devices: Map<string, ScanDevice>) {
        const deviceList = Array.from(devices.values()).sort((a, b) => b.rssi - a.rssi);
        setDevices(deviceList);
        const bleCount = deviceList.filter(d => d.type === "ble").length;
        const classicCount = deviceList.filter(d => d.type === "classic").length;
        setBleDiagnostics(prev => ({ 
          ...prev, 
          bleDeviceCount: bleCount,
          classicDeviceCount: classicCount,
        }));
      }

      setTimeout(() => {
        stopRealScan();
        cancelDiscovery();
        setIsScanning(false);
      }, 15000);
    } catch (error: any) {
      console.error("Bluetooth initialization error:", error);
      setBleDiagnostics(prev => ({ ...prev, bleState: "Error: " + error.message }));
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
      if (useMockMode) {
        await connectToMotor(device.serialNumber, true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (device.type === "classic") {
        addDebugLog("INFO", `Connecting to Classic device: ${device.name} (${device.id})`);
        const success = await connectToClassicDevice(device.id, {
          onDeviceFound: () => {},
          onConnected: async (connectedDevice) => {
            addDebugLog("INFO", `Bluetooth Classic connected callback: ${connectedDevice.name}`);
            console.log("Bluetooth Classic connected:", connectedDevice.name);
            await connectToMotor(device.serialNumber, false);
          },
          onDisconnected: (deviceId) => {
            addDebugLog("INFO", `Bluetooth Classic disconnected callback: ${deviceId}`);
            console.log("Bluetooth Classic disconnected:", deviceId);
            disconnectMotor();
          },
          onDataReceived: (data: ParseResult) => {
            addDebugLog("DATA", `onDataReceived callback called: type=${data.type}`);
            processParsedData(data);
          },
          onError: (error) => {
            addDebugLog("ERROR", `Bluetooth Classic error: ${error.message}`);
            console.error("Bluetooth Classic error:", error);
            Alert.alert("Connection Error", error.message);
          },
          onDebugLog: (level, message) => {
            addDebugLog(level, `[BT-Classic] ${message}`);
          },
        });

        if (!success) {
          throw new Error("Failed to connect via Bluetooth Classic");
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const success = await connectToBleDevice(device.id, {
          onDeviceFound: () => {},
          onConnected: async (connectedDevice) => {
            console.log("BLE connected:", connectedDevice.name);
            await connectToMotor(device.serialNumber, false);
          },
          onDisconnected: (deviceId) => {
            console.log("BLE disconnected:", deviceId);
            disconnectMotor();
          },
          onDataReceived: (data: ParseResult) => {
            processParsedData(data);
          },
          onError: (error) => {
            console.error("BLE error:", error);
            Alert.alert("Connection Error", error.message);
          },
        });

        if (!success) {
          throw new Error("Failed to connect via BLE");
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
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
            <View style={styles.deviceBadges}>
              <View style={[
                styles.typeBadge, 
                { backgroundColor: item.type === "ble" ? BladeColors.accent + "20" : BladeColors.primary + "20" }
              ]}>
                <ThemedText 
                  type="caption" 
                  style={{ color: item.type === "ble" ? BladeColors.accent : BladeColors.primary }}
                >
                  {item.type === "ble" ? "BLE 4.0+" : "Classic 2.0"}
                </ThemedText>
              </View>
              {useMockMode && item.id.startsWith("mock") ? (
                <ThemedText
                  type="caption"
                  style={{ color: BladeColors.warning }}
                >
                  Demo
                </ThemedText>
              ) : null}
            </View>
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
              name={bleDiagnostics.bleInitialized ? "check-circle" : "x-circle"} 
              size={14} 
              color={bleDiagnostics.bleInitialized ? BladeColors.success : BladeColors.error} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              BLE
            </ThemedText>
          </View>
          <View style={styles.diagnosticsItem}>
            <Feather 
              name={bleDiagnostics.classicInitialized ? "check-circle" : "x-circle"} 
              size={14} 
              color={bleDiagnostics.classicInitialized ? BladeColors.success : BladeColors.error} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              Classic
            </ThemedText>
          </View>
          <View style={styles.diagnosticsItem}>
            <Feather 
              name={bleDiagnostics.permissions ? "check-circle" : "x-circle"} 
              size={14} 
              color={bleDiagnostics.permissions ? BladeColors.success : BladeColors.error} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              Perms
            </ThemedText>
          </View>
          <View style={styles.diagnosticsItem}>
            <Feather 
              name={bleDiagnostics.bleState === "PoweredOn" ? "bluetooth" : "alert-circle"} 
              size={14} 
              color={bleDiagnostics.bleState === "PoweredOn" ? BladeColors.success : BladeColors.warning} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              {bleDiagnostics.bleState}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: 4 }}>
          BLE: {bleDiagnostics.bleDeviceCount} | Classic: {bleDiagnostics.classicDeviceCount}
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
  deviceBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 6,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
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
