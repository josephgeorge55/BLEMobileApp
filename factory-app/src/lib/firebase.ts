import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collectionGroup,
  query,
  where,
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

let db: any = null;

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

export async function checkMQTTData(serialNumber: string): Promise<boolean> {
  const firestore = initFirebase();
  if (!firestore) return false;

  try {
    const q = query(
      collectionGroup(firestore, "telemetry"),
      where("serialNumber", "==", serialNumber),
      limit(1)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("[Firebase] MQTT check error:", error);
    return false;
  }
}
