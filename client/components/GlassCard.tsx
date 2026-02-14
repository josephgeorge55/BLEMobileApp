import React from "react";
import { View, ViewStyle, StyleProp } from "react-native";

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
    fallbackBackgroundColor = "rgba(44,44,46,0.92)",
  }: GlassCardProps) => {
    return (
      <View style={[{ backgroundColor: fallbackBackgroundColor }, style]}>
        {children}
      </View>
    );
  }
);

GlassCard.displayName = "GlassCard";
