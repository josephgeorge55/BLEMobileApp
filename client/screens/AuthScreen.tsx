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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useUser } from "@/context/UserContext";
import { Spacing, BladeColors, BorderRadius, Gradients } from "@/constants/theme";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, register } = useUser();
  
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidPin = (pin: string) => {
    return /^\d{6}$/.test(pin);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!isValidPin(pin)) {
      setError("PIN must be exactly 6 digits");
      return;
    }

    if (mode === "register" && pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = mode === "register" 
        ? await register(email, pin)
        : await login(email, pin);

      if (!result.success) {
        setError(result.error || "Something went wrong");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError(null);
    setPin("");
    setConfirmPin("");
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Gradients.dark as [string, string]}
        style={StyleSheet.absoluteFill}
      />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={[styles.content, { paddingTop: insets.top + Spacing["4xl"] }]}>
          <View style={styles.logoSection}>
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.productImage}
              resizeMode="contain"
            />
            <Image
              source={require("../../assets/images/blade-logo-white.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <ThemedText type="body" style={styles.tagline}>
              Precision Electric Propulsion
            </ThemedText>
          </View>

          <View style={styles.formSection}>
            <View style={styles.formCard}>
              <ThemedText type="h2" style={styles.formTitle}>
                {mode === "login" ? "Welcome Back" : "Create Account"}
              </ThemedText>
              <ThemedText type="small" style={styles.formSubtitle}>
                {mode === "login" 
                  ? "Sign in to manage your outboard" 
                  : "Register to pair your Blade outboard"}
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
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="caption" style={styles.inputLabel}>
                  6-DIGIT PIN
                </ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="000000"
                  placeholderTextColor="#64748B"
                  value={pin}
                  onChangeText={(text) => setPin(text.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                />
              </View>

              {mode === "register" ? (
                <View style={styles.inputGroup}>
                  <ThemedText type="caption" style={styles.inputLabel}>
                    CONFIRM PIN
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="000000"
                    placeholderTextColor="#64748B"
                    value={confirmPin}
                    onChangeText={(text) => setConfirmPin(text.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={6}
                  />
                </View>
              ) : null}

              <Button
                onPress={handleSubmit}
                disabled={isLoading}
                style={styles.submitButton}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  mode === "login" ? "Sign In" : "Create Account"
                )}
              </Button>

              <Pressable onPress={toggleMode} style={styles.toggleContainer}>
                <ThemedText type="small" style={styles.toggleText}>
                  {mode === "login" 
                    ? "Don't have an account? " 
                    : "Already have an account? "}
                  <ThemedText type="small" style={styles.toggleLink}>
                    {mode === "login" ? "Register" : "Sign In"}
                  </ThemedText>
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <ThemedText type="caption" style={styles.footerText}>
              Blade Marine Technologies Limited
            </ThemedText>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1120",
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
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
    color: "#94A3B8",
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 11,
  },
  formSection: {
    paddingHorizontal: Spacing.screenPadding,
  },
  formCard: {
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    borderRadius: BorderRadius.xl,
    padding: Spacing["2xl"],
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  formTitle: {
    color: "#F8FAFC",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  formSubtitle: {
    color: "#94A3B8",
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
    color: "#94A3B8",
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: "#F8FAFC",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  submitButton: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  toggleContainer: {
    alignItems: "center",
  },
  toggleText: {
    color: "#94A3B8",
  },
  toggleLink: {
    color: BladeColors.accent,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
  },
  footerText: {
    color: "#475569",
  },
});
