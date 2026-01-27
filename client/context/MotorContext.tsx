import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseBLEFrame,
  generateMockGNSSFrame,
  generateMockBMSFrame,
  generateMockMotorFrame,
  generateMockVESCFrame,
  kphToKnots,
  GNSSData,
  BMSData,
  MotorData as BLEMotorData,
  VESCData,
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

interface MotorContextType {
  motor: MotorInfo | null;
  telemetry: TelemetryData | null;
  location: LocationData | null;
  isConnecting: boolean;
  isScanning: boolean;
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
}

const MotorContext = createContext<MotorContextType | undefined>(undefined);

const MOTOR_STORAGE_KEY = "@blade_motor";
const LOCATION_STORAGE_KEY = "@blade_last_location";

const BASE_LAT = 25.7617;
const BASE_LNG = -80.1918;

export function MotorProvider({ children }: { children: React.ReactNode }) {
  const [motor, setMotorState] = useState<MotorInfo | null>(null);
  const [telemetry, setTelemetryState] = useState<TelemetryData | null>(null);
  const [location, setLocationState] = useState<LocationData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gnssRef = useRef<GNSSData | null>(null);
  const bmsRef = useRef<BMSData | null>(null);
  const motorDataRef = useRef<BLEMotorData | null>(null);
  const vescRef = useRef<VESCData | null>(null);

  useEffect(() => {
    loadStoredData();
    return () => {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
      }
    };
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
    if (newMotor) {
      await AsyncStorage.setItem(MOTOR_STORAGE_KEY, JSON.stringify(newMotor));
    } else {
      await AsyncStorage.removeItem(MOTOR_STORAGE_KEY);
    }
  };

  const setTelemetry = (newTelemetry: TelemetryData | null) => {
    setTelemetryState(newTelemetry);
  };

  const setLocation = async (newLocation: LocationData | null) => {
    setLocationState(newLocation);
    if (newLocation) {
      await AsyncStorage.setItem(
        LOCATION_STORAGE_KEY,
        JSON.stringify(newLocation),
      );
    }
  };

  const processBLEFrame = useCallback((frame: string) => {
    const result = parseBLEFrame(frame);
    if (!result) return;

    const now = new Date();

    switch (result.type) {
      case "GNSS": {
        const data = result.data as GNSSData;
        gnssRef.current = data;
        setLocation({
          latitude: data.latitude,
          longitude: data.longitude,
          speed: kphToKnots(data.speed),
          heading: data.course,
          timestamp: now,
          isLive: true,
        });
        break;
      }
      case "BMS": {
        bmsRef.current = result.data as BMSData;
        break;
      }
      case "MOTOR": {
        motorDataRef.current = result.data as BLEMotorData;
        break;
      }
      case "VESC": {
        vescRef.current = result.data as VESCData;
        break;
      }
    }

    const bms = bmsRef.current;
    const vesc = vescRef.current;
    const gnss = gnssRef.current;

    setTelemetryState({
      speed: gnss ? kphToKnots(gnss.speed) : 0,
      stateOfCharge: bms?.capacity ?? 0,
      powerConsumption: (vesc?.wattage ?? bms?.wattage ?? 0) / 1000,
      gnss: gnssRef.current,
      bms: bmsRef.current,
      motor: motorDataRef.current,
      vesc: vescRef.current,
      timestamp: now,
    });
  }, []);

  const startBLESimulation = useCallback(() => {
    if (simulationRef.current) {
      clearInterval(simulationRef.current);
    }

    let tick = 0;
    let currentLat = BASE_LAT;
    let currentLng = BASE_LNG;
    let currentCourse = Math.random() * 360;
    let batteryCapacity = 85 + Math.floor(Math.random() * 10);

    simulationRef.current = setInterval(() => {
      tick++;

      const throttle = 30 + Math.sin(tick * 0.1) * 20 + Math.random() * 10;
      const speedKph = throttle * 0.8 + Math.random() * 5;
      const rpm = Math.floor(throttle * 28 + Math.random() * 100);
      
      currentCourse = (currentCourse + (Math.random() - 0.5) * 5 + 360) % 360;
      const moveDistance = (speedKph / 3600) * 0.5;
      currentLat += moveDistance * Math.cos(currentCourse * Math.PI / 180) * 0.01;
      currentLng += moveDistance * Math.sin(currentCourse * Math.PI / 180) * 0.01;

      const voltage = 48 + (batteryCapacity / 100) * 6 - 2;
      const bmsCurrent = throttle * 0.4 + Math.random() * 5;
      const bmsWattage = Math.floor(voltage * bmsCurrent);
      const bmsTemp = 28 + throttle * 0.15 + Math.random() * 3;

      const vescCurrent = throttle * 0.6 + Math.random() * 8;
      const vescWattage = Math.floor(voltage * vescCurrent);
      const vescTemp = 32 + throttle * 0.2 + Math.random() * 4;

      const motorCurrent = throttle * 0.35 + Math.random() * 4;
      const motorTemp = 30 + throttle * 0.18 + Math.random() * 3;

      if (tick % 60 === 0 && batteryCapacity > 5) {
        batteryCapacity = Math.max(5, batteryCapacity - 1);
      }

      const frames = [
        generateMockGNSSFrame(currentLat, currentLng, speedKph, currentCourse),
        generateMockBMSFrame(voltage, batteryCapacity, bmsCurrent, bmsWattage, Math.floor(bmsTemp)),
        generateMockMotorFrame(motorCurrent, rpm, Math.floor(motorTemp)),
        generateMockVESCFrame(voltage, vescCurrent, vescWattage, Math.floor(throttle), Math.floor(vescTemp)),
      ];

      frames.forEach((frame) => processBLEFrame(frame));
    }, 500);
  }, [processBLEFrame]);

  const stopBLESimulation = useCallback(() => {
    if (simulationRef.current) {
      clearInterval(simulationRef.current);
      simulationRef.current = null;
    }
    gnssRef.current = null;
    bmsRef.current = null;
    motorDataRef.current = null;
    vescRef.current = null;
  }, []);

  const connectToMotor = async (serialNumber: string) => {
    setIsConnecting(true);
    setIsScanning(false);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newMotor: MotorInfo = {
      serialNumber,
      name: `Blade ${serialNumber.slice(-4)}`,
      firmwareVersion: "1.2.0",
      isConnected: true,
      lastConnected: new Date(),
    };

    await setMotor(newMotor);
    setIsConnecting(false);
    
    startBLESimulation();
  };

  const disconnectMotor = () => {
    stopBLESimulation();
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
