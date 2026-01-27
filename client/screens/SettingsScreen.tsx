import React from "react";
import { StyleSheet, View, ScrollView, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useSettings } from "@/context/SettingsContext";
import { useUser } from "@/context/UserContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";
const BUILD_NUMBER = "2026.01.27";
const FIRMWARE_PROTOCOL = "BLE 5.0";
const HARDWARE_REV = "HW-R3";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();
  const { motor, disconnectMotor } = useMotor();
  const { user, logout } = useUser();
  const {
    anonymousDataSharing,
    notificationSettings,
    setAnonymousDataSharing,
    toggleNotification,
  } = useSettings();

  const handleDisconnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    disconnectMotor();
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

      {motor ? (
        <SettingsSection title="Connected Outboard">
          <View style={[styles.motorCard, { backgroundColor: theme.surfaceElevated }]}>
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.motorImage}
              resizeMode="contain"
            />
            <View style={styles.motorInfo}>
              <ThemedText type="h3">{motor.name || "Blade Outboard"}</ThemedText>
              <ThemedText type="mono" style={{ color: theme.textSecondary, marginTop: 4 }}>
                {motor.serialNumber}
              </ThemedText>
              <View style={styles.motorBadges}>
                <View style={[styles.badge, { backgroundColor: BladeColors.success + "20" }]}>
                  <View style={[styles.badgeDot, { backgroundColor: BladeColors.success }]} />
                  <ThemedText type="caption" style={{ color: BladeColors.success }}>
                    {motor.isConnected ? "Connected" : "Paired"}
                  </ThemedText>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.primary + "20" }]}>
                  <ThemedText type="caption" style={{ color: theme.primary }}>
                    v{motor.firmwareVersion || "1.0.0"}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
          <SettingsRow
            icon="shield"
            title="Anti-Theft Protection"
            subtitle="Your outboard is linked to your account"
            showChevron={false}
          />
          <SettingsRow
            icon="power"
            title="Disconnect Motor"
            onPress={handleDisconnect}
            destructive
            showChevron={false}
          />
        </SettingsSection>
      ) : (
        <SettingsSection title="Outboard">
          <View style={[styles.emptyMotorCard, { backgroundColor: theme.surfaceElevated }]}>
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.emptyMotorImage}
              resizeMode="contain"
            />
            <ThemedText type="h4" style={styles.emptyTitle}>No Outboard Paired</ThemedText>
            <ThemedText type="small" style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Scan for nearby Blade outboards to pair
            </ThemedText>
          </View>
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
});
