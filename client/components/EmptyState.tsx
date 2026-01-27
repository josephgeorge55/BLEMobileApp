import React from "react";
import { StyleSheet, View, Image, ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface EmptyStateProps {
  image?: ImageSourcePropType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  image,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { theme, isDark } = useTheme();

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.container}>
      <View style={[styles.imageContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <Image
          source={image || require("../../assets/images/halo-outboard.png")}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
      <ThemedText type="h2" style={styles.title}>
        {title}
      </ThemedText>
      {description ? (
        <ThemedText
          type="body"
          style={[styles.description, { color: theme.textSecondary }]}
        >
          {description}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.buttonContainer}>
          <Button onPress={onAction} variant="accent">{actionLabel}</Button>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
    paddingVertical: Spacing["4xl"],
  },
  imageContainer: {
    width: 200,
    height: 220,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  image: {
    width: 180,
    height: 200,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  description: {
    textAlign: "center",
    marginBottom: Spacing["2xl"],
    lineHeight: 24,
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 260,
  },
});
