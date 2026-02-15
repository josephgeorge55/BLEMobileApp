import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { 
  getAuth,
  initializeAuth,
  // @ts-ignore: getReactNativePersistence exists in the RN bundle but not in web type definitions
  getReactNativePersistence,
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
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  type Firestore
} from "firebase/firestore";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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

function initializeFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (app && auth && db) {
    return { app, auth, db };
  }
  
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    if (Platform.OS !== "web") {
      try {
        auth = initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
        console.log("[Firebase] Initialized auth with AsyncStorage persistence (native)");
      } catch (initAuthError: any) {
        if (initAuthError?.code === "auth/already-initialized") {
          auth = getAuth(app);
          console.log("[Firebase] Auth already initialized, using existing instance");
        } else {
          throw initAuthError;
        }
      }
    } else {
      auth = getAuth(app);
      console.log("[Firebase] Initialized auth with default web persistence");
    }
    
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

export interface BoatData {
  boatType: string;
  lengthMeters: number;
  weightKg: number;
  vesselName?: string;
  vin?: string;
  updatedAt: Date;
}

export interface UserData {
  email: string;
  registeredMotors: RegisteredMotor[];
  boatData?: BoatData;
  createdAt: Date;
  updatedAt: Date;
}

// Get Firestore instance
export function getFirestoreDb(): Firestore | null {
  if (db) return db;
  const result = initializeFirebase();
  return result?.db ?? null;
}

// Wait for Firebase auth state to be ready (useful on app restart)
async function waitForAuthState(maxWaitMs: number = 5000): Promise<User | null> {
  const currentAuth = getFirebaseAuth();
  if (!currentAuth) return null;
  
  // If already authenticated, return immediately
  if (currentAuth.currentUser) {
    return currentAuth.currentUser;
  }
  
  // Wait for auth state to resolve
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn("[Firebase] Auth state wait timed out");
      resolve(currentAuth.currentUser);
    }, maxWaitMs);
    
    const unsubscribe = onAuthStateChanged(currentAuth, (user) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}

