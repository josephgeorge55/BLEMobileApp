import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import LottieView from "lottie-react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "@/components/SettingsRow";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";
import type { BoatData, RegisteredMotor } from "@/lib/firebase";
import * as Haptics from "expo-haptics";

const DARK_TILE = "rgba(44,44,46,0.92)";
const TILE_TEXT = "#FFFFFF";
const TILE_TEXT_SECONDARY = "rgba(255,255,255,0.5)";
const SUCCESS_GREEN = "#34C759";

interface ProtectionChecklistProps {
  boatData: BoatData | null;
  hasWarranty: boolean;
  hasAntiTheft: boolean;
  registeredMotors: RegisteredMotor[];
  onVesselInfoPress: () => void;
  onWarrantyPress: () => void;
  onAntiTheftPress: () => void;
  onRemoveMotor: (serialNumber: string) => void;
}

interface StepConfig {
  key: string;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  completed: boolean;
  subtitle: string;
  onPress: () => void;
}

function ChecklistStep({
  step,
  compact,
}: {
  step: StepConfig;
  compact: boolean;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    step.onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        compact ? styles.stepRowCompact : styles.stepRow,
        pressed ? { opacity: 0.7 } : undefined,
      ]}
    >
      <View
        style={[
          compact ? styles.statusCircleCompact : styles.statusCircle,
          step.completed
            ? { backgroundColor: SUCCESS_GREEN }
            : { borderColor: TILE_TEXT_SECONDARY, borderWidth: 1.5 },
        ]}
      >
        {step.completed ? (
          <Feather
            name="check"
            size={compact ? 10 : 14}
            color={TILE_TEXT}
          />
        ) : null}
      </View>
      <View
        style={[
          compact ? styles.iconContainerCompact : styles.iconContainer,
          {
            backgroundColor: step.completed
              ? SUCCESS_GREEN + "18"
              : "rgba(255,255,255,0.06)",
          },
        ]}
      >
        <Feather
          name={step.icon}
          size={compact ? 14 : 18}
          color={step.completed ? SUCCESS_GREEN : TILE_TEXT_SECONDARY}
        />
      </View>
      <View style={styles.stepContent}>
        <ThemedText
          type={compact ? "small" : "body"}
          style={{
            color: step.completed ? TILE_TEXT : TILE_TEXT_SECONDARY,
          }}
        >
          {step.title}
        </ThemedText>
        {compact ? null : (
          <ThemedText
            type="caption"
            style={{
              color: step.completed
                ? SUCCESS_GREEN
                : TILE_TEXT_SECONDARY,
              marginTop: 2,
            }}
          >
            {step.subtitle}
          </ThemedText>
        )}
      </View>
      <Feather
        name="chevron-right"
        size={compact ? 14 : 18}
        color={TILE_TEXT_SECONDARY}
      />
    </Pressable>
  );
}

export function ProtectionChecklist({
  boatData,
  hasWarranty,
  hasAntiTheft,
  registeredMotors,
  onVesselInfoPress,
  onWarrantyPress,
  onAntiTheftPress,
  onRemoveMotor,
}: ProtectionChecklistProps) {
  const lottieRef = useRef<LottieView>(null);

  const steps: StepConfig[] = [
    {
      key: "vessel",
      title: "Vessel Information",
      icon: "anchor",
      completed: boatData !== null,
      subtitle: boatData ? boatData.boatType : "Add your boat details",
      onPress: onVesselInfoPress,
    },
    {
      key: "warranty",
      title: "Warranty Registration",
      icon: "shield",
      completed: hasWarranty,
      subtitle: hasWarranty
        ? "Registered"
        : "Register your motor for warranty coverage",
      onPress: onWarrantyPress,
    },
    {
      key: "antitheft",
      title: "Anti-Theft Registration",
      icon: "lock",
      completed: hasAntiTheft,
      subtitle: hasAntiTheft
        ? `${registeredMotors.length} motor${registeredMotors.length !== 1 ? "s" : ""} protected`
        : "Link your outboard for GPS protection",
      onPress: onAntiTheftPress,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allComplete = completedCount === 3;

  useEffect(() => {
    if (allComplete && lottieRef.current) {
      lottieRef.current.play();
    }
  }, [allComplete]);

  return (
    <SettingsSection title="Device Protection">
      {allComplete ? (
        <Animated.View
          entering={FadeIn.duration(400)}
          layout={Layout.springify()}
        >
          <View style={styles.completeHeader}>
            <LottieView
              ref={lottieRef}
              source={require("../../assets/animations/shield-check.json")}
              style={styles.lottie}
              autoPlay={false}
              loop={false}
            />
            <ThemedText
              type="h3"
              style={[
                styles.fullyProtectedText,
                {
                  textShadowColor: SUCCESS_GREEN + "60",
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 12,
                },
              ]}
            >
              {"Fully Protected"}
            </ThemedText>
          </View>

          {steps.map((step) => (
            <ChecklistStep key={step.key} step={step} compact />
          ))}

          {registeredMotors.length > 0 ? (
            <View style={styles.motorsCompact}>
              <ThemedText
                type="caption"
                style={{
                  color: TILE_TEXT_SECONDARY,
                  marginBottom: Spacing.xs,
                  letterSpacing: 0.8,
                }}
              >
                {"REGISTERED MOTORS"}
              </ThemedText>
              {registeredMotors.map((m, i) => (
                <Pressable
                  key={`${m.serialNumber}-${i}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onRemoveMotor(m.serialNumber);
                  }}
                  style={({ pressed }) => [
                    styles.motorCompactRow,
                    pressed ? { opacity: 0.7 } : undefined,
                  ]}
                >
                  <Feather
                    name="lock"
                    size={12}
                    color={SUCCESS_GREEN}
                    style={{ marginRight: Spacing.sm }}
                  />
                  <ThemedText
                    type="caption"
                    style={{ color: TILE_TEXT, flex: 1 }}
                  >
                    {m.name ? m.name : m.serialNumber}
                  </ThemedText>
                  <ThemedText
                    type="caption"
                    style={{ color: TILE_TEXT_SECONDARY }}
                  >
                    {m.name ? m.serialNumber : "Protected"}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(300)}
          layout={Layout.springify()}
        >
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(completedCount / 3) * 100}%` },
                ]}
              />
            </View>
            <ThemedText
              type="caption"
              style={{ color: TILE_TEXT_SECONDARY, marginLeft: Spacing.sm }}
            >
              {`${completedCount} of 3 steps complete`}
            </ThemedText>
          </View>

          {steps.map((step) => (
            <ChecklistStep key={step.key} step={step} compact={false} />
          ))}
        </Animated.View>
      )}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: SUCCESS_GREEN,
    borderRadius: 2,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  stepRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  statusCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  statusCircleCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  iconContainerCompact: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  stepContent: {
    flex: 1,
  },
  completeHeader: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  lottie: {
    width: 120,
    height: 120,
  },
  fullyProtectedText: {
    color: SUCCESS_GREEN,
    marginTop: Spacing.xs,
  },
  motorsCompact: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: Spacing.xs,
  },
  motorCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
});