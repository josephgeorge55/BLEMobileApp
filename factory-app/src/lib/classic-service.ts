import { Platform } from "react-native";
import { parseBLEFrame, ParseResult } from "./ble-parser";

export interface ClassicDevice {
  id: string;
  name: string;
  address: string;
  bonded: boolean;
}

export interface ClassicServiceCallbacks {
  onDeviceFound: (device: ClassicDevice) => void;
  onConnected: (device: ClassicDevice) => void;
  onDisconnected: (deviceId: string) => void;
  onDataReceived: (data: ParseResult) => void;
  onError: (error: Error) => void;
  onDebugLog?: (level: string, message: string) => void;
}

let RNBluetoothClassic: any = null;
let isInitialized = false;
let connectedDevice: any = null;
let dataSubscription: any = null;
let disconnectSubscription: any = null;
let dataBuffer = "";

export async function initializeClassic(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const module = await import("react-native-bluetooth-classic");
    RNBluetoothClassic = module.default;
    isInitialized = true;
    return true;
  } catch {
    return false;
  }
}

export async function getBondedDevices(): Promise<ClassicDevice[]> {
  if (!RNBluetoothClassic || !isInitialized) return [];
  try {
    const devices = await RNBluetoothClassic.getBondedDevices();
    return devices.map((device: any) => ({
      id: device.address,
      name: device.name || `Device ${device.address.substring(0, 8)}`,
      address: device.address,
      bonded: true,
    }));
  } catch {
    return [];
  }
}

export async function startDiscovery(callbacks: Pick<ClassicServiceCallbacks, "onDeviceFound" | "onError" | "onDebugLog">): Promise<boolean> {
  if (!RNBluetoothClassic || !isInitialized) {
    callbacks.onError(new Error("Bluetooth Classic not initialized"));
    return false;
  }
  try {
    const bondedDevices = await getBondedDevices();
    bondedDevices.forEach(device => callbacks.onDeviceFound(device));
    try {
      const unpaired = await RNBluetoothClassic.startDiscovery();
      if (unpaired && Array.isArray(unpaired)) {
        unpaired.forEach((device: any) => {
          callbacks.onDeviceFound({
            id: device.address,
            name: device.name || `Device ${device.address.substring(0, 8)}`,
            address: device.address,
            bonded: false,
          });
        });
      }
    } catch {}
    return true;
  } catch (error: any) {
    callbacks.onError(error);
    return false;
  }
}

export async function cancelDiscovery(): Promise<void> {
  if (!RNBluetoothClassic) return;
  try { await RNBluetoothClassic.cancelDiscovery(); } catch {}
}

function cleanFrame(data: string): string {
  return data.replace(/[^\x20-\x7E]/g, '').trim();
}

function processIncomingData(data: string, callbacks: ClassicServiceCallbacks): void {
  const cleaned = cleanFrame(data);
  if (cleaned.length === 0) return;
  dataBuffer += cleaned;

  const parts = dataBuffer.split('$');
  const unprocessed: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.length === 0) continue;
    const frame = '$' + part;
    const commaCount = (frame.match(/,/g) || []).length;
    const frameType = frame.split(",")[0]?.substring(1);
    const frameGroup = frame.split(",")[1];

    let minCommas = 6;
    if (frameType === "MOTOR") minCommas = 4;
    else if (frameType === "INFOR") minCommas = frameGroup === "G1" ? 3 : 4;

    if (commaCount >= minCommas) {
      callbacks.onDebugLog?.("DATA", `RX: ${frame}`);
      const parsed = parseBLEFrame(frame);
      if (parsed) callbacks.onDataReceived(parsed);
    } else if (i === parts.length - 1) {
      unprocessed.push(part);
    }
  }
  dataBuffer = unprocessed.length > 0 ? '$' + unprocessed.join('$') : '';
}

