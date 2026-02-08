import { Platform } from "react-native";

let moduleLoadError: string | null = null;

let BladeWalletPassModule: {
  canAddPasses(): boolean;
  addPassFromBase64(base64Data: string): Promise<boolean>;
  addPassFromUrl(url: string): Promise<boolean>;
} | null = null;

console.log("[WalletPass] Module loading on platform:", Platform.OS);

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
  console.log("[WalletPass] Skipping native module load on", Platform.OS);
}

export function getWalletModuleLoadError(): string | null {
  return moduleLoadError;
}

export function isNativeWalletAvailable(): boolean {
  return BladeWalletPassModule !== null;
}

export default BladeWalletPassModule;
