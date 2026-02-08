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

const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

const CCC_DESCRIPTOR_UUID = "00002902-0000-1000-8000-00805f9b34fb";

const BLADE_DEVICE_NAME_PREFIX = "Blade";
const HALO_DEVICE_NAME_PREFIX = "Halo";

let bleManager: any = null;
let isInitialized = false;
let connectedDevice: any = null;
let dataBuffer = "";
let notificationSubscription: any = null;
let targetCharacteristic: any = null;
let writeCharacteristic: any = null;
let targetServiceUUID: string = BLADE_SERVICE_UUID;
let targetCharUUID: string = BLADE_CHARACTERISTIC_UUID;
let negotiatedMTU: number = 23;

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

function encodeBase64(bytes: number[]): string {
  try {
    return Buffer.from(bytes).toString("base64");
  } catch (e) {
    const binary = String.fromCharCode(...bytes);
    return global.btoa(binary);
  }
}

function uuidMatch(discovered: string, target: string): boolean {
  const d = discovered.toLowerCase();
  const t = target.toLowerCase();
  if (d === t) return true;
  const shortTarget = t.replace(/^0000/, "").replace(/-0000-1000-8000-00805f9b34fb$/, "");
  if (d === shortTarget) return true;
  if (d.startsWith("0000" + shortTarget)) return true;
  if (d.replace(/-/g, "").includes(shortTarget.replace(/-/g, ""))) return true;
  return false;
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
    targetCharacteristic = null;
    writeCharacteristic = null;

    bleLog("CONNECT", `Connecting to device: ${deviceId} (platform: ${Platform.OS})`);

    const device = await bleManager.connectToDevice(deviceId, {
      autoConnect: false,
      timeout: 15000,
      requestMTU: Platform.OS === "android" ? 512 : undefined,
    });

    bleLog("CONNECT", `Connected to ${device.name || device.id}`);

    if (Platform.OS === "android" && device.mtu) {
      negotiatedMTU = device.mtu;
      bleLog("MTU", `Negotiated MTU: ${device.mtu} (payload: ${device.mtu - 3} bytes)`);
    } else if (Platform.OS === "ios") {
      bleLog("MTU", "iOS manages MTU automatically (typically 185-512 bytes)");
    }

    bleLog("CONNECT", "Discovering services and characteristics...");
    await device.discoverAllServicesAndCharacteristics();
    bleLog("CONNECT", "Service discovery complete");

    if (Platform.OS === "android") {
      try {
        const mtuResult = await device.requestMTU(512);
        negotiatedMTU = mtuResult.mtu;
        bleLog("MTU", `Post-discovery MTU renegotiation: ${mtuResult.mtu} (payload: ${mtuResult.mtu - 3} bytes)`);
      } catch (mtuErr: any) {
        bleLog("MTU", `MTU renegotiation skipped: ${mtuErr.message}`);
      }
    }

    connectedDevice = device;

    device.onDisconnected((error: any, disconnectedDevice: any) => {
      bleLog("DISCONNECT", `Device disconnected: ${disconnectedDevice?.id}, error: ${error?.message || 'none'}`);
      if (notificationSubscription) {
        try { notificationSubscription.remove(); } catch (e) {}
        notificationSubscription = null;
      }
      targetCharacteristic = null;
      writeCharacteristic = null;
      connectedDevice = null;
      callbacks.onDisconnected(disconnectedDevice.id);
    });

    await discoverAndLogServices(device);

    const delay = Platform.OS === "ios" ? 500 : 200;
    bleLog("CONNECT", `Waiting ${delay}ms after service discovery before subscribing...`);
    await new Promise(resolve => setTimeout(resolve, delay));

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

          try {
            const descriptors = await char.descriptors();
            for (const desc of descriptors) {
              bleLog("DISCOVERY", `      Descriptor: ${desc.uuid}`);
            }
          } catch (descErr: any) {
            bleLog("DISCOVERY", `      Descriptors: none or error (${descErr.message})`);
          }
        }
      } catch (charErr: any) {
        bleLog("DISCOVERY", `    Error reading characteristics: ${charErr.message}`);
      }
    }
  } catch (err: any) {
    bleLog("DISCOVERY", `Error enumerating services: ${err.message}`);
  }
}

