import { Platform } from "react-native";
import BladeLiveActivityModule from "../../modules/blade-live-activity";

let isActive = false;
let lastUpdateTime = 0;
const UPDATE_THROTTLE_MS = 1000;

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export async function isLiveActivitySupported(): Promise<boolean> {
  if (Platform.OS === "web" || !BladeLiveActivityModule) {
    return false;
  }
  try {
    return await BladeLiveActivityModule.isLiveActivitySupported();
  } catch {
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
  if (Platform.OS === "web" || !BladeLiveActivityModule) {
    return null;
  }
  try {
    const tripDuration = formatDuration(tripDurationSeconds);
    const activityId = await BladeLiveActivityModule.startLiveActivity(
      serialNumber,
      wattageKW,
      Math.round(batteryPercent),
      isRecording,
      tripDuration,
    );
    isActive = true;
    console.log("[LiveActivity] Started:", activityId);
    return activityId;
  } catch (error) {
    console.warn("[LiveActivity] Failed to start:", error);
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
  if (!isActive || Platform.OS === "web" || !BladeLiveActivityModule) {
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
    console.warn("[LiveActivity] Failed to update:", error);
  }
}

export async function endLiveActivity(): Promise<void> {
  if (!isActive || Platform.OS === "web" || !BladeLiveActivityModule) {
    return;
  }
  try {
    await BladeLiveActivityModule.endLiveActivity();
    isActive = false;
    console.log("[LiveActivity] Ended");
  } catch (error) {
    console.warn("[LiveActivity] Failed to end:", error);
  }
}

export function isLiveActivityActive(): boolean {
  return isActive;
}
