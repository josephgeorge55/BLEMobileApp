import React, { useCallback } from "react";
import { StyleSheet, View, RefreshControl, RefreshControlProps, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { BladeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

interface PullToRefreshProps extends Omit<RefreshControlProps, 'onRefresh'> {
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
}

export function PullToRefresh({ 
  onRefresh, 
  refreshing, 
  ...props 
}: PullToRefreshProps) {
  const { isDark } = useTheme();
  
  const handleRefresh = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await onRefresh();
  }, [onRefresh]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={BladeColors.accent}
      colors={[BladeColors.accent, BladeColors.marine, BladeColors.primary]}
      progressBackgroundColor={isDark ? "#1E293B" : "#FFFFFF"}
      title={refreshing ? "Refreshing..." : "Pull to refresh"}
      titleColor={isDark ? "#94A3B8" : "#64748B"}
      {...props}
    />
  );
}
