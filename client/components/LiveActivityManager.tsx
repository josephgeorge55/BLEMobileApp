import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { useMotor } from "@/context/MotorContext";
import { useTrip } from "@/context/TripContext";
import {
  startLiveActivity,
  updateLiveActivity,
  endLiveActivity,
} from "@/services/LiveActivityService";

export default function LiveActivityManager() {
  const { motor, telemetry } = useMotor();
  const { isRecording, tripDuration, startTrip, endTrip } = useTrip();
  const isActiveRef = useRef(false);
  const lastMotorConnectedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const connected = motor?.isConnected === true;

    if (connected && !lastMotorConnectedRef.current) {
      const serialNumber =
        telemetry?.tillerSerialNumber ||
        motor?.serialNumber ||
        "Unknown";
      startLiveActivity(
        serialNumber,
        telemetry?.powerConsumption ?? 0,
        telemetry?.stateOfCharge ?? 0,
        isRecording,
        tripDuration,
      ).then((id) => {
        if (id) {
          isActiveRef.current = true;
        }
      });
    }

    if (!connected && lastMotorConnectedRef.current) {
      endLiveActivity().then(() => {
        isActiveRef.current = false;
      });
    }

    lastMotorConnectedRef.current = connected;
  }, [motor?.isConnected]);

  useEffect(() => {
    if (Platform.OS === "web" || !isActiveRef.current || !motor?.isConnected) {
      return;
    }

    const serialNumber =
      telemetry?.tillerSerialNumber ||
      motor?.serialNumber ||
      "Unknown";

    updateLiveActivity(
      serialNumber,
      telemetry?.powerConsumption ?? 0,
      telemetry?.stateOfCharge ?? 0,
      isRecording,
      tripDuration,
    );
  }, [telemetry, isRecording, tripDuration]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (url.includes("trip/start")) {
        startTrip();
      } else if (url.includes("trip/stop")) {
        endTrip("user_button");
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [startTrip, endTrip]);

  useEffect(() => {
    return () => {
      if (isActiveRef.current) {
        endLiveActivity();
        isActiveRef.current = false;
      }
    };
  }, []);

  return null;
}
