import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { useMotor } from "@/context/MotorContext";
import { useTrip } from "@/context/TripContext";
import BladeWatchConnectivityModule from "../../modules/blade-watch-connectivity";

export default function WatchConnectivityBridge() {
  const { motor, telemetry } = useMotor();
  const { isRecording, tripDuration, startTrip, endTrip } = useTrip();
  const isSessionActive = useRef(false);
  const eventSubscriptionRef = useRef<any>(null);

  const connected = motor?.isConnected === true;

  useEffect(() => {
    if (Platform.OS === "web" || !BladeWatchConnectivityModule) return;

    const activate = async () => {
      try {
        const result = await BladeWatchConnectivityModule!.activateSession();
        isSessionActive.current = result;
        console.log("[WatchBridge] Session activated:", result);
      } catch (e) {
        console.log("[WatchBridge] Session activation failed:", e);
      }
    };
    activate();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !BladeWatchConnectivityModule) return;

    try {
      const { EventEmitter } = require("expo-modules-core");
      const emitter = new EventEmitter(BladeWatchConnectivityModule);

      const subscription = emitter.addListener(
        "onWatchTripCommand",
        (event: { command: string }) => {
          console.log("[WatchBridge] Received trip command from watch:", event.command);
          if (event.command === "start") {
            startTrip().then((success) => {
              console.log("[WatchBridge] Start trip result:", success);
            });
          } else if (event.command === "stop") {
            endTrip("user_button").then((success) => {
              console.log("[WatchBridge] End trip result:", success);
            });
          }
        }
      );
      eventSubscriptionRef.current = subscription;

      return () => {
        subscription?.remove();
        eventSubscriptionRef.current = null;
      };
    } catch (e) {
      console.log("[WatchBridge] Event listener setup failed:", e);
    }
  }, [startTrip, endTrip]);

  useEffect(() => {
    if (Platform.OS === "web" || !BladeWatchConnectivityModule) return;

    const serialNumber =
      telemetry?.tillerSerialNumber ||
      motor?.serialNumber ||
      "--";
    const motorName = motor?.name || "Blade Halo";
    const speedKnots = telemetry?.gnss?.speed
      ? telemetry.gnss.speed * 0.539957
      : 0;
    const batteryPercent = telemetry?.stateOfCharge ?? 0;
    const wattage = telemetry?.powerConsumption ?? 0;

    BladeWatchConnectivityModule!
      .sendTelemetryToWatch(
        connected,
        serialNumber,
        motorName,
        speedKnots,
        Math.round(batteryPercent),
        wattage,
        isRecording,
        tripDuration
      )
      .catch((e) => {
        // silent - watch may not be paired
      });
  }, [connected, telemetry, isRecording, tripDuration, motor]);

  return null;
}
