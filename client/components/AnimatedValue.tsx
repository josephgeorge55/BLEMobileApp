import React, { useEffect } from "react";
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
  formatFn?: (val: number) => string;
}

export function AnimatedValue({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  style,
  duration = 600,
  formatFn,
}: AnimatedValueProps) {
  const animatedValue = useSharedValue(value);

  useEffect(() => {
    animatedValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  const animatedProps = useAnimatedProps(() => {
    const val = animatedValue.value;
    let text: string;
    if (formatFn) {
      text = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString();
    } else {
      text = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString();
    }
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
}
