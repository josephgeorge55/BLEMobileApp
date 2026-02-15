import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import { StyleSheet, View, ViewStyle, TextStyle, Platform, InteractionManager } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const CHARS = "0123456789ABCDEF";
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

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export const FlipBoard = memo(function FlipBoard({
  value,
  isInitializing,
  style,
  charStyle,
  charWidth = 28,
  charHeight = 40,
}: FlipBoardProps) {
  const chars = value.split("");
  const [displayChars, setDisplayChars] = useState<string[]>(() =>
    chars.map((c) => (NON_CYCLING_CHARS.has(c) ? c : randomChar()))
  );
  const [settledIndices, setSettledIndices] = useState<Set<number>>(() => {
    if (!isInitializing) return new Set(chars.map((_, i) => i));
    return new Set(chars.map((c, i) => (NON_CYCLING_CHARS.has(c) ? i : -1)).filter((i) => i >= 0));
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountedRef = useRef(true);
  const readyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      settleTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!isInitializing) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplayChars(chars);
      setSettledIndices(new Set(chars.map((_, i) => i)));
      return;
    }

    const handle = InteractionManager.runAfterInteractions(() => {
      if (!mountedRef.current) return;
      readyRef.current = true;

      intervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        setDisplayChars((prev) => {
          const next = [...prev];
          for (let i = 0; i < chars.length; i++) {
            if (!NON_CYCLING_CHARS.has(chars[i])) {
              next[i] = randomChar();
            } else {
              next[i] = chars[i];
            }
          }
          return next;
        });
      }, 100);
    });

    return () => {
      handle.cancel();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isInitializing]);

  useEffect(() => {
    if (isInitializing || !readyRef.current) return;

    settleTimersRef.current.forEach(clearTimeout);
    settleTimersRef.current = [];

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    chars.forEach((char, i) => {
      if (NON_CYCLING_CHARS.has(char)) {
        setSettledIndices((prev) => new Set([...prev, i]));
        return;
      }
      const timer = setTimeout(() => {
        if (!mountedRef.current) return;
        setDisplayChars((prev) => {
          const next = [...prev];
          next[i] = char;
          return next;
        });
        setSettledIndices((prev) => new Set([...prev, i]));
      }, i * 150);
      settleTimersRef.current.push(timer);
    });
  }, [isInitializing]);

  useEffect(() => {
    if (!isInitializing) {
      setDisplayChars(value.split(""));
    }
  }, [value, isInitializing]);

  return (
    <View style={[styles.container, style]}>
      {displayChars.map((char, index) => {
        const isSettled = settledIndices.has(index);
        const textColor = isSettled ? "#FFFFFF" : "rgba(52, 199, 89, 0.7)";

        return (
          <CharCellSimple
            key={`${index}-${chars.length}`}
            char={char}
            isSettled={isSettled}
            textColor={textColor}
            charWidth={charWidth}
            charHeight={charHeight}
            charStyle={charStyle}
          />
        );
      })}
    </View>
  );
});

const CharCellSimple = memo(function CharCellSimple({
  char,
  isSettled,
  textColor,
  charWidth,
  charHeight,
  charStyle,
}: {
  char: string;
  isSettled: boolean;
  textColor: string;
  charWidth: number;
  charHeight: number;
  charStyle?: TextStyle;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isSettled) {
      scale.value = withSpring(1.05, { damping: 12, mass: 0.3, stiffness: 300 }, () => {
        scale.value = withSpring(1, { damping: 14, mass: 0.4, stiffness: 200 });
      });
    }
  }, [isSettled]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.charCell,
        {
          width: charWidth,
          height: charHeight,
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
        {char}
      </Animated.Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  charCell: {
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
