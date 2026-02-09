import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from 'expo-haptics';
import {
  parseBLEFrame,
  GNSSData,
  BMSData,
  MotorData as BLEMotorData,
  VESCData,
  INFORG1Data,
  INFORG2Data,
  ParseResult,
} from "@/lib/ble-parser";
import { writeCommand as writeBleCommand, isConnected as isBleConnected } from "@/lib/ble-service";
import { writeClassicData, isClassicConnected } from "@/lib/bluetooth-classic-service";
import { uploadDeviceConnectionToFirestore } from "@/lib/firebase";
import { logBleConnect, logBleDisconnect } from "@/lib/remote-logger";

const SETTINGS_STORAGE_KEY = "@blade_settings";

interface MotorInfo {
  serialNumber: string;
  name: string;
  firmwareVersion: string;
  isConnected: boolean;
  lastConnected?: Date;
}

interface TelemetryData {
  speed: number;
  stateOfCharge: number;
  powerConsumption: number;
  gnss: GNSSData | null;
  bms: BMSData | null;
  motor: BLEMotorData | null;
  vesc: VESCData | null;
  odometer: number | null;
  driverMode: "Eco" | "Normal" | "Sport" | "Docking" | null;
  errorCode: string | null;
  errorDescription: string | null;
  tillerFirmwareVersion: string | null;
  tillerSerialNumber: string | null;
  timestamp: Date;
}

interface LocationData {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: Date;
  isLive: boolean;
}

interface DebugLogEntry {
  timestamp: string;
  level: "INFO" | "DATA" | "PARSE" | "STATE" | "ERROR" | "THROTTLE";
  message: string;
}

interface MotorContextType {
  motor: MotorInfo | null;
  telemetry: TelemetryData | null;
  location: LocationData | null;
  isConnecting: boolean;
  isScanning: boolean;
  isRealConnection: boolean;
  debugLogs: DebugLogEntry[];
  setMotor: (motor: MotorInfo | null) => void;
  setTelemetry: (telemetry: TelemetryData | null) => void;
  setLocation: (location: LocationData | null) => void;
  setIsConnecting: (connecting: boolean) => void;
  setIsScanning: (scanning: boolean) => void;
  connectToMotor: (serialNumber: string) => Promise<void>;
  disconnectMotor: () => void;
  startScan: () => void;
  stopScan: () => void;
  sendCommand: (command: string) => Promise<boolean>;
  processBLEFrame: (frame: string) => void;
  processParsedData: (data: ParseResult) => void;
  addDebugLog: (level: DebugLogEntry["level"], message: string) => void;
  clearDebugLogs: () => void;
}

const MotorContext = createContext<MotorContextType | undefined>(undefined);

const MOTOR_STORAGE_KEY = "@blade_motor";
const LOCATION_STORAGE_KEY = "@blade_last_location";
const BLE_CONNECTION_KEY = "@blade_ble_connection";
const MAX_DEBUG_LOGS = 200;

