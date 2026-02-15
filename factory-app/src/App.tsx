import React, { useState } from "react";
import { View, Text, StyleSheet, Animated, Image, TextInput, Pressable } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { AppProvider, useApp } from "./context/AppContext";
import AppNavigator from "./navigation/AppNavigator";
import type { Language } from "./i18n/translations";

const logoImage = require("../assets/images/blade-logo-white.png");

function ToastOverlay() {
  const { toast, hideToast } = useApp();
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (toast.visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [toast.visible]);

  if (!toast.visible && !toast.message) return null;

  const bgColor =
    toast.type === "success" ? "#34C759" :
    toast.type === "error" ? "#FF3B30" : "#007AFF";

  return (
    <Animated.View style={[styles.toast, { opacity, backgroundColor: bgColor }]} pointerEvents="none">
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Blade Factory encountered an issue</Text>
          <Text style={styles.errorMsg}>{this.state.error?.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function PinGate({ children }: { children: React.ReactNode }) {
  const { t, language, setLanguage } = useApp();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  if (unlocked) {
    return <>{children}</>;
  }

  const handleUnlock = () => {
    if (pin === "88888888") {
      setUnlocked(true);
      setError("");
    } else {
      setError(t("invalidPin"));
    }
  };

  const langButtons: { lang: Language; label: string }[] = [
    { lang: "en", label: "EN" },
    { lang: "zh", label: "\u4E2D\u6587" },
    { lang: "vi", label: "VN" },
  ];

  return (
    <View style={pinGateStyles.container}>
      <View style={pinGateStyles.card}>
        <Image source={logoImage} style={pinGateStyles.logo} resizeMode="contain" />
        <View style={pinGateStyles.titleRow}>
          <Feather name="lock" size={20} color="#FF3B30" style={{ marginRight: 8 }} />
          <Text style={pinGateStyles.title}>{t("authRequired")}</Text>
        </View>
        <Text style={pinGateStyles.subtitle}>{t("authSubtitle")}</Text>
        <Text style={pinGateStyles.label}>{t("accessCode")}</Text>
        <TextInput
          style={pinGateStyles.input}
          placeholder={t("enterPin")}
          placeholderTextColor="#8E8E93"
          value={pin}
          onChangeText={(text) => {
            setPin(text);
            setError("");
          }}
          secureTextEntry
          maxLength={8}
          keyboardType="number-pad"
          testID="input-pin"
        />
        {error ? <Text style={pinGateStyles.errorText}>{error}</Text> : null}
        <Pressable
          style={[pinGateStyles.button, pin.length < 1 ? pinGateStyles.buttonDisabled : null]}
          disabled={pin.length < 1}
          onPress={handleUnlock}
          testID="button-unlock"
        >
          <Text style={pinGateStyles.buttonText}>{t("unlock")}</Text>
        </Pressable>
        <View style={pinGateStyles.langRow}>
          {langButtons.map((item) => (
            <Pressable
              key={item.lang}
              style={[
                pinGateStyles.langButton,
                language === item.lang ? pinGateStyles.langButtonActive : null,
              ]}
              onPress={() => setLanguage(item.lang)}
            >
              <Text
                style={[
                  pinGateStyles.langButtonText,
                  language === item.lang ? pinGateStyles.langButtonTextActive : null,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function NameGate({ children }: { children: React.ReactNode }) {
  const { firstName, lastName, setFirstName, setLastName, t } = useApp();
  const [nameEntered, setNameEntered] = useState(false);

  if (!nameEntered) {
    return (
      <View style={nameGateStyles.container}>
        <View style={nameGateStyles.card}>
          <Image source={logoImage} style={nameGateStyles.logo} resizeMode="contain" />
          <Text style={nameGateStyles.title}>{t("appTitle")}</Text>
          <Text style={nameGateStyles.subtitle}>{t("enterNameToBegin")}</Text>
          <TextInput
            style={nameGateStyles.input}
            placeholder={t("firstName")}
            placeholderTextColor="#8E8E93"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            testID="input-first-name"
          />
          <TextInput
            style={nameGateStyles.input}
            placeholder={t("lastName")}
            placeholderTextColor="#8E8E93"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            testID="input-last-name"
          />
          <Pressable
            style={[
              nameGateStyles.button,
              (!firstName.trim() || !lastName.trim()) ? nameGateStyles.buttonDisabled : null,
            ]}
            disabled={!firstName.trim() || !lastName.trim()}
            onPress={() => setNameEntered(true)}
            testID="button-continue"
          >
            <Text style={nameGateStyles.buttonText}>{t("continue")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider>
            <PinGate>
              <NameGate>
                <NavigationContainer>
                  <StatusBar style="light" />
                  <AppNavigator />
                  <ToastOverlay />
                </NavigationContainer>
              </NameGate>
            </PinGate>
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    padding: 40,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 12,
    textAlign: "center",
  },
  errorMsg: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
  },
});

const pinGateStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
    tintColor: "#1C1C1E",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FF3B30",
  },
  subtitle: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 48,
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    color: "#1C1C1E",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 4,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 8,
  },
  button: {
    width: "100%",
    height: 48,
    backgroundColor: "#34C759",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#C7C7CC",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  langRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    gap: 8,
  },
  langButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
  },
  langButtonActive: {
    backgroundColor: "#1C1C1E",
  },
  langButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
  },
  langButtonTextActive: {
    color: "#FFFFFF",
  },
});

const nameGateStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
    tintColor: "#1C1C1E",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#8E8E93",
    marginBottom: 24,
  },
  input: {
    width: "100%",
    height: 48,
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#1C1C1E",
    marginBottom: 12,
  },
  button: {
    width: "100%",
    height: 48,
    backgroundColor: "#34C759",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#C7C7CC",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
});
