import React, { useEffect, useRef, useState, useCallback } from "react";
import { StyleSheet, View, ViewStyle, TextStyle, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const CHARS = "0123456789ABCDEF.-/%";
const NON_CYCLING_CHARS = new Set([".", "-", "/", "%", " "]);

interface FlipBoardProps {
  value: string;
  isInitializing: boolean;
  style?: ViewStyle;
  charStyle?: TextStyle;
  duration?: number;
  charWidth?: number;
  charHeight?: number;
}

interface CharCellProps {
  targetChar: string;
  isInitializing: boolean;
  settleDelay: number;
  shouldAnimate: boolean;
  charWidth: number;
  charHeight: number;
  charStyle?: TextStyle;
}

function CharCell({
  targetChar,
  isInitializing,
  settleDelay,
  shouldAnimate,
  charWidth,
  charHeight,
  charStyle,
}: CharCellProps) {
  const [displayChar, setDisplayChar] = useState(shouldAnimate ? CHARS[Math.floor(Math.random() * CHARS.length)] : targetChar);
  const [isSettled, setIsSettled] = useState(!shouldAnimate);
  const scale = useSharedValue(shouldAnimate ? 1 : 1);
  const opacity = useSharedValue(shouldAnimate ? 0.7 : 1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCycling = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setDisplayChar(CHARS[Math.floor(Math.random() * CHARS.length)]);
    }, 50);
  }, []);

  const stopCycling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayChar(targetChar);
      setIsSettled(true);
      opacity.value = 1;
      return;
    }

    if (isInitializing) {
      setIsSettled(false);
      opacity.value = 0.7;
      if (NON_CYCLING_CHARS.has(targetChar)) {
        setDisplayChar(targetChar);
        setIsSettled(true);
        opacity.value = 1;
      } else {
        startCycling();
      }
    } else {
      settleTimeoutRef.current = setTimeout(() => {
        stopCycling();
        setDisplayChar(targetChar);
        setIsSettled(true);
        scale.value = withSpring(1.05, { damping: 12, mass: 0.3, stiffness: 300 }, () => {
          scale.value = withSpring(1, { damping: 14, mass: 0.4, stiffness: 200 });
        });
        opacity.value = withTiming(1, { duration: 200 });
      }, settleDelay);
    }

    return () => {
      stopCycling();
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
        settleTimeoutRef.current = null;
      }
    };
  }, [isInitializing, targetChar, shouldAnimate]);

  useEffect(() => {
    if (isSettled && !isInitializing) {
      setDisplayChar(targetChar);
    }
  }, [targetChar, isSettled, isInitializing]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const isNonCycling = NON_CYCLING_CHARS.has(targetChar);
  const textColor = isSettled || isNonCycling ? "#FFFFFF" : "rgba(52, 199, 89, 0.7)";

  return (
    <Animated.View
      style={[
        styles.charCell,
        {
          width: charWidth,
          height: charHeight,
          borderRadius: charWidth * 0.18,
        },
        animatedStyle,
      ]}
    >
      <Animated.Text
        style={[
          styles.charText,
          {
            fontSize: charHeight * 0.55,
            lineHeight: charHeight,
            color: textColor,
          },
          charStyle,
        ]}
      >
        {displayChar}
      </Animated.Text>
    </Animated.View>
  );
}

export function FlipBoard({
  value,
  isInitializing,
  style,
  charStyle,
  duration = 2500,
  charWidth = 28,
  charHeight = 40,
}: FlipBoardProps) {
  const [shouldAnimate, setShouldAnimate] = useState(isInitializing);
  const wasInitializingRef = useRef(isInitializing);

  useEffect(() => {
    if (wasInitializingRef.current && !isInitializing) {
      setShouldAnimate(true);
    } else if (!wasInitializingRef.current && !isInitializing) {
      setShouldAnimate(false);
    }
    wasInitializingRef.current = isInitializing;
  }, [isInitializing]);

  const chars = value.split("");
  const settleDelayPerChar = 150;

  return (
    <View style={[styles.container, style]}>
      {chars.map((char, index) => (
        <CharCell
          key={`${index}-${chars.length}`}
          targetChar={char}
          isInitializing={isInitializing}
          settleDelay={index * settleDelayPerChar}
          shouldAnimate={shouldAnimate}
          charWidth={charWidth}
          charHeight={charHeight}
          charStyle={charStyle}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  charCell: {
    backgroundColor: "rgba(20, 25, 32, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  charText: {
    fontWeight: "700",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
});