export async function connectToClassicDevice(address: string, callbacks: ClassicServiceCallbacks): Promise<boolean> {
  if (!RNBluetoothClassic || !isInitialized) {
    callbacks.onError(new Error("Bluetooth Classic not initialized"));
    return false;
  }
  try {
    await cancelDiscovery();
    callbacks.onDebugLog?.("INFO", `Connecting to ${address}...`);
    const device = await RNBluetoothClassic.connectToDevice(address, { delimiter: "\n", charset: "utf-8" });
    if (!device) {
      callbacks.onError(new Error("Failed to connect"));
      return false;
    }
    connectedDevice = device;
    dataSubscription = device.onDataReceived((data: any) => {
      processIncomingData(data.data, callbacks);
    });
    disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected((d: any) => {
      if (d && d.address === address) {
        connectedDevice = null;
        if (dataSubscription) { dataSubscription.remove(); dataSubscription = null; }
        if (disconnectSubscription) { disconnectSubscription.remove(); disconnectSubscription = null; }
        callbacks.onDisconnected(address);
      }
    });
    callbacks.onConnected({ id: address, name: device.name || address, address, bonded: true });
    callbacks.onDebugLog?.("INFO", "Connected via Bluetooth Classic");
    return true;
  } catch (error: any) {
    callbacks.onDebugLog?.("ERROR", `Connection error: ${error.message}`);
    callbacks.onError(error);
    return false;
  }
}

export async function writeClassicData(data: string): Promise<boolean> {
  if (!connectedDevice) return false;
  try {
    await connectedDevice.write(data + "\n");
    return true;
  } catch {
    return false;
  }
}

export async function disconnectClassic(): Promise<void> {
  if (dataSubscription) { dataSubscription.remove(); dataSubscription = null; }
  if (disconnectSubscription) { disconnectSubscription.remove(); disconnectSubscription = null; }
  if (connectedDevice) {
    try { await connectedDevice.disconnect(); } catch {}
    connectedDevice = null;
  }
  dataBuffer = "";
}

export function isClassicConnected(): boolean {
  return connectedDevice !== null;
}

let classicOtaMode = false;

export function setClassicOTAMode(enabled: boolean): void {
  classicOtaMode = enabled;
  if (enabled) {
    console.log("[Classic] OTA mode enabled");
  } else {
    console.log("[Classic] OTA mode disabled");
  }
}

export function isClassicOTAMode(): boolean {
  return classicOtaMode;
}

function arrayBufferToBase64Classic(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  try {
    return Buffer.from(buffer).toString("base64");
  } catch {
    return global.btoa(binary);
  }
}

function base64ToBytesClassic(base64: string): number[] | null {
  try {
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
    let binary: string;
    try {
      binary = Buffer.from(base64, "base64").toString("binary");
    } catch {
      binary = global.atob(base64);
    }
    const bytes: number[] = [];
    for (let i = 0; i < binary.length; i++) {
      bytes.push(binary.charCodeAt(i) & 0xFF);
    }
    return bytes;
  } catch {
    return null;
  }
}

function stringToBytesClassic(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xFF);
  }
  return bytes;
}

export async function sendClassicBinaryData(data: Uint8Array): Promise<void> {
  if (!connectedDevice) {
    throw new Error("No Classic device connected");
  }

  try {
    const base64 = arrayBufferToBase64Classic(data);
    await connectedDevice.write(base64, "base64");
    await new Promise(resolve => setTimeout(resolve, 5));
  } catch (error) {
    console.error("[Classic-OTA] Error sending binary data:", error);
    throw error;
  }
}

export async function receiveClassicBinaryData(timeout: number): Promise<Uint8Array | null> {
  if (!connectedDevice) return null;

  return new Promise((resolve) => {
    let receivedData: number[] = [];
    let checkInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(receivedData.length > 0 ? new Uint8Array(receivedData) : null);
    }, timeout);

    const checkForData = async () => {
      try {
        if (!connectedDevice) {
          cleanup();
          clearTimeout(timeoutId);
          resolve(receivedData.length > 0 ? new Uint8Array(receivedData) : null);
          return;
        }

        const available = await connectedDevice.available();
        if (available > 0) {
          const rawData = await connectedDevice.read();
          if (rawData) {
            const bytes = base64ToBytesClassic(rawData) || stringToBytesClassic(rawData);
            receivedData.push(...bytes);

            if (receivedData.length > 0 && (receivedData[0] === 0x79 || receivedData[0] === 0x1F)) {
              cleanup();
              clearTimeout(timeoutId);
              resolve(new Uint8Array(receivedData));
              return;
            }
          }
        }
      } catch (error) {
        console.error("[Classic-OTA] Error in receive loop:", error);
      }
    };

    checkForData();
    checkInterval = setInterval(checkForData, 50);
  });
}
