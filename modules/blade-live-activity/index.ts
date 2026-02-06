import { Platform } from "react-native";

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

if (Platform.OS !== "web") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    BladeLiveActivityModule = requireNativeModule("BladeLiveActivity");
  } catch {
    BladeLiveActivityModule = null;
  }
}

export default BladeLiveActivityModule;
