import React, { useState } from "react";
import { View, Text, StyleSheet, Animated, Image, TextInput, Pressable } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "./context/AppContext";
import AppNavigator from "./navigation/AppNavigator";

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

function NameGate({ children }: { children: React.ReactNode }) {
  const { firstName, lastName, setFirstName, setLastName, t } = useApp();
  const [nameEntered, setNameEntered] = useState(false);

  if (!nameEntered && (!firstName.trim() || !lastName.trim())) {
    return (
      <View style={nameGateStyles.container}>
        <View style={nameGateStyles.card}>
          <Image source={logoImage} style={nameGateStyles.logo} resizeMode="contain" />
          <Text style={nameGateStyles.title}>Blade Factory</Text>
          <Text style={nameGateStyles.subtitle}>Enter your name to begin</Text>
          <TextInput
            style={nameGateStyles.input}
            placeholder="First Name"
            placeholderTextColor="#8E8E93"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            testID="input-first-name"
          />
          <TextInput
            style={nameGateStyles.input}
            placeholder="Last Name"
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
            <Text style={nameGateStyles.buttonText}>Continue</Text>
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
            <NameGate>
              <NavigationContainer>
                <StatusBar style="light" />
                <AppNavigator />
                <ToastOverlay />
              </NavigationContainer>
            </NameGate>
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
