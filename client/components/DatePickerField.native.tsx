import React, { useState } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { BladeColors, Spacing, BorderRadius } from "@/constants/theme";

interface DatePickerFieldProps {
  value: Date;
  onChange: (date: Date) => void;
  maximumDate?: Date;
}

export function DatePickerField({ value, onChange, maximumDate }: DatePickerFieldProps) {
  const [show, setShow] = useState(false);

  const handleChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShow(false);
    }
    if (selectedDate) {
      onChange(selectedDate);
    }
  };

  return (
    <View>
      <Pressable
        style={styles.dateRow}
        onPress={() => setShow(true)}
        testID="button-date-picker"
      >
        <Feather name="calendar" size={18} color={BladeColors.accent} />
        <ThemedText type="body" style={styles.dateText}>
          {value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </ThemedText>
        <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.5)" />
      </Pressable>

      {show ? (
        <View>
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleChange}
            maximumDate={maximumDate || new Date()}
            themeVariant="dark"
            textColor="#FFFFFF"
            style={Platform.OS === "ios" ? styles.iosPicker : undefined}
          />
          {Platform.OS === "ios" ? (
            <Pressable style={styles.doneButton} onPress={() => setShow(false)}>
              <ThemedText type="button" style={{ color: BladeColors.accent }}>Done</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
  iosPicker: {
    height: 180,
    marginTop: Spacing.sm,
  },
  doneButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
});
