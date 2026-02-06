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
let notificationSubscription: any = null;

function bleLog(tag: string, msg: string) {
  console.log(`[BLE-Service][${tag}] ${msg}`);
}

export async function initializeBle(): Promise<boolean> {
  if (Platform.OS === "web") {
    console.log("BLE not available on web platform");
    return false;
  }

  try {
    const { BleManager } = await import("react-native-ble-plx");
    bleManager = new BleManager();
    isInitialized = true;
    bleLog("INIT", `BLE initialized on ${Platform.OS}`);
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
      bleLog("STATE", `BLE state: ${state}`);
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
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);

      const hasBluetooth = 
        granted["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED;
      
      const hasLocation = 
        granted["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED ||
        granted["android.permission.ACCESS_COARSE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED;

      return hasBluetooth && hasLocation;
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

  bleLog("SCAN", "Starting BLE scan...");

  bleManager.startDeviceScan(
    null,
    { 
      allowDuplicates: false,
      scanMode: 2,
      legacyScan: Platform.OS === "android",
    },
    (error: any, device: any) => {
      if (error) {
        callbacks.onError(error);
        return;
      }

      if (device) {
        const deviceName = device.name || device.localName || null;
        const displayName = deviceName || `Device ${device.id.substring(0, 8)}`;
        const serialNumber = deviceName ? extractSerialNumber(deviceName) : device.id;
        
        callbacks.onDeviceFound({
          id: device.id,
          name: displayName,
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

function decodeBase64(value: string): string {
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch (e) {
    try {
      return global.atob(value);
    } catch (e2) {
      bleLog("DECODE", `Base64 decode failed for ${value.length} chars`);
      return "";
    }
  }
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
    dataBuffer = "";

    bleLog("CONNECT", `Connecting to device: ${deviceId} (platform: ${Platform.OS})`);

    const device = await bleManager.connectToDevice(deviceId, {
      autoConnect: false,
      timeout: 15000,
      requestMTU: Platform.OS === "android" ? 512 : undefined,
    });

    bleLog("CONNECT", `Connected to ${device.name || device.id}, discovering services...`);

    await device.discoverAllServicesAndCharacteristics();

    bleLog("CONNECT", "Service discovery complete");

    connectedDevice = device;

    device.onDisconnected((error: any, disconnectedDevice: any) => {
      bleLog("DISCONNECT", `Device disconnected: ${disconnectedDevice?.id}, error: ${error?.message || 'none'}`);
      if (notificationSubscription) {
        try { notificationSubscription.remove(); } catch (e) {}
        notificationSubscription = null;
      }
      connectedDevice = null;
      callbacks.onDisconnected(disconnectedDevice.id);
    });

    await discoverAndLogServices(device);

    if (Platform.OS === "ios") {
      bleLog("CONNECT", "iOS: waiting 500ms before subscribing to notifications...");
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await subscribeToNotifications(device, callbacks);

    callbacks.onConnected({
      id: device.id,
      name: device.name,
      rssi: device.rssi || -100,
      serialNumber: extractSerialNumber(device.name || ""),
    });

    bleLog("CONNECT", "Connection complete, notifications active");

    return true;
  } catch (error: any) {
    bleLog("ERROR", `Connection failed: ${error.message}`);
    callbacks.onError(error);
    return false;
  }
}

async function discoverAndLogServices(device: any): Promise<void> {
  try {
    const services = await device.services();
    bleLog("DISCOVERY", `Found ${services.length} services:`);
    
    for (const service of services) {
      const sUuid = service.uuid;
      bleLog("DISCOVERY", `  Service: ${sUuid}`);
      
      try {
        const chars = await service.characteristics();
        for (const char of chars) {
          const props: string[] = [];
          if (char.isReadable) props.push("Read");
          if (char.isWritableWithResponse) props.push("Write");
          if (char.isWritableWithoutResponse) props.push("WriteNoResp");
          if (char.isNotifiable) props.push("Notify");
          if (char.isIndicatable) props.push("Indicate");
          bleLog("DISCOVERY", `    Char: ${char.uuid} [${props.join(", ")}]`);
        }
      } catch (charErr: any) {
        bleLog("DISCOVERY", `    Error reading characteristics: ${charErr.message}`);
      }
    }
  } catch (err: any) {
    bleLog("DISCOVERY", `Error enumerating services: ${err.message}`);
  }
}

async function subscribeToNotifications(
  device: any,
  callbacks: BleServiceCallbacks
): Promise<void> {
  bleLog("SUBSCRIBE", `Subscribing to notifications on ${BLADE_SERVICE_UUID} / ${BLADE_CHARACTERISTIC_UUID}`);

  let targetServiceUUID = BLADE_SERVICE_UUID;
  let targetCharUUID = BLADE_CHARACTERISTIC_UUID;

  try {
    const services = await device.services();
    let foundService = false;
    let foundChar = false;

    for (const service of services) {
      const sUuidLower = service.uuid.toLowerCase();
      if (sUuidLower === BLADE_SERVICE_UUID.toLowerCase() || sUuidLower === "ffe0" || sUuidLower.startsWith("0000ffe0")) {
        foundService = true;
        targetServiceUUID = service.uuid;
        bleLog("SUBSCRIBE", `Found target service: ${service.uuid}`);

        const chars = await service.characteristics();
        for (const char of chars) {
          const cUuidLower = char.uuid.toLowerCase();
          if (cUuidLower === BLADE_CHARACTERISTIC_UUID.toLowerCase() || cUuidLower === "ffe1" || cUuidLower.startsWith("0000ffe1")) {
            foundChar = true;
            targetCharUUID = char.uuid;
            const props: string[] = [];
            if (char.isNotifiable) props.push("Notify");
            if (char.isIndicatable) props.push("Indicate");
            if (char.isReadable) props.push("Read");
            bleLog("SUBSCRIBE", `Found target char: ${char.uuid} [${props.join(", ")}]`);
            break;
          }
        }
        break;
      }
    }

    if (!foundService) {
      bleLog("SUBSCRIBE", "WARNING: Target service FFE0 not found by enumeration, trying direct subscription anyway");
    }
    if (!foundChar) {
      bleLog("SUBSCRIBE", "WARNING: Target characteristic FFE1 not found by enumeration, trying direct subscription anyway");
    }
  } catch (enumErr: any) {
    bleLog("SUBSCRIBE", `Service enumeration error: ${enumErr.message}, proceeding with known UUIDs`);
  }

  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch (e) {}
    notificationSubscription = null;
  }

  let dataReceived = false;

  notificationSubscription = device.monitorCharacteristicForService(
    targetServiceUUID,
    targetCharUUID,
    (error: any, characteristic: any) => {
      if (error) {
        bleLog("NOTIFY-ERR", `Notification error: ${error.message || JSON.stringify(error)}`);
        if (error.message && (error.message.includes("disconnected") || error.message.includes("cancelled"))) {
          return;
        }
        if (!dataReceived && connectedDevice) {
          bleLog("NOTIFY-ERR", "No data received yet, will attempt resubscribe in 1s...");
          setTimeout(() => {
            if (connectedDevice) {
              resubscribeToNotifications(device, callbacks, targetServiceUUID, targetCharUUID);
            }
          }, 1000);
        }
        return;
      }

      if (characteristic && characteristic.value) {
        if (!dataReceived) {
          dataReceived = true;
          bleLog("NOTIFY", "First data received from BLE notifications!");
        }
        const decodedValue = decodeBase64(characteristic.value);
        if (decodedValue.length > 0) {
          processIncomingData(decodedValue, callbacks);
        }
      }
    }
  );

  bleLog("SUBSCRIBE", "Notification subscription active (reference stored)");

  if (Platform.OS === "ios") {
    setTimeout(() => {
      if (!dataReceived && connectedDevice) {
        bleLog("SUBSCRIBE", "iOS: No data after 3s, attempting resubscribe...");
        resubscribeToNotifications(device, callbacks, targetServiceUUID, targetCharUUID);
      }
    }, 3000);
  }
}

function resubscribeToNotifications(
  device: any,
  callbacks: BleServiceCallbacks,
  serviceUUID: string,
  charUUID: string
): void {
  bleLog("RESUB", `Resubscribing to ${serviceUUID} / ${charUUID}`);

  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch (e) {}
    notificationSubscription = null;
  }

  dataBuffer = "";

  notificationSubscription = device.monitorCharacteristicForService(
    serviceUUID,
    charUUID,
    (error: any, characteristic: any) => {
      if (error) {
        bleLog("RESUB-ERR", `Resubscribe notification error: ${error.message || JSON.stringify(error)}`);
        return;
      }

      if (characteristic && characteristic.value) {
        bleLog("RESUB", "Data received after resubscribe!");
        const decodedValue = decodeBase64(characteristic.value);
        if (decodedValue.length > 0) {
          processIncomingData(decodedValue, callbacks);
        }
      }
    }
  );

  bleLog("RESUB", "Resubscription active");
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
  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch (e) {}
    notificationSubscription = null;
  }
  if (connectedDevice) {
    try {
      await connectedDevice.cancelConnection();
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
    connectedDevice = null;
  }
  dataBuffer = "";
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
  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch (e) {}
    notificationSubscription = null;
  }
  if (bleManager) {
    bleManager.destroy();
    bleManager = null;
    isInitialized = false;
    connectedDevice = null;
  }
  dataBuffer = "";
}
