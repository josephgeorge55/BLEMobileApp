import React, { useRef, useState, useCallback, useEffect } from "react";
import { StyleSheet, View, Dimensions, Pressable, Platform, Modal, Image } from "react-native";
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

export const INTRO_KEY_PASSPORT = "@blade_intro_passport";
export const INTRO_KEY_BLUETOOTH = "@blade_intro_bluetooth";
export const INTRO_KEY_ANTITHEFT = "@blade_intro_antitheft";
export const INTRO_KEY_TRIPS = "@blade_intro_trips";
export const INTRO_KEY_UPDATES = "@blade_intro_updates";
export const INTRO_KEY_DASHBOARD_WELCOME = "@blade_intro_dashboard_welcome";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const LOTTIE_SIZE = 240;

interface IntroPage {
  title: string;
  subtitle: string;
  hints: string[];
}

interface FeatureIntroOverlayProps {
  storageKey: string;
  animation: any;
  pages: IntroPage[];
  gradientColors: [string, string];
  onDismiss?: () => void;
}

const PARTICLES = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 3 + Math.random() * 3,
  opacity: 0.05 + Math.random() * 0.07,
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

const MAX_HINTS = 8;

function PageContent({
  page,
  index,
  scrollX,
  isActive,
  animation,
  isSinglePage,
}: {
  page: IntroPage;
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
  animation: any;
  isSinglePage: boolean;
}) {
  const lottieScale = useSharedValue(0.6);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const h0 = useSharedValue(0);
  const h1 = useSharedValue(0);
  const h2 = useSharedValue(0);
  const h3 = useSharedValue(0);
  const h4 = useSharedValue(0);
  const h5 = useSharedValue(0);
  const h6 = useSharedValue(0);
  const h7 = useSharedValue(0);
  const hintOpacities = useRef([h0, h1, h2, h3, h4, h5, h6, h7]).current;

  useEffect(() => {
    if (isActive) {
      lottieScale.value = 0.6;
      titleOpacity.value = 0;
      titleTranslateY.value = 20;
      hintOpacities.forEach((o) => { o.value = 0; });

      lottieScale.value = withSpring(1, { damping: 12, stiffness: 80 });
      titleOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
      titleTranslateY.value = withDelay(200, withSpring(0, { damping: 14 }));
      page.hints.forEach((_, i) => {
        if (i < MAX_HINTS) {
          hintOpacities[i].value = withDelay(400 + i * 100, withTiming(1, { duration: 400 }));
        }
      });
    }
  }, [isActive]);

  const animContainerStyle = useAnimatedStyle(() => {
    if (isSinglePage) {
      return { transform: [{ scale: lottieScale.value }] };
    }
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
    return { transform: [{ translateX }, { scale: lottieScale.value }] };
  });

  const textContainerStyle = useAnimatedStyle(() => {
    if (isSinglePage) {
      return {
        opacity: titleOpacity.value,
        transform: [{ translateY: titleTranslateY.value }],
      };
    }
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
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  return (
    <View style={isSinglePage ? styles.singlePageSlide : styles.slide}>
      <Animated.View style={[styles.animationContainer, animContainerStyle]}>
        <LottieView
          source={animation}
          autoPlay
          loop
          style={styles.lottie}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={[styles.textContainer, textContainerStyle]}>
        <Animated.View style={titleStaggerStyle}>
          <ThemedText type="h1" style={styles.title}>
            {page.title}
          </ThemedText>
        </Animated.View>
        <ThemedText type="body" style={styles.subtitle}>
          {page.subtitle}
        </ThemedText>
        <View style={styles.hintsContainer}>
          {page.hints.map((hint, i) => (
            <HintRow key={i} text={hint} opacityValue={hintOpacities[i]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function HintRow({
  text,
  opacityValue,
}: {
  text: string;
  opacityValue: SharedValue<number>;
}) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacityValue.value,
  }));

  return (
    <Animated.View style={[styles.hintRow, animStyle]}>
      <View style={styles.hintDot} />
      <ThemedText type="body" style={styles.hintText}>
        {text}
      </ThemedText>
    </Animated.View>
  );
}

export default function FeatureIntroOverlay({
  storageKey,
  animation,
  pages,
  gradientColors,
  onDismiss,
}: FeatureIntroOverlayProps) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevIndexRef = useRef(0);
  const [hasScrolled, setHasScrolled] = useState(false);

  const scrollX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const progressAnim = useSharedValue(1 / pages.length);
  const hintOpacity = useSharedValue(1);
  const hintTranslateX = useSharedValue(0);

  const isSinglePage = pages.length === 1;

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
    if (!isSinglePage) {
      hintTranslateX.value = withRepeat(
        withSequence(
          withTiming(8, { duration: 800 }),
          withTiming(-8, { duration: 800 })
        ),
        -1,
        false
      );
    }
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
      if (newIndex >= 0 && newIndex < pages.length) {
        runOnJS(updateIndex)(newIndex);
      }
    },
  });

  useEffect(() => {
    progressAnim.value = withSpring((currentIndex + 1) / pages.length, {
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

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

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

  const handleNext = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (currentIndex < pages.length - 1) {
      (scrollViewRef.current as any)?.scrollTo({
        x: (currentIndex + 1) * SCREEN_WIDTH,
        animated: true,
      });
    }
  }, [currentIndex, pages.length]);

  if (visible !== true) {
    return null;
  }

  const isLastPage = currentIndex === pages.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
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

        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
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
              onPress={handleDismiss}
              style={styles.skipButton}
              testID="feature-intro-skip"
            >
              <ThemedText type="body" style={styles.skipText}>
                Skip
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.progressBarContainer}>
            <Animated.View style={[styles.progressBarFill, progressAnimStyle]} />
          </View>
        </View>

        {isSinglePage ? (
          <View style={styles.scrollView}>
            <PageContent
              page={pages[0]}
              index={0}
              scrollX={scrollX}
              isActive={true}
              animation={animation}
              isSinglePage={true}
            />
          </View>
        ) : (
          <>
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
              {pages.map((page, index) => (
                <PageContent
                  key={index}
                  page={page}
                  index={index}
                  scrollX={scrollX}
                  isActive={index === currentIndex}
                  animation={animation}
                  isSinglePage={false}
                />
              ))}
            </Animated.ScrollView>

            <View style={styles.dotsContainer}>
              {pages.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === currentIndex ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          </>
        )}

        {!isSinglePage && !hasScrolled ? (
          <Animated.View style={[styles.swipeHint, hintStyle]}>
            <ThemedText type="caption" style={styles.swipeHintText}>
              Swipe to learn more
            </ThemedText>
            <Feather name="chevrons-right" size={14} color="rgba(255,255,255,0.4)" />
          </Animated.View>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
          <Pressable
            onPress={isLastPage ? handleDismiss : handleNext}
            style={styles.actionButton}
            testID={isLastPage ? "feature-intro-got-it" : "feature-intro-next"}
          >
            <LinearGradient
              colors={["#A4D08B", "#8BC070"] as [string, string]}
              style={styles.actionButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <ThemedText type="button" style={styles.actionButtonText}>
                {isLastPage ? "Got It" : "Next"}
              </ThemedText>
            </LinearGradient>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    paddingHorizontal: Spacing.screenPadding,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
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
  progressBarContainer: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 3,
    backgroundColor: "#A4D08B",
    borderRadius: 1.5,
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
  singlePageSlide: {
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
    marginBottom: Spacing["2xl"],
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
    marginBottom: Spacing.sm,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 22,
    fontSize: 15,
    marginBottom: Spacing.xl,
    maxWidth: 320,
  },
  hintsContainer: {
    alignSelf: "center",
    maxWidth: 320,
    width: "100%",
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  hintDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#A4D08B",
    marginTop: 5,
    marginRight: Spacing.sm,
  },
  hintText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: "#A4D08B",
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.2)",
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
});
