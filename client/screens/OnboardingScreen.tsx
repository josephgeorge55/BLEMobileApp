import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Dimensions,
  Pressable,
  Platform,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LottieView from "lottie-react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
  runOnJS,
  SharedValue,
  FadeIn,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const LOTTIE_SIZE = 280;

export const ONBOARDING_KEY = "@blade_has_seen_onboarding";

const telemetryAnim = require("../../assets/lottie/telemetry.json");
const gpsAnim = require("../../assets/lottie/gps.json");
const tripAnim = require("../../assets/lottie/trip.json");
const otaAnim = require("../../assets/lottie/ota.json");

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  animation: any | null;
  gradientColors: [string, string];
  isWelcome?: boolean;
}

const SLIDES: Slide[] = [
  {
    id: "welcome",
    title: "Blade Halo Connect",
    subtitle: "by Blade Outboards",
    animation: null,
    gradientColors: ["#1A2332", "#0A1628"],
    isWelcome: true,
  },
  {
    id: "telemetry",
    title: "Live Telemetry",
    subtitle:
      "Real-time RPM, temperature, voltage, and power \u2014 always visible.",
    animation: telemetryAnim,
    gradientColors: ["#2C2C2E", "#1A2332"],
  },
  {
    id: "gps",
    title: "Anti-Theft Location",
    subtitle:
      "Know where your boat is at all times with GPS tracking.",
    animation: gpsAnim,
    gradientColors: ["#2C2C2E", "#1C2A22"],
  },
  {
    id: "trip",
    title: "Trip Recording",
    subtitle:
      "Automatically log every journey. Export trips as PDFs anytime.",
    animation: tripAnim,
    gradientColors: ["#2C2C2E", "#2A1C2E"],
  },
  {
    id: "ota",
    title: "Over-the-Air Updates",
    subtitle:
      "New features and firmware delivered directly to your outboard.",
    animation: otaAnim,
    gradientColors: ["#2C2C2E", "#1C2628"],
  },
];

const PARTICLES = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 3 + Math.random() * 3,
  opacity: 0.05 + Math.random() * 0.07,
  duration: 8000 + Math.random() * 7000,
  drift: 80 + Math.random() * 120,
}));

function GradientLayer({
  index,
  colors,
  scrollX,
}: {
  index: number;
  colors: [string, string];
  scrollX: SharedValue<number>;
}) {
  const animStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [0, 1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, animStyle]} pointerEvents="none">
      <LinearGradient colors={colors} style={StyleSheet.absoluteFillObject} />
    </Animated.View>
  );
}

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

