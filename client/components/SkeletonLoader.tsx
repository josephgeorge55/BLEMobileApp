import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { BorderRadius } from "@/constants/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = BorderRadius.xs,
  style,
}: SkeletonProps) {
  const { theme } = useTheme();
  const shimmer = useSharedValue(0);

  React.useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200 }),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.4, 0.7, 0.4]),
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: theme.backgroundTertiary,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function MetricCardSkeleton() {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: theme.surface },
      ]}
    >
      <Skeleton width={40} height={40} borderRadius={BorderRadius.sm} />
      <View style={styles.metricContent}>
        <Skeleton width={60} height={14} />
        <Skeleton width={80} height={32} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function FirmwareCardSkeleton() {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.firmwareCard,
        { backgroundColor: theme.surface },
      ]}
    >
      <View style={styles.firmwareHeader}>
        <Skeleton width={80} height={24} />
        <Skeleton width={60} height={20} />
      </View>
      <Skeleton width="100%" height={14} style={{ marginTop: 16 }} />
      <Skeleton width="70%" height={14} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {},
  metricCard: {
    flex: 1,
    minHeight: 140,
    padding: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  metricContent: {
    flex: 1,
    justifyContent: "flex-end",
    marginTop: 12,
  },
  firmwareCard: {
    padding: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    marginBottom: 12,
  },
  firmwareHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
