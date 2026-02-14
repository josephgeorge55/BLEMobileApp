import React from "react";
import { StyleSheet, View, ViewStyle, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BladeColors, Typography, Shadows, Gradients } from "@/constants/theme";

const supportsGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

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
  compact?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

const springConfig = {
  damping: 16,
  mass: 0.4,
  stiffness: 220,
  overshootClamping: false,
};

const quickSpring = {
  damping: 22,
  mass: 0.3,
  stiffness: 300,
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
  compact = false,
  onPress,
  onLongPress,
}: MetricCardProps) {
  const { theme, isDark } = useTheme();
  const pressed = useSharedValue(0);
  const cardRotateX = useSharedValue(0);
  const cardRotateY = useSharedValue(0);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const tap = Gesture.Tap()
    .enabled(!!onPress)
    .onBegin(() => {
      pressed.value = withSpring(1, quickSpring);
    })
    .onEnd(() => {
      runOnJS(triggerHaptic)();
      if (onPress) {
        runOnJS(onPress)();
      }
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, springConfig);
    });

  const longPress = Gesture.LongPress()
    .enabled(!!onLongPress)
    .minDuration(500)
    .onStart(() => {
      runOnJS(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      })();
      if (onLongPress) {
        runOnJS(onLongPress)();
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      const maxTilt = 8;
      cardRotateY.value = interpolate(
        event.translationX,
        [-50, 50],
        [-maxTilt, maxTilt],
        Extrapolation.CLAMP
      );
      cardRotateX.value = interpolate(
        event.translationY,
        [-50, 50],
        [maxTilt, -maxTilt],
        Extrapolation.CLAMP
      );
    })
    .onEnd(() => {
      cardRotateX.value = withSpring(0, springConfig);
      cardRotateY.value = withSpring(0, springConfig);
    });

  const composed = Gesture.Simultaneous(tap, longPress, pan);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      pressed.value,
      [0, 1],
      [1, 0.96],
      Extrapolation.CLAMP
    );
    
    return {
      transform: [
        { perspective: 800 },
        { scale },
        { rotateX: `${cardRotateX.value}deg` },
        { rotateY: `${cardRotateY.value}deg` },
      ],
    };
  });

  const glowAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      pressed.value,
      [0, 1],
      [1, 0.6],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

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

  const darkCardBg = "rgba(44,44,46,0.92)";
  const lightText = "#FFFFFF";
  const grayText = "rgba(255,255,255,0.55)";

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.card,
          Shadows.card,
          style,
          animatedStyle,
        ]}
      >
        {supportsGlass ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor="rgba(44,44,46,0.85)"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <LinearGradient
            colors={Gradients.cardPremium as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.header}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: effectiveIconColor + "25",
                borderColor: effectiveIconColor + "40",
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
            style={[styles.label, { color: grayText }]}
          >
            {label.toUpperCase()}
          </ThemedText>
          <View style={styles.valueRow}>
            <ThemedText style={[styles.value, compact && styles.valueCompact, { color: lightText }]}>
              {value}
            </ThemedText>
            {unit ? (
              <ThemedText
                type="body"
                style={[styles.unit, { color: grayText }]}
              >
                {unit}
              </ThemedText>
            ) : null}
            {trendIcon ? (
              <Animated.View
                style={[
                  styles.trendContainer,
                  { backgroundColor: getTrendColor() + "25" },
                ]}
              >
                <Feather name={trendIcon} size={14} color={getTrendColor()} />
              </Animated.View>
            ) : null}
          </View>
        </View>

        {accentGlow ? (
          <Animated.View
            style={[
              styles.glowBar,
              { backgroundColor: effectiveIconColor },
              glowAnimatedStyle,
            ]}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 150,
    padding: Spacing.cardPadding,
    borderRadius: BorderRadius.lg,
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
  valueCompact: {
    fontSize: 22,
    lineHeight: 28,
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
