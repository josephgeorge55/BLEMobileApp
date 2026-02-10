import { Platform } from "react-native";
import { parseBLEFrame, ParseResult } from "./ble-parser";

export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number;
}

export interface BleServiceCallbacks {
  onDeviceFound: (device: BleDevice) => void;
  onConnected: (device: BleDevice) => void;
  onDisconnected: (deviceId: string) => void;
  onDataReceived: (data: ParseResult) => void;
  onError: (error: Error) => void;
  onDebugLog?: (level: string, message: string) => void;
}

const BLADE_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const BLADE_CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CCC_DESCRIPTOR_UUID = "00002902-0000-1000-8000-00805f9b34fb";

let bleManager: any = null;
let isInitialized = false;
let connectedDevice: any = null;
let dataBuffer = "";
let notificationSubscription: any = null;
let targetCharacteristic: any = null;
let writeCharacteristic: any = null;
let targetServiceUUID: string = BLADE_SERVICE_UUID;
let targetCharUUID: string = BLADE_CHARACTERISTIC_UUID;

function bleLog(tag: string, msg: string) {
  console.log(`[BLE][${tag}] ${msg}`);
}

export async function initializeBle(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { BleManager } = await import("react-native-ble-plx");
    bleManager = new BleManager();
    isInitialized = true;
    return true;
  } catch (error) {
    console.log("BLE library not available:", error);
    return false;
  }
}

