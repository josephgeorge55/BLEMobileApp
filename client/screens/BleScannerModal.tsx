import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
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
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";

interface MockDevice {
  id: string;
  name: string;
  serialNumber: string;
  rssi: number;
}

const mockDevices: MockDevice[] = [
  { id: "1", name: "Blade Pro 500", serialNumber: "BLD-2024-0001", rssi: -45 },
  { id: "2", name: "Blade Sport 350", serialNumber: "BLD-2024-0042", rssi: -62 },
  { id: "3", name: "Blade Elite 750", serialNumber: "BLD-2024-0187", rssi: -78 },
];

export default function BleScannerModal() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { connectToMotor, isConnecting, stopScan } = useMotor();
  const { user } = useUser();

  const [isScanning, setIsScanning] = useState(true);
  const [devices, setDevices] = useState<MockDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showAntiTheftModal, setShowAntiTheftModal] = useState(false);
  const [pairedMotor, setPairedMotor] = useState<{ name: string; serialNumber: string } | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    const scanTimeout = setTimeout(() => {
      setDevices(mockDevices);
      setIsScanning(false);
    }, 2000);

    return () => {
      clearTimeout(scanTimeout);
      stopScan();
    };
  }, []);

  const handleDevicePress = async (device: MockDevice) => {
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
    setIsScanning(true);
    setDevices([]);
    setTimeout(() => {
      setDevices(mockDevices);
      setIsScanning(false);
    }, 2000);
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

  const renderDevice = ({ item, index }: { item: MockDevice; index: number }) => {
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
            : `Found ${devices.length} motor${devices.length !== 1 ? "s" : ""}`}
        </ThemedText>
      </View>

      {isScanning ? (
        <Animated.View entering={FadeIn.duration(300)} style={styles.scanning}>
          <ActivityIndicator size="large" color={BladeColors.primary} />
          <ThemedText
            type="body"
            style={[styles.scanningText, { color: theme.textSecondary }]}
          >
            Make sure your motor is powered on and within range
          </ThemedText>
        </Animated.View>
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
    paddingBottom: Spacing["2xl"],
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
