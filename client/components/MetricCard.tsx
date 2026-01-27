import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";

interface MetricCardProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  badge?: string;
  badgeColor?: string;
  style?: ViewStyle;
  iconColor?: string;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
};

export function MetricCard({
  icon,
  label,
  value,
  unit,
  trend,
  badge,
  badgeColor,
  style,
  iconColor,
}: MetricCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getTrendIcon = () => {
    switch (trend) {
      case "up":
        return "trending-up";
      case "down":
        return "trending-down";
      default:
        return null;
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case "up":
        return BladeColors.success;
      case "down":
        return BladeColors.error;
      default:
        return theme.textSecondary;
    }
  };

  const trendIcon = getTrendIcon();

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: theme.surface },
        style,
        animatedStyle,
      ]}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Feather
            name={icon}
            size={20}
            color={iconColor || BladeColors.primary}
          />
        </View>
        {badge ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: badgeColor || BladeColors.accent },
            ]}
          >
            <ThemedText type="caption" style={styles.badgeText}>
              {badge}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {label}
        </ThemedText>
        <View style={styles.valueRow}>
          <ThemedText type="hero" style={styles.value}>
            {value}
          </ThemedText>
          {unit ? (
            <ThemedText
              type="body"
              style={[styles.unit, { color: theme.textSecondary }]}
            >
              {unit}
            </ThemedText>
          ) : null}
          {trendIcon ? (
            <Feather
              name={trendIcon}
              size={16}
              color={getTrendColor()}
              style={styles.trendIcon}
            />
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 140,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
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
  content: {
    flex: 1,
    justifyContent: "flex-end",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Spacing.xs,
  },
  value: {
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    marginLeft: Spacing.xs,
    marginBottom: 4,
  },
  trendIcon: {
    marginLeft: Spacing.sm,
    marginBottom: 8,
  },
});
