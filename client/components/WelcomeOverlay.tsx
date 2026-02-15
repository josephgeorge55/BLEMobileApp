import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, Dimensions, Platform, Modal, Image, Pressable, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from "lottie-react-native";
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
import { useUser } from "@/context/UserContext";
import { getUserCountry } from "@/lib/firebase";
import { Spacing } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const COUNTRY_FLAGS: Record<string, string> = {
  "Afghanistan": "\u{1F1E6}\u{1F1EB}", "Albania": "\u{1F1E6}\u{1F1F1}", "Algeria": "\u{1F1E9}\u{1F1FF}",
  "Argentina": "\u{1F1E6}\u{1F1F7}", "Australia": "\u{1F1E6}\u{1F1FA}", "Austria": "\u{1F1E6}\u{1F1F9}",
  "Bahamas": "\u{1F1E7}\u{1F1F8}", "Bahrain": "\u{1F1E7}\u{1F1ED}", "Bangladesh": "\u{1F1E7}\u{1F1E9}",
  "Belgium": "\u{1F1E7}\u{1F1EA}", "Bermuda": "\u{1F1E7}\u{1F1F2}", "Brazil": "\u{1F1E7}\u{1F1F7}",
  "Brunei": "\u{1F1E7}\u{1F1F3}", "Bulgaria": "\u{1F1E7}\u{1F1EC}", "Cambodia": "\u{1F1F0}\u{1F1ED}",
  "Canada": "\u{1F1E8}\u{1F1E6}", "Chile": "\u{1F1E8}\u{1F1F1}", "China": "\u{1F1E8}\u{1F1F3}",
  "Colombia": "\u{1F1E8}\u{1F1F4}", "Costa Rica": "\u{1F1E8}\u{1F1F7}", "Croatia": "\u{1F1ED}\u{1F1F7}",
  "Cuba": "\u{1F1E8}\u{1F1FA}", "Cyprus": "\u{1F1E8}\u{1F1FE}", "Czech Republic": "\u{1F1E8}\u{1F1FF}",
  "Denmark": "\u{1F1E9}\u{1F1F0}", "Dominican Republic": "\u{1F1E9}\u{1F1F4}",
  "Ecuador": "\u{1F1EA}\u{1F1E8}", "Egypt": "\u{1F1EA}\u{1F1EC}", "Estonia": "\u{1F1EA}\u{1F1EA}",
  "Fiji": "\u{1F1EB}\u{1F1EF}", "Finland": "\u{1F1EB}\u{1F1EE}", "France": "\u{1F1EB}\u{1F1F7}",
  "Germany": "\u{1F1E9}\u{1F1EA}", "Ghana": "\u{1F1EC}\u{1F1ED}", "Greece": "\u{1F1EC}\u{1F1F7}",
  "Grenada": "\u{1F1EC}\u{1F1E9}", "Guatemala": "\u{1F1EC}\u{1F1F9}",
  "Honduras": "\u{1F1ED}\u{1F1F3}", "Hong Kong": "\u{1F1ED}\u{1F1F0}", "Hungary": "\u{1F1ED}\u{1F1FA}",
  "Iceland": "\u{1F1EE}\u{1F1F8}", "India": "\u{1F1EE}\u{1F1F3}", "Indonesia": "\u{1F1EE}\u{1F1E9}",
  "Iran": "\u{1F1EE}\u{1F1F7}", "Iraq": "\u{1F1EE}\u{1F1F6}", "Ireland": "\u{1F1EE}\u{1F1EA}",
  "Israel": "\u{1F1EE}\u{1F1F1}", "Italy": "\u{1F1EE}\u{1F1F9}",
  "Jamaica": "\u{1F1EF}\u{1F1F2}", "Japan": "\u{1F1EF}\u{1F1F5}", "Jordan": "\u{1F1EF}\u{1F1F4}",
  "Kenya": "\u{1F1F0}\u{1F1EA}", "Kuwait": "\u{1F1F0}\u{1F1FC}",
  "Latvia": "\u{1F1F1}\u{1F1FB}", "Lebanon": "\u{1F1F1}\u{1F1E7}", "Lithuania": "\u{1F1F1}\u{1F1F9}",
  "Luxembourg": "\u{1F1F1}\u{1F1FA}",
  "Malaysia": "\u{1F1F2}\u{1F1FE}", "Maldives": "\u{1F1F2}\u{1F1FB}", "Malta": "\u{1F1F2}\u{1F1F9}",
  "Mauritius": "\u{1F1F2}\u{1F1FA}", "Mexico": "\u{1F1F2}\u{1F1FD}", "Monaco": "\u{1F1F2}\u{1F1E8}",
  "Morocco": "\u{1F1F2}\u{1F1E6}", "Mozambique": "\u{1F1F2}\u{1F1FF}", "Myanmar": "\u{1F1F2}\u{1F1F2}",
  "Nepal": "\u{1F1F3}\u{1F1F5}", "Netherlands": "\u{1F1F3}\u{1F1F1}", "New Zealand": "\u{1F1F3}\u{1F1FF}",
  "Nigeria": "\u{1F1F3}\u{1F1EC}", "Norway": "\u{1F1F3}\u{1F1F4}",
  "Oman": "\u{1F1F4}\u{1F1F2}",
  "Pakistan": "\u{1F1F5}\u{1F1F0}", "Panama": "\u{1F1F5}\u{1F1E6}", "Papua New Guinea": "\u{1F1F5}\u{1F1EC}",
  "Peru": "\u{1F1F5}\u{1F1EA}", "Philippines": "\u{1F1F5}\u{1F1ED}", "Poland": "\u{1F1F5}\u{1F1F1}",
  "Portugal": "\u{1F1F5}\u{1F1F9}",
  "Qatar": "\u{1F1F6}\u{1F1E6}",
  "Romania": "\u{1F1F7}\u{1F1F4}", "Russia": "\u{1F1F7}\u{1F1FA}",
  "Saudi Arabia": "\u{1F1F8}\u{1F1E6}", "Seychelles": "\u{1F1F8}\u{1F1E8}",
  "Singapore": "\u{1F1F8}\u{1F1EC}", "Slovakia": "\u{1F1F8}\u{1F1F0}", "Slovenia": "\u{1F1F8}\u{1F1EE}",
  "South Africa": "\u{1F1FF}\u{1F1E6}", "South Korea": "\u{1F1F0}\u{1F1F7}", "Spain": "\u{1F1EA}\u{1F1F8}",
  "Sri Lanka": "\u{1F1F1}\u{1F1F0}", "Sweden": "\u{1F1F8}\u{1F1EA}", "Switzerland": "\u{1F1E8}\u{1F1ED}",
  "Taiwan": "\u{1F1F9}\u{1F1FC}", "Tanzania": "\u{1F1F9}\u{1F1FF}", "Thailand": "\u{1F1F9}\u{1F1ED}",
  "Trinidad and Tobago": "\u{1F1F9}\u{1F1F9}", "Tunisia": "\u{1F1F9}\u{1F1F3}", "Turkey": "\u{1F1F9}\u{1F1F7}",
  "Ukraine": "\u{1F1FA}\u{1F1E6}", "United Arab Emirates": "\u{1F1E6}\u{1F1EA}",
  "United Kingdom": "\u{1F1EC}\u{1F1E7}", "United States": "\u{1F1FA}\u{1F1F8}",
  "Uruguay": "\u{1F1FA}\u{1F1FE}",
  "Venezuela": "\u{1F1FB}\u{1F1EA}", "Vietnam": "\u{1F1FB}\u{1F1F3}",
};

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
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

