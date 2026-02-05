import { Platform } from "react-native";
import { parseBLEFrame, ParseResult } from "./ble-parser";

export interface ClassicDevice {
  id: string;
  name: string;
  address: string;
  bonded: boolean;
  deviceClass?: string;
  rssi?: number;
}

export interface ClassicServiceCallbacks {
  onDeviceFound: (device: ClassicDevice) => void;
  onConnected: (device: ClassicDevice) => void;
  onDisconnected: (deviceId: string) => void;
  onDataReceived: (data: ParseResult) => void;
  onError: (error: Error) => void;
  onDebugLog?: (level: "INFO" | "DATA" | "PARSE" | "ERROR", message: string) => void;
}

let RNBluetoothClassic: any = null;
let isInitialized = false;
let connectedDevice: any = null;
let dataSubscription: any = null;
let disconnectSubscription: any = null;
let dataBuffer = "";

export async function initializeClassic(): Promise<boolean> {
  // Bluetooth Classic is only available on Android
  // iOS uses BLE exclusively - react-native-bluetooth-classic is Android-only
  if (Platform.OS !== "android") {
    console.log("Bluetooth Classic only available on Android, current platform:", Platform.OS);
    return false;
  }

  try {
    const module = await import("react-native-bluetooth-classic");
    RNBluetoothClassic = module.default;
    isInitialized = true;
    return true;
  } catch (error) {
    console.log("Bluetooth Classic library not available:", error);
    return false;
  }
}

export async function isClassicAvailable(): Promise<boolean> {
  if (!RNBluetoothClassic) return false;
  
  try {
    return await RNBluetoothClassic.isBluetoothAvailable();
  } catch (error) {
    console.error("Error checking Bluetooth Classic availability:", error);
    return false;
  }
}

export async function isClassicEnabled(): Promise<boolean> {
  if (!RNBluetoothClassic) return false;
  
  try {
    return await RNBluetoothClassic.isBluetoothEnabled();
  } catch (error) {
    console.error("Error checking Bluetooth Classic enabled:", error);
    return false;
  }
}

export async function requestClassicEnable(): Promise<boolean> {
  if (!RNBluetoothClassic) return false;
  
  try {
    if (Platform.OS === "android") {
      return await RNBluetoothClassic.requestBluetoothEnabled();
    }
    return true;
  } catch (error) {
    console.error("Error requesting Bluetooth enable:", error);
    return false;
  }
}

export async function getBondedDevices(): Promise<ClassicDevice[]> {
  if (!RNBluetoothClassic || !isInitialized) {
    return [];
  }

  try {
    const devices = await RNBluetoothClassic.getBondedDevices();
    return devices.map((device: any) => ({
      id: device.address,
      name: device.name || `Device ${device.address.substring(0, 8)}`,
      address: device.address,
      bonded: true,
      deviceClass: device.deviceClass,
      rssi: device.rssi || -50,
    }));
  } catch (error) {
    console.error("Error getting bonded devices:", error);
    return [];
  }
}

export async function startDiscovery(
  callbacks: Pick<ClassicServiceCallbacks, "onDeviceFound" | "onError">
): Promise<boolean> {
  if (!RNBluetoothClassic || !isInitialized) {
    callbacks.onError(new Error("Bluetooth Classic not initialized"));
    return false;
  }

  try {
    const bondedDevices = await getBondedDevices();
    bondedDevices.forEach(device => {
      callbacks.onDeviceFound(device);
    });

    if (Platform.OS === "android") {
      try {
        const unpaired = await RNBluetoothClassic.startDiscovery();
        if (unpaired && Array.isArray(unpaired)) {
          unpaired.forEach((device: any) => {
            callbacks.onDeviceFound({
              id: device.address,
              name: device.name || `Device ${device.address.substring(0, 8)}`,
              address: device.address,
              bonded: false,
              deviceClass: device.deviceClass,
              rssi: device.rssi || -70,
            });
          });
        }
      } catch (discError) {
        console.log("Discovery not supported or failed:", discError);
      }
    }

    return true;
  } catch (error: any) {
    callbacks.onError(error);
    return false;
  }
}

