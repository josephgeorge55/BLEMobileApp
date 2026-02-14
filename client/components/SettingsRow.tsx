import React from "react";
import { StyleSheet, View, Switch, Pressable, Platform } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";

const supportsGlass = Platform.OS === "ios" && isLiquidGlassAvailable();
const DARK_TILE = "rgba(44,44,46,0.92)";
const TILE_TEXT = "#FFFFFF";
const TILE_TEXT_SECONDARY = "rgba(255,255,255,0.5)";
const TILE_BORDER = "rgba(255,255,255,0.08)";
const ICON_BG = "rgba(255,255,255,0.08)";

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
  disabled?: boolean;
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
  disabled,
}: SettingsRowProps) {
  const handleToggle = (newValue: boolean) => {
    Haptics.selectionAsync();
    onToggle?.(newValue);
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const rowContent = (pressed: boolean) => (
    <View style={[
      styles.row,
      pressed && styles.rowPressed,
      disabled && { opacity: 0.5 },
    ]}>
      {icon ? (
        <View style={styles.iconContainer}>
          <Feather
            name={icon}
            size={18}
            color={
              destructive
                ? BladeColors.error
                : iconColor || BladeColors.accent
            }
          />
        </View>
      ) : null}
      <View style={styles.content}>
        <ThemedText
          type="body"
          style={destructive ? { color: BladeColors.error } : { color: TILE_TEXT }}
        >
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            type="caption"
            style={{ color: TILE_TEXT_SECONDARY, marginTop: 2 }}
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
            false: "rgba(255,255,255,0.15)",
            true: BladeColors.accent,
          }}
          thumbColor="#FFFFFF"
        />
      ) : value ? (
        <ThemedText type="small" style={{ color: TILE_TEXT_SECONDARY }}>
          {value}
        </ThemedText>
      ) : showChevron && onPress ? (
        <Feather name="chevron-right" size={20} color={TILE_TEXT_SECONDARY} />
      ) : null}
    </View>
  );

  if (onPress && !isToggle) {
    return (
      <View style={styles.container}>
        <Pressable
          onPress={handlePress}
          disabled={disabled}
          style={({ pressed }) => pressed ? { opacity: 0.7 } : undefined}
        >
          {({ pressed }) => rowContent(pressed)}
        </Pressable>
      </View>
    );
  }

  return <View style={styles.container}>{rowContent(false)}</View>;
}

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const SectionContainer = supportsGlass ? GlassView : View;
  const sectionProps = supportsGlass
    ? { glassEffectStyle: "regular" as const, tintColor: "rgba(255,255,255,0.08)" }
    : {};

  return (
    <View style={styles.section}>
      <ThemedText
        type="caption"
        style={styles.sectionTitle}
      >
        {title.toUpperCase()}
      </ThemedText>
      <SectionContainer
        {...sectionProps}
        style={[
          styles.sectionContent,
          !supportsGlass && { backgroundColor: DARK_TILE, borderColor: TILE_BORDER, borderWidth: 1 },
        ]}
      >
        {children}
      </SectionContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginHorizontal: -Spacing.xs,
  },
  rowPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    backgroundColor: ICON_BG,
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
    letterSpacing: 0.8,
    fontWeight: "600",
    color: "#8E8E93",
  },
  sectionContent: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    overflow: "hidden",
  },
});