export function MotorProvider({ children }: { children: React.ReactNode }) {
  const [motor, setMotorState] = useState<MotorInfo | null>(null);
  const [telemetry, setTelemetryState] = useState<TelemetryData | null>(null);
  const [location, setLocationState] = useState<LocationData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isRealConnection, setIsRealConnection] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  
  const gnssRef = useRef<GNSSData | null>(null);
  const bmsRef = useRef<BMSData | null>(null);
  const lastBatteryAlertRef = useRef<number | null>(null);
  const motorDataRef = useRef<BLEMotorData | null>(null);
  const vescRef = useRef<VESCData | null>(null);
  const inforG1Ref = useRef<INFORG1Data | null>(null);
  const inforG2Ref = useRef<INFORG2Data | null>(null);
  const motorRef = useRef<MotorInfo | null>(null);
  
  // Keep motorRef in sync with motor state
  useEffect(() => {
    motorRef.current = motor;
  }, [motor]);

  const addDebugLog = useCallback((level: DebugLogEntry["level"], message: string) => {
    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    setDebugLogs(prev => {
      const newLogs = [...prev, entry];
      if (newLogs.length > MAX_DEBUG_LOGS) {
        return newLogs.slice(-MAX_DEBUG_LOGS);
      }
      return newLogs;
    });
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  useEffect(() => {
    loadStoredData();
  }, []);

  useEffect(() => {
    const appStateRef = { current: AppState.currentState };
    
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      console.log("[Motor] AppState changed:", appStateRef.current, "->", nextAppState);
      
      if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
        console.log("[Motor] App returning to foreground, checking connection state...");
        const currentMotor = motorRef.current;
        if (currentMotor?.isConnected && Platform.OS !== 'web') {
          const bleStillConnected = isBleConnected();
          const classicStillConnected = isClassicConnected();
          if (!bleStillConnected && !classicStillConnected) {
            console.log("[Motor] Foreground check: BLE/Classic both disconnected, updating motor state");
            addDebugLog("INFO", "Foreground check: motor disconnected while in background");
            logBleDisconnect(currentMotor?.serialNumber || "unknown", "background_disconnect");
            setMotorState(prev => prev ? { ...prev, isConnected: false } : null);
            setTelemetryState(null);
            gnssRef.current = null;
            bmsRef.current = null;
            motorDataRef.current = null;
            vescRef.current = null;
            inforG1Ref.current = null;
            inforG2Ref.current = null;
          } else {
            addDebugLog("INFO", `Foreground check: still connected (BLE=${bleStillConnected}, Classic=${classicStillConnected})`);
          }
        }
      }
      
      appStateRef.current = nextAppState;
    };
    
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [addDebugLog]);

  const loadStoredData = async () => {
    try {
      const storedMotor = await AsyncStorage.getItem(MOTOR_STORAGE_KEY);
      const storedLocation = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);

      if (storedMotor) {
        const motorData = JSON.parse(storedMotor);
        motorData.isConnected = false;
        setMotorState(motorData);
      }

      if (storedLocation) {
        const locationData = JSON.parse(storedLocation);
        locationData.timestamp = new Date(locationData.timestamp);
        locationData.isLive = false;
        setLocationState(locationData);
      }
    } catch (error) {
      console.error("Error loading stored data:", error);
    }
  };

  const setMotor = async (newMotor: MotorInfo | null) => {
    setMotorState(newMotor);
    try {
      if (newMotor) {
        await AsyncStorage.setItem(MOTOR_STORAGE_KEY, JSON.stringify(newMotor));
      } else {
        await AsyncStorage.removeItem(MOTOR_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Error saving motor data:", error);
    }
  };

  const setTelemetry = (newTelemetry: TelemetryData | null) => {
    setTelemetryState(newTelemetry);
  };

  const setLocation = async (newLocation: LocationData | null) => {
    setLocationState(newLocation);
    try {
      if (newLocation) {
        await AsyncStorage.setItem(
          LOCATION_STORAGE_KEY,
          JSON.stringify(newLocation),
        );
      }
    } catch (error) {
      console.error("Error saving location data:", error);
    }
  };

  const updateTelemetryFromRefs = useCallback((now: Date) => {
    const bms = bmsRef.current;
    const vesc = vescRef.current;
    const gnss = gnssRef.current;
    const motor = motorDataRef.current;
    const inforG1 = inforG1Ref.current;
    const inforG2 = inforG2Ref.current;

    const newTelemetry: TelemetryData = {
      speed: gnss?.speed ?? 0,
      stateOfCharge: bms?.capacity ?? 0,
      powerConsumption: (vesc?.wattage ?? bms?.wattage ?? 0) / 1000,
      gnss: gnssRef.current,
      bms: bmsRef.current,
      motor: motorDataRef.current,
      vesc: vescRef.current,
      odometer: inforG2?.odometer ?? null,
      driverMode: inforG2?.driverMode ?? null,
      errorCode: inforG2?.errorCode ?? null,
      errorDescription: inforG2?.errorDescription ?? null,
      tillerFirmwareVersion: inforG1?.firmwareVersion ?? null,
      tillerSerialNumber: inforG1?.serialNumber ?? null,
      timestamp: now,
    };

    addDebugLog("STATE", `Telemetry update: SOC=${newTelemetry.stateOfCharge}%, Speed=${newTelemetry.speed.toFixed(1)}km/h, Power=${newTelemetry.powerConsumption.toFixed(2)}kW`);
    if (bms) {
      addDebugLog("STATE", `BMS ref: V=${bms.voltage}, Cap=${bms.capacity}%, I=${bms.current}A`);
    }
    if (vesc) {
      addDebugLog("STATE", `VESC ref: Throttle=${vesc.throttle}%, W=${vesc.wattage}W`);
    }
    if (motor) {
      addDebugLog("STATE", `Motor ref: RPM=${motor.motorRPM}, Temp=${motor.temperature}C`);
    }

    setTelemetryState(newTelemetry);

    if (Platform.OS !== 'web') {
      const soc = newTelemetry.stateOfCharge;
      const lastAlert = lastBatteryAlertRef.current;
      if (soc > 0 && soc <= 10 && lastAlert !== 10) {
        lastBatteryAlertRef.current = 10;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (soc > 10 && soc <= 25 && lastAlert !== 25) {
        lastBatteryAlertRef.current = 25;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (soc > 25) {
        lastBatteryAlertRef.current = null;
      }
    }
  }, [addDebugLog]);

  const processParsedData = useCallback((result: ParseResult) => {
    const now = new Date();
    addDebugLog("PARSE", `Received parsed data type=${result.type}, group=${result.group}`);

    switch (result.type) {
      case "GNSS": {
        const data = result.data as GNSSData;
        addDebugLog("PARSE", `GNSS: lat=${data.latitude}, lng=${data.longitude}, speed=${data.speed}kph`);
        gnssRef.current = data;
        setLocation({
          latitude: data.latitude,
          longitude: data.longitude,
          speed: data.speed,
          heading: data.course,
          timestamp: now,
          isLive: true,
        });
        break;
      }
      case "BMS": {
        const data = result.data as BMSData;
        addDebugLog("PARSE", `BMS: voltage=${data.voltage}V, capacity=${data.capacity}%, current=${data.current}A, wattage=${data.wattage}W, temp=${data.temperature}C`);
        bmsRef.current = data;
        break;
      }
      case "MOTOR": {
        const data = result.data as BLEMotorData;
        addDebugLog("PARSE", `MOTOR: phaseCurrent=${data.phaseCurrent}A, rpm=${data.motorRPM}, temp=${data.temperature}C`);
        motorDataRef.current = data;
        break;
      }
      case "VESC": {
        const data = result.data as VESCData;
        addDebugLog("PARSE", `VESC: voltage=${data.voltage}V, current=${data.current}A, wattage=${data.wattage}W, throttle=${data.throttle}%, temp=${data.temperature}C`);
        vescRef.current = data;
        break;
      }
      case "INFOR": {
        if (result.group === "G1") {
          const data = result.data as INFORG1Data;
          addDebugLog("PARSE", `INFOR G1: firmware=${data.firmwareVersion}, serial=${data.serialNumber}`);
          inforG1Ref.current = data;
          
          // Update motor with real serial number from Bluetooth telemetry data (INFOR G1 frame)
          // Initial serial is the BLE device ID (MAC on Android, UUID on iOS) - always update with real serial from telemetry
          const currentMotor = motorRef.current;
          if (data.serialNumber && currentMotor) {
            const currentSerial = currentMotor.serialNumber;
            const isValidNewSerial = data.serialNumber !== currentSerial && 
              !data.serialNumber.includes(':') && 
              !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(data.serialNumber);
            if (isValidNewSerial) {
              addDebugLog("INFO", `Updating motor serial from ${currentSerial} to ${data.serialNumber} (from INFOR G1 telemetry)`);
              setMotor({
                ...currentMotor,
                serialNumber: data.serialNumber,
                firmwareVersion: data.firmwareVersion || currentMotor.firmwareVersion,
                name: `Blade ${data.serialNumber.slice(-4)}`,
              });
            }
          }
        } else if (result.group === "G2") {
          const data = result.data as INFORG2Data;
          const errorInfo = data.errorCode ? `Error=${data.errorCode} (${data.errorDescription})` : "No errors";
          addDebugLog("PARSE", `INFOR G2: odometer=${data.odometer}hrs, mode=${data.driverMode}, ${errorInfo}`);
          inforG2Ref.current = data;
        }
        break;
      }
    }

    updateTelemetryFromRefs(now);
  }, [updateTelemetryFromRefs, addDebugLog]);

  const processBLEFrame = useCallback((frame: string) => {
    const result = parseBLEFrame(frame);
    if (!result) return;
    processParsedData(result);
  }, [processParsedData]);

  const connectToMotor = async (serialNumber: string) => {
    addDebugLog("INFO", `connectToMotor called: serialNumber=${serialNumber}`);
    setIsConnecting(true);
    setIsScanning(false);
    addDebugLog("INFO", "Real connection mode - expecting data from Bluetooth callbacks");

    const newMotor: MotorInfo = {
      serialNumber,
      name: `Blade ${serialNumber.slice(-4)}`,
      firmwareVersion: "1.2.0",
      isConnected: true,
      lastConnected: new Date(),
    };

    await setMotor(newMotor);
    setIsConnecting(false);
    setIsRealConnection(true);
    addDebugLog("INFO", "Motor connected: isRealConnection=true");
    logBleConnect(serialNumber, newMotor.name);

    try {
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      const sharingEnabled = stored ? JSON.parse(stored).anonymousDataSharing === true : false;
      if (sharingEnabled) {
        console.log("[DataShare] Uploading device connection to Firestore...");
        const currentGnss = gnssRef.current;
        const currentBms = bmsRef.current;
        uploadDeviceConnectionToFirestore("auto", {
          serialNumber: newMotor.serialNumber,
          name: newMotor.name,
          firmwareVersion: newMotor.firmwareVersion,
        }, (currentGnss || currentBms) ? {
          batteryPercent: currentBms?.capacity ?? null,
          speed: currentGnss?.speed ?? null,
          latitude: currentGnss?.latitude ?? null,
          longitude: currentGnss?.longitude ?? null,
        } : null).then(result => {
          if (result.success) {
            console.log("[DataShare] Device connection uploaded successfully");
          } else {
            console.log("[DataShare] Device connection upload failed:", result.error);
          }
        }).catch(err => {
          console.log("[DataShare] Device connection upload error:", err);
        });
      }
    } catch (err) {
      console.log("[DataShare] Error checking data sharing setting:", err);
    }
  };

  const disconnectMotor = () => {
    const serialForLog = motor?.serialNumber || "unknown";
    gnssRef.current = null;
    bmsRef.current = null;
    lastBatteryAlertRef.current = null;
    motorDataRef.current = null;
    vescRef.current = null;
    inforG1Ref.current = null;
    inforG2Ref.current = null;
    if (motor) {
      setMotor({ ...motor, isConnected: false });
    }
    setTelemetry(null);
    logBleDisconnect(serialForLog, "manual");
  };

  const startScan = () => {
    setIsScanning(true);
  };

  const stopScan = () => {
    setIsScanning(false);
  };

  const sendCommand = useCallback(async (command: string): Promise<boolean> => {
    const isThrottle = command.includes("THROTTLE");
    const logPrefix = isThrottle ? "[Throttle]" : "[Command]";
    
    console.log(`${logPrefix} sendCommand called: "${command}"`);
    console.log(`${logPrefix} motor connected: ${motor?.isConnected}, serialNumber: ${motor?.serialNumber || 'null'}`);
    console.log(`${logPrefix} Platform: ${Platform.OS}`);
    
    if (!motor?.isConnected) {
      const msg = `sendCommand failed: no motor connected (motor=${motor ? 'exists' : 'null'}, isConnected=${motor?.isConnected})`;
      console.error(`${logPrefix} ${msg}`);
      addDebugLog("ERROR", `${logPrefix} ${msg}`);
      return false;
    }

    addDebugLog(isThrottle ? "THROTTLE" : "INFO", `${logPrefix} Sending: "${command}"`);

    try {
      if (Platform.OS === "web") {
        console.log(`${logPrefix} Web platform - simulating success`);
        addDebugLog("INFO", `${logPrefix} Web platform - simulating success`);
        return true;
      }

      const classicConn = isClassicConnected();
      const bleConn = isBleConnected();
      console.log(`${logPrefix} Classic connected: ${classicConn}, BLE connected: ${bleConn}`);
      addDebugLog(isThrottle ? "THROTTLE" : "INFO", `${logPrefix} Classic: ${classicConn}, BLE: ${bleConn}`);

      if (classicConn) {
        console.log(`${logPrefix} Using Bluetooth Classic to send command...`);
        addDebugLog(isThrottle ? "THROTTLE" : "INFO", `${logPrefix} Using Bluetooth Classic`);
        const success = await writeClassicData(command);
        console.log(`${logPrefix} Classic write result: ${success}`);
        addDebugLog(success ? (isThrottle ? "THROTTLE" : "INFO") : "ERROR", `${logPrefix} Classic result: ${success}`);
        return success;
      }

      if (bleConn) {
        console.log(`${logPrefix} Using BLE to send command...`);
        addDebugLog(isThrottle ? "THROTTLE" : "INFO", `${logPrefix} Using BLE`);
        const success = await writeBleCommand(command);
        console.log(`${logPrefix} BLE write result: ${success}`);
        addDebugLog(success ? (isThrottle ? "THROTTLE" : "INFO") : "ERROR", `${logPrefix} BLE result: ${success}`);
        return success;
      }

      const msg = "No active BLE or Classic connection found";
      console.error(`${logPrefix} ${msg}`);
      addDebugLog("ERROR", `${logPrefix} ${msg}`);
      return false;
    } catch (error: any) {
      const msg = `Error: ${error.message || error}`;
      console.error(`${logPrefix} ${msg}`);
      addDebugLog("ERROR", `${logPrefix} ${msg}`);
      return false;
    }
  }, [motor?.isConnected, motor?.serialNumber, addDebugLog]);

  return (
    <MotorContext.Provider
      value={{
        motor,
        telemetry,
        location,
        isConnecting,
        isScanning,
        isRealConnection,
        debugLogs,
        setMotor,
        setTelemetry,
        setLocation,
        setIsConnecting,
        setIsScanning,
        connectToMotor,
        disconnectMotor,
        startScan,
        stopScan,
        sendCommand,
        processBLEFrame,
        processParsedData,
        addDebugLog,
        clearDebugLogs,
      }}
    >
      {children}
    </MotorContext.Provider>
  );
}

export function useMotor() {
  const context = useContext(MotorContext);
  if (context === undefined) {
    throw new Error("useMotor must be used within a MotorProvider");
  }
  return context;
}
