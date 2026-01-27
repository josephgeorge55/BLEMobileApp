import React, { useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";

interface FirmwareCardProps {
  version: string;
  releaseNotes?: string;
  releaseDate?: Date;
  isMandatory?: boolean;
  isCurrent?: boolean;
  isDownloading?: boolean;
  downloadProgress?: number;
  onDownload?: () => void;
}

export function FirmwareCard({
  version,
  releaseNotes,
  releaseDate,
  isMandatory,
  isCurrent,
  isDownloading,
  downloadProgress = 0,
  onDownload,
}: FirmwareCardProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleToggleExpand = () => {
    Haptics.selectionAsync();
    setExpanded(!expanded);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[
        styles.card,
        { backgroundColor: theme.surface },
        animatedStyle,
        isCurrent && styles.currentCard,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.versionContainer}>
          <ThemedText type="h3" style={styles.version}>
            v{version}
          </ThemedText>
          {isCurrent ? (
            <View
              style={[styles.badge, { backgroundColor: BladeColors.accent }]}
            >
              <ThemedText type="caption" style={styles.badgeText}>
                Current
              </ThemedText>
            </View>
          ) : isMandatory ? (
            <View style={[styles.badge, { backgroundColor: BladeColors.error }]}>
              <ThemedText type="caption" style={styles.badgeText}>
                Required
              </ThemedText>
            </View>
          ) : (
            <View
              style={[styles.badge, { backgroundColor: BladeColors.warning }]}
            >
              <ThemedText type="caption" style={styles.badgeText}>
                Optional
              </ThemedText>
            </View>
          )}
        </View>
        {releaseDate ? (
          <ThemedText
            type="caption"
            style={{ color: theme.textSecondary }}
          >
            {formatDate(releaseDate)}
          </ThemedText>
        ) : null}
      </View>

      {releaseNotes ? (
        <Pressable onPress={handleToggleExpand} style={styles.notesToggle}>
          <ThemedText type="small" style={{ color: BladeColors.primary }}>
            {expanded ? "Hide Release Notes" : "View Release Notes"}
          </ThemedText>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={BladeColors.primary}
          />
        </Pressable>
      ) : null}

      {expanded && releaseNotes ? (
        <View style={styles.notesContainer}>
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, lineHeight: 22 }}
          >
            {releaseNotes}
          </ThemedText>
        </View>
      ) : null}

      {isDownloading ? (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <ThemedText type="small">
              {downloadProgress < 50
                ? "Downloading..."
                : downloadProgress < 100
                  ? "Installing..."
                  : "Complete"}
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {downloadProgress}%
            </ThemedText>
          </View>
          <View style={[styles.progressBar, { backgroundColor: theme.backgroundSecondary }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: BladeColors.accent,
                  width: `${downloadProgress}%`,
                },
              ]}
            />
          </View>
        </View>
      ) : !isCurrent && onDownload ? (
        <View style={styles.actionContainer}>
          <Button onPress={onDownload}>
            <View style={styles.buttonContent}>
              <Feather
                name="download-cloud"
                size={18}
                color="#FFFFFF"
                style={{ marginRight: Spacing.sm }}
              />
              <ThemedText type="button" style={{ color: "#FFFFFF" }}>
                Download & Install
              </ThemedText>
            </View>
          </Button>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    marginBottom: Spacing.md,
  },
  currentCard: {
    borderColor: BladeColors.accent,
    borderWidth: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  versionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  version: {
    fontVariant: ["tabular-nums"],
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 10,
  },
  notesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  notesContainer: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: BorderRadius.xs,
  },
  progressContainer: {
    marginTop: Spacing.lg,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  actionContainer: {
    marginTop: Spacing.lg,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
