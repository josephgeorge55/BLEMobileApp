import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
  type Auth
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let initializationError: Error | null = null;

// Safely initialize Firebase with multiple fallback attempts
function initializeFirebase(): { app: FirebaseApp; auth: Auth } | null {
  if (app && auth) {
    return { app, auth };
  }
  
  try {
    // Check if all required config values are present
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missingKeys = requiredKeys.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);
    
    if (missingKeys.length > 0) {
      console.warn("Firebase config missing keys:", missingKeys);
      initializationError = new Error(`Missing Firebase config: ${missingKeys.join(', ')}`);
      return null;
    }
    
    // Try to get existing app or create new one
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    auth = getAuth(app);
    initializationError = null;
    return { app, auth };
  } catch (error: any) {
    console.warn("Firebase initialization error:", error);
    initializationError = error;
    
    // Fallback: try to create a fresh instance
    try {
      app = initializeApp(firebaseConfig, `blade-${Date.now()}`);
      auth = getAuth(app);
      initializationError = null;
      return { app, auth };
    } catch (fallbackError) {
      console.warn("Firebase fallback initialization failed:", fallbackError);
      return null;
    }
  }
}

// Initialize on module load
const firebase = initializeFirebase();
if (firebase) {
  app = firebase.app;
  auth = firebase.auth;
}

// Export a getter that handles null cases
export function getFirebaseAuth(): Auth | null {
  if (auth) return auth;
  const result = initializeFirebase();
  return result?.auth ?? null;
}

export function isFirebaseInitialized(): boolean {
  return app !== null && auth !== null;
}

export function getFirebaseError(): Error | null {
  return initializationError;
}

export { 
  auth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User 
};
export default app;
