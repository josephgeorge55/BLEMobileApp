import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

interface ChecklistItemProps {
  stepNumber: number;
  title: string;
  description: string;
  status: "pending" | "passed" | "failed" | "in_progress";
  onPress: () => void;
  disabled?: boolean;
}

export default function ChecklistItem({
  stepNumber,
  title,
  description,
  status,
  onPress,
  disabled,
}: ChecklistItemProps) {
  const statusIcon = () => {
    switch (status) {
      case "passed":
        return <Feather name="check-circle" size={24} color="#34C759" />;
      case "failed":
        return <Feather name="x-circle" size={24} color="#FF3B30" />;
      case "in_progress":
        return <Feather name="loader" size={24} color="#FF9500" />;
      default:
        return <Feather name="circle" size={24} color="#C7C7CC" />;
    }
  };

  const borderColor =
    status === "passed" ? "#34C759" :
    status === "failed" ? "#FF3B30" :
    status === "in_progress" ? "#FF9500" :
    "#E5E5EA";

  return (
    <Pressable
      style={[styles.container, { borderLeftColor: borderColor }]}
      onPress={onPress}
      disabled={disabled}
      testID={`checklist-item-${stepNumber}`}
    >
      <View style={styles.stepBadge}>
        <Text style={styles.stepNumber}>{stepNumber}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.statusIcon}>{statusIcon()}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    color: "#8E8E93",
  },
  statusIcon: {
    width: 28,
    alignItems: "center",
  },
});
