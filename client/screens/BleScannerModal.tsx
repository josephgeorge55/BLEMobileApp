import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
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
import { registerMotorForUser, isMotorRegisteredToUser } from "@/lib/firebase";
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
  const { motor, connectToMotor, isConnecting, stopScan, processParsedData, disconnectMotor, addDebugLog } = useMotor();
  const { user } = useUser();

  const [isScanning, setIsScanning] = useState(true);
  const [devices, setDevices] = useState<ScanDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showAntiTheftModal, setShowAntiTheftModal] = useState(false);
  const [pairedMotor, setPairedMotor] = useState<{ name: string; serialNumber: string } | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [useMockMode, setUseMockMode] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const [showConnectingModal, setShowConnectingModal] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState<string | null>(null);
  const { isGuestMode } = useUser();
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
  
  // Ref to track current motor state for use in async callbacks
  const motorRef = useRef(motor);
  useEffect(() => {
    motorRef.current = motor;
  }, [motor]);

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
      // Initialize BLE first (works on iOS and Android)
      let bleInitialized = false;
      let classicInitialized = false;
      
      try {
        bleInitialized = await initializeBle();
      } catch (bleError) {
        console.warn("BLE initialization error:", bleError);
      }
      
      // Bluetooth Classic only works on Android - skip on iOS to prevent crashes
      if (Platform.OS === "android") {
        try {
          classicInitialized = await initializeClassic();
        } catch (classicError) {
          console.warn("Bluetooth Classic initialization error:", classicError);
        }
      }
      
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
    setConnectingDevice(device.name);
    setShowConnectingModal(true);

    try {
      if (useMockMode) {
        await connectToMotor(device.serialNumber);
        setShowConnectingModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (device.type === "classic") {
        addDebugLog("INFO", `Connecting to Classic device: ${device.name} (${device.id})`);
        const success = await connectToClassicDevice(device.id, {
          onDeviceFound: () => {},
          onConnected: async (connectedDevice) => {
            addDebugLog("INFO", `Bluetooth Classic connected callback: ${connectedDevice.name}`);
            console.log("Bluetooth Classic connected:", connectedDevice.name);
            await connectToMotor(device.serialNumber);
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
        setShowConnectingModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        addDebugLog("INFO", `Connecting to BLE device: ${device.name} (${device.id}) on ${Platform.OS}`);
        const success = await connectToBleDevice(device.id, {
          onDeviceFound: () => {},
          onConnected: async (connectedDevice) => {
            addDebugLog("INFO", `BLE connected callback: ${connectedDevice.name}`);
            console.log("BLE connected:", connectedDevice.name);
            await connectToMotor(device.serialNumber);
          },
          onDisconnected: (deviceId) => {
            addDebugLog("INFO", `BLE disconnected callback: ${deviceId}`);
            console.log("BLE disconnected:", deviceId);
            disconnectMotor();
          },
          onDataReceived: (data: ParseResult) => {
            addDebugLog("DATA", `BLE onDataReceived: type=${data.type}, group=${data.group}`);
            processParsedData(data);
          },
          onError: (error) => {
            addDebugLog("ERROR", `BLE error: ${error.message}`);
            console.error("BLE error:", error);
            Alert.alert("Connection Error", error.message);
          },
        });

        if (!success) {
          throw new Error("Failed to connect via BLE");
        }
        setShowConnectingModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      // Always navigate back to Dashboard after successful connection
      console.log("[BleScanner] Connection successful, navigating to Dashboard...");
      navigation.goBack();
      
      // For logged-in users (not guest mode), check anti-theft registration in background
      if (user && !isGuestMode) {
        // Check anti-theft in background after navigation
        setTimeout(async () => {
          addDebugLog("INFO", "[AntiTheft] Checking motor registration in background...");
          let realSerial: string | null = null;
          
          // Wait briefly for real serial from INFOR G1 frame
          for (let attempt = 0; attempt < 4; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentMotor = motorRef.current;
            if (currentMotor?.serialNumber && !currentMotor.serialNumber.includes(':')) {
              realSerial = currentMotor.serialNumber;
              addDebugLog("INFO", `[AntiTheft] Got real serial: ${realSerial}`);
              break;
            }
          }
          
          if (!realSerial) {
            addDebugLog("INFO", "[AntiTheft] Could not get real serial, using device serial");
            realSerial = device.serialNumber;
          }
          
          // Skip if serial is still a BT address
          if (realSerial.includes(':')) {
            addDebugLog("INFO", "[AntiTheft] Serial is BT address, skipping registration check");
            return;
          }
          
          try {
            const isAlreadyRegistered = await isMotorRegisteredToUser(user.id, realSerial);
            
            if (!isAlreadyRegistered) {
              // Motor is not registered, prompt user with Alert
              addDebugLog("INFO", `[AntiTheft] Motor ${realSerial} not registered, prompting user`);
              Alert.alert(
                "Enable Anti-Theft?",
                `Would you like to link this motor (${realSerial}) to your account for anti-theft protection?`,
                [
                  { text: "Later", style: "cancel" },
                  { 
                    text: "Enable", 
                    onPress: async () => {
                      try {
                        const result = await registerMotorForUser(user.id, realSerial!, device.name);
                        if (result.success) {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert("Protected", `Motor ${realSerial} is now protected with anti-theft.`);
                        } else {
                          Alert.alert("Error", result.error || "Failed to enable anti-theft protection.");
                        }
                      } catch (err: any) {
                        Alert.alert("Error", err.message || "Failed to enable anti-theft protection.");
                      }
                    }
                  }
                ]
              );
            } else {
              addDebugLog("INFO", `[AntiTheft] Motor ${realSerial} already registered`);
            }
          } catch (error: any) {
            addDebugLog("ERROR", `[AntiTheft] Error checking registration: ${error.message}`);
          }
        }, 100);
      }
    } catch (error) {
      setShowConnectingModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSelectedDevice(null);
    }
  };

  const handleLinkMotor = async () => {
    if (!pairedMotor || !user) return;
    
    // Check for guest mode
    if (user.id === "guest") {
      Alert.alert(
        "Account Required",
        "Sign in with an email account to enable anti-theft protection. Guest mode doesn't support this feature."
      );
      setShowAntiTheftModal(false);
      navigation.goBack();
      return;
    }
    
    setIsLinking(true);
    addDebugLog("INFO", `[AntiTheft] Linking motor: ${pairedMotor.serialNumber}`);
    
    try {
      // The pairedMotor.serialNumber already contains the real serial (obtained before showing modal)
      const serialToRegister = pairedMotor.serialNumber;
      const motorName = pairedMotor.name;
      
      // Validate serial number format
      if (serialToRegister.includes(':')) {
        addDebugLog("ERROR", "[AntiTheft] Serial still contains BT address format");
        Alert.alert(
          "Registration Issue",
          "Could not retrieve motor serial number. Please try enabling anti-theft from Settings later."
        );
        setShowAntiTheftModal(false);
        navigation.goBack();
        setIsLinking(false);
        return;
      }
      
      addDebugLog("INFO", `[AntiTheft] Registering motor: ${serialToRegister} for user: ${user.id}`);
      
      const result = await registerMotorForUser(user.id, serialToRegister, motorName);
      
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addDebugLog("INFO", `[AntiTheft] SUCCESS: Motor ${serialToRegister} registered`);
        Alert.alert(
          "Linked Successfully",
          `Motor ${serialToRegister} is now protected with anti-theft. Only you can pair and control this motor.`,
          [{ text: "Continue", onPress: () => navigation.goBack() }]
        );
      } else {
        addDebugLog("ERROR", `[AntiTheft] Registration failed: ${result.error}`);
        Alert.alert("Error", result.error || "Failed to register motor for anti-theft protection.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      
      setShowAntiTheftModal(false);
    } catch (error: any) {
      addDebugLog("ERROR", `[AntiTheft] Exception: ${error.message}`);
      console.error("Failed to link motor:", error);
      Alert.alert("Error", error.message || "Failed to register motor for anti-theft protection.");
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
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={styles.closeButton}
          testID="close-scanner-button"
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
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

    <Modal
      visible={showConnectingModal}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.connectingOverlay}>
        <Animated.View 
          entering={FadeIn.duration(200)}
          style={[styles.connectingModal, { backgroundColor: theme.surface }]}
        >
          <ActivityIndicator size="large" color={BladeColors.primary} />
          <ThemedText type="h4" style={styles.connectingTitle}>
            Connecting...
          </ThemedText>
          <ThemedText type="body" style={[styles.connectingSubtitle, { color: theme.textSecondary }]}>
            {connectingDevice || "Blade Outboard"}
          </ThemedText>
          <ThemedText type="caption" style={[styles.connectingNote, { color: theme.textTertiary }]}>
            Please keep your device nearby
          </ThemedText>
        </Animated.View>
      </View>
    </Modal>
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
    marginBottom: Spacing.sm,
  },
  closeButton: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
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
  connectingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  connectingModal: {
    width: "100%",
    maxWidth: 280,
    borderRadius: BorderRadius.xl,
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  connectingTitle: {
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  connectingSubtitle: {
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  connectingNote: {
    marginTop: Spacing.lg,
    textAlign: "center",
  },
});
