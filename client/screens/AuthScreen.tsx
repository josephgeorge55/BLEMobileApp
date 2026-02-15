import React, { useState, useMemo } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeIn, FadeInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import { Spacing, BladeColors, BorderRadius, Gradients } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const APP_VERSION = Constants.expoConfig?.version || "1.3.1";
const BUILD_NUMBER = "2026.02.14";
const FIRMWARE_PROTOCOL = "BLE 5.0";

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

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
          contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing["4xl"] }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={styles.logoSection} entering={FadeIn.duration(800)}>
            <Animated.Image
              source={require("../../assets/images/blade-logo-white.png")}
              style={styles.logo}
              resizeMode="contain"
              entering={FadeIn.delay(200).duration(400)}
            />
            <Animated.View entering={FadeIn.delay(400).duration(400)}>
              <ThemedText type="body" style={styles.seriesName}>
                Blade Halo Series
              </ThemedText>
            </Animated.View>
            <Animated.Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.productImage}
              resizeMode="contain"
              entering={FadeInUp.delay(300).duration(600).springify()}
            />
            <Animated.View entering={FadeIn.delay(600).duration(400)}>
              <ThemedText type="body" style={styles.tagline}>
                Redefined Electric Propulsion
              </ThemedText>
            </Animated.View>
          </Animated.View>

          <View style={styles.formSection}>
            <Animated.View entering={FadeInUp.delay(400).duration(500).springify()}>
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

              <Pressable 
                onPress={() => navigation.navigate('Onboarding')} 
                style={styles.introLink}
              >
                <Feather name="play-circle" size={14} color="rgba(255,255,255,0.35)" />
                <ThemedText type="caption" style={styles.introLinkText}>
                  View Introduction
                </ThemedText>
              </Pressable>
              </View>
            </Animated.View>
          </View>

          <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]} entering={FadeIn.delay(800).duration(400)}>
            <Pressable onPress={handleOpenSupport} style={styles.supportLink}>
              <Feather name="life-buoy" size={14} color="rgba(255,255,255,0.35)" />
              <ThemedText type="caption" style={styles.supportText}>
                Support Center
              </ThemedText>
            </Pressable>
            
            <View style={styles.oemInfo}>
              <ThemedText type="caption" style={styles.oemText}>
                BLADE MARINE TECHNOLOGIES LTD
              </ThemedText>
              <View style={styles.versionRow}>
                <ThemedText type="caption" style={styles.versionLabel}>
                  App v{APP_VERSION}
                </ThemedText>
                <View style={styles.versionDot} />
                <ThemedText type="caption" style={styles.versionLabel}>
                  Build {BUILD_NUMBER}
                </ThemedText>
                <View style={styles.versionDot} />
                <ThemedText type="caption" style={styles.versionLabel}>
                  {FIRMWARE_PROTOCOL}
                </ThemedText>
              </View>
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
    paddingBottom: Spacing.xl,
  },
  logoSection: {
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  productImage: {
    width: 200,
    height: 200,
    marginBottom: Spacing.lg,
  },
  logo: {
    width: 180,
    height: 36,
    marginBottom: Spacing.xs,
  },
  seriesName: {
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 3,
    textTransform: "uppercase",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.015)",
  },
  tagline: {
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 11,
  },
  formSection: {
    paddingHorizontal: Spacing.screenPadding,
    marginTop: Spacing["2xl"],
  },
  formCard: {
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: BorderRadius.xl,
    padding: Spacing["2xl"],
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  formTitle: {
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  formSubtitle: {
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  errorContainer: {
    backgroundColor: BladeColors.error + "20",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: BladeColors.error,
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    color: "rgba(255,255,255,0.45)",
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "rgba(28,28,30,0.8)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  forgotPasswordText: {
    color: BladeColors.accent,
  },
  submitButton: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
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
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dividerText: {
    color: "rgba(255,255,255,0.3)",
    marginHorizontal: Spacing.md,
  },
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    backgroundColor: "rgba(58,58,60,0.6)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  guestButtonText: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "500",
  },
  footer: {
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing["3xl"],
  },
  supportLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "rgba(58,58,60,0.4)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  supportText: {
    color: "rgba(255,255,255,0.35)",
    fontWeight: "500",
  },
  oemInfo: {
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  oemText: {
    color: "rgba(255,255,255,0.25)",
    letterSpacing: 2,
    fontWeight: "600",
    fontSize: 10,
    marginBottom: 6,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  versionLabel: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  versionDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  countrySelector: {
    backgroundColor: "rgba(28,28,30,0.8)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
  },
  countryIcon: {
    marginRight: Spacing.sm,
  },
  countryText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
  },
  countryPlaceholder: {
    flex: 1,
    color: "rgba(255,255,255,0.3)",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    flex: 1,
    backgroundColor: "rgba(28,28,30,0.98)",
    paddingHorizontal: Spacing.screenPadding,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
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
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    paddingHorizontal: Spacing.md,
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
  introLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: Spacing.lg,
  },
  introLinkText: {
    color: "rgba(255,255,255,0.35)",
    fontWeight: "500",
  },
});
