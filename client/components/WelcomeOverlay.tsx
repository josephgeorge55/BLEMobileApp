import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Dimensions, Platform, Modal, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LottieView from "lottie-react-native";
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
import { INTRO_KEY_DASHBOARD_WELCOME } from "@/components/FeatureIntroOverlay";
import { Spacing } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 2 + Math.random() * 4,
  opacity: 0.04 + Math.random() * 0.08,
  duration: 6000 + Math.random() * 8000,
  drift: 60 + Math.random() * 140,
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
          backgroundColor: `rgba(164,208,139,${data.opacity})`,
        },
        animStyle,
      ]}
    />
  );
}

interface WelcomeOverlayProps {
  userName?: string;
  onDismiss?: () => void;
}

export default function WelcomeOverlay({ userName, onDismiss }: WelcomeOverlayProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState<boolean | null>(null);

  const overlayOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const welcomeOpacity = useSharedValue(0);
  const welcomeTranslateY = useSharedValue(30);
  const nameOpacity = useSharedValue(0);
  const nameTranslateY = useSharedValue(20);
  const hintOpacity = useSharedValue(0);
  const hintTranslateY = useSharedValue(15);
  const pulseOpacity = useSharedValue(0);
  const lottieScale = useSharedValue(0);
  const lottieOpacity = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY_DASHBOARD_WELCOME).then((value) => {
      if (value === "true") {
        setVisible(false);
      } else {
        setVisible(true);
      }
    });
  }, []);

  const autoDismiss = useCallback(async () => {
    await AsyncStorage.setItem(INTRO_KEY_DASHBOARD_WELCOME, "true");
    overlayOpacity.value = withTiming(0, { duration: 600 }, (finished) => {
      if (finished) {
        runOnJS(setVisible)(false);
        if (onDismiss) {
          runOnJS(onDismiss)();
        }
      }
    });
  }, [onDismiss]);

  useEffect(() => {
    if (visible !== true) return;

    logoOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    logoScale.value = withDelay(
      200,
      withSpring(1, { damping: 10, stiffness: 60 }, () => {
        logoScale.value = withRepeat(
          withSequence(
            withTiming(1.05, { duration: 2000 }),
            withTiming(1.0, { duration: 2000 })
          ),
          -1,
          false
        );
      })
    );

    welcomeOpacity.value = withDelay(500, withTiming(1, { duration: 500 }));
    welcomeTranslateY.value = withDelay(500, withSpring(0, { damping: 14 }));

    nameOpacity.value = withDelay(800, withTiming(1, { duration: 500 }));
    nameTranslateY.value = withDelay(800, withSpring(0, { damping: 14 }));

    lottieOpacity.value = withDelay(1100, withTiming(1, { duration: 500 }));
    lottieScale.value = withDelay(1100, withSpring(1, { damping: 12, stiffness: 80 }));

    hintOpacity.value = withDelay(1400, withTiming(1, { duration: 500 }));
    hintTranslateY.value = withDelay(1400, withSpring(0, { damping: 14 }));

    pulseOpacity.value = withDelay(1800, withTiming(0.8, { duration: 400 }, () => {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0.5, { duration: 800 })
        ),
        -1,
        false
      );
    }));

    const timer = setTimeout(() => {
      autoDismiss();
    }, 3500);

    return () => clearTimeout(timer);
  }, [visible]);

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const welcomeAnimStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
    transform: [{ translateY: welcomeTranslateY.value }],
  }));

  const nameAnimStyle = useAnimatedStyle(() => ({
    opacity: nameOpacity.value,
    transform: [{ translateY: nameTranslateY.value }],
  }));

  const lottieAnimStyle = useAnimatedStyle(() => ({
    opacity: lottieOpacity.value,
    transform: [{ scale: lottieScale.value }],
  }));

  const hintAnimStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
    transform: [{ translateY: hintTranslateY.value }],
  }));

  const pulseAnimStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (visible !== true) return null;

  const displayName = userName || "Captain";

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, overlayAnimStyle]}>
        <LinearGradient
          colors={["#1A2332", "#0F1720"] as [string, string]}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {PARTICLES.map((p) => (
            <Particle key={p.id} data={p} />
          ))}
        </View>

        <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
          <Animated.View style={logoAnimStyle}>
            <Image
              source={require("../../assets/images/blade-icon-green.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <View style={styles.textContainer}>
            <Animated.View style={welcomeAnimStyle}>
              <ThemedText style={styles.welcomeText}>Welcome Back</ThemedText>
            </Animated.View>

            <Animated.View style={nameAnimStyle}>
              <ThemedText style={styles.nameText}>{displayName}</ThemedText>
            </Animated.View>
          </View>

          <Animated.View style={[styles.lottieContainer, lottieAnimStyle]}>
            <LottieView
              source={require("../../assets/lottie/telemetry.json")}
              autoPlay
              loop
              style={styles.lottie}
            />
          </Animated.View>

          <Animated.View style={[styles.hintContainer, hintAnimStyle]}>
            <View style={styles.hintCard}>
              <LinearGradient
                colors={["rgba(164,208,139,0.15)", "rgba(164,208,139,0.05)"] as [string, string]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Animated.View style={pulseAnimStyle}>
                <View style={styles.scanIconCircle}>
                  <Feather name="bluetooth" size={22} color="#A4D08B" />
                </View>
              </Animated.View>
              <View style={styles.hintTextArea}>
                <ThemedText style={styles.hintTitle}>Ready to Connect</ThemedText>
                <ThemedText style={styles.hintSubtitle}>
                  Tap "Scan for Motors" to pair your outboard
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.progressBar}>
            <Animated.View style={[styles.progressFill, { width: '100%' }]} />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.screenPadding,
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 24,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  welcomeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 2,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 8,
  },
  nameText: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  lottieContainer: {
    marginVertical: 16,
  },
  lottie: {
    width: 180,
    height: 180,
  },
  hintContainer: {
    width: "100%",
    maxWidth: 340,
    marginTop: 12,
  },
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(164,208,139,0.2)",
    padding: 16,
    overflow: "hidden",
  },
  scanIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(164,208,139,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  hintTextArea: {
    flex: 1,
  },
  hintTitle: {
    color: "#A4D08B",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 3,
  },
  hintSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing.screenPadding,
  },
  progressBar: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 1.5,
    backgroundColor: "#A4D08B",
  },
});