export async function checkBleState(): Promise<string> {
  if (!bleManager) return "Unsupported";
  return new Promise((resolve) => {
    bleManager.onStateChange((state: string) => {
      resolve(state);
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
      return (
        granted["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch {
      return false;
    }
  }
  return true;
}

export function startScan(callbacks: Pick<BleServiceCallbacks, "onDeviceFound" | "onError" | "onDebugLog">): void {
  if (!bleManager || !isInitialized) {
    callbacks.onError(new Error("BLE not initialized"));
    return;
  }
  callbacks.onDebugLog?.("INFO", "Starting BLE scan...");
  bleManager.startDeviceScan(
    null,
    { allowDuplicates: false, scanMode: 2, legacyScan: Platform.OS === "android" },
    (error: any, device: any) => {
      if (error) {
        callbacks.onError(error);
        return;
      }
      if (device) {
        const deviceName = device.name || device.localName || null;
        callbacks.onDeviceFound({
          id: device.id,
          name: deviceName || `Device ${device.id.substring(0, 8)}`,
          rssi: device.rssi ?? -100,
        });
      }
    }
  );
}

export function stopScan(): void {
  if (bleManager) bleManager.stopDeviceScan();
}

function decodeBase64(value: string): string {
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    try { return global.atob(value); } catch { return ""; }
  }
}

function encodeBase64(bytes: number[]): string {
  try {
    return Buffer.from(bytes).toString("base64");
  } catch {
    return global.btoa(String.fromCharCode(...bytes));
  }
}

function uuidMatch(discovered: string, target: string): boolean {
  const d = discovered.toLowerCase();
  const t = target.toLowerCase();
  if (d === t) return true;
  const shortTarget = t.replace(/^0000/, "").replace(/-0000-1000-8000-00805f9b34fb$/, "");
  if (d === shortTarget || d.startsWith("0000" + shortTarget)) return true;
  if (d.replace(/-/g, "").includes(shortTarget.replace(/-/g, ""))) return true;
  return false;
}

async function findTargetCharacteristic(device: any): Promise<any> {
  const services = await device.services();
  for (const service of services) {
    if (uuidMatch(service.uuid, BLADE_SERVICE_UUID)) {
      const chars = await service.characteristics();
      for (const char of chars) {
        if (uuidMatch(char.uuid, BLADE_CHARACTERISTIC_UUID) && (char.isNotifiable || char.isIndicatable)) {
          return { notifyChar: char, writeChar: char, serviceUUID: service.uuid, notifyCharUUID: char.uuid, writeCharUUID: char.uuid, isIndicatable: !char.isNotifiable && char.isIndicatable, profileName: "Feasycom FFE0/FFE1" };
        }
      }
    }
  }
  for (const service of services) {
    if (uuidMatch(service.uuid, NUS_SERVICE_UUID)) {
      const chars = await service.characteristics();
      let txChar: any = null;
      let rxChar: any = null;
      for (const char of chars) {
        if (uuidMatch(char.uuid, NUS_TX_UUID)) txChar = char;
        if (uuidMatch(char.uuid, NUS_RX_UUID)) rxChar = char;
      }
      if (txChar && (txChar.isNotifiable || txChar.isIndicatable)) {
        return { notifyChar: txChar, writeChar: rxChar || txChar, serviceUUID: service.uuid, notifyCharUUID: txChar.uuid, writeCharUUID: rxChar ? rxChar.uuid : txChar.uuid, isIndicatable: !txChar.isNotifiable && txChar.isIndicatable, profileName: "Nordic UART (NUS)" };
      }
    }
  }
  for (const service of services) {
    const chars = await service.characteristics();
    for (const char of chars) {
      if (char.isNotifiable || char.isIndicatable) {
        return { notifyChar: char, writeChar: char, serviceUUID: service.uuid, notifyCharUUID: char.uuid, writeCharUUID: char.uuid, isIndicatable: !char.isNotifiable && char.isIndicatable, profileName: "Generic" };
      }
    }
  }
  return null;
}

export async function connectToDevice(deviceId: string, callbacks: BleServiceCallbacks): Promise<boolean> {
  if (!bleManager || !isInitialized) {
    callbacks.onError(new Error("BLE not initialized"));
    return false;
  }
  try {
    stopScan();
    dataBuffer = "";
    targetCharacteristic = null;
    writeCharacteristic = null;

    callbacks.onDebugLog?.("INFO", `Connecting to ${deviceId}...`);
    const device = await bleManager.connectToDevice(deviceId, {
      autoConnect: false,
      timeout: 15000,
      requestMTU: Platform.OS === "android" ? 512 : undefined,
    });
    await device.discoverAllServicesAndCharacteristics();

    if (Platform.OS === "android") {
      try { await device.requestMTU(512); } catch {}
    }

    connectedDevice = device;

    device.onDisconnected((_error: any, disconnectedDevice: any) => {
      if (notificationSubscription) {
        try { notificationSubscription.remove(); } catch {}
        notificationSubscription = null;
      }
      targetCharacteristic = null;
      writeCharacteristic = null;
      connectedDevice = null;
      callbacks.onDisconnected(disconnectedDevice?.id || deviceId);
    });

    const found = await findTargetCharacteristic(device);
    if (found) {
      targetCharacteristic = found.notifyChar;
      writeCharacteristic = found.writeChar;
      targetServiceUUID = found.serviceUUID;
      targetCharUUID = found.notifyCharUUID;
      callbacks.onDebugLog?.("INFO", `Using profile: ${found.profileName}`);
    }

    if (notificationSubscription) {
      try { notificationSubscription.remove(); } catch {}
    }

    const notificationHandler = (_error: any, characteristic: any) => {
      if (characteristic && characteristic.value) {
        const decoded = decodeBase64(characteristic.value);
        if (decoded.length > 0) processIncomingData(decoded, callbacks);
      }
    };

    if (targetCharacteristic) {
      notificationSubscription = targetCharacteristic.monitor(notificationHandler);
    } else {
      notificationSubscription = device.monitorCharacteristicForService(targetServiceUUID, targetCharUUID, notificationHandler);
    }

    const useIndicate = found ? found.isIndicatable : false;
    try {
      const cccValue = useIndicate ? encodeBase64([0x02, 0x00]) : encodeBase64([0x01, 0x00]);
      await device.writeDescriptorForService(targetServiceUUID, targetCharUUID, CCC_DESCRIPTOR_UUID, cccValue);
    } catch {}

    callbacks.onConnected({ id: device.id, name: device.name || device.id, rssi: device.rssi || -100 });
    callbacks.onDebugLog?.("INFO", "Connected and subscribed to notifications");
    return true;
  } catch (error: any) {
    callbacks.onDebugLog?.("ERROR", `Connection failed: ${error.message}`);
    callbacks.onError(error);
    return false;
  }
}

function processIncomingData(data: string, callbacks: BleServiceCallbacks): void {
  dataBuffer += data;
  const lines = dataBuffer.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line.startsWith("$")) {
      callbacks.onDebugLog?.("DATA", `RX: ${line}`);
      const parsed = parseBLEFrame(line);
      if (parsed) callbacks.onDataReceived(parsed);
    }
  }
  dataBuffer = lines[lines.length - 1];
}

export async function writeCommand(command: string): Promise<boolean> {
  if (!connectedDevice) return false;
  try {
    const base64Command = Buffer.from(command + "\n").toString("base64");
    const wChar = writeCharacteristic || targetCharacteristic;
    if (wChar && wChar.isWritableWithResponse) {
      await wChar.writeWithResponse(base64Command);
    } else if (wChar && wChar.isWritableWithoutResponse) {
      await wChar.writeWithoutResponse(base64Command);
    } else {
      const writeUUID = writeCharacteristic ? writeCharacteristic.uuid : targetCharUUID;
      await connectedDevice.writeCharacteristicWithResponseForService(targetServiceUUID, writeUUID, base64Command);
    }
    return true;
  } catch (error: any) {
    console.error("[BLE-Write] ERROR:", error.message);
    return false;
  }
}

export async function disconnect(): Promise<void> {
  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch {}
    notificationSubscription = null;
  }
  targetCharacteristic = null;
  writeCharacteristic = null;
  if (connectedDevice) {
    try { await connectedDevice.cancelConnection(); } catch {}
    connectedDevice = null;
  }
  dataBuffer = "";
}

export function isConnected(): boolean {
  return connectedDevice !== null;
}

export function getConnectedDevice(): BleDevice | null {
  if (!connectedDevice) return null;
  return { id: connectedDevice.id, name: connectedDevice.name, rssi: connectedDevice.rssi || -100 };
}

export function isBleAvailable(): boolean {
  return Platform.OS !== "web" && isInitialized;
}

export function destroyBle(): void {
  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch {}
    notificationSubscription = null;
  }
  targetCharacteristic = null;
  writeCharacteristic = null;
  if (bleManager) {
    bleManager.destroy();
    bleManager = null;
    isInitialized = false;
    connectedDevice = null;
  }
  dataBuffer = "";
}
