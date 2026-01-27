import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useMotor } from "./MotorContext";
import { useUser } from "./UserContext";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import type { Trip, TripDataPoint } from "@shared/schema";

interface TripContextType {
  activeTrip: Trip | null;
  isRecording: boolean;
  startTrip: (name?: string) => Promise<boolean>;
  endTrip: () => Promise<boolean>;
  isLoading: boolean;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { motor, telemetry, location } = useMotor();
  const { user } = useUser();
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const recordingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchActiveTrip();
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTrip && isRecording && motor?.isConnected) {
      startDataRecording();
    } else {
      stopDataRecording();
    }
    return () => stopDataRecording();
  }, [activeTrip, isRecording, motor?.isConnected]);

  const fetchActiveTrip = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(
        new URL(`/api/trips/user/${user.id}/active`, getApiUrl()).toString()
      );
      if (response.ok) {
        const trip = await response.json();
        if (trip) {
          setActiveTrip(trip);
          setIsRecording(true);
        }
      }
    } catch (error) {
      console.error("Error fetching active trip:", error);
    }
  };

  const startDataRecording = useCallback(() => {
    if (recordingRef.current) return;

    recordingRef.current = setInterval(async () => {
      if (!activeTrip || !telemetry) return;

      try {
        await apiRequest("POST", `/api/trips/${activeTrip.id}/data`, {
          latitude: location?.latitude,
          longitude: location?.longitude,
          speedKts: telemetry.gnss?.speed ? telemetry.gnss.speed * 0.539957 : undefined,
          course: location?.heading,
          batteryPercent: telemetry.bms?.capacity,
          batteryVoltage: telemetry.bms?.voltage,
          batteryCurrent: telemetry.bms?.current,
          batteryTemp: telemetry.bms?.temperature,
          motorRpm: telemetry.motor?.motorRPM,
          motorCurrent: telemetry.motor?.phaseCurrent,
          motorTemp: telemetry.motor?.temperature,
          vescWattage: telemetry.vesc?.wattage,
          vescCurrent: telemetry.vesc?.current,
          vescTemp: telemetry.vesc?.temperature,
          throttlePercent: telemetry.vesc?.throttle,
        });
      } catch (error) {
        console.error("Error recording trip data:", error);
      }
    }, 2000);
  }, [activeTrip, telemetry, location]);

  const stopDataRecording = useCallback(() => {
    if (recordingRef.current) {
      clearInterval(recordingRef.current);
      recordingRef.current = null;
    }
  }, []);

  const startTrip = async (name?: string): Promise<boolean> => {
    if (!user?.id || !motor?.serialNumber) {
      console.error("Cannot start trip: no user or motor");
      return false;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/trips/start", {
        userId: user.id,
        motorSerialNumber: motor.serialNumber,
        name: name || `Trip ${new Date().toLocaleDateString()}`,
        startBatteryPercent: telemetry?.bms?.capacity,
      });

      const data = await response.json();
      if (data.trip) {
        setActiveTrip(data.trip);
        setIsRecording(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error starting trip:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const endTrip = async (): Promise<boolean> => {
    if (!activeTrip) return false;

    setIsLoading(true);
    stopDataRecording();
    try {
      const response = await apiRequest("POST", `/api/trips/${activeTrip.id}/end`, {
        endBatteryPercent: telemetry?.bms?.capacity,
      });

      const data = await response.json();
      if (data.success) {
        setActiveTrip(null);
        setIsRecording(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error ending trip:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TripContext.Provider
      value={{
        activeTrip,
        isRecording,
        startTrip,
        endTrip,
        isLoading,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (context === undefined) {
    throw new Error("useTrip must be used within a TripProvider");
  }
  return context;
}
