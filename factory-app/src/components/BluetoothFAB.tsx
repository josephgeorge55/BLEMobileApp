import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, Modal, FlatList, ActivityIndicator, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import * as BleService from "../lib/ble-service";
import * as ClassicService from "../lib/classic-service";

interface ScannedDevice {
  id: string;
  name: string | null;
  rssi?: number;
  type: "ble" | "classic";
}

export default function BluetoothFAB() {
  const insets = useSafeAreaInsets();
  const {
    t, connectionType, setConnectionType, connectedDeviceName,
    setConnectedDeviceName, setConnectedDeviceId, updateTelemetry,
    addDebugLog, showToast,
  } = useApp();

  const [modalVisible, setModalVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [tab, setTab] = useState<"ble" | "classic">("ble");

  const isConnected = connectionType !== null;

  useEffect(() => {
    BleService.initializeBle();
    if (Platform.OS === "android") ClassicService.initializeClassic();
  }, []);

  const startBleScan = useCallback(() => {
    setDevices([]);
    setScanning(true);
    BleService.requestBlePermissions().then(() => {
      BleService.startScan({
        onDeviceFound: (device) => {
          setDevices((prev) => {
            if (prev.find((d) => d.id === device.id)) return prev;
            return [...prev, { id: device.id, name: device.name, rssi: device.rssi, type: "ble" }];
          });
        },
        onError: (err) => addDebugLog("ERROR", `BLE scan error: ${err.message}`),
        onDebugLog: (level, msg) => addDebugLog(level, msg),
      });
    });
    setTimeout(() => {
      BleService.stopScan();
      setScanning(false);
    }, 10000);
  }, [addDebugLog]);

  const startClassicScan = useCallback(() => {
    setDevices([]);
    setScanning(true);
    ClassicService.startDiscovery({
      onDeviceFound: (device) => {
        setDevices((prev) => {
          if (prev.find((d) => d.id === device.id)) return prev;
          return [...prev, { id: device.id, name: device.name, type: "classic" }];
        });
      },
      onError: (err) => addDebugLog("ERROR", `Classic scan error: ${err.message}`),
      onDebugLog: (level, msg) => addDebugLog(level, msg),
    });
    setTimeout(() => {
      ClassicService.cancelDiscovery();
      setScanning(false);
    }, 12000);
  }, [addDebugLog]);

  const connectDevice = useCallback(async (device: ScannedDevice) => {
    setConnecting(device.id);
    addDebugLog("INFO", `Connecting to ${device.name || device.id} (${device.type})`);

    const callbacks = {
      onDeviceFound: () => {},
      onConnected: (d: any) => {
        setConnectionType(device.type);
        setConnectedDeviceName(d.name || device.name || device.id);
        setConnectedDeviceId(device.id);
        setConnecting(null);
        setModalVisible(false);
        showToast(t("connected"), "success");
        addDebugLog("INFO", `Connected to ${d.name || device.id}`);
      },
      onDisconnected: () => {
        setConnectionType(null);
        setConnectedDeviceName(null);
        setConnectedDeviceId(null);
        showToast(t("notConnected"), "error");
        addDebugLog("INFO", "Device disconnected");
      },
      onDataReceived: updateTelemetry,
      onError: (err: Error) => {
        setConnecting(null);
        showToast(err.message, "error");
        addDebugLog("ERROR", err.message);
      },
      onDebugLog: (level: string, msg: string) => addDebugLog(level, msg),
    };

    if (device.type === "ble") {
      await BleService.connectToDevice(device.id, callbacks);
    } else {
      await ClassicService.connectToClassicDevice(device.id, callbacks);
    }
  }, [addDebugLog, setConnectionType, setConnectedDeviceName, setConnectedDeviceId, showToast, t, updateTelemetry]);

  const openModal = () => {
    setModalVisible(true);
    if (tab === "ble") startBleScan();
    else startClassicScan();
  };

  const switchTab = (newTab: "ble" | "classic") => {
    setTab(newTab);
    BleService.stopScan();
    ClassicService.cancelDiscovery();
    setDevices([]);
    setScanning(false);
    if (newTab === "ble") startBleScan();
    else startClassicScan();
  };

  const filteredDevices = devices.filter((d) => d.type === tab);

  return (
    <>
      <Pressable
        style={[
          styles.fab,
          { bottom: insets.bottom + 70 },
          isConnected ? styles.fabConnected : styles.fabDisconnected,
        ]}
        onPress={openModal}
        testID="bluetooth-fab"
      >
        <Feather name="bluetooth" size={24} color="#FFFFFF" />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("scanBluetooth")}</Text>
              <Pressable onPress={() => { setModalVisible(false); BleService.stopScan(); ClassicService.cancelDiscovery(); setScanning(false); }}>
                <Feather name="x" size={24} color="#1C1C1E" />
              </Pressable>
            </View>

            {isConnected ? (
              <View style={styles.connectedBanner}>
                <Feather name="check-circle" size={16} color="#34C759" />
                <Text style={styles.connectedText}>
                  {t("connected")}: {connectedDeviceName}
                </Text>
              </View>
            ) : null}

            {Platform.OS === "android" ? (
              <View style={styles.tabRow}>
                <Pressable style={[styles.tabBtn, tab === "ble" ? styles.tabActive : null]} onPress={() => switchTab("ble")}>
                  <Text style={[styles.tabText, tab === "ble" ? styles.tabTextActive : null]}>{t("bleDevices")}</Text>
                </Pressable>
                <Pressable style={[styles.tabBtn, tab === "classic" ? styles.tabActive : null]} onPress={() => switchTab("classic")}>
                  <Text style={[styles.tabText, tab === "classic" ? styles.tabTextActive : null]}>{t("classicDevices")}</Text>
                </Pressable>
              </View>
            ) : null}

            {scanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.scanningText}>{t("scanning")}</Text>
              </View>
            ) : null}

            <FlatList
              data={filteredDevices}
              keyExtractor={(item) => item.id}
              style={styles.deviceList}
              ListEmptyComponent={
                !scanning ? (
                  <Text style={styles.emptyText}>{t("noDevicesFound")}</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.deviceRow}
                  onPress={() => connectDevice(item)}
                  disabled={connecting !== null}
                >
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{item.name || item.id}</Text>
                    {item.rssi != null ? (
                      <Text style={styles.deviceRssi}>RSSI: {item.rssi}</Text>
                    ) : null}
                  </View>
                  {connecting === item.id ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Text style={styles.connectBtn}>{t("connect")}</Text>
                  )}
                </Pressable>
              )}
            />

            <Pressable
              style={styles.rescanBtn}
              onPress={() => { if (tab === "ble") startBleScan(); else startClassicScan(); }}
              disabled={scanning}
            >
              <Feather name="refresh-cw" size={16} color="#007AFF" />
              <Text style={styles.rescanText}>{scanning ? t("scanning") : t("scanBluetooth")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 100,
  },
  fabConnected: { backgroundColor: "#34C759" },
  fabDisconnected: { backgroundColor: "#007AFF" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 20,
    maxHeight: "75%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  connectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F8EA",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  connectedText: {
    fontSize: 14,
    color: "#34C759",
    fontWeight: "600",
  },
  tabRow: {
    flexDirection: "row",
    marginBottom: 12,
    backgroundColor: "#F2F2F7",
    borderRadius: 8,
    padding: 2,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: { fontSize: 13, color: "#8E8E93", fontWeight: "600" },
  tabTextActive: { color: "#1C1C1E" },
  scanningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  scanningText: { fontSize: 13, color: "#007AFF" },
  deviceList: { maxHeight: 300 },
  emptyText: { textAlign: "center", color: "#8E8E93", padding: 20, fontSize: 14 },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 15, fontWeight: "500", color: "#1C1C1E" },
  deviceRssi: { fontSize: 11, color: "#8E8E93", marginTop: 2 },
  connectBtn: { fontSize: 14, color: "#007AFF", fontWeight: "600" },
  rescanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  rescanText: { fontSize: 14, color: "#007AFF", fontWeight: "600" },
});
