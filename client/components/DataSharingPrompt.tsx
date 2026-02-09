import React from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { BladeColors, BorderRadius, Spacing } from "@/constants/theme";

interface DataSharingPromptProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function DataSharingPrompt({
  visible,
  onAccept,
  onDecline,
}: DataSharingPromptProps) {
  const handleAccept = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAccept();
  };

  const handleDecline = () => {
    Haptics.selectionAsync();
    onDecline();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(300)}
        style={styles.overlay}
      >
        <Animated.View
          entering={SlideInUp.duration(400).springify()}
          style={styles.container}
        >
          <View style={styles.iconBackground}>
            <Feather
              name="bar-chart-2"
              size={32}
              color={BladeColors.accent}
            />
          </View>

          <Text style={styles.title}>Help Us Improve</Text>

          <Text style={styles.body}>
            Share your usage data with Blade to help us improve our products
            and your experience on the water. This includes trip statistics,
            device info, and motor serial number. You can change this anytime
            in Settings.
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={styles.shareButton}
              onPress={handleAccept}
              hitSlop={8}
            >
              <Text style={styles.shareButtonText}>Share Data</Text>
            </Pressable>

            <Pressable
              style={styles.declineButton}
              onPress={handleDecline}
              hitSlop={8}
            >
              <Text style={styles.declineButtonText}>Not Now</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "rgba(44,44,46,0.95)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing["3xl"],
    paddingBottom: Spacing["3xl"],
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing["3xl"],
    alignItems: "center",
  },
  iconBackground: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(164,208,139,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: "#AEAEB2",
    lineHeight: 22,
    marginBottom: Spacing["2xl"],
    textAlign: "center",
  },
  buttonContainer: {
    width: "100%",
    gap: Spacing.md,
  },
  shareButton: {
    backgroundColor: BladeColors.accent,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  declineButton: {
    backgroundColor: "transparent",
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
