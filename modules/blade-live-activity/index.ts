import { Platform } from "react-native";

let moduleLoadError: string | null = null;

let BladeLiveActivityModule: {
  startLiveActivity(
    serialNumber: string,
    wattageKW: number,
    batteryPercent: number,
    isRecording: boolean,
    tripDuration: string,
  ): Promise<string>;
  updateLiveActivity(
    serialNumber: string,
    wattageKW: number,
    batteryPercent: number,
    isRecording: boolean,
    tripDuration: string,
  ): Promise<boolean>;
  endLiveActivity(): Promise<boolean>;
  isLiveActivitySupported(): Promise<boolean>;
} | null = null;

console.log("[LiveActivity] Module loading on platform:", Platform.OS);

if (Platform.OS !== "web") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    BladeLiveActivityModule = requireNativeModule("BladeLiveActivity");
    console.log("[LiveActivity] Native module loaded successfully");
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || "no stack";
    moduleLoadError = errorMessage;
    console.warn("[LiveActivity] Failed to load native module");
    console.warn("[LiveActivity] Error message:", errorMessage);
    console.warn("[LiveActivity] Error stack:", errorStack);
    console.warn("[LiveActivity] Full error object:", JSON.stringify(error, null, 2));
    BladeLiveActivityModule = null;
  }
} else {
  moduleLoadError = "Web platform - native modules not available";
  console.log("[LiveActivity] Skipping native module load on web");
}

export function getModuleLoadError(): string | null {
  return moduleLoadError;
}

export default BladeLiveActivityModule;