async function writeCCCDescriptor(
  device: any,
  serviceUUID: string,
  charUUID: string,
  useIndicate: boolean
): Promise<boolean> {
  const cccValue = useIndicate
    ? encodeBase64([0x02, 0x00])
    : encodeBase64([0x01, 0x00]);
  const modeLabel = useIndicate ? "INDICATE" : "NOTIFY";

  bleLog("CCC", `Writing CCC descriptor (${modeLabel}) on service=${serviceUUID} char=${charUUID}`);
  bleLog("CCC", `CCC descriptor UUID: ${CCC_DESCRIPTOR_UUID}, value: ${cccValue} (${modeLabel})`);

  try {
    await device.writeDescriptorForService(
      serviceUUID,
      charUUID,
      CCC_DESCRIPTOR_UUID,
      cccValue
    );
    bleLog("CCC", `CCC descriptor written successfully (${modeLabel} enabled)`);
    return true;
  } catch (error: any) {
    bleLog("CCC", `CCC descriptor write failed: ${error.message}`);

    if (targetCharacteristic) {
      try {
        bleLog("CCC", "Trying CCC write via characteristic.descriptors() enumeration...");
        const descriptors = await targetCharacteristic.descriptors();
        for (const desc of descriptors) {
          if (uuidMatch(desc.uuid, CCC_DESCRIPTOR_UUID)) {
            bleLog("CCC", `Found CCC descriptor: ${desc.uuid}, writing...`);
            await desc.write(cccValue);
            bleLog("CCC", "CCC descriptor written via enumerated descriptor object");
            return true;
          }
        }
        bleLog("CCC", "CCC descriptor (0x2902) not found among enumerated descriptors");
      } catch (descErr: any) {
        bleLog("CCC", `Descriptor enumeration/write failed: ${descErr.message}`);
      }
    }

    bleLog("CCC", "CCC write failed - monitor() may have handled it internally");
    return false;
  }
}

interface FoundCharResult {
  notifyChar: any;
  writeChar: any;
  serviceUUID: string;
  notifyCharUUID: string;
  writeCharUUID: string;
  isIndicatable: boolean;
  profileName: string;
}