export default function WelcomeOverlay({ onDismiss }: { onDismiss?: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, isGuestMode } = useUser();
  const [visible, setVisible] = useState(true);
  const [country, setCountry] = useState<string | null>(null);
  const dismissingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGuest = isGuestMode || !user || user.id === "guest";

  const overlayOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(30);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(20);
  const detailOpacity = useSharedValue(0);
  const detailTranslateY = useSharedValue(15);
  const lottieScale = useSharedValue(0);
  const lottieOpacity = useSharedValue(0);
  const hintOpacity = useSharedValue(0);
  const hintTranslateY = useSharedValue(15);
  const pulseOpacity = useSharedValue(0);
  const dividerWidth = useSharedValue(0);

  useEffect(() => {
    if (!isGuest && user) {
      getUserCountry().then((c) => setCountry(c)).catch(() => {});
    }
  }, [isGuest, user]);

  const autoDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    overlayOpacity.value = withTiming(0, { duration: 500 }, () => {
      runOnJS(setVisible)(false);
      if (onDismiss) {
        runOnJS(onDismiss)();
      }
    });
    setTimeout(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    }, 700);
  }, [onDismiss]);

  useEffect(() => {
    if (visible !== true) return;

    logoOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    logoScale.value = withDelay(
      200,
      withSpring(1, { damping: 10, stiffness: 60 })
    );

    titleOpacity.value = withDelay(500, withTiming(1, { duration: 500 }));
    titleTranslateY.value = withDelay(500, withSpring(0, { damping: 14 }));

    subtitleOpacity.value = withDelay(800, withTiming(1, { duration: 500 }));
    subtitleTranslateY.value = withDelay(800, withSpring(0, { damping: 14 }));

    dividerWidth.value = withDelay(1000, withTiming(1, { duration: 600 }));

    detailOpacity.value = withDelay(1200, withTiming(1, { duration: 500 }));
    detailTranslateY.value = withDelay(1200, withSpring(0, { damping: 14 }));

    lottieOpacity.value = withDelay(1400, withTiming(1, { duration: 500 }));
    lottieScale.value = withDelay(1400, withSpring(1, { damping: 12, stiffness: 80 }));

    if (!isGuest) {
      hintOpacity.value = withDelay(1700, withTiming(1, { duration: 500 }));
      hintTranslateY.value = withDelay(1700, withSpring(0, { damping: 14 }));

      pulseOpacity.value = withDelay(2100,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 800 }),
            withTiming(0.5, { duration: 800 })
          ),
          -1,
          false
        )
      );
    }

    timerRef.current = setTimeout(() => {
      autoDismiss();
    }, isGuest ? 4000 : 5500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleAnimStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const dividerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: dividerWidth.value }],
  }));

  const detailAnimStyle = useAnimatedStyle(() => ({
    opacity: detailOpacity.value,
    transform: [{ translateY: detailTranslateY.value }],
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

  const flag = country ? COUNTRY_FLAGS[country] || null : null;
  const userEmail = !isGuest && user ? user.email : null;

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={autoDismiss}>
        <Animated.View style={[styles.overlay, overlayAnimStyle]}>
          <LinearGradient
            colors={isGuest ? ["#1E2530", "#141B24"] : ["#1A2332", "#0F1720"]}
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
              <Animated.View style={titleAnimStyle}>
                <ThemedText style={styles.labelText}>
                  {isGuest ? "Welcome" : "Welcome Back"}
                </ThemedText>
              </Animated.View>

              <Animated.View style={subtitleAnimStyle}>
                <ThemedText style={styles.nameText}>
                  {isGuest ? "Guest" : "Captain"}
                </ThemedText>
              </Animated.View>

              <Animated.View style={[styles.divider, dividerAnimStyle]} />

              {!isGuest && userEmail ? (
                <Animated.View style={[styles.detailRow, detailAnimStyle]}>
                  <Feather name="mail" size={14} color="rgba(255,255,255,0.4)" />
                  <ThemedText style={styles.detailText}>{userEmail}</ThemedText>
                </Animated.View>
              ) : null}

              {!isGuest && country ? (
                <Animated.View style={[styles.detailRow, detailAnimStyle]}>
                  {flag ? (
                    <Text style={styles.flagText}>{flag}</Text>
                  ) : (
                    <Feather name="globe" size={14} color="rgba(255,255,255,0.4)" />
                  )}
                  <ThemedText style={styles.detailText}>{country}</ThemedText>
                </Animated.View>
              ) : null}
            </View>

            <Animated.View style={[styles.lottieContainer, lottieAnimStyle]}>
              <LottieView
                source={require("../../assets/lottie/gps.json")}
                autoPlay
                loop
                style={styles.lottie}
              />
            </Animated.View>

            {!isGuest ? (
              <Animated.View style={[styles.hintContainer, hintAnimStyle]}>
                <View style={styles.hintCard}>
                  <LinearGradient
                    colors={["rgba(164,208,139,0.15)", "rgba(164,208,139,0.05)"]}
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
            ) : (
              <Animated.View style={[styles.guestHintContainer, detailAnimStyle]}>
                <Feather name="info" size={16} color="rgba(255,255,255,0.4)" />
                <ThemedText style={styles.guestHintText}>
                  Sign in for full access to all features
                </ThemedText>
              </Animated.View>
            )}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 32 }]}>
            <ThemedText style={styles.skipText}>Tap anywhere to skip</ThemedText>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, { width: "100%" }]} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
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
    width: 72,
    height: 72,
    marginBottom: 28,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  labelText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 6,
  },
  nameText: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  divider: {
    width: 48,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(164,208,139,0.4)",
    marginVertical: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  detailText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "400",
  },
  flagText: {
    fontSize: 18,
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
  guestHintContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  guestHintText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "400",
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
  skipText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
});
