import React from "react";
import { View, ViewStyle, StyleProp, Platform } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

interface GlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glassEffectStyle?: "clear" | "regular";
  tintColor?: string;
  fallbackBackgroundColor?: string;
}

export const GlassCard = React.memo(
  ({
    children,
    style,
    glassEffectStyle = "regular",
    tintColor,
    fallbackBackgroundColor = "rgba(44,44,46,0.92)",
  }: GlassCardProps) => {
    const supportsGlass =
      isLiquidGlassAvailable() && Platform.OS === "ios";

    if (supportsGlass) {
      return (
        <GlassView
          glassEffectStyle={glassEffectStyle}
          tintColor={tintColor}
          style={style}
        >
          {children}
        </GlassView>
      );
    }

    return (
      <View
        style={[
          {
            backgroundColor: fallbackBackgroundColor,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
);

GlassCard.displayName = "GlassCard";
