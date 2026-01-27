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
  login: (email: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@blade_user";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
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

  const logout = async () => {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login,
        register,
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