// Register a motor serial number for a user
export async function registerMotorForUser(
  userId: string,
  serialNumber: string,
  motorName?: string
): Promise<{ success: boolean; error?: string }> {
  console.log("[Firebase] registerMotorForUser called:", { userId, serialNumber, motorName });
  
  // Validate serial number format - skip Bluetooth MAC addresses and iOS BLE UUIDs
  const isPlaceholderSerial = !serialNumber || serialNumber.includes(':') || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(serialNumber);
  if (isPlaceholderSerial) {
    console.error("[Firebase] Invalid serial number (placeholder/device ID):", serialNumber);
    return { success: false, error: "Motor serial number not yet received. Please wait for the motor to send its identity." };
  }
  
  // Check for guest user first
  if (userId === "guest") {
    console.error("[Firebase] Cannot register motor for guest user");
    return { success: false, error: "Sign in with an account to enable anti-theft protection. Guest mode doesn't support this feature." };
  }

  const firestore = getFirestoreDb();
  if (!firestore) {
    console.error("[Firebase] Firestore not initialized");
    return { success: false, error: "Database service unavailable. Please try again." };
  }

  // Wait for Firebase auth state to be ready (on app restart, auth state may not be immediately available)
  const currentUser = await waitForAuthState(8000); // Increased timeout
  console.log("[Firebase] Auth state resolved:", { hasUser: !!currentUser, uid: currentUser?.uid });
  
  if (!currentUser) {
    console.error("[Firebase] User not authenticated after waiting");
    return { success: false, error: "You need to sign in first. Please sign in with your email and password." };
  }

  // Use the Firebase authenticated user's UID directly for the document path
  // This ensures we're always using the correct UID that Firestore security rules expect
  const effectiveUserId = currentUser.uid;
  console.log("[Firebase] Using effective userId:", { providedUserId: userId, effectiveUserId });

  try {
    const userRef = doc(firestore, "users", effectiveUserId);
    const userDoc = await getDoc(userRef);

    const newMotor: RegisteredMotor = {
      serialNumber: serialNumber.toUpperCase(),
      name: motorName || "",
      registeredAt: new Date(),
    };

    if (userDoc.exists()) {
      // Check if motor is already registered
      const existingData = userDoc.data() as UserData;
      const alreadyRegistered = existingData.registeredMotors?.some(
        m => m.serialNumber.toUpperCase() === serialNumber.toUpperCase()
      );
      if (alreadyRegistered) {
        console.log("[Firebase] Motor already registered:", serialNumber);
        return { success: true }; // Already registered, treat as success
      }
      
      // Update existing user document
      await updateDoc(userRef, {
        registeredMotors: arrayUnion(newMotor),
        updatedAt: new Date(),
      });
    } else {
      // Create new user document
      await setDoc(userRef, {
        email: currentUser.email || "",
        registeredMotors: [newMotor],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log("[Firebase] Motor registered successfully:", serialNumber);
    return { success: true };
  } catch (error: any) {
    console.error("[Firebase] Error registering motor:", error);
    console.error("[Firebase] Error code:", error.code);
    console.error("[Firebase] Error message:", error.message);
    
    // Handle specific Firebase errors with user-friendly messages
    if (error.code === "permission-denied") {
      return { 
        success: false, 
        error: "Firestore permission denied. Please check that Firestore security rules allow writes for authenticated users to the 'users' collection." 
      };
    }
    
    if (error.code === "unavailable") {
      return { success: false, error: "Network error. Please check your internet connection and try again." };
    }
    
    return { success: false, error: error.message || "Failed to register motor. Please try again." };
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

// Save boat data for a user
let lastBoatSaveTime = 0;
const BOAT_SAVE_COOLDOWN_MS = 30000;

export async function saveBoatData(
  userId: string,
  boatData: { boatType: string; lengthMeters: number; weightKg: number; vesselName?: string; vin?: string }
): Promise<{ success: boolean; error?: string }> {
  const now = Date.now();
  if (now - lastBoatSaveTime < BOAT_SAVE_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((BOAT_SAVE_COOLDOWN_MS - (now - lastBoatSaveTime)) / 1000);
    return { success: false, error: `Please wait ${waitSeconds} seconds before updating boat information.` };
  }

  const firestore = getFirestoreDb();
  if (!firestore) {
    return { success: false, error: "Database service unavailable." };
  }

  const currentUser = await waitForAuthState(5000);
  if (!currentUser) {
    return { success: false, error: "You need to sign in first." };
  }

  lastBoatSaveTime = now;
  const effectiveUserId = currentUser.uid;

  try {
    const userRef = doc(firestore, "users", effectiveUserId);
    const cleanBoatData: Record<string, any> = {
      boatType: boatData.boatType,
      lengthMeters: boatData.lengthMeters,
      weightKg: boatData.weightKg,
      updatedAt: new Date(),
    };
    if (boatData.vesselName !== undefined && boatData.vesselName !== null && boatData.vesselName !== "") {
      cleanBoatData.vesselName = boatData.vesselName;
    } else {
      cleanBoatData.vesselName = "";
    }
    if (boatData.vin !== undefined && boatData.vin !== null && boatData.vin !== "") {
      cleanBoatData.vin = boatData.vin;
    } else {
      cleanBoatData.vin = "";
    }

    await setDoc(userRef, {
      boatData: cleanBoatData,
      updatedAt: new Date(),
    }, { merge: true });

    console.log("[Firebase] Boat data saved successfully");
    return { success: true };
  } catch (error: any) {
    console.error("[Firebase] Error saving boat data:", error);
    return { success: false, error: error.message || "Failed to save boat data." };
  }
}

// Get boat data for a user
export async function getBoatData(userId: string): Promise<BoatData | null> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    return null;
  }

  try {
    const userRef = doc(firestore, "users", userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const data = userDoc.data() as UserData;
      return data.boatData || null;
    }

    return null;
  } catch (error) {
    console.error("[Firebase] Error getting boat data:", error);
    return null;
  }
}

// Delete boat data for a user
export async function deleteBoatData(userId: string): Promise<{ success: boolean; error?: string }> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    return { success: false, error: "Database service unavailable." };
  }

  const currentUser = await waitForAuthState(5000);
  if (!currentUser) {
    return { success: false, error: "You need to sign in first." };
  }

  const effectiveUserId = currentUser.uid;

  try {
    const userRef = doc(firestore, "users", effectiveUserId);
    await setDoc(userRef, {
      boatData: null,
      updatedAt: new Date(),
    }, { merge: true });

    console.log("[Firebase] Boat data deleted successfully");
    return { success: true };
  } catch (error: any) {
    console.error("[Firebase] Error deleting boat data:", error);
    return { success: false, error: error.message || "Failed to delete boat data." };
  }
}

export async function uploadTripDataToFirestore(
  userId: string,
  tripData: any,
  dataPoints: any[]
): Promise<{ success: boolean; error?: string }> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.log("[DataShare] Firestore not initialized");
    return { success: false, error: "Database service unavailable." };
  }

  const currentUser = await waitForAuthState(5000);
  if (!currentUser) {
    console.log("[DataShare] User not authenticated");
    return { success: false, error: "You need to sign in first." };
  }

  try {
    let appVersion = "unknown";
    try {
      appVersion = Constants.expoConfig?.version || (Constants as any).manifest?.version || "unknown";
    } catch {}

    const sanitizedDataPoints = (dataPoints || []).map((dp: any) => ({
      latitude: dp.latitude ?? null,
      longitude: dp.longitude ?? null,
      speedKmh: dp.speedKmh ?? null,
      batteryPercent: dp.batteryPercent ?? null,
      batteryVoltage: dp.batteryVoltage ?? null,
      motorRpm: dp.motorRpm ?? null,
      motorTemp: dp.motorTemp ?? null,
      vescWattage: dp.vescWattage ?? null,
      throttlePercent: dp.throttlePercent ?? null,
      timestamp: dp.timestamp ?? null,
    }));

    const docData = {
      userId: currentUser.uid,
      motorSerialNumber: tripData.motorSerialNumber ?? null,
      startTime: tripData.startTime ?? null,
      endTime: tripData.endTime ?? null,
      totalDistanceKm: tripData.totalDistanceKm ?? null,
      maxSpeedKmh: tripData.maxSpeedKmh ?? null,
      avgSpeedKmh: tripData.avgSpeedKmh ?? null,
      totalEnergyWh: tripData.totalEnergyWh ?? null,
      startBatteryPercent: tripData.startBatteryPercent ?? null,
      endBatteryPercent: tripData.endBatteryPercent ?? null,
      maxAmperageDraw: tripData.maxAmperageDraw ?? null,
      maxConsumptionKW: tripData.maxConsumptionKW ?? null,
      avgConsumptionKW: tripData.avgConsumptionKW ?? null,
      rpmMax: tripData.rpmMax ?? null,
      rpmAvg: tripData.rpmAvg ?? null,
      odometerStartKm: tripData.odometerStartKm ?? null,
      odometerEndKm: tripData.odometerEndKm ?? null,
      dataPointsCount: sanitizedDataPoints.length,
      dataPoints: sanitizedDataPoints,
      phoneGPSStart: tripData.phoneGPSStart ?? null,
      phoneGPSEnd: tripData.phoneGPSEnd ?? null,
      outboardGPSStart: tripData.outboardGPSStart ?? null,
      outboardGPSEnd: tripData.outboardGPSEnd ?? null,
      startLocationAddress: tripData.startLocationAddress ?? null,
      endLocationAddress: tripData.endLocationAddress ?? null,
      uploadedAt: new Date(),
      appVersion,
    };

    await addDoc(collection(firestore, "shared_trips"), docData);
    console.log("[DataShare] Trip data uploaded successfully");
    return { success: true };
  } catch (error: any) {
    console.log("[DataShare] Error uploading trip data:", error);
    return { success: false, error: error.message || "Failed to upload trip data." };
  }
}

