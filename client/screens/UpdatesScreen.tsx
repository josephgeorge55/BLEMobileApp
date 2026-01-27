import React, { useState } from "react";
import { StyleSheet, View, ScrollView, RefreshControl, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { FirmwareCard } from "@/components/FirmwareCard";
import { EmptyState } from "@/components/EmptyState";
import { FirmwareCardSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BladeColors } from "@/constants/theme";
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
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View
          style={[
            styles.emptyContainer,
            {
              paddingTop: headerHeight + Spacing.xl,
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
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
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
          style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}
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
            style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}
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
            style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}
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
          <Image
            source={require("../../assets/images/firmware-success.png")}
            style={styles.successImage}
            resizeMode="contain"
          />
          <ThemedText type="h3" style={styles.upToDateTitle}>
            Up to Date
          </ThemedText>
          <ThemedText
            type="body"
            style={[styles.upToDateText, { color: theme.textSecondary }]}
          >
            Your Blade outboard is running the latest firmware version.
          </ThemedText>
        </Animated.View>
      )}
    </ScrollView>
  );
}

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
    marginTop: Spacing["4xl"],
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  successImage: {
    width: 120,
    height: 120,
    marginBottom: Spacing["2xl"],
  },
  upToDateTitle: {
    marginBottom: Spacing.sm,
    color: BladeColors.success,
  },
  upToDateText: {
    textAlign: "center",
  },
});
