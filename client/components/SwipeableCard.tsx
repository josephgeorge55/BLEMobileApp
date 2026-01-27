import React, { ReactNode } from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { BladeColors, Spacing, BorderRadius } from "@/constants/theme";

interface SwipeableCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftActionIcon?: keyof typeof Feather.glyphMap;
  rightActionIcon?: keyof typeof Feather.glyphMap;
  leftActionColor?: string;
  rightActionColor?: string;
  swipeThreshold?: number;
}

const springConfig = {
  damping: 20,
  mass: 0.4,
  stiffness: 180,
  overshootClamping: false,
};

export function SwipeableCard({
  children,
  style,
  onSwipeLeft,
  onSwipeRight,
  leftActionIcon = "trash-2",
  rightActionIcon = "check",
  leftActionColor = BladeColors.error,
  rightActionColor = BladeColors.success,
  swipeThreshold = 80,
}: SwipeableCardProps) {
  const { theme } = useTheme();
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      contextX.value = translateX.value;
    })
    .onUpdate((event) => {
      const newValue = contextX.value + event.translationX;
      const maxTranslate = 120;
      translateX.value = Math.max(-maxTranslate, Math.min(maxTranslate, newValue));
    })
    .onEnd((event) => {
      if (event.translationX < -swipeThreshold && onSwipeLeft) {
        runOnJS(triggerHaptic)();
        runOnJS(onSwipeLeft)();
      } else if (event.translationX > swipeThreshold && onSwipeRight) {
        runOnJS(triggerHaptic)();
        runOnJS(onSwipeRight)();
      }
      translateX.value = withSpring(0, springConfig);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, swipeThreshold],
      [0, 1],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      translateX.value,
      [0, swipeThreshold],
      [0.5, 1],
      Extrapolation.CLAMP
    );
    return { opacity, transform: [{ scale }] };
  });

  const rightActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-swipeThreshold, 0],
      [1, 0],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      translateX.value,
      [-swipeThreshold, 0],
      [1, 0.5],
      Extrapolation.CLAMP
    );
    return { opacity, transform: [{ scale }] };
  });

  return (
    <View style={styles.container}>
      <View style={styles.actionsContainer}>
        <Animated.View
          style={[
            styles.actionLeft,
            { backgroundColor: rightActionColor },
            leftActionStyle,
          ]}
        >
          <Feather name={rightActionIcon} size={24} color="#FFFFFF" />
        </Animated.View>
        <Animated.View
          style={[
            styles.actionRight,
            { backgroundColor: leftActionColor },
            rightActionStyle,
          ]}
        >
          <Feather name={leftActionIcon} size={24} color="#FFFFFF" />
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, style, cardStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  actionsContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  actionLeft: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRight: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
});
