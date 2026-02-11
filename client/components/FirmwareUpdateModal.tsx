import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";
import {
  FirmwareOTAService,
  OTAProgress,
  OTALogEntry,
  prepareFirmwareData,
} from "@/lib/firmware-ota-service";
import {
  sendBinaryData,
  receiveBinaryData,
  isClassicConnected,
  setOTAMode,
} from "@/lib/bluetooth-classic-service";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function FirmwareUpdateModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { motor } = useMotor();

  const [firmwareFile, setFirmwareFile] = useState<{
    name: string;
    content: string;
    size: number;
    isBinary: boolean;
  } | null>(null);
  const [logs, setLogs] = useState<OTALogEntry[]>([]);
  const [progress, setProgress] = useState<OTAProgress>({
    state: "idle",
    progress: 0,
    currentBlock: 0,
    totalBlocks: 0,
    bytesWritten: 0,
    totalBytes: 0,
    message: "Ready",
  });
  const [bootloaderReady, setBootloaderReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const otaServiceRef = useRef<FirmwareOTAService | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const addLog = useCallback(
    (level: OTALogEntry["level"], message: string) => {
      const entry: OTALogEntry = {
        timestamp: new Date(),
        level,
        message,
      };
      setLogs((prev) => [...prev, entry]);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
    []
  );

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      const lowerName = file.name.toLowerCase();

      if (!lowerName.endsWith(".hex") && !lowerName.endsWith(".bin")) {
        addLog("error", "Please select a .hex or .bin firmware file");
        return;
      }

      const isBinary = lowerName.endsWith(".bin");

      let content: string;
      if (isBinary) {
        content = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        content = await FileSystem.readAsStringAsync(file.uri);
      }

      setFirmwareFile({
        name: file.name,
        content,
        size: file.size || content.length,
        isBinary,
      });

      addLog("success", `Loaded firmware: ${file.name} (${formatSize(file.size || content.length)}) [${isBinary ? 'BIN' : 'HEX'}]`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      addLog("error", `Failed to load file: ${error}`);
    }
  };

  const handleConnect = async () => {
    if (!isClassicConnected()) {
      addLog("error", "No Bluetooth device connected. Please connect via the Scanner first.");
      return;
    }

    addLog("info", "=== BOOTLOADER CONNECTION (FOTA v2.0) ===");
    addLog("info", "1. Sending $APP_CONFIG,UPDATE_FW to enter bootloader mode");
    addLog("info", "2. Then checking connection with HELLO command");
    
    setOTAMode(true);
    addLog("info", "OTA binary mode enabled");

    const service = new FirmwareOTAService(
      sendBinaryData,
      receiveBinaryData,
      addLog,
      setProgress
    );
    otaServiceRef.current = service;

    const entered = await service.enterBootloaderMode();
    if (!entered) {
      addLog("error", "Failed to send bootloader entry command");
      setOTAMode(false);
      return;
    }

    const connected = await service.hello();
    if (connected) {
      setBootloaderReady(true);
      addLog("success", "Bootloader connection established!");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      addLog("error", "Failed to connect to bootloader.");
      addLog("info", "Troubleshooting:");
      addLog("info", "  - Verify Bluetooth is connected and paired");
      addLog("info", "  - Try power cycling the mainboard");
      addLog("info", "  - Ensure the board supports FOTA v2.0 protocol");
      setOTAMode(false);
    }
  };

  const handleErase = async () => {
    if (!otaServiceRef.current) {
      addLog("error", "Please connect to bootloader first");
      return;
    }

    setIsUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const success = await otaServiceRef.current.eraseChip();
    
    if (success) {
      addLog("success", "Flash memory erased successfully");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      addLog("error", "Flash erase failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    setIsUpdating(false);
  };

  const handleProgram = async () => {
    if (!otaServiceRef.current) {
      addLog("error", "Please connect to bootloader first");
      return;
    }

    if (!firmwareFile) {
      addLog("error", "Please select a firmware file first");
      return;
    }

    setIsUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    addLog("info", "=== STARTING FIRMWARE PROGRAMMING ===");
    addLog("info", `File: ${firmwareFile.name} (${formatSize(firmwareFile.size)}) [${firmwareFile.isBinary ? 'BIN' : 'HEX'}]`);

    try {
      const firmwareData = prepareFirmwareData(firmwareFile.content, firmwareFile.isBinary);
      addLog("info", `Prepared ${firmwareData.length} bytes of firmware data`);

      const success = await otaServiceRef.current.performFullUpdate(firmwareData);

      if (success) {
        addLog("success", "=== FIRMWARE UPDATE COMPLETE ===");
        addLog("info", "The mainboard should now be running the new firmware.");
        addLog("info", "You may need to reconnect via Bluetooth Scanner.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setOTAMode(false);
      } else {
        addLog("error", "Firmware update failed");
        addLog("info", "Check the log above for details.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      addLog("error", `Failed to process firmware file: ${error}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    setIsUpdating(false);
  };

  const handleAbort = () => {
    if (otaServiceRef.current) {
      otaServiceRef.current.abort();
      setOTAMode(false);
      addLog("warning", "Firmware update aborted by user");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleClose = () => {
    if (isUpdating) {
      return;
    }
    setOTAMode(false);
    setFirmwareFile(null);
    setLogs([]);
    setProgress({
      state: "idle",
      progress: 0,
      currentBlock: 0,
      totalBlocks: 0,
      bytesWritten: 0,
      totalBytes: 0,
      message: "Ready",
    });
    setBootloaderReady(false);
    otaServiceRef.current = null;
    onClose();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getLogColor = (level: OTALogEntry["level"]): string => {
    switch (level) {
      case "success":
        return BladeColors.success;
      case "warning":
        return BladeColors.warning;
      case "error":
        return BladeColors.error;
      case "debug":
        return "#888888";
      default:
        return theme.textSecondary;
    }
  };

  const getProgressColor = (): string => {
    switch (progress.state) {
      case "complete":
        return BladeColors.success;
      case "error":
        return BladeColors.error;
      case "erasing":
      case "programming":
        return BladeColors.accent;
      default:
        return theme.primary;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: theme.backgroundRoot, paddingTop: insets.top },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={handleClose}
            disabled={isUpdating}
            style={[styles.closeButton, isUpdating && styles.disabled]}
          >
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
          <ThemedText type="h3" style={styles.headerTitle}>
            Firmware Update
          </ThemedText>
          <View style={styles.placeholder} />
        </View>

        <View style={[styles.statusBar, { backgroundColor: theme.surfaceElevated }]}>
          <View style={styles.statusRow}>
            <Feather
              name="bluetooth"
              size={16}
              color={motor?.isConnected ? BladeColors.success : theme.textTertiary}
            />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {motor?.serialNumber || "No motor connected"}
            </ThemedText>
          </View>
          {bootloaderReady ? (
            <View style={styles.statusRow}>
              <Feather name="cpu" size={16} color={BladeColors.accent} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Bootloader connected (FOTA v2.0)
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.progressSection}>
          <View style={[styles.progressBar, { backgroundColor: theme.backgroundSecondary }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: getProgressColor(),
                  width: `${progress.progress}%`,
                },
              ]}
            />
          </View>
          <View style={styles.progressInfo}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {progress.message}
            </ThemedText>
            <ThemedText type="mono" style={{ color: theme.textTertiary, fontSize: 12 }}>
              {progress.progress.toFixed(0)}%
            </ThemedText>
          </View>
          {progress.totalBlocks > 0 ? (
            <ThemedText
              type="caption"
              style={{ color: theme.textTertiary, marginTop: 4 }}
            >
              Block {progress.currentBlock}/{progress.totalBlocks} |{" "}
              {formatSize(progress.bytesWritten)} / {formatSize(progress.totalBytes)}
            </ThemedText>
          ) : null}
        </View>

        <View style={[styles.fileSection, { backgroundColor: theme.surfaceElevated }]}>
          <Pressable
            onPress={handlePickFile}
            disabled={isUpdating}
            style={[
              styles.fileButton,
              { borderColor: theme.border },
              isUpdating && styles.disabled,
            ]}
          >
            <Feather name="file" size={20} color={theme.primary} />
            <View style={styles.fileInfo}>
              {firmwareFile ? (
                <>
                  <ThemedText type="body" numberOfLines={1}>
                    {firmwareFile.name}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                    {formatSize(firmwareFile.size)} ({firmwareFile.isBinary ? 'Binary' : 'Intel HEX'})
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="body" style={{ color: theme.textTertiary }}>
                  Select .hex or .bin firmware file
                </ThemedText>
              )}
            </View>
            <Feather name="chevron-right" size={20} color={theme.textTertiary} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={[styles.logConsole, { backgroundColor: "#0a0a0a" }]}
          contentContainerStyle={styles.logContent}
        >
          {logs.length === 0 ? (
            <ThemedText type="mono" style={[styles.logEntry, { color: "#666" }]}>
              {"> Firmware update console ready (FOTA v2.0)..."}
            </ThemedText>
          ) : null}
          {logs.map((log, index) => (
            <ThemedText
              key={index}
              type="mono"
              style={[styles.logEntry, { color: getLogColor(log.level) }]}
            >
              [{log.timestamp.toLocaleTimeString()}] {log.message}
            </ThemedText>
          ))}
        </ScrollView>

        <View
          style={[
            styles.buttonRow,
            { backgroundColor: theme.surfaceElevated, paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          {isUpdating ? (
            <Pressable
              onPress={handleAbort}
              style={[styles.button, { backgroundColor: BladeColors.error }]}
            >
              <Feather name="x-circle" size={18} color="#fff" />
              <ThemedText type="button" style={{ color: "#fff" }}>
                Abort
              </ThemedText>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handleConnect}
                style={[
                  styles.button,
                  { backgroundColor: theme.primary },
                  bootloaderReady && styles.buttonSuccess,
                ]}
              >
                <Feather name="link" size={18} color="#fff" />
                <ThemedText type="button" style={{ color: "#fff" }}>
                  {bootloaderReady ? "Connected" : "Connect"}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleErase}
                disabled={!bootloaderReady}
                style={[
                  styles.button,
                  { backgroundColor: BladeColors.warning },
                  !bootloaderReady && styles.disabled,
                ]}
              >
                <Feather name="trash-2" size={18} color="#fff" />
                <ThemedText type="button" style={{ color: "#fff" }}>
                  Erase
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleProgram}
                disabled={!bootloaderReady || !firmwareFile}
                style={[
                  styles.button,
                  { backgroundColor: BladeColors.success },
                  (!bootloaderReady || !firmwareFile) && styles.disabled,
                ]}
              >
                {progress.state === "programming" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="upload" size={18} color="#fff" />
                )}
                <ThemedText type="button" style={{ color: "#fff" }}>
                  Program
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  placeholder: {
    width: 32,
  },
  statusBar: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  progressSection: {
    padding: Spacing.md,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  fileSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    borderStyle: "dashed",
    gap: Spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  logConsole: {
    flex: 1,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  logContent: {
    padding: Spacing.md,
  },
  logEntry: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 2,
  },
  buttonRow: {
    flexDirection: "row",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  buttonSuccess: {
    backgroundColor: BladeColors.success,
  },
  disabled: {
    opacity: 0.5,
  },
});
