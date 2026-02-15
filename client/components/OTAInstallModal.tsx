import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";

interface OTAInstallModalProps {
  visible: boolean;
  onClose: () => void;
  otaState: "idle" | "downloading" | "installing" | "complete" | "error";
  progress: number;
  statusMessage: string;
  errorMessage?: string;
  onCancel?: () => void;
}

const MODAL_BG = "rgba(44,44,46,0.98)";
const STEP_PENDING = "rgba(142,142,147,0.3)";
const STEP_PENDING_BORDER = "rgba(142,142,147,0.5)";
const TEXT_PRIMARY = "#F2F2F7";
const TEXT_SECONDARY = "rgba(235,235,240,0.6)";
const WARNING_BG = "rgba(255,59,48,0.15)";
const ERROR_COLOR = "#FF3B30";

interface StepIndicatorProps {
  stepNumber: 1 | 2 | 3;
  title: string;
  status: "pending" | "in-progress" | "complete";
}

function StepIndicator({ stepNumber, title, status }: StepIndicatorProps) {
  return (
    <View style={styles.stepContainer}>
      <View
        style={[
          styles.stepCircle,
          status === "pending" && styles.stepPending,
          status === "in-progress" && styles.stepInProgress,
          status === "complete" && styles.stepComplete,
        ]}
      >
        {status === "pending" && (
          <View
            style={[
              styles.stepNumber,
              { backgroundColor: "rgba(255,255,255,0.2)" },
            ]}
          >
            <ThemedText
              type="caption"
              style={{ color: TEXT_SECONDARY, fontWeight: "600" }}
            >
              {stepNumber}
            </ThemedText>
          </View>
        )}
        {status === "in-progress" && (
          <ActivityIndicator size="small" color={BladeColors.accent} />
        )}
        {status === "complete" && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Feather name="check" size={18} color={BladeColors.accent} />
          </Animated.View>
        )}
      </View>
      <ThemedText type="small" style={{ color: TEXT_PRIMARY }}>
        {title}
      </ThemedText>
    </View>
  );
}

function getStepStatus(
  otaState: string,
  step: 1 | 2 | 3
): "pending" | "in-progress" | "complete" {
  if (otaState === "idle") return "pending";

  if (step === 1) {
    if (otaState === "downloading") return "in-progress";
    if (otaState === "installing" || otaState === "complete") return "complete";
    if (otaState === "error") return "complete";
    return "pending";
  }

  if (step === 2) {
    if (otaState === "downloading") return "pending";
    if (otaState === "installing") return "in-progress";
    if (otaState === "complete") return "complete";
    if (otaState === "error") return "pending";
    return "pending";
  }

  if (step === 3) {
    if (otaState === "downloading" || otaState === "installing")
      return "pending";
    if (otaState === "complete") return "complete";
    if (otaState === "error") return "pending";
    return "pending";
  }

  return "pending";
}