async function findTargetCharacteristic(device: any): Promise<FoundCharResult | null> {
  const services = await device.services();

  for (const service of services) {
    if (uuidMatch(service.uuid, BLADE_SERVICE_UUID)) {
      bleLog("SUBSCRIBE", `Found Feasycom service (FFE0): ${service.uuid}`);
      const chars = await service.characteristics();
      for (const char of chars) {
        if (uuidMatch(char.uuid, BLADE_CHARACTERISTIC_UUID)) {
          const canNotify = char.isNotifiable || char.isIndicatable;
          bleLog("SUBSCRIBE", `Found FFE1 char: ${char.uuid} notify=${char.isNotifiable} indicate=${char.isIndicatable} read=${char.isReadable} write=${char.isWritableWithResponse || char.isWritableWithoutResponse}`);
          if (canNotify) {
            return {
              notifyChar: char,
              writeChar: char,
              serviceUUID: service.uuid,
              notifyCharUUID: char.uuid,
              writeCharUUID: char.uuid,
              isIndicatable: !char.isNotifiable && char.isIndicatable,
              profileName: "Feasycom FFE0/FFE1",
            };
          } else {
            bleLog("SUBSCRIBE", "WARNING: FFE1 found but has NO Notify/Indicate property!");
          }
        }
      }
    }
  }

  bleLog("SUBSCRIBE", "Feasycom FFE0/FFE1 not found or not notifiable, checking Nordic UART...");
  for (const service of services) {
    if (uuidMatch(service.uuid, NUS_SERVICE_UUID)) {
      bleLog("SUBSCRIBE", `Found Nordic UART service: ${service.uuid}`);
      const chars = await service.characteristics();
      let txChar: any = null;
      let rxChar: any = null;
      for (const char of chars) {
        if (uuidMatch(char.uuid, NUS_TX_UUID)) {
          txChar = char;
          bleLog("SUBSCRIBE", `Found NUS TX char (device→phone): ${char.uuid} notify=${char.isNotifiable} indicate=${char.isIndicatable}`);
        }
        if (uuidMatch(char.uuid, NUS_RX_UUID)) {
          rxChar = char;
          bleLog("SUBSCRIBE", `Found NUS RX char (phone→device): ${char.uuid} write=${char.isWritableWithResponse || char.isWritableWithoutResponse}`);
        }
      }
      if (txChar && (txChar.isNotifiable || txChar.isIndicatable)) {
        return {
          notifyChar: txChar,
          writeChar: rxChar || txChar,
          serviceUUID: service.uuid,
          notifyCharUUID: txChar.uuid,
          writeCharUUID: rxChar ? rxChar.uuid : txChar.uuid,
          isIndicatable: !txChar.isNotifiable && txChar.isIndicatable,
          profileName: "Nordic UART (NUS)",
        };
      }
    }
  }

  bleLog("SUBSCRIBE", "No supported BLE profile found, trying brute-force on all notifiable characteristics...");
  for (const service of services) {
    const chars = await service.characteristics();
    for (const char of chars) {
      if (char.isNotifiable || char.isIndicatable) {
        bleLog("SUBSCRIBE", `Found notifiable char on service ${service.uuid}: ${char.uuid}`);
        return {
          notifyChar: char,
          writeChar: char,
          serviceUUID: service.uuid,
          notifyCharUUID: char.uuid,
          writeCharUUID: char.uuid,
          isIndicatable: !char.isNotifiable && char.isIndicatable,
          profileName: `Generic (${service.uuid} / ${char.uuid})`,
        };
      }
    }
  }

  return null;
}

