import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  level: "INFO" | "DATA" | "PARSE" | "STATE" | "ERROR";
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
  processBLEFrame: (frame: string) => void;
  processParsedData: (data: ParseResult) => void;
  addDebugLog: (level: DebugLogEntry["level"], message: string) => void;
  clearDebugLogs: () => void;
}

const MotorContext = createContext<MotorContextType | undefined>(undefined);

const MOTOR_STORAGE_KEY = "@blade_motor";
const LOCATION_STORAGE_KEY = "@blade_last_location";
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
          
          // Update motor with real serial number from Bluetooth data
          // This is critical for real Bluetooth connections where initial serial is just the device address
          const currentMotor = motorRef.current;
          if (data.serialNumber && currentMotor) {
            const currentSerial = currentMotor.serialNumber;
            // Only update if we have a different, valid serial number (not a Bluetooth address like "AA:BB:CC:DD:EE:FF")
            if (data.serialNumber !== currentSerial && !data.serialNumber.includes(':')) {
              addDebugLog("INFO", `Updating motor serial from ${currentSerial} to ${data.serialNumber}`);
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
  };

  const disconnectMotor = () => {
    gnssRef.current = null;
    bmsRef.current = null;
    motorDataRef.current = null;
    vescRef.current = null;
    inforG1Ref.current = null;
    inforG2Ref.current = null;
    if (motor) {
      setMotor({ ...motor, isConnected: false });
    }
    setTelemetry(null);
  };

  const startScan = () => {
    setIsScanning(true);
  };

  const stopScan = () => {
    setIsScanning(false);
  };

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
