import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Image, Alert, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { FirmwareUpdateModal } from "@/components/FirmwareUpdateModal";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useSettings } from "@/context/SettingsContext";
import { useUser } from "@/context/UserContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";
import { 
  registerMotorForUser, 
  getRegisteredMotors, 
  removeMotorForUser,
  type RegisteredMotor 
} from "@/lib/firebase";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";
const BUILD_NUMBER = "2026.01.27";
const FIRMWARE_PROTOCOL = "BLE 5.0";
const HARDWARE_REV = "HW-R3";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { theme, isDark } = useTheme();
  const { motor, telemetry, disconnectMotor, startScan } = useMotor();
  const { user, logout } = useUser();
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
  const [isLinkingMotor, setIsLinkingMotor] = useState(false);
  const { isGuestMode } = useUser();

  // Check if currently connected motor is registered
  const isConnectedMotorRegistered = motor?.isConnected && registeredMotors.some(
    rm => rm.serialNumber === motor.serialNumber || rm.serialNumber === telemetry?.tillerSerialNumber
  );

  // Load registered motors when user is logged in
  useEffect(() => {
    if (user?.id) {
      loadRegisteredMotors();
    } else {
      setRegisteredMotors([]);
    }
  }, [user?.id]);

  const loadRegisteredMotors = async () => {
    if (!user?.id) return;
    setLoadingMotors(true);
    try {
      const motors = await getRegisteredMotors(user.id);
      setRegisteredMotors(motors);
    } catch (error) {
      console.error("Failed to load registered motors:", error);
    } finally {
      setLoadingMotors(false);
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
            } else {
              Alert.alert("Error", "Failed to unlink motor.");
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
    
    // Prefer real serial number from telemetry over Bluetooth MAC address
    const rawSerial = motor.serialNumber;
    const tillerSerial = telemetry?.tillerSerialNumber;
    const isBluetoothAddress = rawSerial?.includes(':');
    
    // Use tiller serial if motor serial looks like a Bluetooth address
    const serialNumber = (isBluetoothAddress && tillerSerial) ? tillerSerial : rawSerial;
    
    console.log("[SettingsScreen] Linking motor:", { rawSerial, tillerSerial, isBluetoothAddress, serialNumber });
    
    // Validate we have a real serial number
    if (!serialNumber || serialNumber.includes(':')) {
      Alert.alert(
        "Waiting for Motor Identity",
        "The motor hasn't sent its serial number yet. Please wait a few seconds and try again.",
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
        Alert.alert("Success", `Anti-theft protection enabled for motor ${serialNumber}.`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Registration Failed", result.error || "Failed to enable anti-theft protection.");
      }
    } catch (error: any) {
      console.error("[SettingsScreen] Error linking motor:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message || "An error occurred while linking the motor.");
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
    Alert.alert("Disconnected", "Your outboard motor has been disconnected successfully.");
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
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

  const handleDataSharingToggle = (value: boolean) => {
    setAnonymousDataSharing(value);
  };

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing["4xl"],
        paddingHorizontal: Spacing.screenPadding,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
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
        <SettingsSection title="Registered Outboards">
          {loadingMotors ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
                Loading...
              </ThemedText>
            </View>
          ) : registeredMotors.length > 0 ? (
            <>
              {registeredMotors.map((registeredMotor, index) => (
                <SettingsRow
                  key={`${registeredMotor.serialNumber}-${index}`}
                  icon="anchor"
                  title={registeredMotor.name || registeredMotor.serialNumber}
                  subtitle={registeredMotor.name ? `S/N: ${registeredMotor.serialNumber}` : "Registered to your account"}
                  onPress={() => {
                    if (motor?.isConnected && motor.serialNumber === registeredMotor.serialNumber) {
                      handleRemoveMotor(registeredMotor.serialNumber);
                    } else {
                      Alert.alert(
                        "Connect to Unlink",
                        "You must be connected to this outboard via Bluetooth to unlink it from your account."
                      );
                    }
                  }}
                  iconColor={BladeColors.accent}
                />
              ))}
            </>
          ) : (
            <View style={styles.emptyRegisteredContainer}>
              <Feather name="anchor" size={24} color={theme.textTertiary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
                No outboards registered yet.{"\n"}Connect via Bluetooth to register.
              </ThemedText>
            </View>
          )}
        </SettingsSection>
      ) : null}

      {motor?.isConnected ? (
        <SettingsSection title="Connected Outboard">
          <View style={[styles.motorCard, { backgroundColor: theme.surfaceElevated }]}>
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.motorImage}
              resizeMode="contain"
            />
            <View style={styles.motorInfo}>
              <ThemedText type="h3">Blade Halo</ThemedText>
              <ThemedText type="mono" style={{ color: theme.textSecondary, marginTop: 4 }}>
                S/N: {telemetry?.tillerSerialNumber || motor.serialNumber}
              </ThemedText>
              <View style={styles.motorBadges}>
                <View style={[styles.badge, { backgroundColor: BladeColors.success + "20" }]}>
                  <View style={[styles.badgeDot, { backgroundColor: BladeColors.success }]} />
                  <ThemedText type="caption" style={{ color: BladeColors.success }}>
                    Connected
                  </ThemedText>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.primary + "20" }]}>
                  <ThemedText type="caption" style={{ color: theme.primary }}>
                    v{telemetry?.tillerFirmwareVersion || motor.firmwareVersion || "1.0.0"}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
          {isGuestMode ? (
            <SettingsRow
              icon="shield"
              title="Anti-Theft Protection"
              subtitle="Sign in to enable anti-theft protection"
              showChevron={false}
              iconColor={theme.textTertiary}
            />
          ) : isConnectedMotorRegistered ? (
            <SettingsRow
              icon="shield"
              title="Anti-Theft Protection"
              subtitle="Linked to your account - Tap to unlink"
              onPress={handleUnlinkConnectedMotor}
              iconColor={BladeColors.success}
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
            style={[styles.emptyMotorCard, { backgroundColor: theme.surfaceElevated }]}
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
            <ThemedText type="h4" style={styles.emptyTitle}>No Outboard Paired</ThemedText>
            <ThemedText type="small" style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
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
          <ThemedText type="caption" style={{ color: theme.textTertiary }}>
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
        <View style={[styles.oemBadge, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
          <Feather name="anchor" size={16} color={theme.textTertiary} />
          <View style={styles.oemBadgeText}>
            <ThemedText type="caption" style={[styles.oemTitle, { color: theme.textSecondary }]}>
              BLADE MARINE TECHNOLOGIES LTD
            </ThemedText>
            <ThemedText type="caption" style={[styles.oemSubtitle, { color: theme.textTertiary }]}>
              Electric Propulsion Systems
            </ThemedText>
          </View>
        </View>
        <View style={styles.certifications}>
          <View style={[styles.certBadge, { borderColor: theme.border }]}>
            <ThemedText type="caption" style={[styles.certText, { color: theme.textTertiary }]}>
              CE
            </ThemedText>
          </View>
          <View style={[styles.certBadge, { borderColor: theme.border }]}>
            <ThemedText type="caption" style={[styles.certText, { color: theme.textTertiary }]}>
              FCC
            </ThemedText>
          </View>
          <View style={[styles.certBadge, { borderColor: theme.border }]}>
            <ThemedText type="caption" style={[styles.certText, { color: theme.textTertiary }]}>
              IP67
            </ThemedText>
          </View>
          <View style={[styles.certBadge, { borderColor: theme.border }]}>
            <ThemedText type="caption" style={[styles.certText, { color: theme.textTertiary }]}>
              ISO 9001
            </ThemedText>
          </View>
        </View>
        <ThemedText type="caption" style={[styles.copyright, { color: theme.textTertiary }]}>
          {"\u00A9"} 2026 Blade Marine Technologies Ltd. All rights reserved.
        </ThemedText>
      </View>
    </ScrollView>
      
    <FirmwareUpdateModal
      visible={firmwareModalVisible}
      onClose={() => setFirmwareModalVisible(false)}
    />

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
    gap: Spacing.sm,
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
});
