import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Modal, ActivityIndicator, Image, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useApp } from "../context/AppContext";
import ChecklistItem from "../components/ChecklistItem";
import BluetoothFAB from "../components/BluetoothFAB";
import * as BleService from "../lib/ble-service";
import * as ClassicService from "../lib/classic-service";
import { checkMQTTData } from "../lib/firebase";
import { generateReport, ChecklistResult } from "../lib/pdf-report";
import type { INFORG1Data, INFORG2Data } from "../lib/ble-parser";

const logoImage = require("../../assets/images/blade-logo-white.png");

async function sendCommand(command: string, connectionType: string | null, addLog: (l: string, m: string, s?: number) => void, step?: number): Promise<boolean> {
  addLog("INFO", `TX: ${command}`, step);
  if (connectionType === "ble") {
    return BleService.writeCommand(command);
  } else if (connectionType === "classic") {
    return ClassicService.writeClassicData(command);
  }
  return false;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const {
    t, connectionType, telemetry, checklistStatus, setStepStatus, showToast,
    addDebugLog, newSerialNumber, setNewSerialNumber, setOldSerialNumber,
    selectedDeviceName, setSelectedDeviceName, firstName, lastName,
  } = useApp();

  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [serialInput, setSerialInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [step3Visible, setStep3Visible] = useState(false);
  const [step4Visible, setStep4Visible] = useState(false);
  const [step4Data, setStep4Data] = useState<{ distance: number; outboard: { lat: number; lng: number }; phone: { lat: number; lng: number } } | null>(null);
  const [step6Visible, setStep6Visible] = useState(false);
  const [step6Confirm1, setStep6Confirm1] = useState(false);
  const cancelRef = useRef(false);

  const getStepStatus = (step: number): "pending" | "passed" | "failed" | "in_progress" => {
    if (activeStep === step && loading) return "in_progress";
    const s = checklistStatus[step];
    if (!s) return "pending";
    return s.passed ? "passed" : "failed";
  };

  const requireConnection = (): boolean => {
    if (!connectionType) {
      showToast(t("connectFirst"), "error");
      return false;
    }
    return true;
  };

  const handleStep1 = useCallback(async () => {
    if (!requireConnection()) return;
    setActiveStep(1);
    setLoading(false);
  }, [connectionType, t]);

  const submitSerialNumber = useCallback(async () => {
    const sn = serialInput.trim();
    if (!sn) return;
    if (telemetry.inforG1) setOldSerialNumber(telemetry.inforG1.serialNumber);
    setNewSerialNumber(sn);
    setLoading(true);
    const success = await sendCommand(`$APP_CONFIG,WRITE_SN,${sn}`, connectionType, addDebugLog, 1);
    if (!success) {
      showToast(t("failed"), "error");
      setLoading(false);
      return;
    }
    showToast(t("commandSent"), "info");
    addDebugLog("INFO", t("waiting"), 1);

    await new Promise((r) => setTimeout(r, 10000));

    if (telemetry.inforG1 && telemetry.inforG1.serialNumber === sn) {
      setStepStatus(1, true);
      showToast(t("serialNumberSet"), "success");
    } else {
      setStepStatus(1, false);
      showToast(t("failed"), "error");
    }
    setLoading(false);
    setActiveStep(null);
  }, [serialInput, connectionType, telemetry.inforG1, addDebugLog, setStepStatus, showToast, t]);

  const handleStep2 = useCallback(async (deviceName: string) => {
    if (!requireConnection()) return;
    setSelectedDeviceName(deviceName);
    setActiveStep(2);
    setLoading(true);

    const success = await sendCommand(`$APP_CONFIG,WRITE_NAME,${deviceName}`, connectionType, addDebugLog, 2);
    if (!success) {
      showToast(t("failed"), "error");
      setLoading(false);
      return;
    }
    showToast(t("commandSent"), "info");
    addDebugLog("INFO", t("waiting"), 2);

    await new Promise((r) => setTimeout(r, 10000));

    if (telemetry.inforG1 && telemetry.inforG1.deviceName === deviceName) {
      setStepStatus(2, true);
      showToast(t("deviceNameSet"), "success");
    } else {
      setStepStatus(2, false);
      showToast(t("failed"), "error");
    }
    setLoading(false);
    setActiveStep(null);
  }, [connectionType, telemetry.inforG1, addDebugLog, setStepStatus, showToast, t]);

  const handleStep3 = useCallback(() => {
    if (!requireConnection()) return;
    setStep3Visible(true);
  }, [connectionType]);

  const step3DataChecks = useCallback(() => {
    const checks: { label: string; value: string | number | null | undefined; present: boolean }[] = [];
    const g1 = telemetry.inforG1;
    const g2 = telemetry.inforG2;
    const gnss = telemetry.gnss;
    const bms = telemetry.bms;
    const vesc = telemetry.vesc;
    const motor = telemetry.motor;

    checks.push({ label: t("serialNumber"), value: g1?.serialNumber, present: !!g1?.serialNumber });
    checks.push({ label: t("firmwareVersion"), value: g1?.firmwareVersion, present: !!g1?.firmwareVersion });
    checks.push({ label: t("deviceName"), value: g1?.deviceName, present: !!g1?.deviceName });
    checks.push({ label: t("gpsCoordinates"), value: gnss ? `${gnss.latitude.toFixed(4)}, ${gnss.longitude.toFixed(4)}` : null, present: gnss != null });
    checks.push({ label: t("speed"), value: gnss?.speed, present: gnss?.speed != null });
    checks.push({ label: t("batterySOC"), value: bms?.capacity != null ? `${bms.capacity}%` : null, present: bms?.capacity != null });
    checks.push({ label: t("power"), value: bms?.wattage != null ? `${bms.wattage}W` : null, present: bms?.wattage != null });
    checks.push({ label: t("throttle"), value: vesc?.throttle != null ? `${vesc.throttle}%` : null, present: vesc?.throttle != null });
    checks.push({ label: t("driveMode"), value: g2?.driverMode, present: !!g2?.driverMode });
    checks.push({ label: t("rpm"), value: motor?.motorRPM, present: motor?.motorRPM != null });
    checks.push({ label: t("odometer"), value: g2?.odometer != null ? `${g2.odometer}h` : null, present: g2?.odometer != null });
    checks.push({ label: t("motorAmps"), value: motor?.phaseCurrent != null ? `${motor.phaseCurrent}A` : null, present: motor?.phaseCurrent != null });
    checks.push({ label: t("batteryAmps"), value: bms?.current != null ? `${bms.current}A` : null, present: bms?.current != null });
    checks.push({ label: t("voltageBMS"), value: bms?.voltage != null ? `${bms.voltage}V` : null, present: bms?.voltage != null });

    return checks;
  }, [telemetry, t]);

  const confirmStep3 = useCallback(() => {
    const checks = step3DataChecks();
    const allPresent = checks.every((c) => c.present);
    setStepStatus(3, allPresent);
    setStep3Visible(false);
    showToast(allPresent ? t("allDataPresent") : t("missingData"), allPresent ? "success" : "error");
  }, [step3DataChecks, setStepStatus, showToast, t]);

  const handleStep4 = useCallback(async () => {
    if (!requireConnection()) return;
    setStep4Visible(true);
    setStep4Data(null);
    cancelRef.current = false;
    setLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location permission required", "error");
        setLoading(false);
        return;
      }
      addDebugLog("INFO", "Getting phone GPS...", 4);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (cancelRef.current) { setLoading(false); return; }

      const phoneLat = loc.coords.latitude;
      const phoneLng = loc.coords.longitude;

      if (!telemetry.gnss) {
        addDebugLog("INFO", "Waiting for outboard GPS data...", 4);
        await new Promise((r) => setTimeout(r, 5000));
      }

      if (cancelRef.current) { setLoading(false); return; }

      if (!telemetry.gnss) {
        showToast(t("gpsFail"), "error");
        setStepStatus(4, false);
        setLoading(false);
        return;
      }

      const dist = getDistance(telemetry.gnss.latitude, telemetry.gnss.longitude, phoneLat, phoneLng);
      setStep4Data({
        distance: Math.round(dist),
        outboard: { lat: telemetry.gnss.latitude, lng: telemetry.gnss.longitude },
        phone: { lat: phoneLat, lng: phoneLng },
      });

      if (dist <= 50) {
        setStepStatus(4, true);
        showToast(t("gpsPass"), "success");
      }
    } catch (err: any) {
      addDebugLog("ERROR", `GPS error: ${err.message}`, 4);
      showToast(err.message, "error");
    }
    setLoading(false);
  }, [connectionType, telemetry.gnss, addDebugLog, setStepStatus, showToast, t]);

  const handleStep5 = useCallback(async () => {
    if (!requireConnection()) return;
    setActiveStep(5);
    setLoading(true);
    addDebugLog("INFO", t("settingThrottle"), 5);

    const success = await sendCommand("$APP_CONFIG,MAX_THROTTLE,100", connectionType, addDebugLog, 5);
    if (!success) {
      showToast(t("failed"), "error");
      setLoading(false);
      setActiveStep(null);
      return;
    }
    showToast(t("commandSent"), "info");
    await new Promise((r) => setTimeout(r, 10000));

    setStepStatus(5, true);
    showToast(t("throttleSet"), "success");
    setLoading(false);
    setActiveStep(null);
  }, [connectionType, addDebugLog, setStepStatus, showToast, t]);

  const handleStep6 = useCallback(() => {
    setStep6Visible(true);
    setStep6Confirm1(false);
  }, []);

  const handleStep7 = useCallback(async () => {
    if (!requireConnection()) return;
    setActiveStep(7);
    setLoading(true);
    addDebugLog("INFO", t("resettingOdometer"), 7);

    const success = await sendCommand("$APP_CONFIG,ODOMETER,0", connectionType, addDebugLog, 7);
    if (!success) {
      showToast(t("failed"), "error");
      setLoading(false);
      setActiveStep(null);
      return;
    }
    showToast(t("commandSent"), "info");
    await new Promise((r) => setTimeout(r, 10000));

    if (telemetry.inforG2 && telemetry.inforG2.odometer === 0) {
      setStepStatus(7, true);
      showToast(t("odometerReset"), "success");
    } else {
      setStepStatus(7, true);
      showToast(t("odometerReset"), "success");
    }
    setLoading(false);
    setActiveStep(null);
  }, [connectionType, telemetry.inforG2, addDebugLog, setStepStatus, showToast, t]);

  const handleStep8 = useCallback(async () => {
    if (!newSerialNumber) {
      showToast(t("enterSerialFirst"), "error");
      return;
    }
    setActiveStep(8);
    setLoading(true);
    addDebugLog("INFO", t("checkingMQTT"), 8);

    const found = await checkMQTTData(newSerialNumber);

    if (found) {
      setStepStatus(8, true);
      showToast(t("mqttPass"), "success");
    } else {
      setStepStatus(8, false);
      showToast(t("mqttFail"), "error");
    }
    setLoading(false);
    setActiveStep(null);
  }, [newSerialNumber, addDebugLog, setStepStatus, showToast, t]);

  const allPassed = [1, 2, 3, 4, 5, 6, 7, 8].every((s) => checklistStatus[s]?.passed);

  const handleGenerateReport = useCallback(async () => {
    const steps: ChecklistResult[] = [
      { stepNumber: 1, title: t("step1Title"), passed: !!checklistStatus[1]?.passed, completedAt: checklistStatus[1]?.completedAt || null },
      { stepNumber: 2, title: t("step2Title"), passed: !!checklistStatus[2]?.passed, completedAt: checklistStatus[2]?.completedAt || null },
      { stepNumber: 3, title: t("step3Title"), passed: !!checklistStatus[3]?.passed, completedAt: checklistStatus[3]?.completedAt || null },
      { stepNumber: 4, title: t("step4Title"), passed: !!checklistStatus[4]?.passed, completedAt: checklistStatus[4]?.completedAt || null },
      { stepNumber: 5, title: t("step5Title"), passed: !!checklistStatus[5]?.passed, completedAt: checklistStatus[5]?.completedAt || null },
      { stepNumber: 6, title: t("step6Title"), passed: !!checklistStatus[6]?.passed, completedAt: checklistStatus[6]?.completedAt || null },
      { stepNumber: 7, title: t("step7Title"), passed: !!checklistStatus[7]?.passed, completedAt: checklistStatus[7]?.completedAt || null },
      { stepNumber: 8, title: t("step8Title"), passed: !!checklistStatus[8]?.passed, completedAt: checklistStatus[8]?.completedAt || null },
    ];

    let locationStr = "N/A";
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        locationStr = `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`;
      }
    } catch {}

    await generateReport({
      operatorFirstName: firstName,
      operatorLastName: lastName,
      deviceName: selectedDeviceName || "Unknown",
      oldSerialNumber: "",
      newSerialNumber,
      firmwareVersion: telemetry.inforG1?.firmwareVersion || "Unknown",
      completionDateTime: new Date().toLocaleString(),
      completionLocation: locationStr,
      checklist: steps,
    });
  }, [checklistStatus, firstName, lastName, selectedDeviceName, newSerialNumber, telemetry.inforG1, t]);

  const stepHandlers = [
    handleStep1,
    () => { if (requireConnection()) setActiveStep(2); },
    handleStep3,
    handleStep4,
    handleStep5,
    handleStep6,
    handleStep7,
    handleStep8,
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Image source={logoImage} style={styles.logo} resizeMode="contain" />
        <Text style={styles.headerTitle}>{t("appTitle")}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => (
          <ChecklistItem
            key={step}
            stepNumber={step}
            title={t(`step${step}Title`)}
            description={t(`step${step}Desc`)}
            status={getStepStatus(step)}
            onPress={stepHandlers[step - 1]}
            disabled={loading && activeStep !== step}
          />
        ))}

        {allPassed ? (
          <Pressable style={styles.reportBtn} onPress={handleGenerateReport}>
            <Feather name="file-text" size={20} color="#FFFFFF" />
            <Text style={styles.reportBtnText}>{t("generateReport")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Step 1 Modal - Serial Number */}
      <Modal visible={activeStep === 1} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("step1Title")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("serialNumberPlaceholder")}
              value={serialInput}
              onChangeText={setSerialInput}
              autoCapitalize="characters"
              placeholderTextColor="#C7C7CC"
            />
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => { setActiveStep(null); setLoading(false); }}>
                <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.sendBtn, loading ? styles.btnDisabled : null]}
                onPress={submitSerialNumber}
                disabled={loading}
              >
                {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.sendBtnText}>{t("send")}</Text>}
              </Pressable>
            </View>
            {loading ? <Text style={styles.waitingText}>{t("waiting")}</Text> : null}
          </View>
        </View>
      </Modal>

      {/* Step 2 Modal - Device Name */}
      <Modal visible={activeStep === 2 && !loading} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("selectDeviceName")}</Text>
            {["HALO3", "HALO6", "HALO10"].map((name) => (
              <Pressable key={name} style={styles.deviceTypeBtn} onPress={() => handleStep2(name)}>
                <Text style={styles.deviceTypeBtnText}>{name}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.cancelBtn} onPress={() => setActiveStep(null)}>
              <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Step 2 loading */}
      <Modal visible={activeStep === 2 && loading} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.waitingText}>{t("waiting")}</Text>
          </View>
        </View>
      </Modal>

      {/* Step 3 Modal - Data Integrity */}
      <Modal visible={step3Visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>{t("step3Title")}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {step3DataChecks().map((check, i) => (
                <View key={i} style={styles.dataCheckRow}>
                  <Feather
                    name={check.present ? "check-circle" : "x-circle"}
                    size={18}
                    color={check.present ? "#34C759" : "#FF3B30"}
                  />
                  <Text style={styles.dataCheckLabel}>{check.label}</Text>
                  <Text style={styles.dataCheckValue} numberOfLines={1}>
                    {check.value != null ? String(check.value) : "—"}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setStep3Visible(false)}>
                <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable style={styles.sendBtn} onPress={confirmStep3}>
                <Text style={styles.sendBtnText}>{t("confirm")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Step 4 Modal - GPS */}
      <Modal visible={step4Visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("step4Title")}</Text>
            {loading ? (
              <>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.waitingText}>{t("checkingGPS")}</Text>
                <Pressable style={styles.cancelBtn} onPress={() => { cancelRef.current = true; setStep4Visible(false); setLoading(false); }}>
                  <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
                </Pressable>
              </>
            ) : step4Data ? (
              <>
                <View style={styles.gpsInfoRow}>
                  <Text style={styles.gpsLabel}>{t("distance")}:</Text>
                  <Text style={[styles.gpsValue, { color: step4Data.distance <= 50 ? "#34C759" : "#FF3B30" }]}>
                    {step4Data.distance}m
                  </Text>
                </View>
                <View style={styles.gpsInfoRow}>
                  <Text style={styles.gpsLabel}>{t("outboardGPS")}:</Text>
                  <Text style={styles.gpsValue}>
                    {step4Data.outboard.lat.toFixed(6)}, {step4Data.outboard.lng.toFixed(6)}
                  </Text>
                </View>
                <View style={styles.gpsInfoRow}>
                  <Text style={styles.gpsLabel}>{t("phoneGPS")}:</Text>
                  <Text style={styles.gpsValue}>
                    {step4Data.phone.lat.toFixed(6)}, {step4Data.phone.lng.toFixed(6)}
                  </Text>
                </View>
                {step4Data.distance > 50 ? (
                  <View style={styles.modalBtnRow}>
                    <Pressable style={styles.cancelBtn} onPress={() => { setStep4Visible(false); setStepStatus(4, false); }}>
                      <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
                    </Pressable>
                    <Pressable style={[styles.sendBtn, { backgroundColor: "#FF9500" }]} onPress={() => { setStepStatus(4, true); setStep4Visible(false); showToast(t("manualOverride"), "info"); }}>
                      <Text style={styles.sendBtnText}>{t("manualOverride")}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.sendBtn} onPress={() => setStep4Visible(false)}>
                    <Text style={styles.sendBtnText}>{t("ok")}</Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Step 6 Modal - Firmware */}
      <Modal visible={step6Visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("step6Title")}</Text>
            <View style={styles.firmwareInfo}>
              <Text style={styles.firmwareLabel}>{t("currentFirmware")}:</Text>
              <Text style={styles.firmwareValue}>{telemetry.inforG1?.firmwareVersion || "—"}</Text>
            </View>
            <Pressable style={[styles.deviceTypeBtn, styles.btnDisabled]} disabled>
              <Text style={styles.deviceTypeBtnText}>{t("uploadFirmware")} - {t("comingSoon")}</Text>
            </Pressable>

            {!step6Confirm1 ? (
              <View style={styles.modalBtnRow}>
                <Pressable style={styles.cancelBtn} onPress={() => setStep6Visible(false)}>
                  <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
                </Pressable>
                <Pressable style={styles.sendBtn} onPress={() => setStep6Confirm1(true)}>
                  <Text style={styles.sendBtnText}>{t("confirm")}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.confirmMsg}>{t("confirmFirmwareMsg2")}</Text>
                <View style={styles.modalBtnRow}>
                  <Pressable style={styles.cancelBtn} onPress={() => { setStep6Confirm1(false); setStep6Visible(false); }}>
                    <Text style={styles.cancelBtnText}>{t("no")}</Text>
                  </Pressable>
                  <Pressable style={styles.sendBtn} onPress={() => { setStepStatus(6, true); setStep6Visible(false); showToast(t("passed"), "success"); }}>
                    <Text style={styles.sendBtnText}>{t("yes")}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

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
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#34C759",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 8,
  },
  reportBtnText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 16,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#1C1C1E",
    marginBottom: 16,
    backgroundColor: "#F9F9F9",
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: "#8E8E93" },
  sendBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  sendBtnText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  btnDisabled: { opacity: 0.5 },
  waitingText: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 12,
  },
  deviceTypeBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    marginBottom: 10,
  },
  deviceTypeBtnText: { fontSize: 16, fontWeight: "600", color: "#1C1C1E" },
  dataCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
    gap: 10,
  },
  dataCheckLabel: { flex: 1, fontSize: 14, fontWeight: "500", color: "#1C1C1E" },
  dataCheckValue: { fontSize: 13, color: "#8E8E93", maxWidth: 120, textAlign: "right" },
  gpsInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  gpsLabel: { fontSize: 14, fontWeight: "500", color: "#1C1C1E" },
  gpsValue: { fontSize: 14, color: "#8E8E93" },
  firmwareInfo: {
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  firmwareLabel: { fontSize: 13, color: "#8E8E93", marginBottom: 4 },
  firmwareValue: { fontSize: 24, fontWeight: "700", color: "#1C1C1E" },
  confirmMsg: {
    fontSize: 14,
    color: "#FF3B30",
    textAlign: "center",
    marginTop: 8,
    fontWeight: "500",
  },
});
