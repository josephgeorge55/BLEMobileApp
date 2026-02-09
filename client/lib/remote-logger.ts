import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import {
  getFirestoreDb,
  getFirebaseAuth,
} from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

const APP_VERSION = Constants.expoConfig?.version || "1.0.2";

type RemoteLogEvent =
  | "app_launch"
  | "login_success"
  | "login_failure"
  | "logout"
  | "ble_connect"
  | "ble_disconnect"
  | "trip_started"
  | "trip_ended"
  | "api_call"
  | "error";

interface RemoteLogEntry {
  event: RemoteLogEvent;
  userId?: string | null;
  email?: string | null;
  details?: Record<string, any>;
}

let loggingEnabled = true;

function getDeviceInfo() {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    deviceName: Device.deviceName || null,
    deviceModel: Device.modelName || null,
    deviceBrand: Device.brand || null,
    appVersion: APP_VERSION,
  };
}

export async function logRemoteEvent(entry: RemoteLogEntry): Promise<void> {
  if (!loggingEnabled) return;

  try {
    const firestore = getFirestoreDb();
    if (!firestore) return;

    const auth = getFirebaseAuth();
    const currentUser = auth?.currentUser;

    const doc: Record<string, any> = {
      event: entry.event,
      userId: entry.userId || currentUser?.uid || null,
      email: entry.email || currentUser?.email || null,
      timestamp: serverTimestamp(),
      ...getDeviceInfo(),
    };

    if (entry.details) {
      doc.details = entry.details;
    }

    await addDoc(collection(firestore, "remote_app_logs"), doc);
  } catch (error) {
    console.log("[RemoteLog] Failed to write log:", error);
  }
}

export function logAppLaunch(): void {
  logRemoteEvent({
    event: "app_launch",
    details: {
      launchTime: new Date().toISOString(),
    },
  });
}

export function logLoginSuccess(userId: string, email: string): void {
  logRemoteEvent({
    event: "login_success",
    userId,
    email,
  });
}

export function logLoginFailure(email: string, reason?: string): void {
  logRemoteEvent({
    event: "login_failure",
    email,
    details: { reason: reason || "unknown" },
  });
}

export function logLogout(userId?: string): void {
  logRemoteEvent({
    event: "logout",
    userId,
  });
}

export function logBleConnect(serialNumber: string, motorName: string): void {
  logRemoteEvent({
    event: "ble_connect",
    details: { serialNumber, motorName },
  });
}

export function logBleDisconnect(serialNumber: string, reason?: string): void {
  logRemoteEvent({
    event: "ble_disconnect",
    details: { serialNumber, reason: reason || "manual" },
  });
}

export function logTripStarted(tripId: string, motorSerial: string): void {
  logRemoteEvent({
    event: "trip_started",
    details: { tripId, motorSerial },
  });
}

export function logTripEnded(
  tripId: string,
  motorSerial: string,
  durationSeconds: number,
  reason: string
): void {
  logRemoteEvent({
    event: "trip_ended",
    details: {
      tripId,
      motorSerial,
      totalTripTimeSeconds: durationSeconds,
      totalTripTimeFormatted: formatDuration(durationSeconds),
      endReason: reason,
    },
  });
}

export function logApiCall(endpoint: string, method: string, statusCode?: number): void {
  logRemoteEvent({
    event: "api_call",
    details: { endpoint, method, statusCode },
  });
}

export function logError(message: string, context?: string): void {
  logRemoteEvent({
    event: "error",
    details: { message, context },
  });
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
