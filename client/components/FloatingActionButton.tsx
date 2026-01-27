import React from "react";
import { StyleSheet, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  WithSpringConfig,
} from "react-native-reanimated";

import { Spacing, Shadows, BladeColors } from "@/constants/theme";

interface FloatingActionButtonProps {
  isConnected: boolean;
  isScanning?: boolean;
  onPress: () => void;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FloatingActionButton({
  isConnected,
  isScanning,
  onPress,
}: FloatingActionButtonProps) {
  const scale = useSharedValue(1);
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    if (isScanning) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isScanning]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulse.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.fab,
        {
          backgroundColor: isConnected
            ? BladeColors.accent
            : BladeColors.primary,
        },
        Shadows.fab,
        animatedStyle,
      ]}
      testID="fab-bluetooth"
    >
      <Feather
        name="bluetooth"
        size={24}
        color="#FFFFFF"
        style={isScanning ? styles.scanning : undefined}
      />
      <View
        style={[
          styles.statusDot,
          {
            backgroundColor: isConnected
              ? BladeColors.success
              : isScanning
                ? BladeColors.warning
                : BladeColors.offline,
          },
        ]}
      />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: Spacing.fabOffset,
    right: Spacing.fabOffset,
    width: Spacing.fabSize,
    height: Spacing.fabSize,
    borderRadius: Spacing.fabSize / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  scanning: {
    opacity: 0.8,
  },
});
