import { Platform } from "react-native";

let moduleLoadError: string | null = null;

interface WalletPassResult {
  presented: boolean;
  added: boolean;
  alreadyInWallet: boolean;
  serialNumber?: string;
  passTypeIdentifier?: string;
  debug?: string;
}

interface WalletDebugInfo {
  canAddPasses: boolean;
  passCount: number;
  passes: Array<{
    serialNumber: string;
    passTypeIdentifier: string;
    organizationName: string;
    localizedDescription: string;
  }>;
  platform: string;
  moduleVersion: string;
}

let BladeWalletPassModule: {
  canAddPasses(): boolean;
  getDebugInfo(): WalletDebugInfo;
  addPassFromUrl(url: string): Promise<WalletPassResult>;
  addPassFromData(base64Data: string): Promise<WalletPassResult>;
} | null = null;

if (Platform.OS === "ios") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    BladeWalletPassModule = requireNativeModule("BladeWalletPass");
    console.log("[WalletPass] Native module loaded successfully");
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    moduleLoadError = errorMessage;
    console.warn("[WalletPass] Failed to load native module:", errorMessage);
    console.warn("[WalletPass] Will fall back to share sheet for .pkpass files");
    BladeWalletPassModule = null;
  }
} else {
  moduleLoadError = `${Platform.OS} platform - Apple Wallet not available`;
}

export function getWalletModuleLoadError(): string | null {
  return moduleLoadError;
}

export function isNativeWalletAvailable(): boolean {
  return BladeWalletPassModule !== null;
}

export type { WalletPassResult, WalletDebugInfo };
export default BladeWalletPassModule;
