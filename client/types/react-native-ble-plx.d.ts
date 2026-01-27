declare module "react-native-ble-plx" {
  export class BleManager {
    constructor();
    destroy(): void;
    onStateChange(
      listener: (state: string) => void,
      emitCurrentState?: boolean
    ): { remove: () => void };
    startDeviceScan(
      UUIDs: string[] | null,
      options: { allowDuplicates: boolean },
      callback: (error: any, device: Device | null) => void
    ): void;
    stopDeviceScan(): void;
    connectToDevice(
      deviceId: string,
      options?: { autoConnect?: boolean; timeout?: number }
    ): Promise<Device>;
  }

  export interface Device {
    id: string;
    name: string | null;
    rssi: number | null;
    discoverAllServicesAndCharacteristics(): Promise<Device>;
    onDisconnected(
      callback: (error: any, device: Device) => void
    ): { remove: () => void };
    monitorCharacteristicForService(
      serviceUUID: string,
      characteristicUUID: string,
      callback: (error: any, characteristic: Characteristic | null) => void
    ): { remove: () => void };
    writeCharacteristicWithResponseForService(
      serviceUUID: string,
      characteristicUUID: string,
      value: string
    ): Promise<Characteristic>;
    cancelConnection(): Promise<Device>;
  }

  export interface Characteristic {
    uuid: string;
    value: string | null;
  }
}
