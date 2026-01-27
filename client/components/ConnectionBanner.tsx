import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";

interface ConnectionBannerProps {
  isConnected: boolean;
  isConnecting?: boolean;
  motorName?: string;
  onPress?: () => void;
}

export function ConnectionBanner({
  isConnected,
  isConnecting,
  motorName,
  onPress,
}: ConnectionBannerProps) {
  const pulseValue = useSharedValue(1);

  React.useEffect(() => {
    if (isConnecting) {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800 }),
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

  if (isConnected && !isConnecting) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
    >
      <Pressable onPress={onPress}>
        <View
          style={[
            styles.banner,
            {
              backgroundColor: isConnecting
                ? BladeColors.primary
                : BladeColors.warning,
            },
          ]}
        >
          <Animated.View style={[styles.iconContainer, pulseStyle]}>
            <Feather
              name={isConnecting ? "bluetooth" : "alert-triangle"}
              size={18}
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
                ? "Please wait while we establish connection"
                : "Tap to scan for nearby outboards"}
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color="#FFFFFF" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  subtitle: {
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
});
