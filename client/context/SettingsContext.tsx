import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { apiRequest } from "@/lib/query-client";

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
  toggleNotification: (key: keyof NotificationSettings) => void;
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
  const [anonymousDataSharing, setAnonymousDataSharingState] = useState(false);
  const [notificationSettings, setNotificationSettingsState] =
    useState<NotificationSettings>(defaultNotificationSettings);
  const [pushToken, setPushTokenState] = useState<string | null>(null);
  const settingsLoadedRef = useRef(false);

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

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: "blade-outboards",
      });
      const token = tokenData.data;

      setPushTokenState(token);
      saveSettings({ pushToken: token });

      try {
        await apiRequest("POST", "/api/push-tokens/register", {
          token,
          userId,
          motorSerialNumber,
          platform: Platform.OS,
          notifNews: notificationSettings.announcements,
          notifService: notificationSettings.maintenance,
          notifMotor: notificationSettings.firmware,
        });
        console.log("[Push] Token registered with server");
      } catch (error) {
        console.error("[Push] Failed to register token with server:", error);
      }

      return token;
    } catch (error) {
      console.error("[Push] Registration error:", error);
      return null;
    }
  }, [notificationSettings]);

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

  const toggleNotification = (key: keyof NotificationSettings) => {
    const newSettings = {
      ...notificationSettings,
      [key]: !notificationSettings[key],
    };
    setNotificationSettings(newSettings);
    if (pushToken) {
      syncPreferencesToServer(pushToken, newSettings);
    }
  };

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
