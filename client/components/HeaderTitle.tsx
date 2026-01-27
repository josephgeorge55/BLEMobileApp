import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface HeaderTitleProps {
  title?: string;
  showLogo?: boolean;
}

export function HeaderTitle({ showLogo = true }: HeaderTitleProps) {
  const { isDark } = useTheme();

  if (!showLogo) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Image
        source={
          isDark
            ? require("../../assets/images/blade-logo-white.png")
            : require("../../assets/images/blade-logo-white.png")
        }
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    height: 28,
    width: 140,
  },
});
