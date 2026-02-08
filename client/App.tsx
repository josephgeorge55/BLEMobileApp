import React from "react";
import { StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MotorProvider } from "@/context/MotorContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { UserProvider } from "@/context/UserContext";
import { TripProvider } from "@/context/TripContext";
import { ToastProvider } from "@/context/ToastContext";
import LiveActivityManager from "@/components/LiveActivityManager";
import WatchConnectivityBridge from "@/components/WatchConnectivityBridge";

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            <KeyboardProvider>
              <UserProvider>
                <MotorProvider>
                  <TripProvider>
                    <LiveActivityManager />
                    <WatchConnectivityBridge />
                    <SettingsProvider>
                      <ToastProvider>
                        <NavigationContainer>
                          <RootStackNavigator />
                        </NavigationContainer>
                        <StatusBar style="light" />
                      </ToastProvider>
                    </SettingsProvider>
                  </TripProvider>
                </MotorProvider>
              </UserProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