async function subscribeToNotifications(
  device: any,
  callbacks: BleServiceCallbacks
): Promise<void> {
  bleLog("SUBSCRIBE", "=== BLE NOTIFICATION SUBSCRIPTION START ===");
  bleLog("SUBSCRIBE", `Platform: ${Platform.OS}, MTU: ${negotiatedMTU}`);

  targetCharacteristic = null;
  writeCharacteristic = null;

  let found: FoundCharResult | null = null;
  try {
    found = await findTargetCharacteristic(device);
  } catch (enumErr: any) {
    bleLog("SUBSCRIBE", `Service enumeration error: ${enumErr.message}`);
  }

  if (found) {
    targetCharacteristic = found.notifyChar;
    writeCharacteristic = found.writeChar;
    targetServiceUUID = found.serviceUUID;
    targetCharUUID = found.notifyCharUUID;
    bleLog("SUBSCRIBE", `Using profile: ${found.profileName}`);
    bleLog("SUBSCRIBE", `Notify char: ${found.notifyCharUUID} (indicate=${found.isIndicatable})`);
    bleLog("SUBSCRIBE", `Write char: ${found.writeCharUUID}`);
  } else {
    bleLog("SUBSCRIBE", "WARNING: No notifiable characteristic found! Falling back to FFE0/FFE1 UUIDs (may fail)");
    targetServiceUUID = BLADE_SERVICE_UUID;
    targetCharUUID = BLADE_CHARACTERISTIC_UUID;
  }

  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch (e) {}
    notificationSubscription = null;
  }

  let dataReceived = false;

  const notificationHandler = (error: any, characteristic: any) => {
    if (error) {
      bleLog("NOTIFY-ERR", `Notification error: ${error.message || JSON.stringify(error)}`);
      if (error.message && (error.message.includes("disconnected") || error.message.includes("cancelled"))) {
        return;
      }
      if (!dataReceived && connectedDevice) {
        bleLog("NOTIFY-ERR", "No data received yet after error, will attempt resubscribe in 1s...");
        setTimeout(() => {
          if (connectedDevice && !dataReceived) {
            resubscribeToNotifications(device, callbacks);
          }
        }, 1000);
      }
      return;
    }

    if (characteristic && characteristic.value) {
      if (!dataReceived) {
        dataReceived = true;
        bleLog("NOTIFY", `*** FIRST DATA RECEIVED from BLE notifications! (platform: ${Platform.OS}) ***`);
        bleLog("NOTIFY", `Characteristic: ${characteristic.uuid}, value length: ${characteristic.value.length}`);
      }
      const decodedValue = decodeBase64(characteristic.value);
      if (decodedValue.length > 0) {
        processIncomingData(decodedValue, callbacks);
      }
    }
  };

  bleLog("SUBSCRIBE", "Step 1: Setting up notification monitor...");
  if (targetCharacteristic) {
    bleLog("SUBSCRIBE", `Using characteristic.monitor() on ${targetCharUUID} (direct object reference)`);
    notificationSubscription = targetCharacteristic.monitor(notificationHandler);
  } else {
    bleLog("SUBSCRIBE", `Using device.monitorCharacteristicForService() with UUID strings: ${targetServiceUUID} / ${targetCharUUID}`);
    notificationSubscription = device.monitorCharacteristicForService(
      targetServiceUUID,
      targetCharUUID,
      notificationHandler
    );
  }
  bleLog("SUBSCRIBE", "Notification monitor registered (subscription reference stored)");

  bleLog("SUBSCRIBE", "Step 2: Explicitly writing CCC descriptor (0x2902)...");
  const useIndicate = found ? found.isIndicatable : false;
  await writeCCCDescriptor(device, targetServiceUUID, targetCharUUID, useIndicate);

  if (useIndicate && found) {
    bleLog("SUBSCRIBE", "Characteristic uses INDICATE, also trying NOTIFY CCC value as fallback...");
    await writeCCCDescriptor(device, targetServiceUUID, targetCharUUID, false);
  }

  bleLog("SUBSCRIBE", "Step 3: Setting up data-arrival retry timers (both platforms)...");

  setTimeout(() => {
    if (!dataReceived && connectedDevice) {
      bleLog("RETRY", `No data after 3s (${Platform.OS}), attempting resubscribe #1...`);
      resubscribeToNotifications(device, callbacks);
    }
  }, 3000);

  setTimeout(() => {
    if (!dataReceived && connectedDevice) {
      bleLog("RETRY", `No data after 6s (${Platform.OS}), attempting resubscribe #2...`);
      resubscribeToNotifications(device, callbacks);
    }
  }, 6000);

  setTimeout(() => {
    if (!dataReceived && connectedDevice) {
      bleLog("RETRY", `No data after 10s (${Platform.OS}), attempting final resubscribe #3...`);
      resubscribeToNotifications(device, callbacks);
    }
  }, 10000);

  setTimeout(() => {
    if (!dataReceived && connectedDevice) {
      bleLog("WARN", `*** NO BLE DATA RECEIVED AFTER 15s on ${Platform.OS} ***`);
      bleLog("WARN", "Possible causes: CCC not written, wrong characteristic, firmware not transmitting");
      bleLog("WARN", `Service: ${targetServiceUUID}, Char: ${targetCharUUID}`);
      bleLog("WARN", `Profile: ${found ? found.profileName : 'fallback'}`);
    }
  }, 15000);

  bleLog("SUBSCRIBE", "=== BLE NOTIFICATION SUBSCRIPTION COMPLETE ===");
}

