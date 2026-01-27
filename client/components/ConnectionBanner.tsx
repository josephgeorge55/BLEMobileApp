import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, BladeColors, Gradients } from "@/constants/theme";

interface ConnectionBannerProps {
  isConnected: boolean;
  isConnecting?: boolean;
  motorName?: string;
  onPress?: () => void;
}

const springConfig = {
  damping: 16,
  mass: 0.4,
  stiffness: 200,
  overshootClamping: false,
};

export function ConnectionBanner({
  isConnected,
  isConnecting,
  motorName,
  onPress,
}: ConnectionBannerProps) {
  const pulseValue = useSharedValue(1);
  const pressed = useSharedValue(0);
  const translateX = useSharedValue(0);

  React.useEffect(() => {
    if (isConnecting) {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        true,
      );
    } else {
      pulseValue.value = withTiming(1, { duration: 200 });
    }
  }, [isConnecting]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseValue.value,
  }));

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const tap = Gesture.Tap()
    .enabled(!!onPress)
    .onBegin(() => {
      pressed.value = withSpring(1, springConfig);
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

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX * 0.3;
    })
    .onEnd(() => {
      translateX.value = withSpring(0, springConfig);
    });

  const composed = Gesture.Simultaneous(tap, pan);

  const bannerAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      pressed.value,
      [0, 1],
      [1, 0.98],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { scale },
        { translateX: translateX.value },
      ],
    };
  });

  const arrowAnimatedStyle = useAnimatedStyle(() => {
    const translateArrowX = interpolate(
      pressed.value,
      [0, 1],
      [0, 6],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      pressed.value,
      [0, 1],
      [0.8, 1],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ translateX: translateArrowX }],
      opacity,
    };
  });

  if (isConnected && !isConnecting) {
    return null;
  }

  const gradientColors = isConnecting
    ? Gradients.primary
    : [BladeColors.warning, "#D97706"];

  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      exiting={FadeOutUp.duration(200)}
    >
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.bannerWrapper, bannerAnimatedStyle]}>
          <LinearGradient
            colors={gradientColors as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
          <View style={styles.banner}>
            <Animated.View style={[styles.iconContainer, pulseStyle]}>
              <Feather
                name={isConnecting ? "bluetooth" : "alert-triangle"}
                size={20}
                color="#FFFFFF"
              />
            </Animated.View>
            <View style={styles.textContainer}>
              <ThemedText type="small" style={styles.title}>
                {isConnecting
                  ? "Connecting..."
                  : motorName
                    ? `${motorName} Disconnected`
                    : "No Motor Connected"}
              </ThemedText>
              <ThemedText type="caption" style={styles.subtitle}>
                {isConnecting
                  ? "Establishing secure connection"
                  : "Tap to scan for nearby outboards"}
              </ThemedText>
            </View>
            <Animated.View style={[styles.arrowContainer, arrowAnimatedStyle]}>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.9)" />
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerWrapper: {
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    overflow: "hidden",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    marginTop: 3,
    fontWeight: "500",
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
