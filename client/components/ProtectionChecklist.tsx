import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions, Platform, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import LottieView from "lottie-react-native";
import { Spacing } from "@/constants/theme";
import type { BoatData, RegisteredMotor } from "@/lib/firebase";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const LOTTIE_SIZE = Math.round(SCREEN_HEIGHT * 0.3);

const DARK = "#1C1C1E";
const LIGHT_TEXT = "#8E8E93";
const SUCCESS = "#34C759";

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
      <View style={styles.lottieContainer}>
        {Platform.OS === "web" ? (
          <View style={styles.webShield}>
            <Feather name="shield" size={LOTTIE_SIZE * 0.45} color={allComplete ? SUCCESS : DARK} />
          </View>
        ) : (
          <LottieView
            ref={lottieRef}
            source={require("../../assets/animations/shield-check.json")}
            style={styles.lottie}
            autoPlay={allComplete}
            loop={false}
          />
        )}
      </View>

      {allComplete ? (
        <Text style={styles.protectedTitle}>Fully Protected</Text>
      ) : (
        <Text style={styles.statusTitle}>Device Protection</Text>
      )}

      <Text style={allComplete ? styles.protectedSubtitle : styles.statusSubtitle}>
        {allComplete ? "All steps complete" : `${completedCount} of 3 steps complete`}
      </Text>

      {!allComplete ? (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(completedCount / 3) * 100}%` },
            ]}
          />
        </View>
      ) : null}

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
                  : { backgroundColor: "rgba(255,255,255,0.15)" },
              ]}
            >
              {step.completed ? (
                <Feather name="check" size={12} color="#FFFFFF" />
              ) : (
                <Text style={styles.stepNumber}>{`${index + 1}`}</Text>
              )}
            </View>
            <Text
              style={[
                styles.stepLabel,
                step.completed
                  ? { color: "rgba(255,255,255,0.85)" }
                  : { color: "rgba(255,255,255,0.4)" },
              ]}
            >
              {step.label}
            </Text>
            {step.completed ? (
              <Feather name="check-circle" size={16} color={SUCCESS} />
            ) : (
              <Feather name="circle" size={16} color="rgba(255,255,255,0.2)" />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  lottieContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  lottie: {
    width: LOTTIE_SIZE,
    height: LOTTIE_SIZE,
  },
  webShield: {
    width: LOTTIE_SIZE,
    height: LOTTIE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  protectedTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  protectedSubtitle: {
    color: SUCCESS,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
    textAlign: "center",
  },
  statusSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "400",
    marginTop: 4,
    textAlign: "center",
  },
  progressBar: {
    height: 3,
    width: "60%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: Spacing.md,
  },
  progressFill: {
    height: "100%",
    backgroundColor: SUCCESS,
    borderRadius: 2,
  },
  stepsContainer: {
    width: "100%",
    marginTop: Spacing.lg,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
  },
  stepBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
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
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "600",
  },
  stepLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
  },
});