async function resubscribeToNotifications(
  device: any,
  callbacks: BleServiceCallbacks
): Promise<void> {
  bleLog("RESUB", `=== RESUBSCRIBE START (${Platform.OS}) ===`);

  if (notificationSubscription) {
    try { notificationSubscription.remove(); } catch (e) {}
    notificationSubscription = null;
  }

  dataBuffer = "";

  let resubDataReceived = false;

  const notificationHandler = (error: any, characteristic: any) => {
    if (error) {
      bleLog("RESUB-ERR", `Resubscribe notification error: ${error.message || JSON.stringify(error)}`);
      return;
    }

    if (characteristic && characteristic.value) {
      if (!resubDataReceived) {
        resubDataReceived = true;
        bleLog("RESUB", `*** DATA RECEIVED after resubscribe! (${Platform.OS}) ***`);
      }
      const decodedValue = decodeBase64(characteristic.value);
      if (decodedValue.length > 0) {
        processIncomingData(decodedValue, callbacks);
      }
    }
  };

  if (targetCharacteristic) {
    bleLog("RESUB", `Using characteristic.monitor() for resubscribe (direct object reference on ${targetCharUUID})`);
    notificationSubscription = targetCharacteristic.monitor(notificationHandler);
  } else {
    bleLog("RESUB", `Using device.monitorCharacteristicForService() for resubscribe: ${targetServiceUUID} / ${targetCharUUID}`);
    notificationSubscription = device.monitorCharacteristicForService(
      targetServiceUUID,
      targetCharUUID,
      notificationHandler
    );
  }

  bleLog("RESUB", "Re-writing CCC descriptor after resubscribe...");
  const useIndicate = targetCharacteristic ? (!targetCharacteristic.isNotifiable && targetCharacteristic.isIndicatable) : false;
  await writeCCCDescriptor(device, targetServiceUUID, targetCharUUID, useIndicate);

  bleLog("RESUB", "=== RESUBSCRIBE COMPLETE ===");
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
  targetCharacteristic = null;
  writeCharacteristic = null;
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
  console.log(`[BLE-Write] writeCommand called with: "${command}"`);
  console.log(`[BLE-Write] connectedDevice: ${connectedDevice ? `${connectedDevice.id} (${connectedDevice.name})` : 'null'}`);
  
  if (!connectedDevice) {
    console.error("[BLE-Write] FAIL: No device connected");
    return false;
  }

  try {
    const base64Command = Buffer.from(command + "\n").toString("base64");
    console.log(`[BLE-Write] Encoded command length: ${base64Command.length} base64 chars`);

    const wChar = writeCharacteristic || targetCharacteristic;
    console.log(`[BLE-Write] writeCharacteristic: ${writeCharacteristic ? writeCharacteristic.uuid : 'null'}`);
    console.log(`[BLE-Write] targetCharacteristic: ${targetCharacteristic ? targetCharacteristic.uuid : 'null'}`);
    console.log(`[BLE-Write] Using characteristic: ${wChar ? wChar.uuid : 'null'}`);
    
    if (wChar) {
      console.log(`[BLE-Write] isWritableWithResponse: ${wChar.isWritableWithResponse}`);
      console.log(`[BLE-Write] isWritableWithoutResponse: ${wChar.isWritableWithoutResponse}`);
    }

    if (wChar && wChar.isWritableWithResponse) {
      console.log("[BLE-Write] Writing WITH response...");
      await wChar.writeWithResponse(base64Command);
      console.log("[BLE-Write] SUCCESS: writeWithResponse completed");
    } else if (wChar && wChar.isWritableWithoutResponse) {
      console.log("[BLE-Write] Writing WITHOUT response...");
      await wChar.writeWithoutResponse(base64Command);
      console.log("[BLE-Write] SUCCESS: writeWithoutResponse completed");
    } else {
      console.log("[BLE-Write] Fallback: writing via device service method...");
      const writeServiceUUID = writeCharacteristic ? targetServiceUUID : targetServiceUUID;
      const writeCharUUID = writeCharacteristic ? writeCharacteristic.uuid : targetCharUUID;
      console.log(`[BLE-Write] Service UUID: ${writeServiceUUID}`);
      console.log(`[BLE-Write] Characteristic UUID: ${writeCharUUID}`);
      await connectedDevice.writeCharacteristicWithResponseForService(
        writeServiceUUID,
        writeCharUUID,
        base64Command
      );
      console.log("[BLE-Write] SUCCESS: writeCharacteristicWithResponseForService completed");
    }
    return true;
  } catch (error: any) {
    console.error(`[BLE-Write] ERROR: ${error.message || error}`);
    console.error(`[BLE-Write] Error name: ${error.name || 'unknown'}`);
    console.error(`[BLE-Write] Error code: ${error.errorCode || error.code || 'unknown'}`);
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
