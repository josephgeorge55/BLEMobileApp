import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import BleScannerModal from "@/screens/BleScannerModal";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useMotor } from "@/context/MotorContext";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { Spacing } from "@/constants/theme";

export type RootStackParamList = {
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
          { bottom: Platform.select({ ios: 100, android: 80 }) },
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

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
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
