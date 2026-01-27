import React from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BladeColors, Gradients } from "@/constants/theme";

interface AntiTheftLinkModalProps {
  visible: boolean;
  motorName: string;
  serialNumber: string;
  isLinking: boolean;
  onLink: () => void;
  onSkip: () => void;
}

export function AntiTheftLinkModal({
  visible,
  motorName,
  serialNumber,
  isLinking,
  onLink,
  onSkip,
}: AntiTheftLinkModalProps) {
  const { theme, isDark } = useTheme();

  const handleLink = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLink();
  };

  const handleSkip = () => {
    Haptics.selectionAsync();
    onSkip();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          entering={SlideInUp.duration(400).springify()}
          style={[
            styles.modal,
            { backgroundColor: isDark ? "#1E293B" : theme.surface },
          ]}
        >
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={Gradients.accent as [string, string]}
              style={styles.iconGradient}
            >
              <Feather name="shield" size={32} color="#FFFFFF" />
            </LinearGradient>
          </View>

          <ThemedText type="h2" style={styles.title}>
            Enable Anti-Theft?
          </ThemedText>

          <ThemedText
            type="body"
            style={[styles.description, { color: theme.textSecondary }]}
          >
            Link this outboard to your account for protection. Only you will be
            able to pair and control this motor.
          </ThemedText>

          <View
            style={[
              styles.motorInfo,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <View style={styles.motorIcon}>
              <Feather name="anchor" size={20} color={BladeColors.primary} />
            </View>
            <View style={styles.motorDetails}>
              <ThemedText type="h4">{motorName}</ThemedText>
              <ThemedText
                type="mono"
                style={{ color: theme.textSecondary, fontSize: 12 }}
              >
                {serialNumber}
              </ThemedText>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: BladeColors.success + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: BladeColors.success }]} />
              <ThemedText type="caption" style={{ color: BladeColors.success }}>
                Paired
              </ThemedText>
            </View>
          </View>

          <View style={styles.benefits}>
            <View style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: BladeColors.accent + "15" }]}>
                <Feather name="lock" size={14} color={BladeColors.accent} />
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
                Prevents unauthorized pairing
              </ThemedText>
            </View>
            <View style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: BladeColors.accent + "15" }]}>
                <Feather name="map-pin" size={14} color={BladeColors.accent} />
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
                Track location if stolen
              </ThemedText>
            </View>
            <View style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: BladeColors.accent + "15" }]}>
                <Feather name="bell" size={14} color={BladeColors.accent} />
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
                Instant theft alerts
              </ThemedText>
            </View>
          </View>

          <View style={styles.actions}>
            <Button onPress={handleLink} disabled={isLinking} style={styles.linkButton}>
              {isLinking ? (
                <View style={styles.linkingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <ThemedText type="button" style={{ color: "#FFFFFF", marginLeft: 8 }}>
                    Linking...
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.linkingRow}>
                  <Feather name="shield" size={18} color="#FFFFFF" />
                  <ThemedText type="button" style={{ color: "#FFFFFF", marginLeft: 8 }}>
                    Enable Protection
                  </ThemedText>
                </View>
              )}
            </Button>

            <Pressable
              onPress={handleSkip}
              disabled={isLinking}
              style={styles.skipButton}
            >
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Skip for now
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText
            type="caption"
            style={[styles.note, { color: theme.textTertiary }]}
          >
            You can enable this later in Settings
          </ThemedText>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modal: {
    width: "100%",
    maxWidth: 360,
    borderRadius: BorderRadius.xl,
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  motorInfo: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  motorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BladeColors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  motorDetails: {
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  benefits: {
    width: "100%",
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  benefitIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    width: "100%",
    alignItems: "center",
  },
  linkButton: {
    width: "100%",
  },
  linkingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  skipButton: {
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  note: {
    marginTop: Spacing.lg,
    textAlign: "center",
  },
});
