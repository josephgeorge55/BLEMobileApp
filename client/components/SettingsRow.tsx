import React from "react";
import { StyleSheet, View, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

interface SettingsRowProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  showChevron?: boolean;
  iconColor?: string;
  destructive?: boolean;
  disabled?: boolean;
}

const springConfig = {
  damping: 18,
  mass: 0.3,
  stiffness: 250,
  overshootClamping: true,
};

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  isToggle,
  toggleValue,
  onToggle,
  onPress,
  showChevron = true,
  iconColor,
  destructive,
  disabled,
}: SettingsRowProps) {
  const { theme, isDark } = useTheme();
  const pressed = useSharedValue(0);
  const translateX = useSharedValue(0);

  const handleToggle = (newValue: boolean) => {
    Haptics.selectionAsync();
    onToggle?.(newValue);
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const tap = Gesture.Tap()
    .enabled(!!onPress && !isToggle && !disabled)
    .onBegin(() => {
      pressed.value = withSpring(1, springConfig);
      translateX.value = withSpring(4, springConfig);
    })
    .onEnd(() => {
      runOnJS(handlePress)();
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, springConfig);
      translateX.value = withSpring(0, springConfig);
    });

  const animatedRowStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolate(
      pressed.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      pressed.value,
      [0, 1],
      [1, 0.99],
      Extrapolation.CLAMP
    );
    return {
      backgroundColor: pressed.value > 0.5 
        ? isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"
        : "transparent",
      transform: [{ scale }, { translateX: translateX.value }],
    };
  });

  const animatedChevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          pressed.value,
          [0, 1],
          [0, 4],
          Extrapolation.CLAMP
        ),
      },
    ],
    opacity: interpolate(
      pressed.value,
      [0, 1],
      [0.6, 1],
      Extrapolation.CLAMP
    ),
  }));

  const content = (
    <Animated.View style={[styles.row, animatedRowStyle, disabled && { opacity: 0.5 }]}>
      {icon ? (
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? theme.backgroundSecondary : theme.backgroundTertiary },
          ]}
        >
          <Feather
            name={icon}
            size={18}
            color={
              destructive
                ? BladeColors.error
                : iconColor || BladeColors.primary
            }
          />
        </View>
      ) : null}
      <View style={styles.content}>
        <ThemedText
          type="body"
          style={destructive ? { color: BladeColors.error } : undefined}
        >
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            type="caption"
            style={{ color: theme.textSecondary, marginTop: 2 }}
          >
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={handleToggle}
          trackColor={{
            false: theme.backgroundTertiary,
            true: BladeColors.accent,
          }}
          thumbColor="#FFFFFF"
        />
      ) : value ? (
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {value}
        </ThemedText>
      ) : showChevron && onPress ? (
        <Animated.View style={animatedChevronStyle}>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );

  if (onPress && !isToggle) {
    return (
      <GestureDetector gesture={tap}>
        <View style={styles.container}>{content}</View>
      </GestureDetector>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { theme, isDark } = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText
        type="caption"
        style={[styles.sectionTitle, { color: theme.textSecondary }]}
      >
        {title.toUpperCase()}
      </ThemedText>
      <View
        style={[
          styles.sectionContent,
          {
            backgroundColor: theme.surface,
            borderColor: isDark ? theme.border : "transparent",
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginHorizontal: -Spacing.xs,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing["2xl"],
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.md,
    letterSpacing: 0.8,
    fontWeight: "600",
  },
  sectionContent: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
  },
});
