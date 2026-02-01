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
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  type Firestore
} from "firebase/firestore";

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
let db: Firestore | null = null;
let initializationError: Error | null = null;

// Initialize Firebase
function initializeFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (app && auth && db) {
    return { app, auth, db };
  }
  
  try {
    // Try to get existing app or create new one
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    auth = getAuth(app);
    db = getFirestore(app);
    initializationError = null;
    console.log("[Firebase] Initialized successfully with Firestore");
    return { app, auth, db };
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
  db = firebase.db;
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

// Motor registration interface
export interface RegisteredMotor {
  serialNumber: string;
  name?: string;
  registeredAt: Date;
}

export interface UserData {
  email: string;
  registeredMotors: RegisteredMotor[];
  createdAt: Date;
  updatedAt: Date;
}

// Get Firestore instance
export function getFirestoreDb(): Firestore | null {
  if (db) return db;
  const result = initializeFirebase();
  return result?.db ?? null;
}

// Register a motor serial number for a user
export async function registerMotorForUser(
  userId: string,
  serialNumber: string,
  motorName?: string
): Promise<boolean> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.error("[Firebase] Firestore not initialized");
    return false;
  }

  try {
    const userRef = doc(firestore, "users", userId);
    const userDoc = await getDoc(userRef);

    const newMotor: RegisteredMotor = {
      serialNumber: serialNumber.toUpperCase(),
      name: motorName,
      registeredAt: new Date(),
    };

    if (userDoc.exists()) {
      // Update existing user document
      await updateDoc(userRef, {
        registeredMotors: arrayUnion(newMotor),
        updatedAt: new Date(),
      });
    } else {
      // Create new user document
      await setDoc(userRef, {
        email: auth?.currentUser?.email || "",
        registeredMotors: [newMotor],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log("[Firebase] Motor registered:", serialNumber);
    return true;
  } catch (error) {
    console.error("[Firebase] Error registering motor:", error);
    return false;
  }
}

// Get all registered motors for a user
export async function getRegisteredMotors(userId: string): Promise<RegisteredMotor[]> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.error("[Firebase] Firestore not initialized");
    return [];
  }

  try {
    const userRef = doc(firestore, "users", userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const data = userDoc.data() as UserData;
      return data.registeredMotors || [];
    }

    return [];
  } catch (error) {
    console.error("[Firebase] Error getting registered motors:", error);
    return [];
  }
}

// Remove a registered motor for a user
export async function removeMotorForUser(
  userId: string,
  serialNumber: string
): Promise<boolean> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.error("[Firebase] Firestore not initialized");
    return false;
  }

  try {
    const userRef = doc(firestore, "users", userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const data = userDoc.data() as UserData;
      const motorToRemove = data.registeredMotors?.find(
        (m) => m.serialNumber === serialNumber.toUpperCase()
      );

      if (motorToRemove) {
        await updateDoc(userRef, {
          registeredMotors: arrayRemove(motorToRemove),
          updatedAt: new Date(),
        });
        console.log("[Firebase] Motor removed:", serialNumber);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("[Firebase] Error removing motor:", error);
    return false;
  }
}

// Check if a motor is registered to a user
export async function isMotorRegisteredToUser(
  userId: string,
  serialNumber: string
): Promise<boolean> {
  const motors = await getRegisteredMotors(userId);
  return motors.some((m) => m.serialNumber === serialNumber.toUpperCase());
}

// GPS Telemetry interface from Firestore
export interface DeviceTelemetry {
  latitude: number;
  longitude: number;
  status: string;
  timestamp: Date;
  serialNumber: string;
}

// Fetch latest GPS coordinates from Firestore using collection group query
// Queries across all devices/{deviceName}/telemetry subcollections
export async function fetchLatestGPSFromFirestore(
  serialNumber: string
): Promise<DeviceTelemetry> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    throw new Error("Firestore not initialized");
  }

  try {
    // Collection group query across all telemetry subcollections
    const telemetryQuery = query(
      collectionGroup(firestore, "telemetry"),
      where("serialNumber", "==", serialNumber.toUpperCase()),
      orderBy("timestamp", "desc"),
      limit(1)
    );

    const snapshot = await getDocs(telemetryQuery);

    if (snapshot.empty) {
      throw new Error("Device has never connected to GNSS");
    }

    const data = snapshot.docs[0].data();
    
    // Handle Firestore timestamp conversion
    let timestamp: Date;
    if (data.timestamp && typeof data.timestamp.toDate === "function") {
      timestamp = data.timestamp.toDate();
    } else if (data.timestamp instanceof Date) {
      timestamp = data.timestamp;
    } else if (typeof data.timestamp === "string") {
      timestamp = new Date(data.timestamp);
    } else if (typeof data.timestamp === "number") {
      timestamp = new Date(data.timestamp);
    } else {
      timestamp = new Date();
    }

    console.log("[Firebase] Fetched GPS telemetry for:", serialNumber, {
      lat: data.latitude,
      lng: data.longitude,
      status: data.status,
      timestamp: timestamp,
    });

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      status: data.status || "unknown",
      timestamp: timestamp,
      serialNumber: data.serialNumber,
    };
  } catch (error: any) {
    console.error("[Firebase] Error fetching GPS telemetry:", error);
    
    // Check if it's a missing index error
    if (error?.code === "failed-precondition" || error?.message?.includes("index")) {
      throw new Error("Firestore index required. Please create a composite index on telemetry collection group for serialNumber + timestamp fields.");
    }
    
    throw error;
  }
}

export { 
  auth,
  db,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User 
};
export default app;
