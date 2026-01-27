import React, { ReactNode } from "react";
import { StyleSheet, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, BladeColors, Gradients } from "@/constants/theme";

interface ButtonProps {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline" | "accent";
}

const springConfig = {
  damping: 14,
  mass: 0.35,
  stiffness: 200,
  overshootClamping: false,
};

const quickSpring = {
  damping: 20,
  mass: 0.3,
  stiffness: 350,
  overshootClamping: true,
};

export function Button({
  onPress,
  children,
  style,
  disabled = false,
  variant = "primary",
}: ButtonProps) {
  const { theme } = useTheme();
  const pressed = useSharedValue(0);
  const shine = useSharedValue(0);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      pressed.value = withSpring(1, quickSpring);
    })
    .onEnd(() => {
      runOnJS(triggerHaptic)();
      shine.value = withSequence(
        withSpring(1, { damping: 15, stiffness: 400 }),
        withSpring(0, { damping: 20, stiffness: 200 })
      );
      if (onPress) {
        runOnJS(onPress)();
      }
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, springConfig);
    });

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      pressed.value,
      [0, 1],
      [1, 0.96],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      pressed.value,
      [0, 1],
      [0, 2],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }, { translateY }],
    };
  });

  const shineStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      shine.value,
      [0, 0.5, 1],
      [0, 0.3, 0],
      Extrapolation.CLAMP
    );
    const translateX = interpolate(
      shine.value,
      [0, 1],
      [-100, 100],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ translateX }],
    };
  });

  const useGradient = variant === "primary" || variant === "accent";

  const getGradientColors = (): [string, string] => {
    if (disabled) return [theme.backgroundTertiary, theme.backgroundTertiary];
    switch (variant) {
      case "primary":
        return Gradients.primary as [string, string];
      case "accent":
        return Gradients.accent as [string, string];
      default:
        return Gradients.primary as [string, string];
    }
  };

  const getBackgroundColor = () => {
    if (disabled) return theme.backgroundTertiary;
    switch (variant) {
      case "secondary":
        return theme.backgroundSecondary;
      case "outline":
        return "transparent";
      default:
        return BladeColors.primary;
    }
  };

  const getBorderStyle = () => {
    if (variant === "outline") {
      return {
        borderWidth: 2,
        borderColor: disabled ? theme.backgroundTertiary : theme.primary,
      };
    }
    return {};
  };

  const getTextColor = () => {
    if (disabled) return theme.textSecondary;
    if (variant === "outline") return theme.primary;
    if (variant === "secondary") return theme.text;
    return "#FFFFFF";
  };

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        style={[
          styles.button,
          !useGradient && {
            backgroundColor: getBackgroundColor(),
          },
          getBorderStyle(),
          { opacity: disabled ? 0.6 : 1 },
          style,
          animatedStyle,
        ]}
      >
        {useGradient ? (
          <LinearGradient
            colors={getGradientColors()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
        ) : null}
        <Animated.View style={[styles.shine, shineStyle]} />
        {typeof children === "string" ? (
          <ThemedText type="button" style={{ color: getTextColor() }}>
            {children}
          </ThemedText>
        ) : (
          children
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  button: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
    overflow: "hidden",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  shine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: "rgba(255,255,255,0.4)",
    transform: [{ skewX: "-20deg" }],
  },
});