export async function cancelDiscovery(): Promise<void> {
  if (!RNBluetoothClassic) return;
  
  try {
    if (Platform.OS === "android") {
      await RNBluetoothClassic.cancelDiscovery();
    }
  } catch (error) {
    console.log("Cancel discovery error:", error);
  }
}

export async function connectToClassicDevice(
  address: string,
  callbacks: ClassicServiceCallbacks
): Promise<boolean> {
  callbacks.onDebugLog?.("INFO", `connectToClassicDevice called: address=${address}`);
  
  if (!RNBluetoothClassic || !isInitialized) {
    callbacks.onDebugLog?.("ERROR", "Bluetooth Classic not initialized");
    callbacks.onError(new Error("Bluetooth Classic not initialized"));
    return false;
  }

  try {
    callbacks.onDebugLog?.("INFO", "Cancelling discovery...");
    await cancelDiscovery();

    callbacks.onDebugLog?.("INFO", `Attempting to connect to device: ${address}`);
    const device = await RNBluetoothClassic.connectToDevice(address, {
      delimiter: "\n",
      charset: "utf-8",
    });

    if (!device) {
      callbacks.onDebugLog?.("ERROR", "Device connection returned null");
      callbacks.onError(new Error("Failed to connect to device"));
      return false;
    }

    callbacks.onDebugLog?.("INFO", `Device connected successfully: ${device.name || address}`);
    connectedDevice = device;

    callbacks.onDebugLog?.("INFO", "Setting up data subscription...");
    dataSubscription = device.onDataReceived((data: any) => {
      callbacks.onDebugLog?.("DATA", `onDataReceived triggered, data.data length: ${data?.data?.length || 0}`);
      processIncomingData(data.data, callbacks);
    });
    callbacks.onDebugLog?.("INFO", "Data subscription active - listening for incoming data");

    disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected((disconnectedDevice: any) => {
      if (disconnectedDevice && disconnectedDevice.address === address) {
        callbacks.onDebugLog?.("INFO", `Device disconnected: ${address}`);
        connectedDevice = null;
        if (dataSubscription) {
          dataSubscription.remove();
          dataSubscription = null;
        }
        if (disconnectSubscription) {
          disconnectSubscription.remove();
          disconnectSubscription = null;
        }
        callbacks.onDisconnected(address);
      }
    });

    callbacks.onConnected({
      id: address,
      name: device.name || address,
      address: address,
      bonded: true,
    });

    return true;
  } catch (error: any) {
    callbacks.onDebugLog?.("ERROR", `Connection error: ${error.message}`);
    console.error("Connection error:", error);
    callbacks.onError(error);
    return false;
  }
}

function cleanFrame(data: string): string {
  // Remove invisible/control characters (null bytes, etc.) but keep printable ASCII
  // Keep: $ , . - digits, letters, spaces
  return data.replace(/[^\x20-\x7E]/g, '').trim();
}

