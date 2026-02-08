import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";
import { boatTypes } from "@shared/schema";
import { saveBoatData, deleteBoatData, getBoatData, BoatData } from "@/lib/firebase";

interface BoatSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onSaved?: () => void;
}

type LengthUnit = "ft" | "m";
type WeightUnit = "lbs" | "kg" | "ton";

const ftToM = (ft: number) => ft * 0.3048;
const mToFt = (m: number) => m / 0.3048;
const lbsToKg = (lbs: number) => lbs * 0.453592;
const kgToLbs = (kg: number) => kg / 0.453592;
const tonToKg = (ton: number) => ton * 1000;
const kgToTon = (kg: number) => kg / 1000;

const explicitWords = ['fuck', 'shit', 'ass', 'bitch', 'damn', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bastard', 'nigger', 'faggot'];
const containsExplicitContent = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return explicitWords.some(word => lowerText.includes(word));
};

const BOAT_COLORS = {
  background: "#1C1C1E",
  surface: "rgba(44,44,46,0.92)",
  border: "rgba(255,255,255,0.12)",
  accent: "#A4D08B",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.6)",
  textTertiary: "rgba(255,255,255,0.35)",
};

export function BoatSettingsModal({ visible, onClose, userId, onSaved }: BoatSettingsModalProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  
  const [boatType, setBoatType] = useState<string>("");
  const [lengthValue, setLengthValue] = useState("");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("ft");
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [existingData, setExistingData] = useState<BoatData | null>(null);
  const [vesselName, setVesselName] = useState("");
  const [vin, setVin] = useState("");

  useEffect(() => {
    if (visible && userId) {
      loadBoatData();
    }
  }, [visible, userId]);

  const loadBoatData = async () => {
    setIsLoading(true);
    try {
      const data = await getBoatData(userId);
      setExistingData(data);
      if (data) {
        setBoatType(data.boatType);
        if (lengthUnit === "ft") {
          setLengthValue(mToFt(data.lengthMeters).toFixed(1));
        } else {
          setLengthValue(data.lengthMeters.toFixed(1));
        }
        if (weightUnit === "lbs") {
          setWeightValue(kgToLbs(data.weightKg).toFixed(0));
        } else if (weightUnit === "ton") {
          setWeightValue(kgToTon(data.weightKg).toFixed(2));
        } else {
          setWeightValue(data.weightKg.toFixed(0));
        }
        setVesselName(data.vesselName || "");
        setVin(data.vin || "");
      } else {
        setBoatType("");
        setLengthValue("");
        setWeightValue("");
        setVesselName("");
        setVin("");
      }
    } catch (error) {
      console.error("Error loading boat data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!boatType) {
      Alert.alert("Missing Information", "Please select a boat type.");
      return;
    }
    
    const lengthNum = parseFloat(lengthValue);
    const weightNum = parseFloat(weightValue);
    
    if (isNaN(lengthNum) || lengthNum <= 0) {
      Alert.alert("Invalid Length", "Please enter a valid boat length.");
      return;
    }
    
    if (isNaN(weightNum) || weightNum <= 0) {
      Alert.alert("Invalid Weight", "Please enter a valid boat weight.");
      return;
    }

    if (vesselName && containsExplicitContent(vesselName)) {
      Alert.alert("Invalid Name", "Please use appropriate language for the vessel name.");
      return;
    }

    const lengthMeters = lengthUnit === "ft" ? ftToM(lengthNum) : lengthNum;
    let weightKg: number;
    if (weightUnit === "lbs") {
      weightKg = lbsToKg(weightNum);
    } else if (weightUnit === "ton") {
      weightKg = tonToKg(weightNum);
    } else {
      weightKg = weightNum;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await saveBoatData(userId, {
        boatType,
        lengthMeters,
        weightKg,
        vesselName: vesselName.trim() || undefined,
        vin: vin.trim() || undefined,
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSaved?.();
        onClose();
      } else {
        Alert.alert("Error", result.error || "Failed to save boat data.");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "An error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Boat Information",
      "Are you sure you want to remove your boat information?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            
            try {
              const result = await deleteBoatData(userId);
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setBoatType("");
                setLengthValue("");
                setWeightValue("");
                setExistingData(null);
                onSaved?.();
                onClose();
              } else {
                Alert.alert("Error", result.error || "Failed to delete boat data.");
              }
            } catch (error: any) {
              Alert.alert("Error", error.message || "An error occurred.");
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: BOAT_COLORS.background }]}>
        <View style={[styles.header, { borderBottomColor: BOAT_COLORS.border }]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={BOAT_COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle}>My Boat</Text>
          <View style={styles.headerSpacer} />
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BOAT_COLORS.accent} />
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={[
              styles.contentContainer,
              { paddingBottom: insets.bottom + Spacing["2xl"] },
            ]}
          >
            <Text style={[styles.description, { color: BOAT_COLORS.textSecondary }]}>
              Enter your boat information for trip reports. This data will be included in PDF reports.
            </Text>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: BOAT_COLORS.textSecondary }]}>Boat Type</Text>
              <View style={styles.typeGrid}>
                {boatTypes.map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.typeButton,
                      { 
                        backgroundColor: boatType === type ? BOAT_COLORS.accent : BOAT_COLORS.surface,
                        borderColor: boatType === type ? BOAT_COLORS.accent : BOAT_COLORS.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setBoatType(type);
                    }}
                  >
                    <Text
                      style={[styles.typeButtonText, { color: boatType === type ? "#000" : BOAT_COLORS.text }]}
                    >
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: BOAT_COLORS.textSecondary }]}>Boat Length</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: BOAT_COLORS.surface, color: BOAT_COLORS.text, borderColor: BOAT_COLORS.border },
                  ]}
                  value={lengthValue}
                  onChangeText={setLengthValue}
                  keyboardType="decimal-pad"
                  placeholder="Enter length"
                  placeholderTextColor={BOAT_COLORS.textTertiary}
                />
                <View style={styles.unitToggle}>
                  <Pressable
                    style={[
                      styles.unitButton,
                      { backgroundColor: lengthUnit === "ft" ? BOAT_COLORS.accent : BOAT_COLORS.surface },
                    ]}
                    onPress={() => {
                      if (lengthUnit !== "ft" && lengthValue) {
                        setLengthValue(mToFt(parseFloat(lengthValue)).toFixed(1));
                      }
                      setLengthUnit("ft");
                    }}
                  >
                    <Text style={[styles.unitButtonText, { color: lengthUnit === "ft" ? "#000" : BOAT_COLORS.text }]}>
                      Feet
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.unitButton,
                      { backgroundColor: lengthUnit === "m" ? BOAT_COLORS.accent : BOAT_COLORS.surface },
                    ]}
                    onPress={() => {
                      if (lengthUnit !== "m" && lengthValue) {
                        setLengthValue(ftToM(parseFloat(lengthValue)).toFixed(1));
                      }
                      setLengthUnit("m");
                    }}
                  >
                    <Text style={[styles.unitButtonText, { color: lengthUnit === "m" ? "#000" : BOAT_COLORS.text }]}>
                      Meters
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: BOAT_COLORS.textSecondary }]}>Boat Weight</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: BOAT_COLORS.surface, color: BOAT_COLORS.text, borderColor: BOAT_COLORS.border },
                  ]}
                  value={weightValue}
                  onChangeText={setWeightValue}
                  keyboardType="decimal-pad"
                  placeholder="Enter weight"
                  placeholderTextColor={BOAT_COLORS.textTertiary}
                />
                <View style={styles.unitToggle}>
                  <Pressable
                    style={[
                      styles.unitButton,
                      { backgroundColor: weightUnit === "lbs" ? BOAT_COLORS.accent : BOAT_COLORS.surface },
                    ]}
                    onPress={() => {
                      if (weightUnit !== "lbs" && weightValue) {
                        const kg = weightUnit === "ton" ? tonToKg(parseFloat(weightValue)) : parseFloat(weightValue);
                        setWeightValue(kgToLbs(kg).toFixed(0));
                      }
                      setWeightUnit("lbs");
                    }}
                  >
                    <Text style={[styles.unitButtonText, { color: weightUnit === "lbs" ? "#000" : BOAT_COLORS.text }]}>
                      Lbs
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.unitButton,
                      { backgroundColor: weightUnit === "kg" ? BOAT_COLORS.accent : BOAT_COLORS.surface },
                    ]}
                    onPress={() => {
                      if (weightUnit !== "kg" && weightValue) {
                        const kg = weightUnit === "lbs" ? lbsToKg(parseFloat(weightValue)) : tonToKg(parseFloat(weightValue));
                        setWeightValue(kg.toFixed(0));
                      }
                      setWeightUnit("kg");
                    }}
                  >
                    <Text style={[styles.unitButtonText, { color: weightUnit === "kg" ? "#000" : BOAT_COLORS.text }]}>
                      Kg
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.unitButton,
                      { backgroundColor: weightUnit === "ton" ? BOAT_COLORS.accent : BOAT_COLORS.surface },
                    ]}
                    onPress={() => {
                      if (weightUnit !== "ton" && weightValue) {
                        const kg = weightUnit === "lbs" ? lbsToKg(parseFloat(weightValue)) : parseFloat(weightValue);
                        setWeightValue(kgToTon(kg).toFixed(2));
                      }
                      setWeightUnit("ton");
                    }}
                  >
                    <Text style={[styles.unitButtonText, { color: weightUnit === "ton" ? "#000" : BOAT_COLORS.text }]}>
                      Ton
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: BOAT_COLORS.textSecondary }]}>Vessel Name (Optional)</Text>
              <TextInput
                style={[
                  styles.fullInput,
                  { backgroundColor: BOAT_COLORS.surface, color: BOAT_COLORS.text, borderColor: BOAT_COLORS.border },
                ]}
                value={vesselName}
                onChangeText={setVesselName}
                placeholder="Enter vessel name"
                placeholderTextColor={BOAT_COLORS.textTertiary}
                maxLength={50}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: BOAT_COLORS.textSecondary }]}>VIN / HIN (Optional)</Text>
              <TextInput
                style={[
                  styles.fullInput,
                  { backgroundColor: BOAT_COLORS.surface, color: BOAT_COLORS.text, borderColor: BOAT_COLORS.border },
                ]}
                value={vin}
                onChangeText={setVin}
                placeholder="Enter VIN or HIN number"
                placeholderTextColor={BOAT_COLORS.textTertiary}
                maxLength={30}
                autoCapitalize="characters"
              />
              <Text style={[styles.helperText, { color: BOAT_COLORS.textTertiary }]}>
                Hull Identification Number for registration
              </Text>
            </View>

            <Pressable
              style={[styles.saveButton, { backgroundColor: BOAT_COLORS.accent }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Feather name="check" size={20} color="#000" />
                  <Text style={styles.saveButtonText}>
                    Save Boat Information
                  </Text>
                </>
              )}
            </Pressable>

            {existingData ? (
              <Pressable
                style={[styles.deleteButton, { borderColor: BladeColors.error }]}
                onPress={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color={BladeColors.error} />
                ) : (
                  <>
                    <Feather name="trash-2" size={18} color={BladeColors.error} />
                    <Text style={[styles.deleteButtonText, { color: BladeColors.error }]}>
                      Delete Boat Information
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  description: {
    marginBottom: Spacing.xl,
    lineHeight: 20,
    fontSize: 14,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    marginBottom: Spacing.sm,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  typeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  typeButtonText: {
    fontSize: 14,
  },
  inputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
  },
  fullInput: {
    height: 48,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
  },
  helperText: {
    marginTop: Spacing.xs,
    fontSize: 12,
  },
  unitToggle: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  unitButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  unitButtonText: {
    fontSize: 14,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  saveButtonText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 16,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontWeight: "600",
    fontSize: 16,
  },
});
