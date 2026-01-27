import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BladeColors, Typography } from "@/constants/theme";

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
  accentGlow?: boolean;
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
  accentGlow = false,
}: MetricCardProps) {
  const { theme, isDark } = useTheme();
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
  const effectiveIconColor = iconColor || theme.primary;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: theme.surfaceElevated,
          borderColor: isDark ? theme.border : "transparent",
        },
        style,
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={
          isDark
            ? [theme.cardGradientStart, theme.cardGradientEnd]
            : [theme.cardGradientStart, theme.cardGradientEnd]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: effectiveIconColor + "15",
              borderColor: effectiveIconColor + "20",
            },
          ]}
        >
          <Feather name={icon} size={22} color={effectiveIconColor} />
        </View>
        {badge ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: badgeColor || BladeColors.accent,
              },
            ]}
          >
            <ThemedText type="caption" style={styles.badgeText}>
              {badge}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <ThemedText
          type="caption"
          style={[styles.label, { color: theme.textTertiary }]}
        >
          {label.toUpperCase()}
        </ThemedText>
        <View style={styles.valueRow}>
          <ThemedText style={[styles.value, { color: theme.text }]}>
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
            <View
              style={[
                styles.trendContainer,
                { backgroundColor: getTrendColor() + "15" },
              ]}
            >
              <Feather name={trendIcon} size={14} color={getTrendColor()} />
            </View>
          ) : null}
        </View>
      </View>

      {accentGlow ? (
        <View
          style={[styles.glowBar, { backgroundColor: effectiveIconColor }]}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 150,
    padding: Spacing.cardPadding,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.xs,
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
  },
  label: {
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  value: {
    ...Typography.metric,
    fontVariant: ["tabular-nums"],
  },
  unit: {
    marginLeft: Spacing.sm,
    marginBottom: 6,
    fontWeight: "500",
  },
  trendContainer: {
    marginLeft: Spacing.sm,
    marginBottom: 8,
    padding: 4,
    borderRadius: 6,
  },
  glowBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
});
