import React, { useEffect, memo } from "react";
import { TextStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { TextInput } from "react-native";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedValueProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}

export const AnimatedValue = memo(function AnimatedValue({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  style,
  duration = 600,
}: AnimatedValueProps) {
  const safeValue = typeof value === "number" && !isNaN(value) && isFinite(value) ? value : 0;
  const animatedValue = useSharedValue(safeValue);

  useEffect(() => {
    const target = typeof value === "number" && !isNaN(value) && isFinite(value) ? value : 0;
    animatedValue.value = withTiming(target, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration]);

  const animatedProps = useAnimatedProps(() => {
    const val = animatedValue.value;
    const text = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString();
    return {
      text: `${prefix}${text}${suffix}`,
      defaultValue: `${prefix}${text}${suffix}`,
    };
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      style={[{ padding: 0, margin: 0 }, style]}
      animatedProps={animatedProps}
    />
  );
});