export async function uploadDeviceConnectionToFirestore(
  userId: string,
  motorInfo: any,
  telemetrySnapshot?: any
): Promise<{ success: boolean; error?: string }> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.log("[DataShare] Firestore not initialized");
    return { success: false, error: "Database service unavailable." };
  }

  const currentUser = await waitForAuthState(5000);
  if (!currentUser) {
    console.log("[DataShare] User not authenticated");
    return { success: false, error: "You need to sign in first." };
  }

  try {
    let appVersion = "unknown";
    try {
      appVersion = Constants.expoConfig?.version || (Constants as any).manifest?.version || "unknown";
    } catch {}

    const docData: Record<string, any> = {
      userId: currentUser.uid,
      motorSerialNumber: motorInfo?.serialNumber ?? null,
      motorName: motorInfo?.name ?? null,
      firmwareVersion: motorInfo?.firmwareVersion ?? null,
      connectedAt: new Date(),
      platform: Platform.OS,
      appVersion,
    };

    if (telemetrySnapshot) {
      docData.batteryPercent = telemetrySnapshot.batteryPercent ?? null;
      docData.speed = telemetrySnapshot.speed ?? null;
      docData.latitude = telemetrySnapshot.latitude ?? null;
      docData.longitude = telemetrySnapshot.longitude ?? null;
    }

    await addDoc(collection(firestore, "shared_connections"), docData);
    console.log("[DataShare] Device connection uploaded successfully");
    return { success: true };
  } catch (error: any) {
    console.log("[DataShare] Error uploading device connection:", error);
    return { success: false, error: error.message || "Failed to upload device connection." };
  }
}

