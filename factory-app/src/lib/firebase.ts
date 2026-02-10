import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAOS_qrKCWdXAENEdrvO3cJ2V8nLmE3v1A",
  authDomain: "bladeobapp.firebaseapp.com",
  projectId: "bladeobapp",
  storageBucket: "bladeobapp.firebasestorage.app",
  messagingSenderId: "416634217131",
  appId: "1:416634217131:web:c45427f52f10285e3d0dee",
};

let db: any = null;
let authInitialized = false;

function initFirebase() {
  if (db) return db;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    return db;
  } catch (error) {
    console.error("[Firebase] Init error:", error);
    return null;
  }
}

async function ensureAuth(): Promise<boolean> {
  if (authInitialized) return true;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    if (!auth.currentUser) {
      console.log("[Firebase] Signing in anonymously...");
      await signInAnonymously(auth);
      console.log("[Firebase] Anonymous auth successful");
    }
    authInitialized = true;
    return true;
  } catch (error) {
    console.error("[Firebase] Auth error:", error);
    return false;
  }
}

export async function checkMQTTData(serialNumber: string): Promise<boolean> {
  console.log("[Firebase] checkMQTTData called for:", serialNumber);
  
  const firestore = initFirebase();
  if (!firestore) {
    console.error("[Firebase] Firestore not initialized");
    return false;
  }

  const authed = await ensureAuth();
  if (!authed) {
    console.error("[Firebase] Authentication failed");
    return false;
  }

  try {
    const upperSN = serialNumber.toUpperCase();
    console.log("[Firebase] Querying telemetry for serial:", upperSN);
    
    const q = query(
      collectionGroup(firestore, "telemetry"),
      where("serialNumber", "==", upperSN),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    const snapshot = await getDocs(q);
    console.log("[Firebase] Query result: found", snapshot.size, "documents");
    return !snapshot.empty;
  } catch (error: any) {
    console.error("[Firebase] MQTT check error:", error.code, error.message);
    return false;
  }
}