function WelcomeSlide({
  index,
  scrollX,
  isActive,
}: {
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
}) {
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(24);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(16);
  const lineWidth = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
    logoScale.value = withDelay(300, withSpring(1, { damping: 12, stiffness: 80 }));
    titleOpacity.value = withDelay(700, withTiming(1, { duration: 600 }));
    titleTranslateY.value = withDelay(700, withSpring(0, { damping: 14 }));
    subtitleOpacity.value = withDelay(1000, withTiming(1, { duration: 600 }));
    subtitleTranslateY.value = withDelay(1000, withSpring(0, { damping: 14 }));
    lineWidth.value = withDelay(1200, withSpring(60, { damping: 15 }));
  }, []);

  const containerStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.3, 1, 0.3],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const lineStyle = useAnimatedStyle(() => ({
    width: lineWidth.value,
  }));

  return (
    <View style={styles.slide}>
      <Animated.View style={[styles.welcomeContent, containerStyle]}>
        <Animated.View style={[styles.welcomeLogoContainer, logoStyle]}>
          <Image
            source={require("../../assets/images/blade-icon-green.png")}
            style={styles.welcomeLogo}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.View style={titleStyle}>
          <ThemedText type="h1" style={styles.welcomeTitle}>
            Blade Halo Connect
          </ThemedText>
        </Animated.View>
        <Animated.View style={[styles.welcomeLine, lineStyle]} />
        <Animated.View style={subtitleStyle}>
          <ThemedText type="body" style={styles.welcomeSubtitle}>
            by Blade Outboards
          </ThemedText>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function SlideItem({
  slide,
  index,
  scrollX,
  isActive,
}: {
  slide: Slide;
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
}) {
  const titleOffsetY = useSharedValue(20);
  const subtitleOffsetY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      titleOffsetY.value = 20;
      subtitleOffsetY.value = 20;
      titleOffsetY.value = withSpring(0, { damping: 15 });
      subtitleOffsetY.value = withDelay(150, withSpring(0, { damping: 15 }));
    }
  }, [isActive]);

  const animContainerStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [SCREEN_WIDTH * 0.3, 0, -SCREEN_WIDTH * 0.3],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateX }] };
  });

  const textContainerStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [SCREEN_WIDTH * 0.1, 0, -SCREEN_WIDTH * 0.1],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.3, 1, 0.3],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateX }], opacity };
  });

  const titleStaggerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: titleOffsetY.value }],
  }));

  const subtitleStaggerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: subtitleOffsetY.value }],
  }));

  if (slide.isWelcome) {
    return (
      <WelcomeSlide
        index={index}
        scrollX={scrollX}
        isActive={isActive}
      />
    );
  }

  return (
    <View style={styles.slide}>
      <Animated.View style={[styles.animationContainer, animContainerStyle]}>
        <LottieView
          source={slide.animation}
          autoPlay
          loop
          style={styles.lottie}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={[styles.textContainer, textContainerStyle]}>
        <Animated.View style={titleStaggerStyle}>
          <ThemedText type="h1" style={styles.title}>
            {slide.title}
          </ThemedText>
        </Animated.View>
        <Animated.View style={subtitleStaggerStyle}>
          <ThemedText type="body" style={styles.subtitle}>
            {slide.subtitle}
          </ThemedText>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevIndexRef = useRef(0);
  const [hasScrolled, setHasScrolled] = useState(false);

  const scrollX = useSharedValue(0);
  const progressAnim = useSharedValue(1 / SLIDES.length);
  const hintOpacity = useSharedValue(1);
  const hintTranslateX = useSharedValue(0);

  useEffect(() => {
    hintTranslateX.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 800 }),
        withTiming(-8, { duration: 800 })
      ),
      -1,
      false
    );
  }, []);

  const updateIndex = useCallback((newIndex: number) => {
    if (newIndex !== prevIndexRef.current) {
      prevIndexRef.current = newIndex;
      setCurrentIndex(newIndex);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const newIndex = Math.round(event.contentOffset.x / SCREEN_WIDTH);
      if (newIndex >= 0 && newIndex < SLIDES.length) {
        runOnJS(updateIndex)(newIndex);
      }
    },
  });

  useEffect(() => {
    progressAnim.value = withSpring((currentIndex + 1) / SLIDES.length, {
      damping: 15,
      stiffness: 120,
    });
  }, [currentIndex]);

  useEffect(() => {
    if (currentIndex > 0 && !hasScrolled) {
      setHasScrolled(true);
      hintOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [currentIndex, hasScrolled]);

  const progressAnimStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
    transform: [{ translateX: hintTranslateX.value }],
  }));

  const handleComplete = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (currentIndex < SLIDES.length - 1) {
      (scrollViewRef.current as any)?.scrollTo({
        x: (currentIndex + 1) * SCREEN_WIDTH,
        animated: true,
      });
    }
  }, [currentIndex]);

  const isLastSlide = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {SLIDES.map((slide, i) => (
        <GradientLayer
          key={slide.id}
          index={i}
          colors={slide.gradientColors}
          scrollX={scrollX}
        />
      ))}

      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {PARTICLES.map((p) => (
          <Particle key={p.id} data={p} />
        ))}
      </View>

      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.progressBarContainer}>
          <Animated.View style={[styles.progressBarFill, progressAnimStyle]} />
        </View>
        <View style={styles.headerRow}>
          <Animated.View entering={FadeIn.delay(400).duration(600)}>
            <Image
              source={require("../../assets/images/blade-icon-green.png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </Animated.View>
          <View style={styles.headerSpacer} />
          <Pressable
            onPress={handleComplete}
            style={styles.skipButton}
            testID="onboarding-skip"
          >
            <ThemedText type="body" style={styles.skipText}>
              Skip
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SLIDES.map((slide, index) => (
          <SlideItem
            key={slide.id}
            slide={slide}
            index={index}
            scrollX={scrollX}
            isActive={index === currentIndex}
          />
        ))}
      </Animated.ScrollView>

      {!hasScrolled ? (
        <Animated.View style={[styles.swipeHint, hintStyle]}>
          <ThemedText type="caption" style={styles.swipeHintText}>
            Swipe to explore
          </ThemedText>
          <Feather name="chevrons-right" size={14} color="rgba(255,255,255,0.4)" />
        </Animated.View>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
        <Pressable
          onPress={isLastSlide ? handleComplete : handleNext}
          style={styles.actionButton}
          testID={isLastSlide ? "onboarding-get-started" : "onboarding-next"}
        >
          <LinearGradient
            colors={["#A4D08B", "#8BC070"] as [string, string]}
            style={styles.actionButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ThemedText type="button" style={styles.actionButtonText}>
              {isLastSlide ? "Get Started" : "Next"}
            </ThemedText>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
  },
  header: {
    paddingHorizontal: Spacing.screenPadding,
    zIndex: 10,
  },
  progressBarContainer: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 1.5,
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 3,
    backgroundColor: "#A4D08B",
    borderRadius: 1.5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLogo: {
    width: 28,
    height: 28,
    opacity: 0.5,
    marginLeft: Spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  skipText: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "500",
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  animationContainer: {
    width: LOTTIE_SIZE,
    height: LOTTIE_SIZE,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing["4xl"],
  },
  lottie: {
    width: LOTTIE_SIZE,
    height: LOTTIE_SIZE,
  },
  textContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  title: {
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.md,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 24,
    fontSize: 16,
  },
  swipeHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  swipeHintText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: Spacing.screenPadding,
  },
  actionButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  actionButtonGradient: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
  },
  actionButtonText: {
    color: "#1C1C1E",
    fontWeight: "700",
    fontSize: 17,
  },
  welcomeContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeLogoContainer: {
    width: 100,
    height: 100,
    marginBottom: Spacing["3xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeLogo: {
    width: 100,
    height: 100,
  },
  welcomeTitle: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: Spacing.lg,
  },
  welcomeLine: {
    height: 1,
    backgroundColor: "rgba(164,208,139,0.35)",
    marginBottom: Spacing.lg,
  },
  welcomeSubtitle: {
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    fontSize: 15,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
