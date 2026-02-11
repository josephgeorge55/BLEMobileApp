import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
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

import { useApp } from "../context/AppContext";
import {
  FirmwareOTAService,
  OTAProgress,
  OTALogEntry,
  prepareFirmwareData,
} from "../lib/firmware-ota-service";
import {
  sendBleBinaryData,
  receiveBleBinaryData,
  setBleOTAMode,
  isConnected as isBleConnected,
} from "../lib/ble-service";
import {
  sendClassicBinaryData,
  receiveClassicBinaryData,
  setClassicOTAMode,
  isClassicConnected,
} from "../lib/classic-service";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FirmwareUpdateModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { connectionType, t } = useApp();

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

  const getTransportFunctions = () => {
    if (connectionType === "ble") {
      return {
        send: sendBleBinaryData,
        receive: receiveBleBinaryData,
        setOTA: setBleOTAMode,
        isConnectedFn: isBleConnected,
        label: "BLE",
      };
    } else if (connectionType === "classic") {
      return {
        send: sendClassicBinaryData,
        receive: receiveClassicBinaryData,
        setOTA: setClassicOTAMode,
        isConnectedFn: isClassicConnected,
        label: "Bluetooth Classic",
      };
    }
    return null;
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

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

      addLog("success", `Loaded: ${file.name} (${formatSize(file.size || content.length)}) [${isBinary ? "BIN" : "HEX"}]`);
    } catch (error) {
      addLog("error", `Failed to load file: ${error}`);
    }
  };

  const handleConnect = async () => {
    const transport = getTransportFunctions();
    if (!transport) {
      addLog("error", "No Bluetooth device connected. Connect via the scanner first.");
      return;
    }

    if (!transport.isConnectedFn()) {
      addLog("error", `No ${transport.label} device connected.`);
      return;
    }

    addLog("info", `=== BOOTLOADER CONNECTION via ${transport.label} (FOTA v2.0) ===`);
    addLog("info", "1. Sending $APP_CONFIG,UPDATE_FW to enter bootloader mode");
    addLog("info", "2. Then checking connection with HELLO command");

    transport.setOTA(true);
    addLog("info", "OTA binary mode enabled");

    const service = new FirmwareOTAService(
      transport.send,
      transport.receive,
      addLog,
      setProgress
    );
    otaServiceRef.current = service;

    const entered = await service.enterBootloaderMode();
    if (!entered) {
      addLog("error", "Failed to send bootloader entry command");
      transport.setOTA(false);
      return;
    }

    const connected = await service.hello();
    if (connected) {
      setBootloaderReady(true);
      addLog("success", "Bootloader connection established!");
    } else {
      addLog("error", "Failed to connect to bootloader.");
      addLog("info", "  - Verify Bluetooth is connected and paired");
      addLog("info", "  - Try power cycling the mainboard");
      addLog("info", "  - Ensure the board supports FOTA v2.0 protocol");
      transport.setOTA(false);
    }
  };

  const handleErase = async () => {
    if (!otaServiceRef.current) {
      addLog("error", "Connect to bootloader first");
      return;
    }

    setIsUpdating(true);
    const success = await otaServiceRef.current.eraseChip();

    if (success) {
      addLog("success", "Flash memory erased successfully");
    } else {
      addLog("error", "Flash erase failed");
    }
    setIsUpdating(false);
  };

  const handleProgram = async () => {
    if (!otaServiceRef.current) {
      addLog("error", "Connect to bootloader first");
      return;
    }
    if (!firmwareFile) {
      addLog("error", "Select a firmware file first");
      return;
    }

    setIsUpdating(true);
    addLog("info", "=== STARTING FIRMWARE PROGRAMMING ===");
    addLog("info", `File: ${firmwareFile.name} (${formatSize(firmwareFile.size)}) [${firmwareFile.isBinary ? "BIN" : "HEX"}]`);

    try {
      const firmwareData = prepareFirmwareData(firmwareFile.content, firmwareFile.isBinary);
      addLog("info", `Prepared ${firmwareData.length} bytes of firmware data`);

      const success = await otaServiceRef.current.performFullUpdate(firmwareData);

      if (success) {
        addLog("success", "=== FIRMWARE UPDATE COMPLETE ===");
        addLog("info", "The mainboard should now be running the new firmware.");
        addLog("info", "You may need to reconnect via Bluetooth Scanner.");
        const transport = getTransportFunctions();
        transport?.setOTA(false);
      } else {
        addLog("error", "Firmware update failed. Check the log above.");
      }
    } catch (error) {
      addLog("error", `Failed to process firmware file: ${error}`);
    }
    setIsUpdating(false);
  };

  const handleAbort = () => {
    if (otaServiceRef.current) {
      otaServiceRef.current.abort();
      const transport = getTransportFunctions();
      transport?.setOTA(false);
      addLog("warning", "Firmware update aborted by user");
    }
  };

  const handleClose = () => {
    if (isUpdating) return;
    const transport = getTransportFunctions();
    transport?.setOTA(false);
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
      case "success": return "#34C759";
      case "warning": return "#FF9500";
      case "error": return "#FF3B30";
      case "debug": return "#888888";
      default: return "#CCCCCC";
    }
  };

  const getProgressColor = (): string => {
    switch (progress.state) {
      case "complete": return "#34C759";
      case "error": return "#FF3B30";
      case "erasing":
      case "programming": return "#007AFF";
      default: return "#007AFF";
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            disabled={isUpdating}
            style={[styles.closeButton, isUpdating ? styles.disabled : null]}
          >
            <Feather name="x" size={24} color="#333" />
          </Pressable>
          <Text style={styles.headerTitle}>Firmware Update</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.statusBar}>
          <View style={styles.statusRow}>
            <Feather
              name="bluetooth"
              size={16}
              color={connectionType ? "#34C759" : "#C7C7CC"}
            />
            <Text style={styles.statusText}>
              {connectionType ? `Connected via ${connectionType === "ble" ? "BLE" : "Classic"}` : "No device connected"}
            </Text>
          </View>
          {bootloaderReady ? (
            <View style={styles.statusRow}>
              <Feather name="cpu" size={16} color="#007AFF" />
              <Text style={styles.statusText}>Bootloader connected (FOTA v2.0)</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
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
            <Text style={styles.progressText}>{progress.message}</Text>
            <Text style={styles.progressPercent}>{progress.progress.toFixed(0)}%</Text>
          </View>
          {progress.totalBlocks > 0 ? (
            <Text style={styles.blockInfo}>
              Block {progress.currentBlock}/{progress.totalBlocks} |{" "}
              {formatSize(progress.bytesWritten)} / {formatSize(progress.totalBytes)}
            </Text>
          ) : null}
        </View>

        <View style={styles.fileSection}>
          <Pressable
            onPress={handlePickFile}
            disabled={isUpdating}
            style={[styles.fileButton, isUpdating ? styles.disabled : null]}
          >
            <Feather name="file" size={20} color="#007AFF" />
            <View style={styles.fileInfo}>
              {firmwareFile ? (
                <>
                  <Text style={styles.fileName} numberOfLines={1}>{firmwareFile.name}</Text>
                  <Text style={styles.fileDetail}>
                    {formatSize(firmwareFile.size)} ({firmwareFile.isBinary ? "Binary" : "Intel HEX"})
                  </Text>
                </>
              ) : (
                <Text style={styles.filePlaceholder}>Select .hex or .bin firmware file</Text>
              )}
            </View>
            <Feather name="chevron-right" size={20} color="#C7C7CC" />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.logConsole}
          contentContainerStyle={styles.logContent}
        >
          {logs.length === 0 ? (
            <Text style={[styles.logEntry, { color: "#666" }]}>
              {"> Firmware update console ready (FOTA v2.0)..."}
            </Text>
          ) : null}
          {logs.map((log, index) => (
            <Text
              key={index}
              style={[styles.logEntry, { color: getLogColor(log.level) }]}
            >
              [{log.timestamp.toLocaleTimeString()}] {log.message}
            </Text>
          ))}
        </ScrollView>

        <View style={[styles.buttonRow, { paddingBottom: insets.bottom + 16 }]}>
          {isUpdating ? (
            <Pressable
              onPress={handleAbort}
              style={[styles.button, { backgroundColor: "#FF3B30" }]}
            >
              <Feather name="x-circle" size={18} color="#fff" />
              <Text style={styles.buttonText}>Abort</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handleConnect}
                style={[
                  styles.button,
                  { backgroundColor: bootloaderReady ? "#34C759" : "#007AFF" },
                ]}
              >
                <Feather name="link" size={18} color="#fff" />
                <Text style={styles.buttonText}>
                  {bootloaderReady ? "Connected" : "Connect"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleErase}
                disabled={!bootloaderReady}
                style={[
                  styles.button,
                  { backgroundColor: "#FF9500" },
                  !bootloaderReady ? styles.disabled : null,
                ]}
              >
                <Feather name="trash-2" size={18} color="#fff" />
                <Text style={styles.buttonText}>Erase</Text>
              </Pressable>
              <Pressable
                onPress={handleProgram}
                disabled={!bootloaderReady || !firmwareFile}
                style={[
                  styles.button,
                  { backgroundColor: "#34C759" },
                  (!bootloaderReady || !firmwareFile) ? styles.disabled : null,
                ]}
              >
                {progress.state === "programming" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="upload" size={18} color="#fff" />
                )}
                <Text style={styles.buttonText}>Program</Text>
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
    backgroundColor: "#F2F2F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    backgroundColor: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  placeholder: {
    width: 32,
  },
  statusBar: {
    padding: 12,
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 13,
    color: "#8E8E93",
  },
  progressSection: {
    padding: 16,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#E5E5EA",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  progressText: {
    fontSize: 12,
    color: "#8E8E93",
  },
  progressPercent: {
    fontSize: 12,
    color: "#AEAEB2",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  blockInfo: {
    fontSize: 11,
    color: "#AEAEB2",
    marginTop: 4,
  },
  fileSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
    borderColor: "#C7C7CC",
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1C1C1E",
  },
  fileDetail: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  filePlaceholder: {
    fontSize: 15,
    color: "#AEAEB2",
  },
  logConsole: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    backgroundColor: "#0A0A0A",
  },
  logContent: {
    padding: 12,
  },
  logEntry: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  buttonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.5,
  },
});
