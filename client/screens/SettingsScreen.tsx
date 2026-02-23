import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, ScrollView, Image, Alert, ActivityIndicator, Pressable, Platform, TextInput, Modal } from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, NavigationProp, useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as MailComposer from "expo-mail-composer";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { FirmwareUpdateModal } from "@/components/FirmwareUpdateModal";
import { DebugLogModal } from "@/components/DebugLogModal";
import { BoatSettingsModal } from "@/components/BoatSettingsModal";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useSettings } from "@/context/SettingsContext";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";
import { 
  registerMotorForUser, 
  getRegisteredMotors, 
  removeMotorForUser,
  getBoatData,
  getWarrantyData,
  type RegisteredMotor,
  type BoatData
} from "@/lib/firebase";
import { ProtectionChecklist } from "@/components/ProtectionChecklist";

const APP_VERSION = Constants.expoConfig?.version || "1.3.1";
const BUILD_NUMBER = "2026.02.14";
const FIRMWARE_PROTOCOL = "BLE 5.0";
const HARDWARE_REV = "HW-R3";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { theme, isDark } = useTheme();
  const { motor, telemetry, disconnectMotor, startScan, debugLogs, sendCommand } = useMotor();
  const { user, logout, isFirebaseReady, isGuestMode, deleteAccount } = useUser();
  const { showSuccess, showError } = useToast();
  const {
    anonymousDataSharing,
    notificationSettings,
    setAnonymousDataSharing,
    toggleNotification,
  } = useSettings();
  
  const [firmwareModalVisible, setFirmwareModalVisible] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [registeredMotors, setRegisteredMotors] = useState<RegisteredMotor[]>([]);
  const [loadingMotors, setLoadingMotors] = useState(false);
  const motorsLoadedRef = useRef(false);
  const [isLinkingMotor, setIsLinkingMotor] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showBoatModal, setShowBoatModal] = useState(false);
  const [boatData, setBoatData] = useState<BoatData | null>(null);
  const [hasWarranty, setHasWarranty] = useState(false);

  const [maxThrottle, setMaxThrottle] = useState(100);
  const [throttleCooldown, setThrottleCooldown] = useState(0);
  const [isSendingThrottle, setIsSendingThrottle] = useState(false);
  const lastThrottleSentRef = useRef(0);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const isConnectedMotorRegistered = motor?.isConnected && registeredMotors.some(
    rm => rm.serialNumber === motor.serialNumber || rm.serialNumber === telemetry?.tillerSerialNumber
  );

  useFocusEffect(
    useCallback(() => {
      if (user?.id && isFirebaseReady) {
        loadRegisteredMotors();
        loadBoatData();
        loadWarrantyStatus();
      } else if (!user?.id) {
        setRegisteredMotors([]);
        setBoatData(null);
        setHasWarranty(false);
      }
    }, [user?.id, isFirebaseReady])
  );

  const loadBoatData = async () => {
    if (!user?.id) return;
    try {
      const data = await getBoatData(user.id);
      setBoatData(data);
    } catch (error) {
      console.error("Failed to load boat data:", error);
    }
  };

  const loadWarrantyStatus = async () => {
    if (!user?.id) return;
    try {
      const warranty = await getWarrantyData(user.id);
      setHasWarranty(warranty !== null);
    } catch (error) {
      console.error("Failed to load warranty status:", error);
    }
  };

  const loadRegisteredMotors = async () => {
    if (!user?.id) return;
    if (!motorsLoadedRef.current) {
      setLoadingMotors(true);
    }
    try {
      const motors = await getRegisteredMotors(user.id);
      setRegisteredMotors(motors);
      motorsLoadedRef.current = true;
    } catch (error) {
      console.error("Failed to load registered motors:", error);
    } finally {
      setLoadingMotors(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastThrottleSentRef.current) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setThrottleCooldown(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSendThrottle = async () => {
    console.log("[Throttle] handleSendThrottle called");
    console.log(`[Throttle] maxThrottle slider value: ${maxThrottle}`);
    console.log(`[Throttle] Motor connected: ${motor?.isConnected}`);
    console.log(`[Throttle] Motor serial: ${motor?.serialNumber || 'null'}`);
    
    const now = Date.now();
    const elapsed = Math.floor((now - lastThrottleSentRef.current) / 1000);
    console.log(`[Throttle] Cooldown elapsed: ${elapsed}s (need 60s)`);
    
    if (elapsed < 60) {
      console.log(`[Throttle] Blocked by cooldown: ${60 - elapsed}s remaining`);
      return;
    }

    const percent = Math.round(Math.min(100, Math.max(10, maxThrottle)));
    const command = `$APP_CONFIG,MAX_THROTTLE,${percent}`;
    console.log(`[Throttle] Sending command: "${command}"`);

    setIsSendingThrottle(true);
    try {
      const success = await sendCommand(command);
      console.log(`[Throttle] sendCommand returned: ${success}`);
      if (success) {
        lastThrottleSentRef.current = Date.now();
        setThrottleCooldown(60);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess(`Throttle limit set to ${percent}%`);
        console.log(`[Throttle] SUCCESS: Throttle set to ${percent}%`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showError("Failed to send throttle command to motor.");
        console.error(`[Throttle] FAILED: sendCommand returned false`);
      }
    } catch (error: any) {
      console.error(`[Throttle] Exception: ${error.message || error}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError(error.message || "An error occurred while sending the command.");
    } finally {
      setIsSendingThrottle(false);
    }
  };

  const handleRemoveMotor = async (serialNumber: string) => {
    if (!user?.id) return;
    
    Alert.alert(
      "Remove Motor",
      `Are you sure you want to unlink motor ${serialNumber} from your account? This will disable anti-theft protection.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const success = await removeMotorForUser(user.id, serialNumber);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadRegisteredMotors();
              showSuccess("Motor unlinked successfully");
            } else {
              showError("Failed to unlink motor");
            }
          },
        },
      ]
    );
  };

  const handleLinkConnectedMotor = async () => {
    if (!user?.id || !motor?.isConnected) {
      Alert.alert("Error", "Please connect to your motor first.");
      return;
    }
    
    // Check for guest mode first
    if (isGuestMode) {
      Alert.alert(
        "Account Required",
        "Sign in with an email account to enable anti-theft protection. Guest mode doesn't support this feature.",
        [{ text: "OK" }]
      );
      return;
    }
    
    // Prefer real serial number from telemetry over BLE device ID placeholder
    const rawSerial = motor.serialNumber;
    const tillerSerial = telemetry?.tillerSerialNumber;
    const isPlaceholderSerial = rawSerial?.includes(':') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawSerial || '');
    
    // Use tiller serial if motor serial is a placeholder (BT address or iOS UUID)
    const serialNumber = (isPlaceholderSerial && tillerSerial) ? tillerSerial : rawSerial;
    
    console.log("[SettingsScreen] Linking motor:", { rawSerial, tillerSerial, isPlaceholderSerial, serialNumber });
    
    // Validate we have a real serial number (not a BT address or iOS BLE UUID)
    if (!serialNumber || serialNumber.includes(':') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(serialNumber)) {
      Alert.alert(
        "Waiting for Motor Identity",
        "The motor hasn't sent its serial number yet. Please wait a few seconds and try again.",
        [{ text: "OK" }]
      );
      return;
    }
    
    // Validate serial number prefix for binding
    if (!/^(BLD|JK)/i.test(serialNumber)) {
      Alert.alert(
        "Anti-Theft Unavailable",
        "Anti-theft binding is not possible due to serial number abnormalities. The motor serial number must begin with \"BLD\" or \"JK\".",
        [{ text: "OK" }]
      );
      return;
    }
    
    const motorName = `Blade Halo`;
    
    setIsLinkingMotor(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const result = await registerMotorForUser(user.id, serialNumber, motorName);
      console.log("[SettingsScreen] Registration result:", result);
      
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadRegisteredMotors();
        showSuccess("Anti-theft protection enabled");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showError(result.error || "Failed to enable anti-theft protection");
      }
    } catch (error: any) {
      console.error("[SettingsScreen] Error linking motor:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("Failed to link motor. Please try again.");
    } finally {
      setIsLinkingMotor(false);
    }
  };

  const handleUnlinkConnectedMotor = () => {
    if (!motor?.isConnected) return;
    const serialNumber = telemetry?.tillerSerialNumber || motor.serialNumber;
    handleRemoveMotor(serialNumber);
  };

  const handleDisconnect = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsDisconnecting(true);
    
    // Small delay to show the disconnecting state
    await new Promise(resolve => setTimeout(resolve, 800));
    
    disconnectMotor();
    setIsDisconnecting(false);
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess("Motor disconnected");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    if (!deletePassword.trim()) {
      showError("Please enter your password.");
      return;
    }

    setIsDeletingAccount(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const result = await deleteAccount(deletePassword);
      if (result.success) {
        setShowDeleteModal(false);
        setDeletePassword("");
        setDeleteConfirmText("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess("Account deleted successfully");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showError(result.error || "Failed to delete account.");
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("An unexpected error occurred.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    showSuccess("Signed out");
  };

  const handleOpenWebsite = async () => {
    await WebBrowser.openBrowserAsync("https://bladeoutboards.com");
  };

  const handleOpenPrivacy = async () => {
    await WebBrowser.openBrowserAsync("https://www.bladeoutboards.com/privacy-policy");
  };

  const handleOpenTerms = async () => {
    await WebBrowser.openBrowserAsync("https://www.bladeoutboards.com/tandc");
  };

  const handleOpenSupport = async () => {
    await WebBrowser.openBrowserAsync("https://support.bladeoutboards.com");
  };

  const handleReportBug = async () => {
    const subject = "Bug Report - Blade App v" + APP_VERSION;
    const body = "Please describe the issue:\n\n\nSteps to reproduce:\n1. \n2. \n3. \n\nDevice: " + Platform.OS + "\nApp Version: " + APP_VERSION + "\nBuild: " + BUILD_NUMBER;
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        showError("No email app is set up on this device");
        return;
      }
      await MailComposer.composeAsync({
        recipients: ["IT@bladetcg.com"],
        subject,
        body,
      });
    } catch (error) {
      showError("Could not open email app");
    }
  };

  const handleDataSharingToggle = (value: boolean) => {
    setAnonymousDataSharing(value);
  };

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: "#F2F2F7" }]}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.md,
        paddingBottom: tabBarHeight + Spacing["4xl"],
        paddingHorizontal: Spacing.screenPadding,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
        <View style={styles.heroTile}>
          <View style={styles.heroIconRow}>
            <View style={styles.heroIconCircle}>
              <Image
                source={require("../../assets/images/blade-logo-white.png")}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextGroup}>
              <ThemedText type="h2" style={styles.heroTitle}>
                Blade Halo
              </ThemedText>
              <ThemedText type="small" style={styles.heroSubtitle}>
                Settings
              </ThemedText>
            </View>
          </View>
          <View style={styles.heroInfoRow}>
            <View style={styles.heroInfoItem}>
              <Feather name="smartphone" size={13} color="rgba(255,255,255,0.4)" />
              <ThemedText type="caption" style={styles.heroInfoText}>v{APP_VERSION}</ThemedText>
            </View>
            <View style={styles.heroInfoDot} />
            <View style={styles.heroInfoItem}>
              <Feather name="bluetooth" size={13} color="rgba(255,255,255,0.4)" />
              <ThemedText type="caption" style={styles.heroInfoText}>{FIRMWARE_PROTOCOL}</ThemedText>
            </View>
            <View style={styles.heroInfoDot} />
            <View style={styles.heroInfoItem}>
              <Feather name="cpu" size={13} color="rgba(255,255,255,0.4)" />
              <ThemedText type="caption" style={styles.heroInfoText}>{HARDWARE_REV}</ThemedText>
            </View>
          </View>
        </View>

      {user && !isGuestMode ? (
        <ProtectionChecklist
          boatData={boatData}
          hasWarranty={hasWarranty}
          hasAntiTheft={registeredMotors.length > 0}
          registeredMotors={registeredMotors}
        />
      ) : null}

      {user ? (
          <SettingsSection title="Account">
            <SettingsRow
              icon="user"
              title={user.email}
              subtitle="Signed in"
              showChevron={false}
            />
            <SettingsRow
              icon="log-out"
              title="Sign Out"
              onPress={handleLogout}
              destructive
              showChevron={false}
            />
          </SettingsSection>
      ) : null}

      {user && !isGuestMode ? (
          <SettingsSection title="My Boat">
            <SettingsRow
              icon="anchor"
              title={boatData ? boatData.boatType : "Add Boat Information"}
              subtitle={boatData 
                ? `${(boatData.lengthMeters * 3.28084).toFixed(1)} ft / ${boatData.weightKg.toFixed(0)} kg`
                : "Enter your boat details for trip reports"
              }
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowBoatModal(true);
              }}
              iconColor={boatData ? BladeColors.marine : "rgba(255,255,255,0.5)"}
            />
          </SettingsSection>
      ) : null}

      {user && !isGuestMode ? (
          <SettingsSection title="Ownership">
            <SettingsRow
              icon="award"
              title="Digital Outboard Passport"
              subtitle="Digital proof of ownership, warranty & wallet pass"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("Passport");
              }}
              iconColor={BladeColors.gold}
            />
            <SettingsRow
              icon="shield"
              title="Warranty Registration"
              subtitle="Register your motor for warranty coverage"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("WarrantyRegistration");
              }}
              iconColor={BladeColors.marine}
            />
          </SettingsSection>
      ) : null}

      {user && !isGuestMode ? (
          <SettingsSection title="Anti-Theft Registered Devices">
            {loadingMotors ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={BladeColors.accent} />
                <ThemedText type="small" style={{ color: "rgba(255,255,255,0.5)", marginLeft: Spacing.sm }}>
                  Loading...
                </ThemedText>
              </View>
            ) : registeredMotors.length > 0 ? (
              registeredMotors.map((registeredMotor, index) => (
                <SettingsRow
                  key={`${registeredMotor.serialNumber}-${index}`}
                  icon="lock"
                  title={registeredMotor.name || registeredMotor.serialNumber}
                  subtitle={registeredMotor.name ? `S/N: ${registeredMotor.serialNumber}` : "Protected"}
                  onPress={() => handleRemoveMotor(registeredMotor.serialNumber)}
                  iconColor={BladeColors.success}
                />
              ))
            ) : (
              <View style={styles.emptyRegisteredContainer}>
                <Feather name="shield-off" size={32} color={"rgba(255,255,255,0.35)"} />
                <ThemedText type="small" style={{ color: "rgba(255,255,255,0.35)", marginTop: Spacing.sm, textAlign: 'center' }}>
                  No outboards registered for anti-theft protection
                </ThemedText>
                <ThemedText type="caption" style={{ color: "rgba(255,255,255,0.35)", marginTop: Spacing.xs, textAlign: 'center' }}>
                  Connect an outboard via Bluetooth to enable protection
                </ThemedText>
              </View>
            )}
          </SettingsSection>
      ) : null}

      {motor?.isConnected ? (
        <SettingsSection title="Connected Outboard">
          <View style={[styles.motorCard, { backgroundColor: "transparent" }]}>
            <View style={styles.motorImageContainer}>
              <Image
                source={require("../../assets/images/halo-outboard.png")}
                style={styles.motorImage}
                resizeMode="contain"
              />
              {isConnectedMotorRegistered ? (
                <View style={[styles.registeredBadge, { backgroundColor: BladeColors.success }]}>
                  <Feather name="lock" size={12} color="#fff" />
                </View>
              ) : null}
            </View>
            <View style={styles.motorInfo}>
              <ThemedText type="h3" style={{ color: "#FFFFFF" }}>Blade Halo</ThemedText>
              <View style={styles.serialRow}>
                {isConnectedMotorRegistered ? (
                  <Feather name="lock" size={12} color={BladeColors.success} style={{ marginRight: 4 }} />
                ) : null}
                <ThemedText type="mono" style={{ color: isConnectedMotorRegistered ? BladeColors.success : "rgba(255,255,255,0.5)" }}>
                  S/N: {telemetry?.tillerSerialNumber || motor.serialNumber}
                </ThemedText>
              </View>
              <View style={styles.motorBadges}>
                <View style={[styles.badge, { backgroundColor: BladeColors.success + "20" }]}>
                  <View style={[styles.badgeDot, { backgroundColor: BladeColors.success }]} />
                  <ThemedText type="caption" style={{ color: BladeColors.success }}>
                    Connected
                  </ThemedText>
                </View>
                <View style={[styles.badge, { backgroundColor: BladeColors.accent + "20" }]}>
                  <ThemedText type="caption" style={{ color: BladeColors.accent }}>
                    v{telemetry?.tillerFirmwareVersion || motor.firmwareVersion || "1.0.0"}
                  </ThemedText>
                </View>
                {isConnectedMotorRegistered ? (
                  <View style={[styles.badge, { backgroundColor: BladeColors.success + "20" }]}>
                    <Feather name="shield" size={10} color={BladeColors.success} />
                    <ThemedText type="caption" style={{ color: BladeColors.success, marginLeft: 3 }}>
                      Protected
                    </ThemedText>
                  </View>
                ) : (
                  <View style={[styles.badge, { backgroundColor: BladeColors.warning + "20" }]}>
                    <Feather name="shield-off" size={10} color={BladeColors.warning} />
                    <ThemedText type="caption" style={{ color: BladeColors.warning, marginLeft: 3 }}>
                      Unprotected
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          </View>
          {isGuestMode ? (
            <SettingsRow
              icon="shield"
              title="Anti-Theft Protection"
              subtitle="Sign in to enable anti-theft protection"
              showChevron={false}
              iconColor={"rgba(255,255,255,0.35)"}
            />
          ) : isConnectedMotorRegistered ? (
            <SettingsRow
              icon="unlock"
              title="Unlink from Account"
              subtitle="Remove anti-theft protection"
              onPress={handleUnlinkConnectedMotor}
              iconColor={"rgba(255,255,255,0.5)"}
            />
          ) : (
            <SettingsRow
              icon="shield-off"
              title={isLinkingMotor ? "Linking..." : "Enable Anti-Theft"}
              subtitle="Tap to link this outboard to your account"
              onPress={handleLinkConnectedMotor}
              iconColor={BladeColors.warning}
              disabled={isLinkingMotor}
            />
          )}
          <SettingsRow
            icon="upload-cloud"
            title="Custom Firmware Update"
            subtitle="Upload and flash custom .hex firmware"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFirmwareModalVisible(true);
            }}
            iconColor={BladeColors.accent}
          />
          <View style={[styles.throttleContainer, { backgroundColor: "transparent" }]}>
            <View style={styles.throttleHeader}>
              <View
                style={[
                  styles.throttleIconContainer,
                  { backgroundColor: "rgba(255,255,255,0.08)" },
                ]}
              >
                <Feather name="sliders" size={18} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={{ color: "#FFFFFF" }}>Max Throttle Limit</ThemedText>
                <ThemedText type="caption" style={{ color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                  Limit maximum motor power output. 100% means no limit applied.
                </ThemedText>
              </View>
            </View>
            <ThemedText type="h1" style={[styles.throttleValue, { color: "#FFFFFF" }]}>
              {Math.round(maxThrottle)}%
            </ThemedText>
            <View style={styles.throttleSliderRow}>
              <Slider
                minimumValue={10}
                maximumValue={100}
                step={1}
                value={maxThrottle}
                onValueChange={setMaxThrottle}
                minimumTrackTintColor={BladeColors.accent}
                maximumTrackTintColor={"rgba(255,255,255,0.15)"}
                thumbTintColor={BladeColors.accent}
                style={{ width: "100%", height: 40 }}
              />
              <View style={styles.throttleLabels}>
                <ThemedText type="caption" style={{ color: "rgba(255,255,255,0.35)" }}>10%</ThemedText>
                <ThemedText type="caption" style={{ color: "rgba(255,255,255,0.35)" }}>100%</ThemedText>
              </View>
            </View>
            <Pressable
              style={[
                styles.throttleSendButton,
                {
                  backgroundColor: throttleCooldown > 0 || isSendingThrottle
                    ? "rgba(255,255,255,0.15)"
                    : BladeColors.accent,
                },
              ]}
              onPress={handleSendThrottle}
              disabled={throttleCooldown > 0 || isSendingThrottle}
            >
              {isSendingThrottle ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText type="button" style={{ color: "#FFFFFF" }}>
                  {throttleCooldown > 0
                    ? `Wait ${throttleCooldown}s`
                    : "Send to Motor"}
                </ThemedText>
              )}
            </Pressable>
            <ThemedText type="caption" style={[styles.throttleNote, { color: BladeColors.warning }]}>
              If unsure of current setting, reset to 100% first.
            </ThemedText>
          </View>
          <SettingsRow
            icon="power"
            title={isDisconnecting ? "Disconnecting..." : "Disconnect Motor"}
            onPress={handleDisconnect}
            destructive
            showChevron={false}
            disabled={isDisconnecting}
          />
        </SettingsSection>
      ) : (
        <SettingsSection title="Outboard">
          <Pressable 
            style={[styles.emptyMotorCard, { backgroundColor: "transparent" }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              startScan();
              navigation.navigate("BleScanner");
            }}
          >
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.emptyMotorImage}
              resizeMode="contain"
            />
            <ThemedText type="h4" style={[styles.emptyTitle, { color: "#FFFFFF" }]}>No Outboard Paired</ThemedText>
            <ThemedText type="small" style={[styles.emptySubtitle, { color: "rgba(255,255,255,0.5)" }]}>
              Tap to scan for nearby Blade outboards
            </ThemedText>
          </Pressable>
        </SettingsSection>
      )}

      <SettingsSection title="Notifications">
        <SettingsRow
          icon="tool"
          title="Maintenance Reminders"
          subtitle="Service intervals and alerts"
          isToggle
          toggleValue={notificationSettings.maintenance}
          onToggle={() => toggleNotification("maintenance")}
        />
        <SettingsRow
          icon="download-cloud"
          title="Firmware Updates"
          subtitle="New software releases"
          isToggle
          toggleValue={notificationSettings.firmware}
          onToggle={() => toggleNotification("firmware")}
        />
        <SettingsRow
          icon="bell"
          title="Announcements"
          subtitle="Product news and updates"
          isToggle
          toggleValue={notificationSettings.announcements}
          onToggle={() => toggleNotification("announcements")}
        />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <SettingsRow
          icon="share-2"
          title="Share Information"
          subtitle="Help improve Blade with usage data including personal info"
          isToggle
          toggleValue={anonymousDataSharing}
          onToggle={handleDataSharingToggle}
        />
        <View style={styles.privacyNote}>
          <ThemedText type="caption" style={{ color: "rgba(255,255,255,0.35)" }}>
            Data is used to improve product performance, enhance features, and provide better support.
          </ThemedText>
        </View>
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsRow
          icon="life-buoy"
          title="Support Center"
          subtitle="Get help with your Blade products"
          onPress={handleOpenSupport}
          iconColor={BladeColors.accent}
        />
        <SettingsRow
          icon="book-open"
          title="User Manual"
          subtitle="Installation and operation guides"
          onPress={handleOpenSupport}
        />
        <SettingsRow
          icon="phone"
          title="Contact Engineering"
          subtitle="Technical support for OEM customers"
          onPress={handleOpenSupport}
        />
        <SettingsRow
          icon="alert-triangle"
          title="Report a Bug"
          subtitle="Email IT@bladetcg.com"
          onPress={handleReportBug}
          iconColor={BladeColors.warning}
        />
      </SettingsSection>

      <SettingsSection title="Maintenance">
        <SettingsRow
          icon="tool"
          title="Developer Mode"
          subtitle="Passcode-protected diagnostics console"
          onPress={() => setShowDebugModal(true)}
          iconColor={BladeColors.marine}
        />
      </SettingsSection>

      <SettingsSection title="Legal">
        <SettingsRow
          icon="shield"
          title="Privacy Policy"
          onPress={handleOpenPrivacy}
        />
        <SettingsRow
          icon="file-text"
          title="Terms & Conditions"
          onPress={handleOpenTerms}
        />
      </SettingsSection>

      {user && !isGuestMode ? (
        <SettingsSection title="Danger Zone">
          <SettingsRow
            icon="trash-2"
            title="Delete Account"
            subtitle="Permanently remove your account and all data"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              setDeletePassword("");
              setDeleteConfirmText("");
              setShowDeleteModal(true);
            }}
            destructive
            showChevron={false}
            iconColor="#FF3B30"
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title="System Information">
        <SettingsRow
          icon="smartphone"
          title="App Version"
          value={`v${APP_VERSION}`}
          showChevron={false}
        />
        <SettingsRow
          icon="package"
          title="Build"
          value={BUILD_NUMBER}
          showChevron={false}
        />
        <SettingsRow
          icon="bluetooth"
          title="Protocol"
          value={FIRMWARE_PROTOCOL}
          showChevron={false}
        />
        <SettingsRow
          icon="cpu"
          title="Hardware Revision"
          value={HARDWARE_REV}
          showChevron={false}
        />
        <SettingsRow
          icon="globe"
          title="bladeoutboards.com"
          onPress={handleOpenWebsite}
        />
      </SettingsSection>

      <View style={styles.footer}>
        <View style={[styles.oemBadge, { backgroundColor: "rgba(44,44,46,0.92)", borderColor: "rgba(255,255,255,0.08)" }]}>
          <Feather name="anchor" size={16} color={"rgba(255,255,255,0.35)"} />
          <View style={styles.oemBadgeText}>
            <ThemedText type="caption" style={[styles.oemTitle, { color: "rgba(255,255,255,0.5)" }]}>
              BLADE MARINE TECHNOLOGIES LTD
            </ThemedText>
            <ThemedText type="caption" style={[styles.oemSubtitle, { color: "rgba(255,255,255,0.35)" }]}>
              Electric Propulsion Systems
            </ThemedText>
          </View>
        </View>
        <View style={styles.certifications}>
          <View style={[styles.certBadge, { borderColor: "rgba(255,255,255,0.08)" }]}>
            <ThemedText type="caption" style={[styles.certText, { color: "rgba(255,255,255,0.35)" }]}>
              CE
            </ThemedText>
          </View>
          <View style={[styles.certBadge, { borderColor: "rgba(255,255,255,0.08)" }]}>
            <ThemedText type="caption" style={[styles.certText, { color: "rgba(255,255,255,0.35)" }]}>
              FCC
            </ThemedText>
          </View>
          <View style={[styles.certBadge, { borderColor: "rgba(255,255,255,0.08)" }]}>
            <ThemedText type="caption" style={[styles.certText, { color: "rgba(255,255,255,0.35)" }]}>
              IP67
            </ThemedText>
          </View>
          <View style={[styles.certBadge, { borderColor: "rgba(255,255,255,0.08)" }]}>
            <ThemedText type="caption" style={[styles.certText, { color: "rgba(255,255,255,0.35)" }]}>
              ISO 9001
            </ThemedText>
          </View>
        </View>
        <ThemedText type="caption" style={[styles.copyright, { color: "rgba(255,255,255,0.35)" }]}>
          {"\u00A9"} 2026 Blade Marine Technologies Ltd. All rights reserved.
        </ThemedText>
      </View>
    </ScrollView>
      
    <FirmwareUpdateModal
      visible={firmwareModalVisible}
      onClose={() => setFirmwareModalVisible(false)}
    />

    <DebugLogModal
      visible={showDebugModal}
      onClose={() => setShowDebugModal(false)}
    />

    {user?.id ? (
      <BoatSettingsModal
        visible={showBoatModal}
        onClose={() => setShowBoatModal(false)}
        userId={user.id}
        onSaved={loadBoatData}
      />
    ) : null}

    <Modal
      visible={showDeleteModal}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isDeletingAccount) {
          setShowDeleteModal(false);
        }
      }}
    >
      <View style={styles.deleteModalOverlay}>
        <View style={styles.deleteModalContent}>
          <View style={styles.deleteModalIconContainer}>
            <Feather name="alert-triangle" size={32} color="#FF3B30" />
          </View>
          <ThemedText type="h3" style={styles.deleteModalTitle}>
            Delete Account
          </ThemedText>
          <ThemedText type="small" style={styles.deleteModalWarning}>
            This action is permanent and cannot be undone. Deleting your account will:
          </ThemedText>
          <View style={styles.deleteModalList}>
            <ThemedText type="small" style={styles.deleteModalListItem}>
              {"\u2022"} Remove your login credentials
            </ThemedText>
            <ThemedText type="small" style={styles.deleteModalListItem}>
              {"\u2022"} Unlink all registered motors
            </ThemedText>
            <ThemedText type="small" style={styles.deleteModalListItem}>
              {"\u2022"} Delete warranty registrations
            </ThemedText>
            <ThemedText type="small" style={styles.deleteModalListItem}>
              {"\u2022"} Remove boat and trip data
            </ThemedText>
            <ThemedText type="small" style={styles.deleteModalListItem}>
              {"\u2022"} Disable anti-theft protection
            </ThemedText>
          </View>
          <ThemedText type="small" style={styles.deleteModalLabel}>
            Enter your password to confirm:
          </ThemedText>
          <TextInput
            style={styles.deleteModalInput}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.3)"
            secureTextEntry
            value={deletePassword}
            onChangeText={setDeletePassword}
            editable={!isDeletingAccount}
            autoCapitalize="none"
            testID="input-delete-password"
          />
          <ThemedText type="small" style={styles.deleteModalLabel}>
            Type DELETE to confirm:
          </ThemedText>
          <TextInput
            style={styles.deleteModalInput}
            placeholder="DELETE"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            editable={!isDeletingAccount}
            autoCapitalize="characters"
            testID="input-delete-confirm"
          />
          <View style={styles.deleteModalButtons}>
            <Pressable
              style={styles.deleteModalCancelButton}
              onPress={() => setShowDeleteModal(false)}
              disabled={isDeletingAccount}
            >
              <ThemedText type="button" style={{ color: "#FFFFFF" }}>
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.deleteModalDeleteButton,
                {
                  opacity: deleteConfirmText === "DELETE" && deletePassword.trim() ? 1 : 0.4,
                },
              ]}
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount || deleteConfirmText !== "DELETE" || !deletePassword.trim()}
              testID="button-confirm-delete"
            >
              {isDeletingAccount ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText type="button" style={{ color: "#FFFFFF" }}>
                  Delete Account
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
        </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  motorCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  motorImage: {
    width: 80,
    height: 100,
    marginRight: Spacing.lg,
  },
  motorInfo: {
    flex: 1,
    justifyContent: "center",
  },
  motorBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyMotorCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  emptyMotorImage: {
    width: 120,
    height: 150,
    marginBottom: Spacing.lg,
    opacity: 0.7,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    textAlign: "center",
  },
  privacyNote: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  footer: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    gap: Spacing.lg,
  },
  oemBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  oemBadgeText: {
    alignItems: "flex-start",
  },
  oemTitle: {
    letterSpacing: 1.5,
    fontWeight: "600",
    fontSize: 10,
  },
  oemSubtitle: {
    fontSize: 10,
    marginTop: 2,
  },
  certifications: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  certBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  certText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  copyright: {
    fontSize: 10,
    marginTop: Spacing.sm,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  emptyRegisteredContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  motorImageContainer: {
    position: "relative",
  },
  registeredBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  serialRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  throttleContainer: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  throttleHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  throttleIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  throttleValue: {
    fontSize: 36,
    fontWeight: "700",
    textAlign: "center",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  throttleSliderRow: {
    paddingHorizontal: Spacing.xs,
  },
  throttleLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  throttleSendButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  throttleNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  heroTile: {
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  heroIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(164,208,139,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(164,208,139,0.25)",
  },
  heroLogo: {
    width: 36,
    height: 20,
    tintColor: BladeColors.accent,
  },
  heroTextGroup: {
    flex: 1,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  heroInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  heroInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroInfoText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  heroInfoDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: Spacing.sm,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  deleteModalContent: {
    backgroundColor: "rgba(44,44,46,0.98)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 400,
  },
  deleteModalIconContainer: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  deleteModalTitle: {
    color: "#FF3B30",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  deleteModalWarning: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  deleteModalList: {
    marginBottom: Spacing.lg,
    paddingLeft: Spacing.sm,
  },
  deleteModalListItem: {
    color: "rgba(255,255,255,0.6)",
    marginBottom: 6,
    lineHeight: 20,
  },
  deleteModalLabel: {
    color: "rgba(255,255,255,0.5)",
    marginBottom: Spacing.xs,
    fontSize: 13,
  },
  deleteModalInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  deleteModalCancelButton: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  deleteModalDeleteButton: {
    flex: 1,
    backgroundColor: "#FF3B30",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
});
