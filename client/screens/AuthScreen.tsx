import React, { useState, useMemo, useEffect } from "react";
import {
  StyleSheet,
  View,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const APP_VERSION = Constants.expoConfig?.version || "1.4.1";
const BUILD_NUMBER = "2026.02.14";
const FIRMWARE_PROTOCOL = "BLE 5.0";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const IS_SHORT_SCREEN = SCREEN_HEIGHT < 700;

const AUTH_PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 2 + Math.random() * 3,
  opacity: 0.04 + Math.random() * 0.06,
  duration: 8000 + Math.random() * 6000,
  drift: 60 + Math.random() * 80,
}));

function AuthParticle({ data }: { data: (typeof AUTH_PARTICLES)[0] }) {
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

function AnimatedLogo() {
  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(16);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(12);
  const lineWidth = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withDelay(200, withTiming(1, { duration: 700 }));
    logoScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 80 }));
    titleOpacity.value = withDelay(500, withTiming(1, { duration: 500 }));
    titleTranslateY.value = withDelay(500, withSpring(0, { damping: 14 }));
    subtitleOpacity.value = withDelay(750, withTiming(1, { duration: 500 }));
    subtitleTranslateY.value = withDelay(750, withSpring(0, { damping: 14 }));
    lineWidth.value = withDelay(900, withSpring(50, { damping: 15 }));
  }, []);

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
    <View style={styles.logoSection}>
      {AUTH_PARTICLES.map((p) => (
        <AuthParticle key={p.id} data={p} />
      ))}
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Image
          source={require("../../assets/images/blade-icon-green.png")}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={titleStyle}>
        <ThemedText type="h2" style={styles.brandTitle}>
          Blade Halo Connect
        </ThemedText>
      </Animated.View>
      <Animated.View style={[styles.accentLine, lineStyle]} />
      <Animated.View style={subtitleStyle}>
        <ThemedText type="body" style={styles.brandSubtitle}>
          by Blade Outboards
        </ThemedText>
      </Animated.View>
    </View>
  );
}

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Australia", "Austria",
  "Bahamas", "Bahrain", "Bangladesh", "Belgium", "Bermuda", "Brazil", "Brunei", "Bulgaria",
  "Cambodia", "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Dominican Republic",
  "Ecuador", "Egypt", "Estonia",
  "Fiji", "Finland", "France",
  "Germany", "Ghana", "Greece", "Grenada", "Guatemala",
  "Honduras", "Hong Kong", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan",
  "Kenya", "Kuwait",
  "Latvia", "Lebanon", "Libya", "Lithuania", "Luxembourg",
  "Madagascar", "Malaysia", "Maldives", "Malta", "Mauritius", "Mexico", "Monaco", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Netherlands", "New Zealand", "Nigeria", "Norway",
  "Oman",
  "Pakistan", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Puerto Rico",
  "Qatar",
  "Romania", "Russia",
  "Saudi Arabia", "Seychelles", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland",
  "Taiwan", "Tanzania", "Thailand", "Trinidad and Tobago", "Tunisia", "Turkey",
  "UAE", "UK", "Ukraine", "Uruguay", "USA",
  "Vanuatu", "Venezuela", "Vietnam",
];

