import React, { ReactNode } from "react";
import { StyleSheet, ViewStyle, StyleProp } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

interface AnimatedPressableProps {
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hapticFeedback?: "light" | "medium" | "heavy" | "selection" | "none";
  scaleDown?: number;
}

const springConfig = {
  damping: 15,
  mass: 0.4,
  stiffness: 200,
  overshootClamping: false,
};

const quickSpring = {
  damping: 20,
  mass: 0.3,
  stiffness: 300,
  overshootClamping: true,
};

export function AnimatedPressable({
  onPress,
  onLongPress,
  children,
  style,
  disabled = false,
  hapticFeedback = "light",
  scaleDown = 0.97,
}: AnimatedPressableProps) {
  const pressed = useSharedValue(0);
  const longPressTriggered = useSharedValue(false);

  const triggerHaptic = (type: typeof hapticFeedback) => {
    "worklet";
    if (type === "none") return;
    
    runOnJS(() => {
      switch (type) {
        case "light":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case "medium":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case "heavy":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case "selection":
          Haptics.selectionAsync();
          break;
      }
    })();
  };

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      pressed.value = withSpring(1, quickSpring);
    })
    .onEnd(() => {
      if (onPress && !longPressTriggered.value) {
        triggerHaptic(hapticFeedback);
        runOnJS(onPress)();
      }
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, springConfig);
      longPressTriggered.value = false;
    });

  const longPress = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(500)
    .onStart(() => {
      longPressTriggered.value = true;
      triggerHaptic("medium");
      if (onLongPress) {
        runOnJS(onLongPress)();
      }
    });

  const composed = Gesture.Simultaneous(tap, longPress);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      pressed.value,
      [0, 1],
      [1, scaleDown],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      pressed.value,
      [0, 1],
      [1, 0.9],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[style, animatedStyle, disabled && styles.disabled]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
});
