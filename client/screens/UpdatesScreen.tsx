import React, { useState } from "react";
import { StyleSheet, View, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { FirmwareCard } from "@/components/FirmwareCard";
import { EmptyState } from "@/components/EmptyState";
import { FirmwareCardSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

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
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { motor } = useMotor();

  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(
    null,
  );
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const serialNumber = motor?.serialNumber;
  const currentVersion = motor?.firmwareVersion || "1.0.0";

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
        <View
          style={[
            styles.emptyContainer,
            {
              paddingTop: Spacing.xl,
              paddingBottom: tabBarHeight + Spacing.xl,
            },
          ]}
        >
          <EmptyState
            image={require("../../assets/images/empty-dashboard.png")}
            title="No Motor Connected"
            description="Connect to your Blade outboard to check for firmware updates."
          />
        </View>
      </View>
    );
  }

  const availableUpdates = firmwareData?.available ?? [];
  const hasUpdates = availableUpdates.length > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: "#F2F2F7" }]}
      contentContainerStyle={{
        paddingTop: Spacing.xl,
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
      <Animated.View entering={FadeIn.duration(300)}>
        <ThemedText
          type="caption"
          style={{ color: "#8E8E93", marginBottom: Spacing.sm }}
        >
          CURRENT VERSION
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
          entering={FadeIn.delay(100).duration(300)}
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
          entering={FadeIn.delay(100).duration(300)}
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
              Your Blade outboard is running the latest firmware. No action needed right now.
            </ThemedText>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Feather name="shield" size={16} color={BladeColors.accent} />
              <ThemedText type="small" style={styles.infoText}>
                Firmware updates include performance improvements, safety patches, and new features for your motor.
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <Feather name="wifi" size={16} color={BladeColors.accent} />
              <ThemedText type="small" style={styles.infoText}>
                Updates are delivered wirelessly over Bluetooth when your motor is connected.
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <Feather name="refresh-cw" size={16} color={BladeColors.accent} />
              <ThemedText type="small" style={styles.infoText}>
                Pull down to check again, or we'll notify you when a new update is available.
              </ThemedText>
            </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingSection: {
    marginTop: Spacing["2xl"],
  },
  updatesSection: {
    marginTop: Spacing["2xl"],
  },
  upToDateSection: {
    marginTop: Spacing["2xl"],
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
  divider: {
    height: 1,
    backgroundColor: TILE_BORDER,
    alignSelf: "stretch",
    marginVertical: Spacing.xl,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoText: {
    color: "rgba(255,255,255,0.5)",
    flex: 1,
    lineHeight: 20,
  },
});
