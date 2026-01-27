import React from "react";
import { StyleSheet, View, ScrollView, Linking, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { useSettings } from "@/context/SettingsContext";
import { Spacing, BladeColors } from "@/constants/theme";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { motor, disconnectMotor } = useMotor();
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

  const handleOpenWebsite = async () => {
    await WebBrowser.openBrowserAsync("https://bladeoutboards.com");
  };

  const handleDataSharingToggle = (value: boolean) => {
    setAnonymousDataSharing(value);
  };

  const appVersion = Constants.expoConfig?.version || "1.0.0";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      {motor ? (
        <SettingsSection title="Connected Device">
          <SettingsRow
            icon="bluetooth"
            title={motor.name || "Blade Outboard"}
            subtitle={motor.serialNumber}
            showChevron={false}
          />
          <SettingsRow
            icon="cpu"
            title="Firmware Version"
            value={motor.firmwareVersion || "--"}
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
        <SettingsSection title="Device">
          <SettingsRow
            icon="bluetooth"
            title="No Motor Connected"
            subtitle="Tap the Bluetooth button to connect"
            showChevron={false}
          />
        </SettingsSection>
      )}

      <SettingsSection title="Notifications">
        <SettingsRow
          icon="tool"
          title="Maintenance Reminders"
          subtitle="Service intervals and maintenance alerts"
          isToggle
          toggleValue={notificationSettings.maintenance}
          onToggle={() => toggleNotification("maintenance")}
        />
        <SettingsRow
          icon="download-cloud"
          title="Firmware Updates"
          subtitle="New firmware releases for your motor"
          isToggle
          toggleValue={notificationSettings.firmware}
          onToggle={() => toggleNotification("firmware")}
        />
        <SettingsRow
          icon="bell"
          title="Announcements"
          subtitle="Product news and promotions"
          isToggle
          toggleValue={notificationSettings.announcements}
          onToggle={() => toggleNotification("announcements")}
        />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <SettingsRow
          icon="bar-chart-2"
          title="Anonymous Data Sharing"
          subtitle="Help improve Blade products by sharing anonymous usage data"
          isToggle
          toggleValue={anonymousDataSharing}
          onToggle={handleDataSharingToggle}
        />
        <View style={styles.privacyNote}>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            We never collect personal information. Data is used solely to
            improve product performance and reliability.
          </ThemedText>
        </View>
      </SettingsSection>

      <SettingsSection title="About">
        <SettingsRow
          icon="globe"
          title="Visit bladeoutboards.com"
          onPress={handleOpenWebsite}
        />
        <SettingsRow
          icon="info"
          title="App Version"
          value={appVersion}
          showChevron={false}
        />
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  privacyNote: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
});
