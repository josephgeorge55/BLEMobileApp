import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";

export const INTRO_KEY_PASSPORT = "@blade_intro_passport";
export const INTRO_KEY_BLUETOOTH = "@blade_intro_bluetooth";
export const INTRO_KEY_ANTITHEFT = "@blade_intro_antitheft";
export const INTRO_KEY_TRIPS = "@blade_intro_trips";
export const INTRO_KEY_UPDATES = "@blade_intro_updates";

interface FeatureIntroOverlayProps {
  storageKey: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  gradientColors: [string, string];
  onDismiss?: () => void;
}

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 3 + Math.random() * 2,
  opacity: 0.04 + Math.random() * 0.06,
  duration: 8000 + Math.random() * 7000,
  drift: 80 + Math.random() * 120,
}));

function Particle({ data }: { data: (typeof PARTICLES)[0] }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(-data.drift, { duration: data.duration }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: `${data.x}%`,
          top: `${data.y}%`,
          width: data.size,
          height: data.size,
          borderRadius: data.size / 2,
          backgroundColor: `rgba(255,255,255,${data.opacity})`,
        },
        animStyle,
      ]}
    />
  );
}

export default function FeatureIntroOverlay({
  storageKey,
  icon,
  title,
  subtitle,
  gradientColors,
  onDismiss,
}: FeatureIntroOverlayProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState<boolean | null>(null);

  const overlayOpacity = useSharedValue(1);
  const iconScale = useSharedValue(0.5);
  const iconOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(24);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(16);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((value) => {
      if (value === "true") {
        setVisible(false);
      } else {
        setVisible(true);
      }
    });
  }, [storageKey]);

  useEffect(() => {
    if (visible !== true) return;

    iconOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
    iconScale.value = withDelay(
      300,
      withSpring(1, { damping: 12, stiffness: 80 }, () => {
        iconScale.value = withRepeat(
          withSequence(
            withTiming(1.04, { duration: 1500 }),
            withTiming(1.0, { duration: 1500 })
          ),
          -1,
          false
        );
      })
    );

    titleOpacity.value = withDelay(600, withTiming(1, { duration: 600 }));
    titleTranslateY.value = withDelay(600, withSpring(0, { damping: 14 }));

    subtitleOpacity.value = withDelay(900, withTiming(1, { duration: 600 }));
    subtitleTranslateY.value = withDelay(900, withSpring(0, { damping: 14 }));

    buttonOpacity.value = withDelay(1200, withTiming(1, { duration: 600 }));
  }, [visible]);

  const handleDismiss = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await AsyncStorage.setItem(storageKey, "true");
    overlayOpacity.value = withTiming(0, { duration: 400 }, (finished) => {
      if (finished) {
        runOnJS(setVisible)(false);
        if (onDismiss) {
          runOnJS(onDismiss)();
        }
      }
    });
  }, [storageKey, onDismiss]);

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const iconAnimStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleAnimStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }));

  if (visible !== true) {
    return null;
  }

  return (
    <Animated.View style={[styles.overlay, overlayAnimStyle]}>
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {PARTICLES.map((p) => (
          <Particle key={p.id} data={p} />
        ))}
      </View>

      <View style={styles.content}>
        <Animated.View style={[styles.iconContainer, iconAnimStyle]}>
          <Feather
            name={icon}
            size={72}
            color="white"
            style={styles.icon}
          />
        </Animated.View>

        <View style={styles.textArea}>
          <Animated.View style={titleAnimStyle}>
            <ThemedText type="h1" style={styles.title}>
              {title}
            </ThemedText>
          </Animated.View>
          <Animated.View style={subtitleAnimStyle}>
            <ThemedText type="body" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          </Animated.View>
        </View>
      </View>

      <Animated.View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 48 },
          buttonAnimStyle,
        ]}
      >
        <Pressable
          onPress={handleDismiss}
          style={styles.button}
          testID="feature-intro-got-it"
        >
          <LinearGradient
            colors={["#A4D08B", "#8BC070"] as [string, string]}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ThemedText type="button" style={styles.buttonText}>
              Got It
            </ThemedText>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    opacity: 0.85,
  },
  textArea: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: Spacing.screenPadding,
  },
  title: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: Spacing.md,
  },
  subtitle: {
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: Spacing.screenPadding,
  },
  button: {
    borderRadius: 12,
    overflow: "hidden",
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  buttonText: {
    color: "#1C1C1E",
    fontWeight: "700",
    fontSize: 17,
  },
});
