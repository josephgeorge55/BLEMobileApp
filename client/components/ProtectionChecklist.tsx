import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, Layout } from "react-native-reanimated";
import LottieView from "lottie-react-native";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { BoatData, RegisteredMotor } from "@/lib/firebase";

const DARK = "#1C1C1E";
const DARK_SECONDARY = "#3A3A3C";
const LIGHT_TEXT = "#8E8E93";
const SUCCESS = "#34C759";
const WARNING = "#FF9500";

interface ProtectionChecklistProps {
  boatData: BoatData | null;
  hasWarranty: boolean;
  hasAntiTheft: boolean;
  registeredMotors: RegisteredMotor[];
}

interface StepStatus {
  label: string;
  completed: boolean;
}

export function ProtectionChecklist({
  boatData,
  hasWarranty,
  hasAntiTheft,
  registeredMotors,
}: ProtectionChecklistProps) {
  const lottieRef = useRef<LottieView>(null);

  const steps: StepStatus[] = [
    { label: "Vessel Information", completed: boatData !== null },
    { label: "Warranty Registration", completed: hasWarranty },
    { label: "Anti-Theft Registration", completed: hasAntiTheft },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allComplete = completedCount === 3;

  useEffect(() => {
    if (allComplete && lottieRef.current) {
      lottieRef.current.play();
    }
  }, [allComplete]);

  return (
    <View style={styles.container}>
      <Animated.View
        entering={FadeIn.duration(400)}
        layout={Layout.springify()}
        style={styles.card}
      >
        {allComplete ? (
          <View style={styles.completeLayout}>
            {Platform.OS === "web" ? (
              <View style={styles.shieldComplete}>
                <Feather name="shield" size={28} color="#FFFFFF" />
              </View>
            ) : (
              <LottieView
                ref={lottieRef}
                source={require("../../assets/animations/shield-check.json")}
                style={styles.lottie}
                autoPlay
                loop={false}
              />
            )}
            <View style={styles.completeTextArea}>
              <ThemedText type="h3" style={styles.protectedTitle}>
                {"Fully Protected"}
              </ThemedText>
              <ThemedText type="caption" style={styles.protectedSubtitle}>
                {"All steps complete"}
              </ThemedText>
            </View>
          </View>
        ) : (
          <View style={styles.incompleteLayout}>
            <View style={styles.headerRow}>
              <View style={styles.shieldIconContainer}>
                <Feather name="shield" size={20} color={DARK} />
              </View>
              <View style={styles.headerText}>
                <ThemedText type="body" style={styles.title}>
                  {"Device Protection"}
                </ThemedText>
                <ThemedText type="caption" style={styles.subtitle}>
                  {`${completedCount} of 3 steps complete`}
                </ThemedText>
              </View>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(completedCount / 3) * 100}%` },
                ]}
              />
            </View>
          </View>
        )}

        <View style={styles.stepsContainer}>
          {steps.map((step, index) => (
            <View
              key={step.label}
              style={[
                styles.stepRow,
                index < steps.length - 1 ? styles.stepBorder : undefined,
              ]}
            >
              <View
                style={[
                  styles.stepCircle,
                  step.completed
                    ? { backgroundColor: SUCCESS }
                    : { backgroundColor: "#E5E5EA" },
                ]}
              >
                {step.completed ? (
                  <Feather name="check" size={allComplete ? 10 : 12} color="#FFFFFF" />
                ) : (
                  <ThemedText type="caption" style={styles.stepNumber}>
                    {`${index + 1}`}
                  </ThemedText>
                )}
              </View>
              <ThemedText
                type={allComplete ? "caption" : "small"}
                style={[
                  styles.stepLabel,
                  step.completed ? { color: DARK } : { color: LIGHT_TEXT },
                ]}
              >
                {step.label}
              </ThemedText>
              {step.completed ? (
                <Feather name="check-circle" size={allComplete ? 14 : 16} color={SUCCESS} />
              ) : (
                <Feather name="circle" size={allComplete ? 14 : 16} color="#D1D1D6" />
              )}
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  incompleteLayout: {
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  shieldIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: DARK,
    fontWeight: "600",
    fontSize: 16,
  },
  subtitle: {
    color: LIGHT_TEXT,
    marginTop: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: "#F2F2F7",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: SUCCESS,
    borderRadius: 2,
  },
  completeLayout: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
  },
  lottie: {
    width: 56,
    height: 56,
  },
  shieldComplete: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: SUCCESS,
    alignItems: "center",
    justifyContent: "center",
  },
  completeTextArea: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  protectedTitle: {
    color: DARK,
    fontWeight: "700",
    fontSize: 18,
  },
  protectedSubtitle: {
    color: SUCCESS,
    marginTop: 2,
    fontWeight: "500",
  },
  stepsContainer: {},
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
  },
  stepBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F2F2F7",
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm + 2,
  },
  stepNumber: {
    color: LIGHT_TEXT,
    fontSize: 11,
    fontWeight: "600",
  },
  stepLabel: {
    flex: 1,
  },
});
