import React, { useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Dimensions,
  Pressable,
  FlatList,
  ViewToken,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LottieView from "lottie-react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const LOTTIE_SIZE = 220;

export const ONBOARDING_KEY = "@blade_has_seen_onboarding";

const telemetryAnim = require("../../assets/lottie/telemetry.json");
const gpsAnim = require("../../assets/lottie/gps.json");
const tripAnim = require("../../assets/lottie/trip.json");
const otaAnim = require("../../assets/lottie/ota.json");

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  animation: any;
}

const SLIDES: Slide[] = [
  {
    id: "telemetry",
    title: "Live Telemetry",
    subtitle:
      "Real-time RPM, temperature, voltage, and power \u2014 always visible.",
    animation: telemetryAnim,
  },
  {
    id: "gps",
    title: "Anti-Theft Location",
    subtitle:
      "Know where your boat is at all times with GPS tracking.",
    animation: gpsAnim,
  },
  {
    id: "trip",
    title: "Trip Recording",
    subtitle:
      "Automatically log every journey. Export trips as PDFs anytime.",
    animation: tripAnim,
  },
  {
    id: "ota",
    title: "Over-the-Air Updates",
    subtitle:
      "New features and firmware delivered directly to your outboard.",
    animation: otaAnim,
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  }, [currentIndex]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = useCallback(({ item }: { item: Slide }) => {
    return (
      <View style={styles.slide}>
        <View style={styles.animationContainer}>
          <LottieView
            source={item.animation}
            autoPlay
            loop
            style={styles.lottie}
            resizeMode="contain"
          />
        </View>
        <View style={styles.textContainer}>
          <ThemedText type="h1" style={styles.title}>
            {item.title}
          </ThemedText>
          <ThemedText type="body" style={styles.subtitle}>
            {item.subtitle}
          </ThemedText>
        </View>
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#2C2C2E", "#1C1C1E"] as [string, string]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
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

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        bounces={false}
        style={styles.flatList}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

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
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: Spacing.screenPadding,
    zIndex: 10,
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
  flatList: {
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
  footer: {
    paddingHorizontal: Spacing.screenPadding,
    gap: Spacing["2xl"],
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    height: 8,
    backgroundColor: "#A4D08B",
    borderRadius: 4,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
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
});
