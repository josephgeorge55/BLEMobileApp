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
import BladeLiveActivityModule, { getModuleLoadError } from "../../modules/blade-live-activity";

export default function LiveActivityManager() {
  const { motor, telemetry } = useMotor();
  const { isRecording, tripDuration, startTrip, endTrip } = useTrip();
  const isActiveRef = useRef(false);

  const connected = motor?.isConnected === true;
  const shouldBeActive = connected || isRecording;

  useEffect(() => {
    const moduleAvailable = BladeLiveActivityModule !== null;
    console.log("[LiveActivityManager] Mounted, platform:", Platform.OS, "module available:", moduleAvailable);
    if (!moduleAvailable) {
      console.log("[LiveActivityManager] Module load error:", getModuleLoadError());
    }
  }, []);

  useEffect(() => {
    console.log("[LiveActivityManager] shouldBeActive changed:", shouldBeActive, "(connected:", connected, "isRecording:", isRecording, ")");
  }, [shouldBeActive, connected, isRecording]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    if (shouldBeActive && !isActiveRef.current) {
      const serialNumber =
        telemetry?.tillerSerialNumber ||
        motor?.serialNumber ||
        "Unknown";
      console.log("[LiveActivityManager] Attempting to start, serial:", serialNumber, "recording:", isRecording, "moduleLoaded:", BladeLiveActivityModule !== null);
      if (!BladeLiveActivityModule) {
        console.warn("[LiveActivityManager] Cannot start - module not loaded. Error:", getModuleLoadError());
      }
      startLiveActivity(
        serialNumber,
        telemetry?.powerConsumption ?? 0,
        telemetry?.stateOfCharge ?? 0,
        isRecording,
        tripDuration,
      ).then((id) => {
        if (id) {
          isActiveRef.current = true;
          console.log("[LiveActivityManager] Started successfully, id:", id);
        } else {
          console.warn("[LiveActivityManager] startLiveActivity returned null - module may not be loaded or not supported");
          if (!BladeLiveActivityModule) {
            console.warn("[LiveActivityManager] Module load error:", getModuleLoadError());
          }
        }
      });
    }

    if (!shouldBeActive && isActiveRef.current) {
      console.log("[LiveActivityManager] Ending live activity, shouldBeActive:", shouldBeActive);
      endLiveActivity().then(() => {
        isActiveRef.current = false;
        console.log("[LiveActivityManager] Live activity ended");
      });
    }
  }, [shouldBeActive]);

  useEffect(() => {
    if (Platform.OS === "web" || !isActiveRef.current) {
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
