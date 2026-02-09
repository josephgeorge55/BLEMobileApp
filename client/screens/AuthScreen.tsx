import React, { useState } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";
const BUILD_NUMBER = "2026.01.27";
const FIRMWARE_PROTOCOL = "BLE 5.0";

export default function AuthScreen() {
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
        ? await register(email, password)
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
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.productImage}
              resizeMode="contain"
              entering={FadeInUp.delay(200).duration(600).springify()}
            />
            <Animated.Image
              source={require("../../assets/images/blade-logo-white.png")}
              style={styles.logo}
              resizeMode="contain"
              entering={FadeIn.delay(500).duration(400)}
            />
            <Animated.View entering={FadeIn.delay(700).duration(400)}>
              <ThemedText type="body" style={styles.tagline}>
                Precision Electric Propulsion
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
    justifyContent: "space-between",
  },
  logoSection: {
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  productImage: {
    width: 200,
    height: 220,
    marginBottom: Spacing.lg,
  },
  logo: {
    width: 180,
    height: 36,
    marginBottom: Spacing.sm,
  },
  tagline: {
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 11,
  },
  formSection: {
    paddingHorizontal: Spacing.screenPadding,
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
});
