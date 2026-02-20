import React, { useRef } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { BladeColors, Spacing, BorderRadius } from "@/constants/theme";

interface DatePickerFieldProps {
  value: Date;
  onChange: (date: Date) => void;
  maximumDate?: Date;
}

function formatDateForInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePickerField({ value, onChange, maximumDate }: DatePickerFieldProps) {
  const webDateInputRef = useRef<HTMLInputElement | null>(null);

  const handleWebDateChange = (dateString: string) => {
    if (dateString) {
      const d = new Date(dateString + "T00:00:00");
      if (!isNaN(d.getTime()) && d <= (maximumDate || new Date())) {
        onChange(d);
      }
    }
  };

  return (
    <View>
      <Pressable
        style={styles.dateRow}
        onPress={() => webDateInputRef.current?.showPicker?.()}
        testID="button-date-picker"
      >
        <Feather name="calendar" size={18} color={BladeColors.accent} />
        <ThemedText type="body" style={styles.dateText}>
          {value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </ThemedText>
        <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.5)" />
      </Pressable>

      <View style={styles.hiddenInputWrap}>
        <input
          ref={webDateInputRef}
          type="date"
          value={formatDateForInput(value)}
          max={formatDateForInput(maximumDate || new Date())}
          onChange={(e: any) => handleWebDateChange(e.target.value)}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  dateText: {
    flex: 1,
    color: "#FFFFFF",
  },
  hiddenInputWrap: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
  },
});
