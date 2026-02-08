import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { 
  auth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  getFirebaseAuth,
  isFirebaseInitialized,
  type User as FirebaseUser
} from "@/lib/firebase";

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
  isFirebaseReady: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@blade_user";
const GUEST_STORAGE_KEY = "@blade_guest_mode";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const authStateReceivedRef = useRef(false);
  const loadedFromStorageRef = useRef(false);

  useEffect(() => {
    loadStoredUser();
    
    const currentAuth = getFirebaseAuth();
    if (!currentAuth) {
      console.warn("Firebase auth not initialized, skipping auth state listener");
      setIsFirebaseReady(true);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(currentAuth, async (firebaseUser) => {
      const isFirstCallback = !authStateReceivedRef.current;
      authStateReceivedRef.current = true;
      
      if (firebaseUser) {
        const userData: UserData = {
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
        };
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        setUser(userData);
        setIsGuestMode(false);
        console.log("[Auth] Firebase auth confirmed user:", firebaseUser.uid);
      } else if (isFirstCallback && loadedFromStorageRef.current) {
        console.log("[Auth] Firebase says no user but we had one in storage - clearing stale session");
        await AsyncStorage.removeItem(USER_STORAGE_KEY);
        setUser(null);
      }
      
      setIsFirebaseReady(true);
      
      if (isFirstCallback && loadedFromStorageRef.current) {
        setIsLoading(false);
      }
    });

    const authTimeout = setTimeout(() => {
      if (!authStateReceivedRef.current) {
        console.warn("[Auth] Firebase auth state timed out after 5s, proceeding with stored user");
        setIsFirebaseReady(true);
        setIsLoading(false);
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(authTimeout);
    };
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
        setIsFirebaseReady(true);
        setIsLoading(false);
        loadedFromStorageRef.current = true;
        return;
      }

      const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        userData.createdAt = new Date(userData.createdAt);
        setUser(userData);
        console.log("[Auth] Loaded user from storage:", userData.id);
      }
    } catch (error) {
      console.error("Error loading stored user:", error);
    }
    
    loadedFromStorageRef.current = true;
    
    if (authStateReceivedRef.current) {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const currentAuth = getFirebaseAuth();
    if (!currentAuth) {
      return { success: false, error: "Authentication service unavailable. Please try again later." };
    }
    
    try {
      const userCredential = await createUserWithEmailAndPassword(currentAuth, email, password);
      const firebaseUser = userCredential.user;
      
      const userData: UserData = {
        id: firebaseUser.uid,
        email: firebaseUser.email || email,
        createdAt: new Date(),
      };
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
      await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
      setUser(userData);
      setIsGuestMode(false);
      
      return { success: true };
    } catch (error: any) {
      console.error("Firebase registration error:", error);
      
      let errorMessage = "Registration failed";
      switch (error.code) {
        case "auth/email-already-in-use":
          errorMessage = "This email is already registered. Please sign in instead.";
          break;
        case "auth/invalid-email":
          errorMessage = "Please enter a valid email address.";
          break;
        case "auth/weak-password":
          errorMessage = "Password must be at least 6 characters.";
          break;
        case "auth/operation-not-allowed":
          errorMessage = "Email/password accounts are not enabled.";
          break;
        default:
          errorMessage = error.message || "Registration failed";
      }
      
      return { success: false, error: errorMessage };
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const currentAuth = getFirebaseAuth();
    if (!currentAuth) {
      return { success: false, error: "Authentication service unavailable. Please try again later." };
    }
    
    try {
      const userCredential = await signInWithEmailAndPassword(currentAuth, email, password);
      const firebaseUser = userCredential.user;
      
      const userData: UserData = {
        id: firebaseUser.uid,
        email: firebaseUser.email || email,
        createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
      };
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
      await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
      setUser(userData);
      setIsGuestMode(false);
      
      return { success: true };
    } catch (error: any) {
      console.error("Firebase login error:", error);
      
      let errorMessage = "Login failed";
      switch (error.code) {
        case "auth/user-not-found":
          errorMessage = "No account found with this email.";
          break;
        case "auth/wrong-password":
          errorMessage = "Incorrect password.";
          break;
        case "auth/invalid-email":
          errorMessage = "Please enter a valid email address.";
          break;
        case "auth/user-disabled":
          errorMessage = "This account has been disabled.";
          break;
        case "auth/too-many-requests":
          errorMessage = "Too many failed attempts. Please try again later.";
          break;
        case "auth/invalid-credential":
          errorMessage = "Invalid email or password.";
          break;
        default:
          errorMessage = error.message || "Login failed";
      }
      
      return { success: false, error: errorMessage };
    }
  };

  const loginAsGuest = async () => {
    await AsyncStorage.setItem(GUEST_STORAGE_KEY, "true");
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    setIsGuestMode(true);
    setUser({
      id: "guest",
      email: "guest@bladeoutboards.com",
      createdAt: new Date(),
    });
  };

  const logout = async () => {
    try {
      const currentAuth = getFirebaseAuth();
      if (!isGuestMode && currentAuth?.currentUser) {
        await firebaseSignOut(currentAuth);
      }
    } catch (error) {
      console.error("Firebase sign out error:", error);
    }
    
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
    setUser(null);
    setIsGuestMode(false);
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    const currentAuth = getFirebaseAuth();
    if (!currentAuth) {
      return { success: false, error: "Authentication service unavailable. Please try again later." };
    }
    
    try {
      await sendPasswordResetEmail(currentAuth, email);
      return { success: true };
    } catch (error: any) {
      console.error("Firebase password reset error:", error);
      
      let errorMessage = "Password reset failed";
      switch (error.code) {
        case "auth/user-not-found":
          errorMessage = "No account found with this email.";
          break;
        case "auth/invalid-email":
          errorMessage = "Please enter a valid email address.";
          break;
        default:
          errorMessage = error.message || "Password reset failed";
      }
      
      return { success: false, error: errorMessage };
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        isGuestMode,
        isFirebaseReady,
        login,
        register,
        loginAsGuest,
        logout,
        resetPassword,
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
