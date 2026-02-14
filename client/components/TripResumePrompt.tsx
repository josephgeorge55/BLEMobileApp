import React from "react";
import { View, StyleSheet, Modal, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { BladeColors, Spacing, BorderRadius } from "@/constants/theme";

interface TripResumePromptProps {
  visible: boolean;
  tripName: string;
  onResume: () => void;
  onDiscard: () => void;
}

export function TripResumePrompt({ visible, tripName, onResume, onDiscard }: TripResumePromptProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Feather name="alert-circle" size={32} color={BladeColors.accent} />
          </View>
          <ThemedText type="h3" style={styles.title}>Trip In Progress</ThemedText>
          <ThemedText type="body" style={styles.message}>
            It looks like "{tripName}" was interrupted. Would you like to resume recording?
          </ThemedText>
          <Pressable style={styles.resumeButton} onPress={onResume}>
            <Feather name="play" size={18} color="#FFFFFF" />
            <ThemedText type="body" style={styles.resumeText}>Resume Trip</ThemedText>
          </Pressable>
          <Pressable style={styles.discardButton} onPress={onDiscard}>
            <ThemedText type="body" style={styles.discardText}>Discard & End Trip</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: "rgba(44,44,46,0.98)",
    borderRadius: BorderRadius["2xl"],
    padding: Spacing["2xl"],
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BladeColors.accent + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  message: {
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  resumeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: BladeColors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    width: "100%",
    marginBottom: Spacing.sm,
  },
  resumeText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  discardButton: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
  },
  discardText: {
    color: "rgba(255,255,255,0.45)",
    fontWeight: "500",
  },
});
