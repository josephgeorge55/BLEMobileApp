import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  FlatList,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DebugLogModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { debugLogs, clearDebugLogs, telemetry, motor, isRealConnection } = useMotor();
  const [isExporting, setIsExporting] = useState(false);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "INFO": return BladeColors.accent;
      case "DATA": return BladeColors.primary;
      case "PARSE": return BladeColors.success;
      case "STATE": return "#9B59B6";
      case "ERROR": return BladeColors.error;
      default: return theme.textSecondary;
    }
  };

  const handleExport = async () => {
    if (debugLogs.length === 0) {
      Alert.alert("No Logs", "There are no debug logs to export.");
      return;
    }

    setIsExporting(true);
    try {
      const statusInfo = [
        "=== BLADE OUTBOARDS DEBUG LOG ===",
        `Export Time: ${new Date().toISOString()}`,
        `Motor Connected: ${motor?.isConnected || false}`,
        `Motor Serial: ${motor?.serialNumber || "N/A"}`,
        `Is Real Connection: ${isRealConnection}`,
        `Current SOC: ${telemetry?.stateOfCharge ?? "N/A"}%`,
        `Current Speed: ${telemetry?.speed?.toFixed(2) ?? "N/A"} kts`,
        `Current Power: ${telemetry?.powerConsumption?.toFixed(2) ?? "N/A"} kW`,
        "",
        "=== LOG ENTRIES ===",
        "",
      ].join("\n");

      const logContent = debugLogs.map(log => 
        `[${log.timestamp}] [${log.level}] ${log.message}`
      ).join("\n");

      const fullContent = statusInfo + logContent;

      const fileName = `blade_debug_${Date.now()}.txt`;
      
      if (Platform.OS === "web") {
        const blob = new Blob([fullContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert("Success", "Log file downloaded.");
      } else {
        const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || "";
        const filePath = `${cacheDir}${fileName}`;
        await FileSystem.writeAsStringAsync(filePath, fullContent);

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: "text/plain",
            dialogTitle: "Export Debug Logs",
          });
        } else {
          Alert.alert("Export Complete", `Log saved to: ${filePath}`);
        }
      }
    } catch (error: any) {
      Alert.alert("Export Error", error.message || "Failed to export logs");
    } finally {
      setIsExporting(false);
    }
  };

  const renderLogItem = ({ item, index }: { item: any; index: number }) => (
    <View style={[styles.logItem, { borderBottomColor: theme.border }]}>
      <View style={styles.logHeader}>
        <View style={[styles.levelBadge, { backgroundColor: getLevelColor(item.level) + "20" }]}>
          <ThemedText type="caption" style={{ color: getLevelColor(item.level), fontWeight: "600" }}>
            {item.level}
          </ThemedText>
        </View>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </ThemedText>
      </View>
      <ThemedText type="mono" style={[styles.logMessage, { color: theme.text }]}>
        {item.message}
      </ThemedText>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.headerLeft}>
            <ThemedText type="h2">Debug Logs</ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {debugLogs.length} entries
            </ThemedText>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={[styles.statusBar, { backgroundColor: theme.surface }]}>
          <View style={styles.statusItem}>
            <Feather 
              name={motor?.isConnected ? "check-circle" : "x-circle"} 
              size={14} 
              color={motor?.isConnected ? BladeColors.success : BladeColors.error} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              {motor?.isConnected ? "Connected" : "Disconnected"}
            </ThemedText>
          </View>
          <View style={styles.statusItem}>
            <Feather 
              name={isRealConnection ? "bluetooth" : "cpu"} 
              size={14} 
              color={isRealConnection ? BladeColors.primary : BladeColors.warning} 
            />
            <ThemedText type="caption" style={{ marginLeft: 4 }}>
              {isRealConnection ? "Real BT" : "Simulation"}
            </ThemedText>
          </View>
          <View style={styles.statusItem}>
            <ThemedText type="caption">
              SOC: {telemetry?.stateOfCharge ?? 0}%
            </ThemedText>
          </View>
        </View>

        <FlatList
          data={[...debugLogs].reverse()}
          renderItem={renderLogItem}
          keyExtractor={(item, index) => `${item.timestamp}-${index}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="file-text" size={48} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                No logs yet. Connect to a device to start logging.
              </ThemedText>
            </View>
          }
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: theme.backgroundRoot }]}>
          <Button 
            variant="outline" 
            onPress={clearDebugLogs}
            style={{ flex: 1, marginRight: Spacing.sm }}
          >
            Clear Logs
          </Button>
          <Button 
            onPress={handleExport}
            disabled={isExporting}
            style={{ flex: 1 }}
          >
            {isExporting ? "Exporting..." : "Download Log"}
          </Button>
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
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  logItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  logMessage: {
    fontSize: 11,
    lineHeight: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
});