export default function AuthScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { login, register, loginAsGuest, resetPassword } = useUser();
  const { showSuccess, showError } = useToast();
  
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRIES;
    const search = countrySearch.toLowerCase().trim();
    return COUNTRIES.filter((c) => c.toLowerCase().includes(search));
  }, [countrySearch]);

  const isValidEmail = (emailStr: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (mode === "reset") {
      setIsLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      try {
        const result = await resetPassword(email);
        if (result.success) {
          Alert.alert(
            "Check Your Email",
            "We've sent a password reset link to your email address.",
            [{ text: "OK", onPress: () => setMode("login") }]
          );
        } else {
          setError(result.error || "Password reset failed");
        }
      } catch (e: any) {
        setError(e.message || "Network error");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = mode === "register" 
        ? await register(email, password, selectedCountry || undefined)
        : await login(email, password);

      if (!result.success) {
        setError(result.error || "Something went wrong");
      } else {
        showSuccess(mode === "register" ? "Account created" : "Welcome back");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
      showError("Connection issue. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    if (mode === "reset") {
      setMode("login");
    } else {
      setMode(mode === "login" ? "register" : "login");
    }
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setSelectedCountry("");
  };

  const handleOpenSupport = async () => {
    await WebBrowser.openBrowserAsync("https://support.bladeoutboards.com");
  };

  const handleForgotPassword = () => {
    setMode("reset");
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleGuestLogin = () => {
    loginAsGuest();
    showSuccess("Signed in as guest");
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#2C2C2E", "#1C1C1E"] as [string, string]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.noiseOverlay} pointerEvents="none" />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + (IS_SHORT_SCREEN ? Spacing["2xl"] : Spacing["4xl"]) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          overScrollMode="never"
          alwaysBounceVertical={false}
        >
          <AnimatedLogo />

          <Animated.View entering={FadeInUp.delay(300).duration(600).springify()} style={styles.formSection}>
            <Animated.View entering={FadeIn.delay(500).duration(400)}>
              <View style={styles.formCard}>
              <ThemedText type="h2" style={styles.formTitle}>
                {mode === "login" ? "Welcome Back" : mode === "register" ? "Create Account" : "Reset Password"}
              </ThemedText>
              <ThemedText type="small" style={styles.formSubtitle}>
                {mode === "login" 
                  ? "Sign in to manage your outboard" 
                  : mode === "register"
                    ? "Register to pair your Blade outboard"
                    : "Enter your email to reset your password"}
              </ThemedText>

              {error ? (
                <View style={styles.errorContainer}>
                  <ThemedText type="small" style={styles.errorText}>
                    {error}
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.inputGroup}>
                <ThemedText type="caption" style={styles.inputLabel}>
                  EMAIL
                </ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  testID="email-input"
                />
              </View>

              {mode !== "reset" ? (
                <>
                  <View style={styles.inputGroup}>
                    <ThemedText type="caption" style={styles.inputLabel}>
                      PASSWORD
                    </ThemedText>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        placeholder="Enter password"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoComplete="password"
                        testID="password-input"
                      />
                      <Pressable 
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeButton}
                      >
                        <Feather 
                          name={showPassword ? "eye-off" : "eye"} 
                          size={20} 
                          color="rgba(255,255,255,0.35)" 
                        />
                      </Pressable>
                    </View>
                  </View>

                  {mode === "register" ? (
                    <>
                      <View style={styles.inputGroup}>
                        <ThemedText type="caption" style={styles.inputLabel}>
                          CONFIRM PASSWORD
                        </ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder="Confirm password"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          secureTextEntry={!showPassword}
                          autoComplete="password"
                          testID="confirm-password-input"
                        />
                      </View>

                      <View style={styles.inputGroup}>
                        <ThemedText type="caption" style={styles.inputLabel}>
                          COUNTRY (OPTIONAL)
                        </ThemedText>
                        <Pressable
                          style={styles.countrySelector}
                          onPress={() => {
                            setCountrySearch("");
                            setShowCountryPicker(true);
                          }}
                          testID="country-picker-button"
                        >
                          <Feather name="globe" size={18} color="rgba(255,255,255,0.35)" style={styles.countryIcon} />
                          <ThemedText
                            type="body"
                            style={selectedCountry ? styles.countryText : styles.countryPlaceholder}
                          >
                            {selectedCountry || "Select your country (optional)"}
                          </ThemedText>
                          <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.35)" />
                        </Pressable>
                      </View>
                    </>
                  ) : null}

                  {mode === "login" ? (
                    <Pressable onPress={handleForgotPassword} style={styles.forgotPassword}>
                      <ThemedText type="small" style={styles.forgotPasswordText}>
                        Forgot password?
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              <Button
                onPress={handleSubmit}
                disabled={isLoading}
                style={styles.submitButton}
                variant="accent"
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : "Send Reset Link"
                )}
              </Button>

              <Pressable onPress={toggleMode} style={styles.toggleContainer}>
                <ThemedText type="small" style={styles.toggleText}>
                  {mode === "login" 
                    ? "Don't have an account? " 
                    : mode === "register"
                      ? "Already have an account? "
                      : "Remember your password? "}
                  <ThemedText type="small" style={styles.toggleLink}>
                    {mode === "login" ? "Register" : "Sign In"}
                  </ThemedText>
                </ThemedText>
              </Pressable>

              {mode !== "reset" ? (
                <>
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <ThemedText type="caption" style={styles.dividerText}>OR</ThemedText>
                    <View style={styles.dividerLine} />
                  </View>

                  <Pressable onPress={handleGuestLogin} style={styles.guestButton} testID="guest-button">
                    <Feather name="user" size={18} color="rgba(255,255,255,0.45)" />
                    <ThemedText type="body" style={styles.guestButtonText}>
                      Continue as Guest
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}

              </View>
            </Animated.View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(700).duration(500).springify()} style={[styles.bottomRow, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <Pressable 
              onPress={() => navigation.navigate('Onboarding')} 
              style={styles.introLink}
            >
              <Feather name="play-circle" size={13} color="rgba(255,255,255,0.4)" />
              <ThemedText type="caption" style={styles.introLinkText}>
                View Introduction
              </ThemedText>
            </Pressable>

            <Animated.View entering={FadeIn.delay(800).duration(400)}>
              <Pressable onPress={handleOpenSupport} style={styles.supportLink}>
                <Feather name="life-buoy" size={13} color="rgba(255,255,255,0.35)" />
                <ThemedText type="caption" style={styles.supportText}>
                  Support
                </ThemedText>
              </Pressable>
            </Animated.View>
          </Animated.View>

          <Animated.View style={styles.versionInfo} entering={FadeIn.delay(1000).duration(400)}>
            <ThemedText type="caption" style={styles.oemText}>
              BLADE MARINE TECHNOLOGIES LTD
            </ThemedText>
            <View style={styles.versionRow}>
              <ThemedText type="caption" style={styles.versionLabel}>
                v{APP_VERSION}
              </ThemedText>
              <View style={styles.versionDot} />
              <ThemedText type="caption" style={styles.versionLabel}>
                {BUILD_NUMBER}
              </ThemedText>
              <View style={styles.versionDot} />
              <ThemedText type="caption" style={styles.versionLabel}>
                {FIRMWARE_PROTOCOL}
              </ThemedText>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3" style={styles.modalTitle}>Select Country</ThemedText>
              <Pressable onPress={() => setShowCountryPicker(false)} style={styles.modalCloseButton}>
                <Feather name="x" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, styles.modalSearchInput]}
              placeholder="Search countries..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
              autoCorrect={false}
              testID="country-search-input"
            />

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              style={styles.countryList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryItem}
                  onPress={() => {
                    setSelectedCountry(item);
                    setShowCountryPicker(false);
                  }}
                >
                  <ThemedText
                    type="body"
                    style={[
                      styles.countryItemText,
                      item === selectedCountry ? styles.countryItemSelected : null,
                    ]}
                  >
                    {item}
                  </ThemedText>
                  {item === selectedCountry ? (
                    <Feather name="check" size={18} color={BladeColors.accent} />
                  ) : null}
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.countryItemDivider} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: Spacing.md,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.01)",
  },
  logoSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: IS_SHORT_SCREEN ? Spacing.lg : Spacing["2xl"],
    overflow: "hidden",
  },
  logoContainer: {
    width: IS_SHORT_SCREEN ? 60 : 72,
    height: IS_SHORT_SCREEN ? 60 : 72,
    marginBottom: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: IS_SHORT_SCREEN ? 60 : 72,
    height: IS_SHORT_SCREEN ? 60 : 72,
  },
  brandTitle: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: IS_SHORT_SCREEN ? 22 : 26,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: Spacing.sm,
  },
  accentLine: {
    height: 1,
    backgroundColor: "rgba(164,208,139,0.35)",
    marginBottom: Spacing.sm,
  },
  brandSubtitle: {
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  formSection: {
    paddingHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md,
  },
  formCard: {
    backgroundColor: "rgba(44,44,46,0.65)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  formTitle: {
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.xs,
    fontSize: 20,
  },
  formSubtitle: {
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginBottom: Spacing.lg,
    fontSize: 13,
  },
  errorContainer: {
    backgroundColor: BladeColors.error + "20",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: BladeColors.error,
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    color: "rgba(255,255,255,0.4)",
    marginBottom: 4,
    letterSpacing: 1,
    fontSize: 10,
  },
  input: {
    backgroundColor: "rgba(28,28,30,0.8)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  forgotPassword: {
    alignItems: "flex-end",
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
  },
  forgotPasswordText: {
    color: BladeColors.accent,
    fontSize: 13,
  },
  submitButton: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  toggleContainer: {
    alignItems: "center",
  },
  toggleText: {
    color: "rgba(255,255,255,0.45)",
  },
  toggleLink: {
    color: BladeColors.accent,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dividerText: {
    color: "rgba(255,255,255,0.25)",
    marginHorizontal: Spacing.md,
  },
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.xl,
    backgroundColor: "rgba(58,58,60,0.4)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  guestButtonText: {
    color: "rgba(255,255,255,0.5)",
    fontWeight: "500",
    fontSize: 14,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.screenPadding,
  },
  introLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: Spacing.xs,
  },
  introLinkText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
  supportLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: Spacing.xs,
  },
  supportText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
  },
  versionInfo: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  oemText: {
    color: "rgba(255,255,255,0.15)",
    fontWeight: "500",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  versionLabel: {
    color: "rgba(255,255,255,0.12)",
    fontSize: 9,
  },
  versionDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  countrySelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(28,28,30,0.8)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  countryIcon: {
    marginRight: Spacing.sm,
  },
  countryText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
  },
  countryPlaceholder: {
    flex: 1,
    color: "rgba(255,255,255,0.3)",
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#2C2C2E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingHorizontal: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    color: "#FFFFFF",
  },
  modalCloseButton: {
    padding: Spacing.sm,
  },
  modalSearchInput: {
    marginBottom: Spacing.md,
  },
  countryList: {
    flex: 1,
  },
  countryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  countryItemText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  countryItemSelected: {
    color: BladeColors.accent,
    fontWeight: "600",
  },
  countryItemDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});
