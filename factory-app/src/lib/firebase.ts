import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  collectionGroup,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAOS_qrKCWdXAENEdrvO3cJ2V8nLmE3v1A",
  authDomain: "bladeobapp.firebaseapp.com",
  projectId: "bladeobapp",
  storageBucket: "bladeobapp.firebasestorage.app",
  messagingSenderId: "416634217131",
  appId: "1:416634217131:web:c45427f52f10285e3d0dee",
};

const FACTORY_EMAIL = "factorybladeob@gmail.com";
const FACTORY_PASSWORD = "Blade001!";

type Logger = (level: string, message: string, step?: number) => void;

let db: ReturnType<typeof getFirestore> | null = null;
let authInitialized = false;

function initFirebase(log?: Logger): ReturnType<typeof getFirestore> | null {
  if (db) return db;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    log?.("INFO", "Firestore initialized OK", 8);
    return db;
  } catch (error: any) {
    log?.("ERROR", `Firestore init failed: ${error.message}`, 8);
    return null;
  }
}

async function ensureAuth(log?: Logger): Promise<boolean> {
  if (authInitialized) {
    log?.("INFO", "Auth already initialized", 8);
    return true;
  }
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    if (!auth.currentUser) {
      log?.("INFO", "Signing in with factory account...", 8);
      await signInWithEmailAndPassword(auth, FACTORY_EMAIL, FACTORY_PASSWORD);
      log?.("INFO", "Factory account auth successful", 8);
    } else {
      log?.("INFO", `Already authenticated as: ${auth.currentUser.email}`, 8);
    }
    authInitialized = true;
    return true;
  } catch (error: any) {
    log?.("ERROR", `Auth failed: ${error.code} - ${error.message}`, 8);
    if (error.code === "auth/user-not-found") {
      log?.("ERROR", "Factory account not found in Firebase. Create it in Firebase Console > Authentication > Users.", 8);
    } else if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
      log?.("ERROR", "Factory account password incorrect. Check Firebase Console.", 8);
    }
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function checkMQTTData(
  serialNumber: string,
  log?: Logger
): Promise<{ found: boolean; coords?: { lat: number; lng: number } }> {
  const upperSN = serialNumber.toUpperCase();
  log?.("INFO", `MQTT check starting for SN: ${upperSN}`, 8);

  const firestore = initFirebase(log);
  if (!firestore) {
    log?.("ERROR", "Firestore not available - cannot proceed", 8);
    return { found: false };
  }

  try {
    log?.("INFO", "Authenticating with Firebase...", 8);
    const authed = await withTimeout(ensureAuth(log), 15000, "Auth");
    if (!authed) {
      log?.("ERROR", "Authentication failed - check factory account exists in Firebase Console", 8);
      return { found: false };
    }
  } catch (error: any) {
    log?.("ERROR", `Auth error: ${error.message}`, 8);
    return { found: false };
  }

  try {
    log?.("INFO", `Querying collectionGroup 'telemetry' where serialNumber == '${upperSN}'...`, 8);

    const q = query(
      collectionGroup(firestore, "telemetry"),
      where("serialNumber", "==", upperSN),
      orderBy("timestamp", "desc"),
      limit(1)
    );

    log?.("INFO", "Executing Firestore query (timeout 20s)...", 8);
    const snapshot = await withTimeout(getDocs(q), 20000, "Firestore query");

    log?.("DATA", `Query returned ${snapshot.size} document(s)`, 8);

    if (!snapshot.empty) {
      const docData = snapshot.docs[0].data();
      log?.("DATA", `Found telemetry doc: ${JSON.stringify(Object.keys(docData))}`, 8);
      const coords = (docData.latitude != null && docData.longitude != null)
        ? { lat: docData.latitude, lng: docData.longitude }
        : undefined;
      return { found: true, coords };
    } else {
      log?.("INFO", `No telemetry documents found for SN: ${upperSN}`, 8);
      return { found: false };
    }
  } catch (error: any) {
    log?.("ERROR", `Firestore query failed: ${error.code || "unknown"} - ${error.message}`, 8);

    if (error.message?.includes("index")) {
      log?.("ERROR", "A Firestore composite index may be required. Check Firebase console.", 8);
    }
    if (error.message?.includes("permission") || error.code === "permission-denied") {
      log?.("ERROR", "Permission denied. Check Firestore security rules allow read for authenticated users.", 8);
    }

    return { found: false };
  }
}
