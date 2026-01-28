import React from "react";
import { StyleSheet, View, Dimensions } from "react-native";
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
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { Spacing, Shadows, BladeColors } from "@/constants/theme";

interface FloatingActionButtonProps {
  isConnected: boolean;
  isScanning?: boolean;
  onPress: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FAB_SIZE = Spacing.fabSize;
const FAB_OFFSET = Spacing.fabOffset;

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
};

export function FloatingActionButton({
  isConnected,
  isScanning,
  onPress,
}: FloatingActionButtonProps) {
  const scale = useSharedValue(1);
  const pulse = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);
  const isDragging = useSharedValue(false);

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

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const triggerPress = () => {
    onPress();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextX.value = translateX.value;
      contextY.value = translateY.value;
      isDragging.value = true;
      scale.value = withSpring(1.1, springConfig);
    })
    .onUpdate((event) => {
      const newX = contextX.value + event.translationX;
      const newY = contextY.value + event.translationY;
      
      const minX = -(SCREEN_WIDTH - FAB_SIZE - FAB_OFFSET * 2);
      const maxX = 0;
      const minY = -(SCREEN_HEIGHT - FAB_SIZE - FAB_OFFSET * 2 - 100);
      const maxY = 0;
      
      translateX.value = Math.max(minX, Math.min(maxX, newX));
      translateY.value = Math.max(minY, Math.min(maxY, newY));
    })
    .onEnd(() => {
      isDragging.value = false;
      scale.value = withSpring(1, springConfig);
      runOnJS(triggerHaptic)();
    });

  const tapGesture = Gesture.Tap()
    .onStart(() => {
      scale.value = withSpring(0.95, springConfig);
    })
    .onEnd(() => {
      scale.value = withSpring(1, springConfig);
      runOnJS(triggerHaptic)();
      runOnJS(triggerPress)();
    });

  const composedGestures = Gesture.Exclusive(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value * pulse.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGestures}>
      <Animated.View
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
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: FAB_OFFSET,
    right: FAB_OFFSET,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
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
