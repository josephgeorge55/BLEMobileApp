import React from "react";
import { View, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import BleScannerModal from "@/screens/BleScannerModal";
import AuthScreen from "@/screens/AuthScreen";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useMotor } from "@/context/MotorContext";
import { useUser } from "@/context/UserContext";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { Spacing, BladeColors } from "@/constants/theme";

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  BleScanner: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainWithFab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { motor, isScanning, isConnecting, startScan } = useMotor();

  const handleFabPress = () => {
    startScan();
    navigation.navigate("BleScanner");
  };

  return (
    <View style={styles.container}>
      <MainTabNavigator />
      <View
        style={[
          styles.fabContainer,
          { bottom: Platform.select({ ios: 100, android: 80, default: 80 }) },
        ]}
      >
        <FloatingActionButton
          isConnected={motor?.isConnected ?? false}
          isScanning={isScanning || isConnecting}
          onPress={handleFabPress}
        />
      </View>
    </View>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={BladeColors.accent} />
    </View>
  );
}

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isLoggedIn, isLoading } = useUser();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!isLoggedIn ? (
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Main"
            component={MainWithFab}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="BleScanner"
            component={BleScannerModal}
            options={{
              presentation: "modal",
              headerShown: false,
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fabContainer: {
    position: "absolute",
    right: Spacing.fabOffset,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B1120",
  },
});