export async function saveUserCountry(country: string): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) return;
  const currentAuth = getFirebaseAuth();
  if (!currentAuth?.currentUser) return;
  try {
    const userRef = doc(firestore, "users", currentAuth.currentUser.uid);
    await setDoc(userRef, { country, updatedAt: new Date() }, { merge: true });
    console.log("[Firebase] User country saved:", country);
  } catch (error) {
    console.error("[Firebase] Error saving user country:", error);
  }
}

export async function getUserCountry(): Promise<string | null> {
  const firestore = getFirestoreDb();
  if (!firestore) return null;
  const currentAuth = getFirebaseAuth();
  if (!currentAuth?.currentUser) return null;
  try {
    const userRef = doc(firestore, "users", currentAuth.currentUser.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data()?.country || null;
    }
    return null;
  } catch (error) {
    console.error("[Firebase] Error getting user country:", error);
    return null;
  }
}

// Firmware Release interface
export interface FirmwareRelease {
  id: string;
  version: string;
  releaseNotes: string | null;
  releaseDate: string | null;
  isMandatory: boolean;
  fileSize: number | null;
}

// Check firmware eligibility for a given serial number
export async function checkFirmwareEligibility(serialNumber: string): Promise<FirmwareRelease[]> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.error("[Firebase] Firestore not initialized");
    return [];
  }

  try {
    const firmwareQuery = query(
      collection(firestore, "firmware_releases"),
      where("eligibleSerials", "array-contains", serialNumber.toUpperCase())
    );

    const snapshot = await getDocs(firmwareQuery);

    if (snapshot.empty) {
      console.log("[Firebase] No eligible firmware found for serial:", serialNumber);
      return [];
    }

    const releases: FirmwareRelease[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      
      // Convert Firestore timestamp to ISO string
      let releaseDate: string | null = null;
      if (data.releaseDate) {
        if (typeof data.releaseDate.toDate === "function") {
          releaseDate = data.releaseDate.toDate().toISOString();
        } else if (data.releaseDate instanceof Date) {
          releaseDate = data.releaseDate.toISOString();
        } else if (typeof data.releaseDate === "string") {
          releaseDate = data.releaseDate;
        } else if (typeof data.releaseDate === "number") {
          releaseDate = new Date(data.releaseDate).toISOString();
        }
      }

      return {
        id: doc.id,
        version: data.version || "",
        releaseNotes: data.releaseNotes || null,
        releaseDate: releaseDate,
        isMandatory: data.isMandatory || false,
        fileSize: data.fileSize || null,
      };
    });

    console.log("[Firebase] Found", releases.length, "eligible firmware releases for serial:", serialNumber);
    return releases;
  } catch (error: any) {
    console.error("[Firebase] Error checking firmware eligibility:", error);
    console.error("[Firebase] Error code:", error.code);
    console.error("[Firebase] Error message:", error.message);
    return [];
  }
}

// Download firmware data by firmware ID
export async function downloadFirmwareData(
  firmwareId: string
): Promise<{ fileData: string; version: string } | null> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.error("[Firebase] Firestore not initialized");
    return null;
  }

  try {
    const firmwareRef = doc(firestore, "firmware_releases", firmwareId);
    const firmwareDoc = await getDoc(firmwareRef);

    if (!firmwareDoc.exists()) {
      console.error("[Firebase] Firmware not found with ID:", firmwareId);
      return null;
    }

    const data = firmwareDoc.data();
    
    if (!data.fileData || !data.version) {
      console.error("[Firebase] Firmware missing required fields (fileData or version)");
      return null;
    }

    console.log("[Firebase] Firmware data downloaded successfully for ID:", firmwareId);
    return {
      fileData: data.fileData,
      version: data.version,
    };
  } catch (error: any) {
    console.error("[Firebase] Error downloading firmware data:", error);
    console.error("[Firebase] Error code:", error.code);
    console.error("[Firebase] Error message:", error.message);
    return null;
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
