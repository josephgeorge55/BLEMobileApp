import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Image, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useApp } from "../context/AppContext";
import BluetoothFAB from "../components/BluetoothFAB";
import * as BleService from "../lib/ble-service";
import * as ClassicService from "../lib/classic-service";
import type { Language } from "../i18n/translations";

const logoImage = require("../../assets/images/blade-logo-white.png");

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    t, language, setLanguage, firstName, setFirstName, lastName, setLastName,
    connectionType, setConnectionType, connectedDeviceName, setConnectedDeviceName,
    setConnectedDeviceId, debugLogs, clearDebugLogs, showToast,
  } = useApp();

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());
  const [logFilter, setLogFilter] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDisconnect = async () => {
    if (connectionType === "ble") {
      await BleService.disconnect();
    } else if (connectionType === "classic") {
      await ClassicService.disconnectClassic();
    }
    setConnectionType(null);
    setConnectedDeviceName(null);
    setConnectedDeviceId(null);
    showToast(t("notConnected"), "info");
  };

  const filteredLogs = logFilter !== null
    ? debugLogs.filter((l) => l.step === logFilter)
    : debugLogs;

  const languageOptions: { key: Language; label: string }[] = [
    { key: "en", label: t("english") },
    { key: "zh", label: t("chinese") },
    { key: "vi", label: t("vietnamese") },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Image source={logoImage} style={styles.logo} resizeMode="contain" />
        <Text style={styles.headerTitle}>{t("settings")}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Connection Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("bluetoothStatus")}</Text>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Feather
                name={connectionType ? "bluetooth" : "bluetooth"}
                size={20}
                color={connectionType ? "#34C759" : "#FF3B30"}
              />
              <Text style={styles.statusText}>
                {connectionType ? `${t("connected")}: ${connectedDeviceName}` : t("notConnected")}
              </Text>
            </View>
            {connectionType ? (
              <Pressable style={styles.disconnectBtn} onPress={handleDisconnect}>
                <Feather name="power" size={16} color="#FF3B30" />
                <Text style={styles.disconnectBtnText}>{t("disconnectOutboard")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Operator */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("operator")}</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder={t("enterFirstName")}
              value={firstName}
              onChangeText={setFirstName}
              placeholderTextColor="#C7C7CC"
            />
            <TextInput
              style={styles.input}
              placeholder={t("enterLastName")}
              value={lastName}
              onChangeText={setLastName}
              placeholderTextColor="#C7C7CC"
            />
          </View>
        </View>

        {/* Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("language")}</Text>
          <View style={styles.card}>
            <View style={styles.langRow}>
              {languageOptions.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.langBtn, language === opt.key ? styles.langBtnActive : null]}
                  onPress={() => setLanguage(opt.key)}
                >
                  <Text style={[styles.langBtnText, language === opt.key ? styles.langBtnTextActive : null]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Device Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("deviceTime")}</Text>
          <View style={styles.card}>
            <Text style={styles.timeText}>{currentTime}</Text>
          </View>
        </View>

        {/* Debug Logs */}
        <View style={styles.section}>
          <View style={styles.logHeader}>
            <Text style={styles.sectionTitle}>{t("debugLogs")}</Text>
            <Pressable onPress={clearDebugLogs}>
              <Feather name="trash-2" size={18} color="#FF3B30" />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
            <Pressable
              style={[styles.logTab, logFilter === null ? styles.logTabActive : null]}
              onPress={() => setLogFilter(null)}
            >
              <Text style={[styles.logTabText, logFilter === null ? styles.logTabTextActive : null]}>
                {t("allSteps")}
              </Text>
            </Pressable>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => (
              <Pressable
                key={step}
                style={[styles.logTab, logFilter === step ? styles.logTabActive : null]}
                onPress={() => setLogFilter(step)}
              >
                <Text style={[styles.logTabText, logFilter === step ? styles.logTabTextActive : null]}>
                  {step}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.logCard}>
            {filteredLogs.length === 0 ? (
              <Text style={styles.emptyLog}>{t("noDevicesFound")}</Text>
            ) : (
              filteredLogs.slice(-100).map((log, i) => (
                <View key={i} style={styles.logRow}>
                  <Text style={styles.logTime}>
                    {log.timestamp.toLocaleTimeString()}
                  </Text>
                  <Text
                    style={[
                      styles.logLevel,
                      log.level === "ERROR" ? { color: "#FF3B30" } :
                      log.level === "DATA" ? { color: "#007AFF" } :
                      { color: "#8E8E93" },
                    ]}
                  >
                    [{log.level}]
                  </Text>
                  <Text style={styles.logMsg} numberOfLines={2}>{log.message}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <BluetoothFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  logo: { width: 28, height: 28 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#8E8E93", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusText: { fontSize: 15, fontWeight: "500", color: "#1C1C1E" },
  disconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#FFF0F0",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  disconnectBtnText: { fontSize: 14, fontWeight: "600", color: "#FF3B30" },
  input: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#1C1C1E",
    marginBottom: 10,
    backgroundColor: "#F9F9F9",
  },
  langRow: { flexDirection: "row", gap: 8 },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
  },
  langBtnActive: { backgroundColor: "#007AFF" },
  langBtnText: { fontSize: 13, fontWeight: "600", color: "#8E8E93" },
  langBtnTextActive: { color: "#FFFFFF" },
  timeText: { fontSize: 16, fontWeight: "500", color: "#1C1C1E" },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingHorizontal: 4 },
  tabScroll: { marginBottom: 8 },
  logTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
    marginRight: 6,
  },
  logTabActive: { backgroundColor: "#007AFF" },
  logTabText: { fontSize: 12, fontWeight: "600", color: "#8E8E93" },
  logTabTextActive: { color: "#FFFFFF" },
  logCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    padding: 12,
    maxHeight: 400,
  },
  emptyLog: { color: "#8E8E93", fontSize: 13, textAlign: "center", padding: 20 },
  logRow: { flexDirection: "row", paddingVertical: 3, gap: 6 },
  logTime: { fontSize: 10, color: "#8E8E93", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  logLevel: { fontSize: 10, fontWeight: "700", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  logMsg: { fontSize: 10, color: "#E5E5EA", flex: 1, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});
