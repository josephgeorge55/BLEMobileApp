import { Platform } from "react-native";
import BladeLiveActivityModule, { getModuleLoadError } from "../../modules/blade-live-activity";

let isActive = false;
let lastUpdateTime = 0;
const UPDATE_THROTTLE_MS = 1000;

console.log("[LiveActivityService] Initializing, module available:", BladeLiveActivityModule !== null);
if (!BladeLiveActivityModule) {
  console.log("[LiveActivityService] Module load error:", getModuleLoadError());
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export async function isLiveActivitySupported(): Promise<boolean> {
  if (Platform.OS === "web") {
    console.log("[LiveActivityService] isLiveActivitySupported: false (web platform)");
    return false;
  }
  if (!BladeLiveActivityModule) {
    console.log("[LiveActivityService] isLiveActivitySupported: false (module not loaded, error:", getModuleLoadError(), ")");
    return false;
  }
  try {
    const supported = await BladeLiveActivityModule.isLiveActivitySupported();
    console.log("[LiveActivityService] isLiveActivitySupported:", supported);
    return supported;
  } catch (error) {
    console.warn("[LiveActivityService] isLiveActivitySupported error:", error);
    return false;
  }
}

export async function startLiveActivity(
  serialNumber: string,
  wattageKW: number,
  batteryPercent: number,
  isRecording: boolean,
  tripDurationSeconds: number,
): Promise<string | null> {
  if (Platform.OS === "web") {
    console.log("[LiveActivityService] startLiveActivity: skipped (web platform)");
    return null;
  }
  if (!BladeLiveActivityModule) {
    console.warn("[LiveActivityService] startLiveActivity: module is null, cannot start");
    console.warn("[LiveActivityService] Module load error:", getModuleLoadError());
    return null;
  }
  try {
    const tripDuration = formatDuration(tripDurationSeconds);
    console.log("[LiveActivityService] startLiveActivity: requesting start with serial:", serialNumber, "recording:", isRecording, "duration:", tripDuration);
    const activityId = await BladeLiveActivityModule.startLiveActivity(
      serialNumber,
      wattageKW,
      Math.round(batteryPercent),
      isRecording,
      tripDuration,
    );
    isActive = true;
    console.log("[LiveActivityService] Started successfully, activityId:", activityId);
    return activityId;
  } catch (error) {
    console.warn("[LiveActivityService] Failed to start:", error);
    return null;
  }
}

export async function updateLiveActivity(
  serialNumber: string,
  wattageKW: number,
  batteryPercent: number,
  isRecording: boolean,
  tripDurationSeconds: number,
): Promise<void> {
  if (!isActive) {
    return;
  }
  if (Platform.OS === "web") {
    return;
  }
  if (!BladeLiveActivityModule) {
    console.warn("[LiveActivityService] updateLiveActivity: module is null, error:", getModuleLoadError());
    return;
  }

  const now = Date.now();
  if (now - lastUpdateTime < UPDATE_THROTTLE_MS) {
    return;
  }
  lastUpdateTime = now;

  try {
    const tripDuration = formatDuration(tripDurationSeconds);
    await BladeLiveActivityModule.updateLiveActivity(
      serialNumber,
      wattageKW,
      Math.round(batteryPercent),
      isRecording,
      tripDuration,
    );
  } catch (error) {
    console.warn("[LiveActivityService] Failed to update:", error);
  }
}

export async function endLiveActivity(): Promise<void> {
  if (!isActive) {
    console.log("[LiveActivityService] endLiveActivity: not active, skipping");
    return;
  }
  if (Platform.OS === "web") {
    return;
  }
  if (!BladeLiveActivityModule) {
    console.warn("[LiveActivityService] endLiveActivity: module is null, error:", getModuleLoadError());
    return;
  }
  try {
    await BladeLiveActivityModule.endLiveActivity();
    isActive = false;
    console.log("[LiveActivityService] Ended successfully");
  } catch (error) {
    console.warn("[LiveActivityService] Failed to end:", error);
  }
}

export function isLiveActivityActive(): boolean {
  return isActive;
}
