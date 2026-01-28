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
}

let RNBluetoothClassic: any = null;
let isInitialized = false;
let connectedDevice: any = null;
let dataSubscription: any = null;
let disconnectSubscription: any = null;
let dataBuffer = "";

export async function initializeClassic(): Promise<boolean> {
  if (Platform.OS === "web") {
    console.log("Bluetooth Classic not available on web platform");
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
  if (!RNBluetoothClassic || !isInitialized) {
    callbacks.onError(new Error("Bluetooth Classic not initialized"));
    return false;
  }

  try {
    await cancelDiscovery();

    const device = await RNBluetoothClassic.connectToDevice(address, {
      delimiter: "\n",
      charset: "utf-8",
    });

    if (!device) {
      callbacks.onError(new Error("Failed to connect to device"));
      return false;
    }

    connectedDevice = device;

    dataSubscription = device.onDataReceived((data: any) => {
      processIncomingData(data.data, callbacks);
    });

    disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected((disconnectedDevice: any) => {
      if (disconnectedDevice && disconnectedDevice.address === address) {
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
    console.error("Connection error:", error);
    callbacks.onError(error);
    return false;
  }
}

function processIncomingData(data: string, callbacks: ClassicServiceCallbacks): void {
  dataBuffer += data;

  const lines = dataBuffer.split("\n");

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line.startsWith("$")) {
      const parsed = parseBLEFrame(line);
      if (parsed) {
        callbacks.onDataReceived(parsed);
      }
    }
  }

  dataBuffer = lines[lines.length - 1];
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
