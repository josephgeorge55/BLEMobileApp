import { Platform } from "react-native";
import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { isLiquidGlassAvailable } from "expo-glass-effect";

import { useTheme } from "@/hooks/useTheme";
import { BladeColors } from "@/constants/theme";

interface UseScreenOptionsParams {
  transparent?: boolean;
}

export function useScreenOptions({
  transparent = true,
}: UseScreenOptionsParams = {}): NativeStackNavigationOptions {
  const { theme, isDark } = useTheme();

  const headerBgColor = isDark ? BladeColors.primaryDark : BladeColors.primary;

  return {
    headerTitleAlign: "center",
    headerTransparent: transparent,
    headerBlurEffect: isDark ? "systemMaterialDark" : "systemMaterial",
    headerTintColor: "#FFFFFF",
    headerStyle: {
      backgroundColor: Platform.select({
        ios: transparent ? undefined : headerBgColor,
        android: headerBgColor,
        web: headerBgColor,
      }),
    },
    headerShadowVisible: false,
    gestureEnabled: true,
    gestureDirection: "horizontal",
    fullScreenGestureEnabled: isLiquidGlassAvailable() ? false : true,
    contentStyle: {
      backgroundColor: theme.backgroundRoot,
    },
  };
}
