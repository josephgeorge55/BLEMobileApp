import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface UserData {
  id: string;
  email: string;
  createdAt: Date;
}

interface UserContextType {
  user: UserData | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isGuestMode: boolean;
  login: (email: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@blade_user";

const GUEST_STORAGE_KEY = "@blade_guest_mode";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);

  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
      const storedGuest = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
      if (storedGuest === "true") {
        setIsGuestMode(true);
        setUser({
          id: "guest",
          email: "guest@bladeoutboards.com",
          createdAt: new Date(),
        });
        setIsLoading(false);
        return;
      }

      const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        userData.createdAt = new Date(userData.createdAt);
        setUser(userData);
      }
    } catch (error) {
      console.error("Error loading stored user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveUser = async (userData: UserData) => {
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    setUser(userData);
  };

  const register = async (email: string, pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiRequest("POST", "/api/auth/register", { email, pin });
      const data = await response.json();
      
      if (data.success && data.user) {
        await saveUser({
          id: data.user.id,
          email: data.user.email,
          createdAt: new Date(data.user.createdAt),
        });
        return { success: true };
      } else {
        return { success: false, error: data.error || "Registration failed" };
      }
    } catch (error: any) {
      return { success: false, error: error.message || "Network error" };
    }
  };

  const login = async (email: string, pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiRequest("POST", "/api/auth/login", { email, pin });
      const data = await response.json();
      
      if (data.success && data.user) {
        await saveUser({
          id: data.user.id,
          email: data.user.email,
          createdAt: new Date(data.user.createdAt),
        });
        return { success: true };
      } else {
        return { success: false, error: data.error || "Login failed" };
      }
    } catch (error: any) {
      return { success: false, error: error.message || "Network error" };
    }
  };

  const loginAsGuest = async () => {
    await AsyncStorage.setItem(GUEST_STORAGE_KEY, "true");
    setIsGuestMode(true);
    setUser({
      id: "guest",
      email: "guest@bladeoutboards.com",
      createdAt: new Date(),
    });
  };

  const logout = async () => {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
    setUser(null);
    setIsGuestMode(false);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        isGuestMode,
        login,
        register,
        loginAsGuest,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
