import React, { useEffect, useCallback } from "react";
import { StyleSheet, View, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurView } from "expo-blur";

import { ThemedText } from "@/components/ThemedText";
import { BladeColors, BorderRadius, Spacing } from "@/constants/theme";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss: () => void;
}

const springConfig = {
  damping: 18,
  mass: 0.8,
  stiffness: 200,
};

export function Toast({
  visible,
  message,
  type = "info",
  duration = 3000,
  onDismiss,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    translateY.value = withSpring(-100, springConfig);
    opacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onDismiss)();
    });
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(
        type === "success"
          ? Haptics.NotificationFeedbackType.Success
          : type === "error"
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Warning
      );
      translateY.value = withSpring(0, springConfig);
      opacity.value = withTiming(1, { duration: 200 });

      const timer = setTimeout(dismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, type, dismiss]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY < 0) {
        translateY.value = event.translationY * 0.5;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -30 || event.velocityY < -500) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withSpring(0, springConfig);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const getConfig = () => {
    switch (type) {
      case "success":
        return { icon: "check-circle" as const, color: BladeColors.success, bg: BladeColors.success + "15" };
      case "error":
        return { icon: "alert-circle" as const, color: BladeColors.error, bg: BladeColors.error + "15" };
      case "warning":
        return { icon: "alert-triangle" as const, color: BladeColors.warning, bg: BladeColors.warning + "15" };
      default:
        return { icon: "info" as const, color: BladeColors.marine, bg: BladeColors.marine + "15" };
    }
  };

  const config = getConfig();

  if (!visible) return null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.container,
          { top: insets.top + Spacing.md },
          animatedStyle,
        ]}
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
            <ToastContent config={config} message={message} onDismiss={dismiss} />
          </BlurView>
        ) : (
          <View style={[styles.solidContainer, { backgroundColor: "#1A2530" }]}>
            <ToastContent config={config} message={message} onDismiss={dismiss} />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function ToastContent({
  config,
  message,
  onDismiss,
}: {
  config: { icon: keyof typeof Feather.glyphMap; color: string; bg: string };
  message: string;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.content}>
      <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
        <Feather name={config.icon} size={18} color={config.color} />
      </View>
      <ThemedText type="body" style={styles.message} numberOfLines={2}>
        {message}
      </ThemedText>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
      >
        <Feather name="x" size={16} color="#8A9BA8" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 9999,
  },
  blurContainer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  solidContainer: {
    borderRadius: BorderRadius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
    borderRadius: 12,
  },
  closeButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
});
