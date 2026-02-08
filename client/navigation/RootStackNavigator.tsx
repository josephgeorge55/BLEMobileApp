import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import BleScannerModal from "@/screens/BleScannerModal";
import AuthScreen from "@/screens/AuthScreen";
import TripDetailScreen from "@/screens/TripDetailScreen";
import PassportScreen from "@/screens/PassportScreen";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useMotor } from "@/context/MotorContext";
import { useUser } from "@/context/UserContext";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { Spacing, BladeColors } from "@/constants/theme";

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  BleScanner: undefined;
  TripDetail: { tripId: string };
  Passport: undefined;
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
        pointerEvents="box-none"
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


export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isLoggedIn, isLoading } = useUser();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator 
      screenOptions={{
        ...screenOptions,
        animation: "fade_from_bottom",
        animationDuration: 350,
      }}
    >
      {!isLoggedIn ? (
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ 
            headerShown: false,
            animation: "fade",
          }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Main"
            component={MainWithFab}
            options={{ 
              headerShown: false,
              animation: "fade",
            }}
          />
          <Stack.Screen
            name="BleScanner"
            component={BleScannerModal}
            options={{
              presentation: "modal",
              headerShown: false,
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="TripDetail"
            component={TripDetailScreen}
            options={{
              headerTitle: "Trip Details",
              headerBackTitle: "Back",
              animation: "fade_from_bottom",
              animationDuration: 350,
              headerStyle: { backgroundColor: "rgba(44,44,46,0.95)" },
              headerTintColor: "#FFFFFF",
            }}
          />
          <Stack.Screen
            name="Passport"
            component={PassportScreen}
            options={{
              headerTitle: "Outboard Passport",
              headerBackTitle: "Back",
              animation: "fade_from_bottom",
              animationDuration: 350,
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
});
