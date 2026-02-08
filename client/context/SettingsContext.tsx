import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { apiRequest } from "@/lib/query-client";
import { useUser } from "@/context/UserContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationSettings {
  maintenance: boolean;
  firmware: boolean;
  announcements: boolean;
}

interface SettingsContextType {
  anonymousDataSharing: boolean;
  notificationSettings: NotificationSettings;
  pushToken: string | null;
  setAnonymousDataSharing: (value: boolean) => void;
  setNotificationSettings: (settings: NotificationSettings) => void;
  setPushToken: (token: string | null) => void;
  toggleNotification: (key: keyof NotificationSettings) => Promise<void> | void;
  registerForPushNotifications: (userId?: string, motorSerialNumber?: string) => Promise<string | null>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = "@blade_settings";

const defaultNotificationSettings: NotificationSettings = {
  maintenance: true,
  firmware: true,
  announcements: false,
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, isGuestMode } = useUser();
  const [anonymousDataSharing, setAnonymousDataSharingState] = useState(false);
  const [notificationSettings, setNotificationSettingsState] =
    useState<NotificationSettings>(defaultNotificationSettings);
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const settingsLoadedRef = useRef(false);
  const pushRegistrationAttemptedRef = useRef(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        setAnonymousDataSharingState(settings.anonymousDataSharing ?? false);
        setNotificationSettingsState(
          settings.notificationSettings ?? defaultNotificationSettings,
        );
        setPushTokenState(settings.pushToken ?? null);
      }
      settingsLoadedRef.current = true;
    } catch (error) {
      console.error("Error loading settings:", error);
      settingsLoadedRef.current = true;
    }
  };

  const saveSettings = async (updates: Partial<{
    anonymousDataSharing: boolean;
    notificationSettings: NotificationSettings;
    pushToken: string | null;
  }>) => {
    try {
      const current = {
        anonymousDataSharing,
        notificationSettings,
        pushToken,
        ...updates,
      };
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(current));
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const syncPreferencesToServer = useCallback(async (token: string, settings: NotificationSettings) => {
    try {
      await apiRequest("PUT", "/api/push-tokens/preferences", {
        token,
        notifNews: settings.announcements,
        notifService: settings.maintenance,
        notifMotor: settings.firmware,
      });
    } catch (error) {
      console.error("[Push] Failed to sync preferences:", error);
    }
  }, []);

  const registerForPushNotifications = useCallback(async (userId?: string, motorSerialNumber?: string): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        console.log("[Push] Web platform - skipping push registration");
        return null;
      }

      if (!Device.isDevice) {
        console.log("[Push] Not a physical device - skipping push registration");
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("[Push] Permission not granted");
        return null;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#3B9EFF",
        });
      }

      let token: string;
      let tokenType: "apns" | "expo";

      if (Platform.OS === "ios") {
        const deviceTokenData = await Notifications.getDevicePushTokenAsync();
        token = deviceTokenData.data as string;
        tokenType = "apns";
        console.log("[Push] iOS device token (APNs) obtained");
      } else {
        const expoTokenData = await Notifications.getExpoPushTokenAsync({
          projectId: "blade-outboards",
        });
        token = expoTokenData.data;
        tokenType = "expo";
        console.log("[Push] Android Expo push token obtained");
      }

      setPushTokenState(token);
      saveSettings({ pushToken: token });

      try {
        await apiRequest("POST", "/api/push-tokens/register", {
          token,
          tokenType,
          userId,
          motorSerialNumber,
          platform: Platform.OS,
          notifNews: notificationSettings.announcements,
          notifService: notificationSettings.maintenance,
          notifMotor: notificationSettings.firmware,
        });
        console.log(`[Push] Token registered with server (type: ${tokenType})`);
      } catch (error) {
        console.error("[Push] Failed to register token with server:", error);
      }

      return token;
    } catch (error) {
      console.error("[Push] Registration error:", error);
      return null;
    }
  }, [notificationSettings]);

  useEffect(() => {
    if (!user || user.id === "guest" || isGuestMode) {
      return;
    }
    if (pushRegistrationAttemptedRef.current) {
      return;
    }
    pushRegistrationAttemptedRef.current = true;
    console.log("[Push] Auto-registering push notifications for user:", user.id);
    registerForPushNotifications(user.id).then((token) => {
      if (token) {
        console.log("[Push] Auto-registration successful, token obtained");
      } else {
        console.log("[Push] Auto-registration: no token (permission denied or unsupported)");
      }
    });
  }, [user, isGuestMode, registerForPushNotifications]);

  const setAnonymousDataSharing = (value: boolean) => {
    setAnonymousDataSharingState(value);
    saveSettings({ anonymousDataSharing: value });
  };

  const setNotificationSettings = (settings: NotificationSettings) => {
    setNotificationSettingsState(settings);
    saveSettings({ notificationSettings: settings });
  };

  const setPushToken = (token: string | null) => {
    setPushTokenState(token);
    saveSettings({ pushToken: token });
  };

  const toggleNotification = useCallback(async (key: keyof NotificationSettings) => {
    const newSettings = {
      ...notificationSettings,
      [key]: !notificationSettings[key],
    };
    setNotificationSettingsState(newSettings);
    saveSettings({ notificationSettings: newSettings });

    const isEnablingAny = Object.values(newSettings).some(v => v);

    if (pushToken) {
      console.log("[Push] Syncing preference change to server:", key, "→", newSettings[key]);
      syncPreferencesToServer(pushToken, newSettings);
    } else if (isEnablingAny && user && user.id !== "guest" && !isGuestMode) {
      console.log("[Push] No token yet — registering push notifications before syncing preferences");
      const token = await registerForPushNotifications(user.id);
      if (token) {
        console.log("[Push] Registration triggered by toggle, now syncing preferences");
        syncPreferencesToServer(token, newSettings);
      }
    }
  }, [notificationSettings, pushToken, user, isGuestMode, registerForPushNotifications, syncPreferencesToServer]);

  return (
    <SettingsContext.Provider
      value={{
        anonymousDataSharing,
        notificationSettings,
        pushToken,
        setAnonymousDataSharing,
        setNotificationSettings,
        setPushToken,
        toggleNotification,
        registerForPushNotifications,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
