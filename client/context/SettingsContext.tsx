import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

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
    } catch (error) {
      console.error("Error loading settings:", error);
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
