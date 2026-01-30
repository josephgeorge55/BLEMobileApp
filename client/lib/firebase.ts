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

// Firebase configuration - values from google-services.json and Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyAOS_qrKCWdXAENEdrvO3cJ2V8nLmE3v1A",
  authDomain: "bladeobapp.firebaseapp.com",
  projectId: "bladeobapp",
  storageBucket: "bladeobapp.firebasestorage.app",
  messagingSenderId: "416634217131",
  appId: "1:416634217131:web:c45427f52f10285e3d0dee"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let initializationError: Error | null = null;

// Initialize Firebase
function initializeFirebase(): { app: FirebaseApp; auth: Auth } | null {
  if (app && auth) {
    return { app, auth };
  }
  
  try {
    // Try to get existing app or create new one
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    auth = getAuth(app);
    initializationError = null;
    console.log("[Firebase] Initialized successfully");
    return { app, auth };
  } catch (error: any) {
    console.warn("Firebase initialization error:", error);
    initializationError = error;
    return null;
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
