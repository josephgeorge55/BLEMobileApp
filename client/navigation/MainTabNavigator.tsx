import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";

import DashboardScreen from "@/screens/DashboardScreen";
import LocationScreen from "@/screens/LocationScreen";
import TripsScreen from "@/screens/TripsScreen";
import UpdatesScreen from "@/screens/UpdatesScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useTheme } from "@/hooks/useTheme";
import { BladeColors, Spacing } from "@/constants/theme";

export type MainTabParamList = {
  DashboardTab: undefined;
  LocationTab: undefined;
  TripsTab: undefined;
  UpdatesTab: undefined;
  SettingsTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabBarIcon({ name, color, focused }: { name: keyof typeof Feather.glyphMap; color: string; focused: boolean }) {
  return (
    <View style={styles.iconWrapper}>
      {focused ? (
        <View style={[styles.iconGlow, { backgroundColor: color + "30" }]} />
      ) : null}
      <View style={[styles.iconInner, focused && styles.iconFocused]}>
        <Feather 
          name={name} 
          size={22} 
          color={color}
        />
      </View>
    </View>
  );
}

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="DashboardTab"
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerTitleAlign: "center",
        headerStyle: {
          backgroundColor: Platform.select({
            ios: "transparent",
            default: isDark ? BladeColors.primaryDark : BladeColors.primary,
          }),
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "600",
        },
        tabBarActiveTintColor: BladeColors.accent,
        tabBarInactiveTintColor: isDark ? "#5A6B7A" : "#8A9BA8",
        tabBarShowLabel: true,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: isDark ? "#0A0F14" : "#FFFFFF",
            default: isDark ? "#0A0F14" : "#FFFFFF",
          }),
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.select({ ios: 85, android: 68, default: 68 }),
          paddingBottom: Platform.select({ ios: 26, android: 8, default: 8 }),
          paddingTop: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.4 : 0.06,
          shadowRadius: 16,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "#0A0F14" : "#FFFFFF" }]}>
              <View style={[styles.tabBarTopBorder, { backgroundColor: isDark ? "#1A2530" : "#E8ECEF" }]} />
            </View>
          ),
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
          letterSpacing: 0.1,
          marginTop: 4,
        },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          title: "Dashboard",
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="activity" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="LocationTab"
        component={LocationScreen}
        options={{
          title: "Motor",
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="shield" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="TripsTab"
        component={TripsScreen}
        options={{
          title: "Trips",
          headerTitle: () => <HeaderTitle />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="navigation" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="UpdatesTab"
        component={UpdatesScreen}
        options={{
          title: "Updates",
          headerTitle: () => <HeaderTitle />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="download-cloud" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: "Settings",
          headerTitle: () => <HeaderTitle />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="settings" color={color} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 32,
  },
  iconGlow: {
    position: "absolute",
    width: 48,
    height: 32,
    borderRadius: 16,
  },
  iconInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconFocused: {
    transform: [{ scale: 1.05 }],
  },
  tabBarTopBorder: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
});