export function OTAInstallModal({
  visible,
  onClose,
  otaState,
  progress,
  statusMessage,
  errorMessage,
  onCancel,
}: OTAInstallModalProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (!visible || otaState === "idle") {
      setElapsedTime(0);
      return;
    }

    if (otaState === "complete" || otaState === "error") {
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, otaState]);

  useEffect(() => {
    if (otaState === "complete" && Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [otaState]);

  useEffect(() => {
    if (otaState === "error" && Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [otaState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCancel = () => {
    if (onCancel) {
      setShowCancelConfirm(true);
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    if (onCancel) {
      onCancel();
    }
  };

  const showCancelButton =
    otaState === "downloading" && (onCancel !== undefined);
  const showCloseButton = otaState === "complete" || otaState === "error";

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={showCloseButton ? onClose : undefined}
    >
      <View style={styles.overlay}>
        <View style={styles.centeredView}>
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <ThemedText type="h3" style={{ color: TEXT_PRIMARY }}>
                Firmware Update
              </ThemedText>
              {showCloseButton && (
                <Pressable
                  onPress={onClose}
                  style={styles.closeButton}
                  testID="button-close-ota-modal"
                >
                  <Feather name="x" size={24} color={TEXT_PRIMARY} />
                </Pressable>
              )}
            </View>

            {otaState !== "error" && (
              <ThemedText
                type="small"
                style={[styles.warningText, { color: TEXT_SECONDARY }]}
              >
                This may take up to 15 minutes
              </ThemedText>
            )}

            {otaState === "error" && errorMessage ? (
              <View style={styles.errorContainer}>
                <Feather name="alert-circle" size={24} color={ERROR_COLOR} />
                <ThemedText
                  type="small"
                  style={{ color: ERROR_COLOR, flex: 1, marginLeft: Spacing.md }}
                >
                  {errorMessage}
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.stepsContainer}>
                  <StepIndicator
                    stepNumber={1}
                    title="Downloaded"
                    status={getStepStatus(otaState, 1)}
                  />
                  <StepIndicator
                    stepNumber={2}
                    title="Installed"
                    status={getStepStatus(otaState, 2)}
                  />
                  <StepIndicator
                    stepNumber={3}
                    title="Completed"
                    status={getStepStatus(otaState, 3)}
                  />
                </View>

                <View style={styles.timerContainer}>
                  <ThemedText
                    type="small"
                    style={{ color: TEXT_SECONDARY }}
                  >
                    Time Elapsed: {formatTime(elapsedTime)}
                  </ThemedText>
                </View>

                {otaState !== "complete" && (
                  <>
                    <View style={styles.progressBarContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.min(progress, 100)}%` },
                          ]}
                        />
                      </View>
                      <ThemedText
                        type="caption"
                        style={{ color: TEXT_SECONDARY, marginTop: Spacing.sm }}
                      >
                        {Math.min(progress, 100)}%
                      </ThemedText>
                    </View>

                    {statusMessage && (
                      <ThemedText
                        type="small"
                        style={[styles.statusMessage, { color: TEXT_PRIMARY }]}
                      >
                        {statusMessage}
                      </ThemedText>
                    )}
                  </>
                )}
              </>
            )}

            {otaState !== "error" && otaState !== "complete" && (
              <View style={styles.warningsSection}>
                <View style={styles.warningHeader}>
                  <Feather
                    name="alert-triangle"
                    size={16}
                    color={BladeColors.warning}
                  />
                  <ThemedText
                    type="caption"
                    style={{
                      color: BladeColors.warning,
                      marginLeft: Spacing.xs,
                      fontWeight: "600",
                    }}
                  >
                    Safety Warnings
                  </ThemedText>
                </View>

                <View style={styles.warningItems}>
                  <View style={styles.warningItem}>
                    <Feather
                      name="minus"
                      size={12}
                      color={BladeColors.warning}
                      style={{ marginTop: 5 }}
                    />
                    <ThemedText
                      type="small"
                      style={[
                        styles.warningItemText,
                        { color: TEXT_PRIMARY },
                      ]}
                    >
                      Do not turn off the outboard motor
                    </ThemedText>
                  </View>

                  <View style={styles.warningItem}>
                    <Feather
                      name="minus"
                      size={12}
                      color={BladeColors.warning}
                      style={{ marginTop: 5 }}
                    />
                    <ThemedText
                      type="small"
                      style={[
                        styles.warningItemText,
                        { color: TEXT_PRIMARY },
                      ]}
                    >
                      Do not disconnect Bluetooth
                    </ThemedText>
                  </View>

                  <View style={styles.warningItem}>
                    <Feather
                      name="minus"
                      size={12}
                      color={BladeColors.warning}
                      style={{ marginTop: 5 }}
                    />
                    <ThemedText
                      type="small"
                      style={[
                        styles.warningItemText,
                        { color: TEXT_PRIMARY },
                      ]}
                    >
                      Keep the app in the foreground
                    </ThemedText>
                  </View>

                  <View style={styles.warningItem}>
                    <Feather
                      name="minus"
                      size={12}
                      color={BladeColors.warning}
                      style={{ marginTop: 5 }}
                    />
                    <ThemedText
                      type="small"
                      style={[
                        styles.warningItemText,
                        { color: TEXT_PRIMARY },
                      ]}
                    >
                      Ensure your phone stays charged
                    </ThemedText>
                  </View>
                </View>
              </View>
            )}

            {(showCancelButton || showCloseButton) && (
              <View style={styles.buttonContainer}>
                {showCancelButton && (
                  <Pressable
                    onPress={handleCancel}
                    style={[styles.button, styles.cancelButton]}
                    testID="button-cancel-ota"
                  >
                    <ThemedText
                      type="button"
                      style={{ color: BladeColors.error }}
                    >
                      Cancel
                    </ThemedText>
                  </Pressable>
                )}
                {showCloseButton && (
                  <Pressable
                    onPress={onClose}
                    style={[styles.button, styles.closeButtonPrimary]}
                    testID="button-close-ota"
                  >
                    <ThemedText type="button" style={{ color: TEXT_PRIMARY }}>
                      Close
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </View>

      {showCancelConfirm && (
        <Modal
          visible={showCancelConfirm}
          transparent={true}
          animationType="fade"
          statusBarTranslucent={true}
        >
          <View style={styles.overlay}>
            <View style={styles.centeredView}>
              <View style={styles.confirmModalContent}>
                <ThemedText
                  type="h4"
                  style={{ color: TEXT_PRIMARY, marginBottom: Spacing.md }}
                >
                  Cancel Update?
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{
                    color: TEXT_SECONDARY,
                    marginBottom: Spacing.lg,
                    lineHeight: 20,
                  }}
                >
                  Canceling the update may leave your device in an incomplete
                  state. Are you sure?
                </ThemedText>

                <View style={styles.confirmButtonContainer}>
                  <Pressable
                    onPress={() => setShowCancelConfirm(false)}
                    style={[styles.confirmButton, styles.confirmKeepButton]}
                    testID="button-keep-updating"
                  >
                    <ThemedText type="button" style={{ color: TEXT_PRIMARY }}>
                      Keep Updating
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={handleConfirmCancel}
                    style={[styles.confirmButton, styles.confirmCancelButton]}
                    testID="button-confirm-cancel"
                  >
                    <ThemedText type="button" style={{ color: ERROR_COLOR }}>
                      Cancel Update
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  modalContent: {
    backgroundColor: MODAL_BG,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxWidth: 400,
    width: "100%",
  },
  confirmModalContent: {
    backgroundColor: MODAL_BG,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxWidth: 340,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  closeButton: {
    padding: Spacing.sm,
    marginRight: -Spacing.sm,
  },
  warningText: {
    marginBottom: Spacing.md,
    fontStyle: "italic",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: WARNING_BG,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  stepsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.xl,
    marginTop: Spacing.md,
  },
  stepContainer: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  stepCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  stepPending: {
    backgroundColor: STEP_PENDING,
    borderColor: STEP_PENDING_BORDER,
  },
  stepInProgress: {
    backgroundColor: "rgba(164,208,139,0.15)",
    borderColor: BladeColors.accent,
  },
  stepComplete: {
    backgroundColor: "rgba(164,208,139,0.15)",
    borderColor: BladeColors.accent,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  timerContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  progressBarContainer: {
    marginBottom: Spacing.lg,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: BladeColors.accent,
    borderRadius: 4,
  },
  statusMessage: {
    textAlign: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  warningsSection: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  warningItems: {
    gap: Spacing.sm,
  },
  warningItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  warningItemText: {
    flex: 1,
    lineHeight: 18,
  },
  buttonContainer: {
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  button: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: BladeColors.error,
    backgroundColor: "transparent",
  },
  closeButtonPrimary: {
    backgroundColor: BladeColors.accent,
  },
  confirmButtonContainer: {
    gap: Spacing.md,
    flexDirection: "row",
  },
  confirmButton: {
    flex: 1,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmKeepButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  confirmCancelButton: {
    borderWidth: 1,
    borderColor: ERROR_COLOR,
    backgroundColor: "transparent",
  },
});
