import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import BleScannerModal from "@/screens/BleScannerModal";
import AuthScreen from "@/screens/AuthScreen";
import OnboardingScreen, { ONBOARDING_KEY } from "@/screens/OnboardingScreen";
import FeatureTourScreen, { FEATURE_TOUR_KEY } from "@/screens/FeatureTourScreen";
import TripDetailScreen from "@/screens/TripDetailScreen";
import PassportScreen from "@/screens/PassportScreen";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { LoadingScreen } from "@/components/LoadingScreen";
import { DataSharingPrompt } from "@/components/DataSharingPrompt";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useMotor } from "@/context/MotorContext";
import { useUser } from "@/context/UserContext";
import { useSettings } from "@/context/SettingsContext";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { Spacing, BladeColors } from "@/constants/theme";

const DATA_SHARING_PROMPT_SHOWN_KEY = "@blade_data_sharing_prompt_shown";

export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  FeatureTour: undefined;
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


function OnboardingReplay() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const handleComplete = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);
  return <OnboardingScreen onComplete={handleComplete} />;
}

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isLoggedIn, isLoading } = useUser();
  const { setAnonymousDataSharing } = useSettings();
  const [showDataPrompt, setShowDataPrompt] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [hasSeenFeatureTour, setHasSeenFeatureTour] = useState<boolean | null>(null);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkStartupFlags = async () => {
      try {
        const [onboardingSeen, tourSeen] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(FEATURE_TOUR_KEY),
        ]);
        setHasSeenOnboarding(onboardingSeen === "true");
        setHasSeenFeatureTour(tourSeen === "true");
      } catch {
        setHasSeenOnboarding(true);
        setHasSeenFeatureTour(true);
      }
    };
    checkStartupFlags();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
      setShowDataPrompt(false);
      return;
    }

    const checkAndShowPrompt = async () => {
      try {
        const alreadyShown = await AsyncStorage.getItem(DATA_SHARING_PROMPT_SHOWN_KEY);
        if (alreadyShown) return;

        promptTimerRef.current = setTimeout(() => {
          setShowDataPrompt(true);
        }, 15000);
      } catch (error) {
        console.log("[DataShare] Error checking prompt state:", error);
      }
    };

    checkAndShowPrompt();

    return () => {
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
    };
  }, [isLoggedIn]);

  const handleAcceptDataSharing = async () => {
    setAnonymousDataSharing(true);
    setShowDataPrompt(false);
    await AsyncStorage.setItem(DATA_SHARING_PROMPT_SHOWN_KEY, "true");
    console.log("[DataShare] User accepted data sharing");
  };

  const handleDeclineDataSharing = async () => {
    setAnonymousDataSharing(false);
    setShowDataPrompt(false);
    await AsyncStorage.setItem(DATA_SHARING_PROMPT_SHOWN_KEY, "true");
    console.log("[DataShare] User declined data sharing");
  };

  const handleOnboardingComplete = useCallback(() => {
    setHasSeenOnboarding(true);
  }, []);

  const handleFeatureTourComplete = useCallback(() => {
    setHasSeenFeatureTour(true);
  }, []);

  if (isLoading || hasSeenOnboarding === null || hasSeenFeatureTour === null) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Stack.Navigator 
        screenOptions={{
          ...screenOptions,
          animation: "fade_from_bottom",
          animationDuration: 350,
        }}
      >
        {!isLoggedIn ? (
          hasSeenOnboarding ? (
            <>
              <Stack.Screen
                name="Auth"
                component={AuthScreen}
                options={{ 
                  headerShown: false,
                  animation: "fade",
                }}
              />
              <Stack.Screen
                name="Onboarding"
                component={OnboardingReplay}
                options={{
                  headerShown: false,
                  animation: "slide_from_bottom",
                  presentation: "modal",
                }}
              />
            </>
          ) : (
            <>
              <Stack.Screen
                name="Onboarding"
                options={{
                  headerShown: false,
                  animation: "fade",
                }}
              >
                {() => <OnboardingScreen onComplete={handleOnboardingComplete} />}
              </Stack.Screen>
              <Stack.Screen
                name="Auth"
                component={AuthScreen}
                options={{ 
                  headerShown: false,
                  animation: "fade",
                }}
              />
            </>
          )
        ) : !hasSeenFeatureTour ? (
          <>
            <Stack.Screen
              name="FeatureTour"
              options={{
                headerShown: false,
                animation: "fade",
              }}
            >
              {() => <FeatureTourScreen onComplete={handleFeatureTourComplete} />}
            </Stack.Screen>
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
                headerTransparent: false,
                headerBlurEffect: undefined,
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
                headerTransparent: false,
                headerBlurEffect: undefined,
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
      <DataSharingPrompt
        visible={showDataPrompt}
        onAccept={handleAcceptDataSharing}
        onDecline={handleDeclineDataSharing}
      />
    </>
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
