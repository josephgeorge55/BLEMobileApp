import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import translations, { Language } from "../i18n/translations";
import type { GNSSData, BMSData, MotorData, VESCData, INFORG1Data, INFORG2Data, ParseResult } from "../lib/ble-parser";

export interface DebugLogEntry {
  timestamp: Date;
  level: string;
  message: string;
  step?: number;
}

export interface TelemetryState {
  gnss: GNSSData | null;
  bms: BMSData | null;
  motor: MotorData | null;
  vesc: VESCData | null;
  inforG1: INFORG1Data | null;
  inforG2: INFORG2Data | null;
}

export interface StepDetails {
  step1?: { oldSerial: string; newSerial: string; command: string };
  step2?: { deviceName: string; command: string };
  step3?: { bleDataSample: Record<string, string | number | null> };
  step4?: { phoneGPS: { lat: number; lng: number }; outboardGPS: { lat: number; lng: number }; distanceMeters: number };
  step5?: { dethrottleValue: number; command: string };
  step6?: { firmwareVersion: string; confirmed: boolean };
  step7?: { previousOdometer: string; newOdometer: string; command: string };
  step8?: { mqttResult: boolean; firestoreCoords?: { lat: number; lng: number } };
}

export type ConnectionType = "ble" | "classic" | null;

interface ToastState {
  visible: boolean;
  message: string;
  type: "success" | "error" | "info";
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  firstName: string;
  setFirstName: (name: string) => void;
  lastName: string;
  setLastName: (name: string) => void;
  connectionType: ConnectionType;
  setConnectionType: (type: ConnectionType) => void;
  connectedDeviceName: string | null;
  setConnectedDeviceName: (name: string | null) => void;
  connectedDeviceId: string | null;
  setConnectedDeviceId: (id: string | null) => void;
  telemetry: TelemetryState;
  telemetryRef: React.MutableRefObject<TelemetryState>;
  updateTelemetry: (result: ParseResult) => void;
  debugLogs: DebugLogEntry[];
  addDebugLog: (level: string, message: string, step?: number) => void;
  clearDebugLogs: () => void;
  toast: ToastState;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  hideToast: () => void;
  checklistStatus: Record<number, { passed: boolean; overridden: boolean; completedAt: string | null }>;
  setStepStatus: (step: number, passed: boolean, overridden?: boolean) => void;
  resetChecklist: () => void;
  resetAll: () => void;
  oldSerialNumber: string;
  setOldSerialNumber: (sn: string) => void;
  newSerialNumber: string;
  setNewSerialNumber: (sn: string) => void;
  selectedDeviceName: string;
  setSelectedDeviceName: (name: string) => void;
  stepDetails: StepDetails;
  setStepDetails: (details: StepDetails) => void;
  updateStepDetail: <K extends keyof StepDetails>(step: K, data: StepDetails[K]) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    gnss: null, bms: null, motor: null, vesc: null, inforG1: null, inforG2: null,
  });
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: "", type: "info" });
  const [checklistStatus, setChecklistStatus] = useState<Record<number, { passed: boolean; overridden: boolean; completedAt: string | null }>>({});
  const [oldSerialNumber, setOldSerialNumber] = useState("");
  const [newSerialNumber, setNewSerialNumber] = useState("");
  const [selectedDeviceName, setSelectedDeviceName] = useState("");
  const [stepDetails, setStepDetails] = useState<StepDetails>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telemetryRef = useRef<TelemetryState>(telemetry);

  const t = useCallback((key: string): string => {
    return translations[language]?.[key] || translations.en[key] || key;
  }, [language]);

  const updateTelemetry = useCallback((result: ParseResult) => {
    setTelemetry((prev) => {
      const next = { ...prev };
      switch (result.type) {
        case "GNSS":
          next.gnss = result.data as GNSSData;
          break;
        case "BMS":
          next.bms = result.data as BMSData;
          break;
        case "MOTOR":
          next.motor = result.data as MotorData;
          break;
        case "VESC":
          next.vesc = result.data as VESCData;
          break;
        case "INFOR":
          if (result.group === "G1") next.inforG1 = result.data as INFORG1Data;
          else if (result.group === "G2") next.inforG2 = result.data as INFORG2Data;
          break;
      }
      telemetryRef.current = next;
      return next;
    });
  }, []);

  const addDebugLog = useCallback((level: string, message: string, step?: number) => {
    setDebugLogs((prev) => [...prev.slice(-500), { timestamp: new Date(), level, message, step }]);
  }, []);

  const clearDebugLogs = useCallback(() => setDebugLogs([]), []);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message, type });
    toastTimer.current = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const hideToast = useCallback(() => setToast((prev) => ({ ...prev, visible: false })), []);

  const setStepStatus = useCallback((step: number, passed: boolean, overridden?: boolean) => {
    setChecklistStatus((prev) => ({
      ...prev,
      [step]: { passed, overridden: overridden || false, completedAt: new Date().toLocaleString() },
    }));
  }, []);

  const updateStepDetail = useCallback(<K extends keyof StepDetails>(step: K, data: StepDetails[K]) => {
    setStepDetails((prev) => ({ ...prev, [step]: data }));
  }, []);

  const resetChecklist = useCallback(() => setChecklistStatus({}), []);

  const resetAll = useCallback(() => {
    setChecklistStatus({});
    setTelemetry({ gnss: null, bms: null, motor: null, vesc: null, inforG1: null, inforG2: null });
    setNewSerialNumber("");
    setOldSerialNumber("");
    setSelectedDeviceName("");
    setStepDetails({});
    setDebugLogs([]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        language, setLanguage, t,
        firstName, setFirstName, lastName, setLastName,
        connectionType, setConnectionType,
        connectedDeviceName, setConnectedDeviceName,
        connectedDeviceId, setConnectedDeviceId,
        telemetry, telemetryRef, updateTelemetry,
        debugLogs, addDebugLog, clearDebugLogs,
        toast, showToast, hideToast,
        checklistStatus, setStepStatus, resetChecklist, resetAll,
        oldSerialNumber, setOldSerialNumber,
        newSerialNumber, setNewSerialNumber,
        selectedDeviceName, setSelectedDeviceName,
        stepDetails, setStepDetails, updateStepDetail,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
