import { Platform } from "react-native";

let BladeWatchConnectivityModule: {
  activateSession(): Promise<boolean>;
  sendTelemetryToWatch(
    isConnected: boolean,
    serialNumber: string,
    motorName: string,
    speedKnots: number,
    batteryPercent: number,
    wattage: number,
    isTripActive: boolean,
    tripElapsedSeconds: number,
  ): Promise<boolean>;
  isWatchPaired(): Promise<boolean>;
  isWatchReachable(): Promise<boolean>;
} | null = null;

if (Platform.OS === "ios" || Platform.OS === "android") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    BladeWatchConnectivityModule = requireNativeModule("BladeWatchConnectivity");
  } catch {
    BladeWatchConnectivityModule = null;
  }
}

export default BladeWatchConnectivityModule;
