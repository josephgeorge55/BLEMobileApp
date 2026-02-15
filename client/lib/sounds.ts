import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export enum SoundEffect {
  MotorConnect = "motor_connect",
  MotorDisconnect = "motor_disconnect",
  TripStart = "trip_start",
  TripEnd = "trip_end",
}

export async function playConnectSound(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 100);
  } catch (e) {
    console.log("[Sound] Connect haptic failed:", e);
  }
}

export async function playDisconnectSound(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch (e) {
    console.log("[Sound] Disconnect haptic failed:", e);
  }
}

export async function playTripStartSound(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 80);
  } catch (e) {
    console.log("[Sound] Trip start haptic failed:", e);
  }
}

export async function playTripEndSound(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 100);
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 200);
  } catch (e) {
    console.log("[Sound] Trip end haptic failed:", e);
  }
}
