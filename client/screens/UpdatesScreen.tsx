import React, { useState } from "react";
import { StyleSheet, View, ScrollView, RefreshControl, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { FirmwareCard } from "@/components/FirmwareCard";
import { EmptyState } from "@/components/EmptyState";
import { FirmwareCardSkeleton } from "@/components/SkeletonLoader";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";

interface FirmwareVersion {
  id: string;
  version: string;
  releaseNotes: string | null;
  releaseDate: string | null;
  isMandatory: boolean | null;
  fileSize: number | null;
}

export default function UpdatesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { motor, telemetry } = useMotor();

  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(
    null,
  );
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const serialNumber = motor?.serialNumber;
  const currentVersion = telemetry?.tillerFirmwareVersion || motor?.firmwareVersion || "1.0.0";

  const {
    data: firmwareData,
    isLoading,
    refetch,
  } = useQuery<{ available: FirmwareVersion[]; current: string }>({
    queryKey: ["/api/motor", serialNumber, "firmware"],
    enabled: !!serialNumber,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDownload = async (version: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDownloadingVersion(version);
    setDownloadProgress(0);

    for (let i = 0; i <= 100; i += 5) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setDownloadProgress(i);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDownloadingVersion(null);
    setDownloadProgress(0);
  };

  if (!motor) {
    return (
      <View style={[styles.container, { backgroundColor: "#F2F2F7" }]}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + Spacing.md,
            paddingBottom: tabBarHeight + Spacing["3xl"],
            paddingHorizontal: Spacing.lg,
            flexGrow: 1,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        >
          <Animated.View entering={FadeInUp.duration(350).springify()}>
            <View style={styles.heroTile}>
              <View style={styles.heroIconRow}>
                <View style={styles.heroIconCircle}>
                  <Feather name="download-cloud" size={24} color={BladeColors.accent} />
                </View>
                <View style={styles.heroTextGroup}>
                  <ThemedText type="h2" style={styles.heroTitle}>
                    OTA Updates
                  </ThemedText>
                  <ThemedText type="small" style={styles.heroSubtitle}>
                    Over-The-Air Firmware
                  </ThemedText>
                </View>
              </View>
            </View>
          </Animated.View>
          <View style={styles.noMotorCenter}>
            <EmptyState
              image={require("../../assets/images/empty-dashboard.png")}
              title="No Motor Connected"
              description="Connect to your Blade outboard to check for firmware updates."
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  const availableUpdates = firmwareData?.available ?? [];
  const hasUpdates = availableUpdates.length > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: "#F2F2F7" }]}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.md,
        paddingBottom: tabBarHeight + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={BladeColors.primary}
        />
      }
    >
      <Animated.View entering={FadeInUp.duration(350).springify()}>
        <View style={styles.heroTile}>
          <View style={styles.heroIconRow}>
            <View style={styles.heroIconCircle}>
              <Feather name="download-cloud" size={24} color={BladeColors.accent} />
            </View>
            <View style={styles.heroTextGroup}>
              <ThemedText type="h2" style={styles.heroTitle}>
                OTA Updates
              </ThemedText>
              <ThemedText type="small" style={styles.heroSubtitle}>
                Over-The-Air Firmware
              </ThemedText>
            </View>
          </View>
          <View style={styles.heroDivider} />
          <ThemedText type="small" style={styles.heroDescription}>
            Firmware updates are delivered wirelessly over Bluetooth. Connect your Blade Halo outboard, and updates will be flashed directly to the motor controller — no cables or laptop needed.
          </ThemedText>
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(100).duration(300)}>
        <ThemedText
          type="caption"
          style={{ color: "#8E8E93", marginBottom: Spacing.sm, marginTop: Spacing.md }}
        >
          INSTALLED FIRMWARE
        </ThemedText>
        <FirmwareCard
          version={currentVersion}
          isCurrent
          releaseDate={new Date()}
        />
      </Animated.View>

      {isLoading ? (
        <View style={styles.loadingSection}>
          <ThemedText
            type="caption"
            style={{ color: "#8E8E93", marginBottom: Spacing.sm }}
          >
            CHECKING FOR UPDATES...
          </ThemedText>
          <FirmwareCardSkeleton />
        </View>
      ) : hasUpdates ? (
        <Animated.View
          entering={FadeIn.delay(200).duration(300)}
          style={styles.updatesSection}
        >
          <ThemedText
            type="caption"
            style={{ color: "#8E8E93", marginBottom: Spacing.sm }}
          >
            AVAILABLE UPDATES
          </ThemedText>
          {availableUpdates.map((fw) => (
            <FirmwareCard
              key={fw.id}
              version={fw.version}
              releaseNotes={fw.releaseNotes ?? undefined}
              releaseDate={fw.releaseDate ? new Date(fw.releaseDate) : undefined}
              isMandatory={fw.isMandatory ?? false}
              isDownloading={downloadingVersion === fw.version}
              downloadProgress={
                downloadingVersion === fw.version ? downloadProgress : 0
              }
              onDownload={() => handleDownload(fw.version)}
            />
          ))}
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.delay(200).duration(300)}
          style={styles.upToDateSection}
        >
          <View style={styles.upToDateCard}>
            <View style={styles.checkCircle}>
              <Feather name="check" size={32} color="#FFFFFF" />
            </View>
            <ThemedText type="h3" style={styles.upToDateTitle}>
              You're All Set
            </ThemedText>
            <ThemedText type="body" style={styles.upToDateText}>
              Your Blade Halo is running the latest firmware. No action needed right now.
            </ThemedText>
          </View>

          <ThemedText
            type="caption"
            style={{ color: "#8E8E93", marginBottom: Spacing.sm, marginTop: Spacing.xl }}
          >
            ABOUT OTA UPDATES
          </ThemedText>
          <View style={styles.aboutCard}>
            <View style={styles.aboutRow}>
              <View style={styles.aboutIconWrap}>
                <Feather name="zap" size={16} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={styles.aboutRowTitle}>Performance</ThemedText>
                <ThemedText type="small" style={styles.aboutRowDesc}>
                  Motor efficiency, throttle response, and power curve optimisations.
                </ThemedText>
              </View>
            </View>
            <View style={styles.aboutSeparator} />
            <View style={styles.aboutRow}>
              <View style={styles.aboutIconWrap}>
                <Feather name="shield" size={16} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={styles.aboutRowTitle}>Safety</ThemedText>
                <ThemedText type="small" style={styles.aboutRowDesc}>
                  Temperature protection, battery management, and fault detection improvements.
                </ThemedText>
              </View>
            </View>
            <View style={styles.aboutSeparator} />
            <View style={styles.aboutRow}>
              <View style={styles.aboutIconWrap}>
                <Feather name="star" size={16} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={styles.aboutRowTitle}>New Features</ThemedText>
                <ThemedText type="small" style={styles.aboutRowDesc}>
                  New drive modes, telemetry data, and connectivity enhancements.
                </ThemedText>
              </View>
            </View>
            <View style={styles.aboutSeparator} />
            <View style={styles.aboutRow}>
              <View style={styles.aboutIconWrap}>
                <Feather name="bluetooth" size={16} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={styles.aboutRowTitle}>Wireless Delivery</ThemedText>
                <ThemedText type="small" style={styles.aboutRowDesc}>
                  Updates are sent from your phone to the motor over Bluetooth — no cables required.
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={styles.pullHint}>
            <Feather name="refresh-cw" size={14} color="rgba(255,255,255,0.3)" />
            <ThemedText type="caption" style={styles.pullHintText}>
              Pull down to check for new updates
            </ThemedText>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const DARK_TILE = "rgba(44,44,46,0.92)";
const TILE_BORDER = "rgba(255,255,255,0.08)";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  noMotorCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heroTile: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: Spacing.xl,
    marginBottom: Spacing.sm,
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
  heroDivider: {
    height: 1,
    backgroundColor: TILE_BORDER,
    marginVertical: Spacing.lg,
  },
  heroDescription: {
    color: "rgba(255,255,255,0.45)",
    lineHeight: 20,
  },
  loadingSection: {
    marginTop: Spacing["2xl"],
  },
  updatesSection: {
    marginTop: Spacing["2xl"],
  },
  upToDateSection: {
    marginTop: Spacing.lg,
  },
  upToDateCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: Spacing.xl,
    alignItems: "center",
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BladeColors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  upToDateTitle: {
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  upToDateText: {
    textAlign: "center",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 22,
  },
  aboutCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: Spacing.lg,
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  aboutIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(164,208,139,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  aboutRowTitle: {
    color: "#FFFFFF",
    fontWeight: "600",
    marginBottom: 3,
  },
  aboutRowDesc: {
    color: "rgba(255,255,255,0.45)",
    lineHeight: 19,
  },
  aboutSeparator: {
    height: 1,
    backgroundColor: TILE_BORDER,
    marginVertical: Spacing.xs,
  },
  pullHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  pullHintText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
  },
});