function processIncomingData(data: string, callbacks: ClassicServiceCallbacks): void {
  // Clean the incoming data first - remove invisible characters
  const cleanedData = cleanFrame(data);
  
  callbacks.onDebugLog?.("DATA", `Raw chunk (${data.length} chars, cleaned: ${cleanedData.length}): "${cleanedData.substring(0, 80)}"`);
  
  if (cleanedData.length === 0) {
    callbacks.onDebugLog?.("DATA", `Empty data after cleaning, skipping`);
    return;
  }
  
  // Add cleaned data to buffer
  dataBuffer += cleanedData;
  callbacks.onDebugLog?.("DATA", `Buffer now (${dataBuffer.length} chars): "${dataBuffer.substring(0, 100)}"`);

  // Split on $ to handle multiple frames - each frame starts with $
  // This handles: "$BMS,...$MOTOR,..." -> ["", "BMS,...", "MOTOR,..."]
  const parts = dataBuffer.split('$');
  callbacks.onDebugLog?.("DATA", `Split by $ into ${parts.length} parts`);

  let processedCount = 0;
  const unprocessedFrames: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.length === 0) continue;
    
    // Reconstruct the frame with $
    const frame = '$' + part;
    
    // Check if this frame has enough data to be complete
    const commaCount = (frame.match(/,/g) || []).length;
    const frameType = frame.split(",")[0]?.substring(1); // Remove $
    const frameGroup = frame.split(",")[1]; // G1 or G2
    
    // Frame comma requirements (minimum commas needed for complete frame):
    // $MOTOR,G1,phaseCurrent,rpm,temp = 4 commas (5 parts)
    // $BMS,G1,voltage,capacity,current,wattage,temp = 6 commas (7 parts)
    // $GNSS,G1,time,lat,lng,course,speed = 6 commas (7 parts)  
    // $VESC,G1,voltage,current,wattage,throttle,temp = 6 commas (7 parts)
    // $INFOR,G1,serialNumber,firmwareVersion = 3 commas (4 parts)
    // $INFOR,G2,odometer,driverMode,errorCode = 4 commas (5 parts)
    let minCommas = 6; // Default for BMS, GNSS, VESC
    if (frameType === "MOTOR") {
      minCommas = 4;
    } else if (frameType === "INFOR") {
      minCommas = frameGroup === "G1" ? 3 : 4;
    }
    
    callbacks.onDebugLog?.("DATA", `Frame [${i}]: type=${frameType}, group=${frameGroup}, commas=${commaCount}/${minCommas}, data="${frame}"`);
    
    if (commaCount >= minCommas) {
      callbacks.onDebugLog?.("DATA", `Attempting parse for: "${frame}"`);
      const parsed = parseBLEFrame(frame);
      if (parsed) {
        callbacks.onDebugLog?.("PARSE", `SUCCESS: type=${parsed.type}, data=${JSON.stringify(parsed.data)}`);
        callbacks.onDataReceived(parsed);
        processedCount++;
      } else {
        callbacks.onDebugLog?.("ERROR", `Parse FAILED for: "${frame}"`);
        // Still consider it processed to avoid re-parsing
      }
    } else {
      // Incomplete frame - might be the last one, keep for next chunk
      // But only keep the LAST incomplete frame
      if (i === parts.length - 1) {
        callbacks.onDebugLog?.("DATA", `Keeping incomplete frame for next chunk: "${frame}"`);
        unprocessedFrames.push(part); // Store without $ so we can reconstruct later
      } else {
        callbacks.onDebugLog?.("DATA", `Discarding incomplete mid-stream frame: "${frame}"`);
      }
    }
  }
  
  // Keep only unprocessed (incomplete) frames in buffer  
  // If there are unprocessed frames, they need $ prefix when next data arrives
  dataBuffer = unprocessedFrames.length > 0 ? '$' + unprocessedFrames.join('$') : '';
  callbacks.onDebugLog?.("DATA", `Processed ${processedCount} frames. Buffer: "${dataBuffer}"`);
}

export async function disconnectClassic(): Promise<void> {
  if (dataSubscription) {
    dataSubscription.remove();
    dataSubscription = null;
  }

  if (disconnectSubscription) {
    disconnectSubscription.remove();
    disconnectSubscription = null;
  }

  if (connectedDevice) {
    try {
      await connectedDevice.disconnect();
    } catch (error) {
      console.error("Error disconnecting Classic device:", error);
    }
    connectedDevice = null;
  }
}

export function isClassicConnected(): boolean {
  return connectedDevice !== null;
}

export function getConnectedClassicDevice(): ClassicDevice | null {
  if (!connectedDevice) return null;

  return {
    id: connectedDevice.address,
    name: connectedDevice.name || connectedDevice.address,
    address: connectedDevice.address,
    bonded: true,
  };
}

