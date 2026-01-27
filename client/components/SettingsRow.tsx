import React from "react";
import { StyleSheet, View, Pressable, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BladeColors } from "@/constants/theme";

interface SettingsRowProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  showChevron?: boolean;
  iconColor?: string;
  destructive?: boolean;
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  isToggle,
  toggleValue,
  onToggle,
  onPress,
  showChevron = true,
  iconColor,
  destructive,
}: SettingsRowProps) {
  const { theme } = useTheme();

  const handleToggle = (newValue: boolean) => {
    Haptics.selectionAsync();
    onToggle?.(newValue);
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.selectionAsync();
      onPress();
    }
  };

  const content = (
    <View style={styles.row}>
      {icon ? (
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Feather
            name={icon}
            size={18}
            color={
              destructive
                ? BladeColors.error
                : iconColor || BladeColors.primary
            }
          />
        </View>
      ) : null}
      <View style={styles.content}>
        <ThemedText
          type="body"
          style={destructive ? { color: BladeColors.error } : undefined}
        >
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            type="caption"
            style={{ color: theme.textSecondary, marginTop: 2 }}
          >
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={handleToggle}
          trackColor={{
            false: theme.backgroundTertiary,
            true: BladeColors.accent,
          }}
          thumbColor="#FFFFFF"
        />
      ) : value ? (
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {value}
        </ThemedText>
      ) : showChevron && onPress ? (
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      ) : null}
    </View>
  );

  if (onPress && !isToggle) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.container,
          { backgroundColor: pressed ? theme.backgroundSecondary : "transparent" },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText
        type="caption"
        style={[styles.sectionTitle, { color: theme.textSecondary }]}
      >
        {title.toUpperCase()}
      </ThemedText>
      <View
        style={[
          styles.sectionContent,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing["2xl"],
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.md,
    letterSpacing: 0.5,
  },
  sectionContent: {
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
  },
});
