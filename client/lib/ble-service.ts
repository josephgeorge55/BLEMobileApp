import { Platform } from "react-native";
import { parseBLEFrame, ParseResult } from "./ble-parser";

export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number;
  serialNumber: string | null;
}

export interface BleServiceCallbacks {
  onDeviceFound: (device: BleDevice) => void;
  onConnected: (device: BleDevice) => void;
  onDisconnected: (deviceId: string) => void;
  onDataReceived: (data: ParseResult) => void;
  onError: (error: Error) => void;
}

const BLADE_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const BLADE_CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
const BLADE_DEVICE_NAME_PREFIX = "Blade";
const HALO_DEVICE_NAME_PREFIX = "Halo";

let bleManager: any = null;
let isInitialized = false;
let connectedDevice: any = null;
let dataBuffer = "";

export async function initializeBle(): Promise<boolean> {
  if (Platform.OS === "web") {
    console.log("BLE not available on web platform");
    return false;
  }

  try {
    const { BleManager } = await import("react-native-ble-plx");
    bleManager = new BleManager();
    isInitialized = true;
    return true;
  } catch (error) {
    console.log("BLE library not available (Expo Go mode):", error);
    return false;
  }
}

export async function checkBleState(): Promise<"PoweredOn" | "PoweredOff" | "Unauthorized" | "Unsupported"> {
  if (!bleManager) {
    return "Unsupported";
  }

  return new Promise((resolve) => {
    bleManager.onStateChange((state: string) => {
      if (state === "PoweredOn") {
        resolve("PoweredOn");
      } else if (state === "PoweredOff") {
        resolve("PoweredOff");
      } else if (state === "Unauthorized") {
        resolve("Unauthorized");
      }
    }, true);
  });
}

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const { PermissionsAndroid } = await import("react-native");
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      return (
        granted["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.error("Error requesting BLE permissions:", error);
      return false;
    }
  }
  return true;
}

export function startScan(callbacks: Pick<BleServiceCallbacks, "onDeviceFound" | "onError">): void {
  if (!bleManager || !isInitialized) {
    callbacks.onError(new Error("BLE not initialized"));
    return;
  }

  bleManager.startDeviceScan(
    null,
    { allowDuplicates: false },
    (error: any, device: any) => {
      if (error) {
        callbacks.onError(error);
        return;
      }

      if (device) {
        const deviceName = device.name || device.localName || `Unknown (${device.id.substring(0, 8)})`;
        const serialNumber = extractSerialNumber(deviceName);
        callbacks.onDeviceFound({
          id: device.id,
          name: deviceName,
          rssi: device.rssi || -100,
          serialNumber,
        });
      }
    }
  );
}

export function stopScan(): void {
  if (bleManager) {
    bleManager.stopDeviceScan();
  }
}

function extractSerialNumber(deviceName: string): string | null {
  const patterns = [
    /BLD-\d{4}-\d{4}/,
    /HALO-\d{4}-\d{4}/,
    /\d{4}-\d{4}/,
  ];

  for (const pattern of patterns) {
    const match = deviceName.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return deviceName.replace(/^(Blade|Halo)\s*/i, "").trim() || null;
}

export async function connectToDevice(
  deviceId: string,
  callbacks: BleServiceCallbacks
): Promise<boolean> {
  if (!bleManager || !isInitialized) {
    callbacks.onError(new Error("BLE not initialized"));
    return false;
  }

  try {
    stopScan();

    const device = await bleManager.connectToDevice(deviceId, {
      autoConnect: false,
      timeout: 10000,
    });

    await device.discoverAllServicesAndCharacteristics();

    connectedDevice = device;

    device.onDisconnected((error: any, disconnectedDevice: any) => {
      connectedDevice = null;
      callbacks.onDisconnected(disconnectedDevice.id);
    });

    await subscribeToNotifications(device, callbacks);

    callbacks.onConnected({
      id: device.id,
      name: device.name,
      rssi: device.rssi || -100,
      serialNumber: extractSerialNumber(device.name || ""),
    });

    return true;
  } catch (error: any) {
    callbacks.onError(error);
    return false;
  }
}

async function subscribeToNotifications(
  device: any,
  callbacks: BleServiceCallbacks
): Promise<void> {
  device.monitorCharacteristicForService(
    BLADE_SERVICE_UUID,
    BLADE_CHARACTERISTIC_UUID,
    (error: any, characteristic: any) => {
      if (error) {
        console.error("BLE notification error:", error);
        return;
      }

      if (characteristic && characteristic.value) {
        const decodedValue = Buffer.from(characteristic.value, "base64").toString("utf-8");
        processIncomingData(decodedValue, callbacks);
      }
    }
  );
}

function processIncomingData(data: string, callbacks: BleServiceCallbacks): void {
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

export async function disconnect(): Promise<void> {
  if (connectedDevice) {
    try {
      await connectedDevice.cancelConnection();
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
    connectedDevice = null;
  }
}

export function isConnected(): boolean {
  return connectedDevice !== null;
}

export function getConnectedDevice(): BleDevice | null {
  if (!connectedDevice) return null;

  return {
    id: connectedDevice.id,
    name: connectedDevice.name,
    rssi: connectedDevice.rssi || -100,
    serialNumber: extractSerialNumber(connectedDevice.name || ""),
  };
}

export async function writeCommand(command: string): Promise<boolean> {
  if (!connectedDevice) {
    console.error("No device connected");
    return false;
  }

  try {
    const base64Command = Buffer.from(command + "\n").toString("base64");
    await connectedDevice.writeCharacteristicWithResponseForService(
      BLADE_SERVICE_UUID,
      BLADE_CHARACTERISTIC_UUID,
      base64Command
    );
    return true;
  } catch (error) {
    console.error("Error writing command:", error);
    return false;
  }
}

export function isBleAvailable(): boolean {
  return Platform.OS !== "web" && isInitialized;
}

export function destroyBle(): void {
  if (bleManager) {
    bleManager.destroy();
    bleManager = null;
    isInitialized = false;
    connectedDevice = null;
  }
}