export async function writeClassicData(data: string): Promise<boolean> {
  if (!connectedDevice) {
    console.error("No Classic device connected");
    return false;
  }

  try {
    await connectedDevice.write(data + "\n");
    return true;
  } catch (error) {
    console.error("Error writing to Classic device:", error);
    return false;
  }
}

export async function getClassicDiagnostics(): Promise<{
  available: boolean;
  enabled: boolean;
  bondedCount: number;
}> {
  const available = await isClassicAvailable();
  const enabled = await isClassicEnabled();
  const bonded = await getBondedDevices();
  
  return {
    available,
    enabled,
    bondedCount: bonded.length,
  };
}

let pendingDataResolve: ((data: Uint8Array | null) => void) | null = null;
let pendingDataBuffer: number[] = [];
let otaMode = false;

export function setOTAMode(enabled: boolean): void {
  otaMode = enabled;
  if (enabled) {
    pendingDataBuffer = [];
    console.log("[BT-Classic] OTA mode enabled - binary data handling active");
  } else {
    console.log("[BT-Classic] OTA mode disabled - normal text mode");
  }
}

export function isInOTAMode(): boolean {
  return otaMode;
}

export async function sendBinaryData(data: Uint8Array): Promise<void> {
  if (!connectedDevice) {
    throw new Error("No Classic device connected");
  }

  try {
    const hexPreview = Array.from(data.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[BT-OTA] TX (${data.length} bytes): ${hexPreview}${data.length > 16 ? '...' : ''}`);
    
    const base64 = arrayBufferToBase64(data);
    await connectedDevice.write(base64, "base64");
    
    await new Promise(resolve => setTimeout(resolve, 5));
  } catch (error) {
    console.error("[BT-OTA] Error sending binary data:", error);
    throw error;
  }
}

export async function receiveBinaryData(timeout: number): Promise<Uint8Array | null> {
  if (!connectedDevice) {
    console.log("[BT-OTA] No device connected for receive");
    return null;
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
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
      if (receivedData.length > 0) {
        console.log(`[BT-OTA] RX timeout with ${receivedData.length} bytes collected`);
        resolve(new Uint8Array(receivedData));
      } else {
        console.log("[BT-OTA] RX timeout - no data received");
        resolve(null);
      }
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
            const bytes = base64ToBytes(rawData) || stringToBytes(rawData);
            receivedData.push(...bytes);
            
            const hexPreview = bytes.slice(0, 16).map((b: number) => b.toString(16).padStart(2, '0')).join(' ');
            console.log(`[BT-OTA] RX chunk (${bytes.length} bytes): ${hexPreview}${bytes.length > 16 ? '...' : ''}`);
            
            if (receivedData.length > 0 && (receivedData[0] === 0x79 || receivedData[0] === 0x1F)) {
              cleanup();
              clearTimeout(timeoutId);
              console.log(`[BT-OTA] RX complete (ACK/NACK): ${receivedData.length} bytes`);
              resolve(new Uint8Array(receivedData));
              return;
            }
            
            if (receivedData.length >= 13 && receivedData[0] === 0x79) {
              cleanup();
              clearTimeout(timeoutId);
              console.log(`[BT-OTA] RX complete (GET response): ${receivedData.length} bytes`);
              resolve(new Uint8Array(receivedData));
              return;
            }
          }
        }
      } catch (error) {
        console.error("[BT-OTA] Error in receive loop:", error);
      }
    };

    checkForData();
    checkInterval = setInterval(checkForData, 50);
  });
}

function base64ToBytes(base64: string): number[] | null {
  try {
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
      return null;
    }
    const binary = atob(base64);
    const bytes: number[] = [];
    for (let i = 0; i < binary.length; i++) {
      bytes.push(binary.charCodeAt(i) & 0xFF);
    }
    return bytes;
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function stringToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xFF);
  }
  return bytes;
}
