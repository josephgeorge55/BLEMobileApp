import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface MotorData {
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
  latitude?: number;
  longitude?: number;
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
  motor: MotorData | null;
  telemetry: TelemetryData | null;
  location: LocationData | null;
  isConnecting: boolean;
  isScanning: boolean;
  setMotor: (motor: MotorData | null) => void;
  setTelemetry: (telemetry: TelemetryData | null) => void;
  setLocation: (location: LocationData | null) => void;
  setIsConnecting: (connecting: boolean) => void;
  setIsScanning: (scanning: boolean) => void;
  connectToMotor: (serialNumber: string) => Promise<void>;
  disconnectMotor: () => void;
  startScan: () => void;
  stopScan: () => void;
}

const MotorContext = createContext<MotorContextType | undefined>(undefined);

const MOTOR_STORAGE_KEY = "@blade_motor";
const LOCATION_STORAGE_KEY = "@blade_last_location";

export function MotorProvider({ children }: { children: React.ReactNode }) {
  const [motor, setMotorState] = useState<MotorData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [location, setLocationState] = useState<LocationData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

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

  const setMotor = async (newMotor: MotorData | null) => {
    setMotorState(newMotor);
    if (newMotor) {
      await AsyncStorage.setItem(MOTOR_STORAGE_KEY, JSON.stringify(newMotor));
    } else {
      await AsyncStorage.removeItem(MOTOR_STORAGE_KEY);
    }
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

  const connectToMotor = async (serialNumber: string) => {
    setIsConnecting(true);
    setIsScanning(false);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newMotor: MotorData = {
      serialNumber,
      name: `Blade ${serialNumber.slice(-4)}`,
      firmwareVersion: "1.2.0",
      isConnected: true,
      lastConnected: new Date(),
    };

    await setMotor(newMotor);

    setTelemetry({
      speed: 0,
      stateOfCharge: 85,
      powerConsumption: 0,
      timestamp: new Date(),
    });

    setIsConnecting(false);
  };

  const disconnectMotor = () => {
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
