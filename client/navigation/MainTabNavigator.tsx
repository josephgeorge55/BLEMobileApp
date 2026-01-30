import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";

import DashboardScreen from "@/screens/DashboardScreen";
import LocationScreen from "@/screens/LocationScreen";
import TripsScreen from "@/screens/TripsScreen";
import UpdatesScreen from "@/screens/UpdatesScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useTheme } from "@/hooks/useTheme";
import { BladeColors, Spacing, BorderRadius } from "@/constants/theme";

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
      {focused && (
        <View style={[styles.iconGlow, { backgroundColor: color + "20" }]} />
      )}
      <Feather name={name} size={22} color={color} />
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
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: isDark ? "#0D1318" : "#F8FAFB",
            default: isDark ? "#0D1318" : "#F8FAFB",
          }),
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.select({ ios: 88, android: 72, default: 72 }),
          paddingBottom: Platform.select({ ios: 28, android: 12, default: 12 }),
          paddingTop: Spacing.sm,
          paddingHorizontal: Spacing.md,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 12,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={isDark ? 80 : 90}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "#0D1318" : "#F8FAFB" }]}>
              <View style={[styles.tabBarTopBorder, { backgroundColor: isDark ? "#1E2832" : "#E5E9EC" }]} />
            </View>
          ),
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.2,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          title: "Dashboard",
          headerTitle: () => <HeaderTitle />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="activity" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="LocationTab"
        component={LocationScreen}
        options={{
          title: "Location",
          headerTitle: () => <HeaderTitle />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="map-pin" color={color} focused={focused} />
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
    width: 44,
    height: 32,
  },
  iconGlow: {
    position: "absolute",
    width: 44,
    height: 32,
    borderRadius: 16,
  },
  tabBarTopBorder: {
    height: 1,
    width: "100%",
  },
});
