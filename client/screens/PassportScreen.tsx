import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import QRCode from "react-native-qrcode-svg";

import { ThemedText } from "@/components/ThemedText";
import { useUser } from "@/context/UserContext";
import { useMotor } from "@/context/MotorContext";
import {
  getBoatData,
  getRegisteredMotors,
  type BoatData,
  type RegisteredMotor,
} from "@/lib/firebase";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";
import BladeWalletPassModule, { isNativeWalletAvailable, getWalletModuleLoadError } from "../../modules/blade-wallet-pass";
import FeatureIntroOverlay, { INTRO_KEY_PASSPORT } from "@/components/FeatureIntroOverlay";

const bladePassportLogo = require("../../assets/images/blade-passport-logo.png");
const ukcaLogo = require("../../assets/images/ukca-logo.png");
const haloOutboard = require("../../assets/images/halo-outboard.png");

function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

export default function PassportScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user, isFirebaseReady } = useUser();
  const { motor } = useMotor();
  const navigation = useNavigation();
  const cardRef = useRef<View>(null);

  const [registeredMotors, setRegisteredMotors] = useState<RegisteredMotor[]>([]);
  const [boatData, setBoatData] = useState<BoatData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingPDF, setSavingPDF] = useState(false);
  const [addingToWallet, setAddingToWallet] = useState(false);

  useEffect(() => {
    if (user?.id && isFirebaseReady) {
      loadData();
    } else if (!isFirebaseReady) {
      // Still waiting for Firebase
    } else {
      setIsLoading(false);
    }
  }, [user?.id, isFirebaseReady]);

  const loadData = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const [motors, boat] = await Promise.all([
        getRegisteredMotors(user.id),
        getBoatData(user.id),
      ]);
      setRegisteredMotors(motors);
      setBoatData(boat);
    } catch (error) {
      console.error("[Passport] Failed to load data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const serialNumber =
    registeredMotors.length > 0
      ? registeredMotors[0].serialNumber
      : "Not available";

  const getPassportData = () => ({
    ownerEmail: user?.email || "",
    ownerId: user?.id || "",
    serialNumber,
    productName: "Blade Halo 6",
    maxPower: "3000W Continuous",
    batteryCapacity: "1700Wh",
    purchaseDate: "February 1, 2026",
    warrantyExpires: "February 1, 2028",
    vesselName: boatData?.vesselName || "Not available",
    vesselType: boatData?.boatType || "Not available",
    vesselLength: boatData?.lengthMeters
      ? `${metersToFeet(boatData.lengthMeters).toFixed(1)} ft (${boatData.lengthMeters.toFixed(1)} m)`
      : "Not available",
    vesselHin: boatData?.vin || "Not available",
  });

  const qrCodeUrl = `https://bladeoutboards.com/passport?serial=${encodeURIComponent(serialNumber)}&owner=${encodeURIComponent(user?.id || '')}`;

  const downloadBase64OnWeb = (base64: string, filename: string, mimeType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const shareOrDownload = async (base64Data: string, filename: string, mimeType: string) => {
    if (Platform.OS === "web") {
      downloadBase64OnWeb(base64Data, filename, mimeType);
      return;
    }
    try {
      const filePath = `${FileSystem.cacheDirectory}${filename}`;
      console.log("[Passport] Writing file to:", filePath);
      console.log("[Passport] Data length:", base64Data.length, "chars, mime:", mimeType);
      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      console.log("[Passport] File written, exists:", fileInfo.exists, "size:", fileInfo.exists ? (fileInfo as any).size : 0);
      if (!fileInfo.exists) {
        throw new Error("File was not created after write");
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, { mimeType, UTI: mimeType === "application/vnd.apple.pkpass" ? "com.apple.pkpass" : undefined });
      } else {
        Alert.alert("Sharing not available", "Unable to share the file on this device.");
      }
    } catch (fileError: any) {
      console.error("[Passport] File save error:", fileError);
      Alert.alert("Save Error", `Unable to save file: ${fileError.message || 'Unknown error'}`);
    }
  };

  const handleAddToAppleWallet = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAddingToWallet(true);

    console.log("[Passport] ========== Apple Wallet Flow Start ==========");
    console.log("[Passport] Platform:", Platform.OS);
    console.log("[Passport] Native module available:", isNativeWalletAvailable());
    console.log("[Passport] Module load error:", getWalletModuleLoadError() || "none");

    if (BladeWalletPassModule && isNativeWalletAvailable()) {
      try {
        const debugInfo = BladeWalletPassModule.getDebugInfo();
        console.log("[Passport] Native debug info:", JSON.stringify(debugInfo));
      } catch (e: any) {
        console.log("[Passport] getDebugInfo not available:", e.message);
      }
    }

    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/passport/wallet/apple", baseUrl);
      console.log("[Passport] API URL:", url.toString());
      const passportData = getPassportData();
      console.log("[Passport] Passport data serial:", passportData.serialNumber);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passportData),
      });

      console.log("[Passport] Server response status:", response.status);
      console.log("[Passport] Server content-type:", response.headers.get("content-type"));

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        console.error("[Passport] Server error body:", errorText.substring(0, 500));
        throw new Error(`Server ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      console.log("[Passport] Response type:", data.type);
      console.log("[Passport] Download path:", data.downloadPath);
      console.log("[Passport] Filename:", data.filename);
      console.log("[Passport] Pass size:", data.passSize);

      if (!data.downloadPath) {
        throw new Error("No download path received from server");
      }

      const downloadUrl = baseUrl + data.downloadPath;
      console.log("[Passport] Full download URL:", downloadUrl);

      if (data.type === "pkpass" && Platform.OS === "ios") {
        if (isNativeWalletAvailable() && BladeWalletPassModule) {
          console.log("[Passport] >>> Using NATIVE PKAddPassesViewController path");
          const canAdd = BladeWalletPassModule.canAddPasses();
          console.log("[Passport] canAddPasses:", canAdd);
          if (!canAdd) {
            throw new Error("This device cannot add passes to Apple Wallet");
          }

          console.log("[Passport] Calling addPassFromUrl...");
          const result = await BladeWalletPassModule.addPassFromUrl(downloadUrl);
          console.log("[Passport] Native result:", JSON.stringify(result, null, 2));

          if (result.alreadyInWallet) {
            Alert.alert("Apple Wallet", "This pass is already in your Wallet.");
          } else if (result.added) {
            console.log("[Passport] Pass added successfully!");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Success", "Pass added to Apple Wallet!");
          } else {
            console.log("[Passport] User cancelled or dismissed pass preview");
          }
        } else {
          console.log("[Passport] >>> Using FALLBACK share sheet path (native module not available)");
          console.log("[Passport] Module load error:", getWalletModuleLoadError());

          const localPath = FileSystem.cacheDirectory + (data.filename || "blade-passport.pkpass");
          console.log("[Passport] Downloading to:", localPath);

          const downloadResult = await FileSystem.downloadAsync(downloadUrl, localPath);
          console.log("[Passport] Download status:", downloadResult.status);
          console.log("[Passport] Downloaded to:", downloadResult.uri);

          if (downloadResult.status !== 200) {
            throw new Error(`Download failed with status ${downloadResult.status}`);
          }

          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
          console.log("[Passport] File exists:", fileInfo.exists, "size:", fileInfo.exists ? (fileInfo as any).size : 0);

          console.log("[Passport] Opening share sheet with UTI com.apple.pkpass...");
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: "application/vnd.apple.pkpass",
            UTI: "com.apple.pkpass",
            dialogTitle: "Add to Apple Wallet",
          });
          console.log("[Passport] Share sheet completed");
        }
      } else if (data.type === "pkpass" && Platform.OS === "android") {
        console.log("[Passport] >>> Android path: downloading and sharing .pkpass");
        const localPath = FileSystem.cacheDirectory + (data.filename || "blade-passport.pkpass");
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, localPath);
        console.log("[Passport] Download status:", downloadResult.status);
        if (downloadResult.status !== 200) {
          throw new Error(`Download failed with status ${downloadResult.status}`);
        }
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: "application/vnd.apple.pkpass",
        });
      } else if (data.type === "pdf_fallback") {
        console.log("[Passport] >>> PDF fallback path");
        if (Platform.OS !== "web") {
          const localPath = FileSystem.cacheDirectory + (data.filename || "blade-passport.pdf");
          const downloadResult = await FileSystem.downloadAsync(downloadUrl, localPath);
          await Sharing.shareAsync(downloadResult.uri, { mimeType: "application/pdf" });
        } else {
          const pdfResponse = await fetch(downloadUrl);
          const arrayBuffer = await pdfResponse.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          await shareOrDownload(base64, data.filename || "blade-passport.pdf", "application/pdf");
        }
        if (data.message) {
          Alert.alert("Apple Wallet", data.message);
        }
      } else {
        console.log("[Passport] Unknown response type:", data.type, "platform:", Platform.OS);
      }
    } catch (error: any) {
      console.error("[Passport] !! Apple Wallet error:", error.message);
      console.error("[Passport] !! Stack:", error.stack);
      Alert.alert("Apple Wallet Error", `${error.message || "Unknown error"}`);
    } finally {
      setAddingToWallet(false);
      console.log("[Passport] ========== Apple Wallet Flow End ==========");
    }
  };

  const handleAddToGoogleWallet = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAddingToWallet(true);
    try {
      const url = new URL("/api/passport/wallet/google", getApiUrl());
      console.log("[Passport] Google Wallet API URL:", url.toString());
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPassportData()),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.type === "google_wallet" && data.url) {
        if (Platform.OS === "android") {
          await Linking.openURL(data.url);
        } else {
          await WebBrowser.openBrowserAsync(data.url);
        }
      } else if (data.data) {
        const filename = data.filename || "blade-passport-google.pdf";
        await shareOrDownload(data.data, filename, "application/pdf");
        if (data.message) {
          Alert.alert("Google Wallet", data.message);
        }
      } else if (data.message) {
        Alert.alert("Google Wallet", data.message);
      } else {
        throw new Error("No wallet data received");
      }
    } catch (error: any) {
      console.error("[Passport] Google Wallet error:", error);
      Alert.alert("Error", "Failed to add to Google Wallet. Please try again.");
    } finally {
      setAddingToWallet(false);
    }
  };

  const handleSavePDF = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavingPDF(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/passport/pdf", baseUrl);
      console.log("[Passport] PDF - EXPO_PUBLIC_DOMAIN:", process.env.EXPO_PUBLIC_DOMAIN || "(not set)");
      console.log("[Passport] PDF - Base URL:", baseUrl);
      console.log("[Passport] PDF - Full URL:", url.toString());
      const passportData = getPassportData();
      const bodyStr = JSON.stringify(passportData);
      console.log("[Passport] PDF - Request body size:", bodyStr.length, "bytes");

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (Platform.OS !== "web") {
        headers["x-download-mode"] = "native";
      }

      const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: bodyStr,
      });

      console.log("[Passport] PDF - Response status:", response.status);
      console.log("[Passport] PDF - Response content-type:", response.headers.get("content-type") || "none");

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        console.error("[Passport] PDF - Error response body:", errorText.substring(0, 500));
        throw new Error(`Server ${response.status} at ${url.host}: ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();

      if (data.downloadPath && Platform.OS !== "web") {
        const filename = data.filename || "blade-passport.pdf";
        const downloadUrl = baseUrl + data.downloadPath;
        const localPath = FileSystem.cacheDirectory + filename;
        console.log("[Passport] PDF - Native download from:", downloadUrl);
        console.log("[Passport] PDF - Saving to:", localPath);
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, localPath);
        console.log("[Passport] PDF - Download status:", downloadResult.status);
        console.log("[Passport] PDF - Downloaded to:", downloadResult.uri);
        const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
        console.log("[Passport] PDF - File exists:", fileInfo.exists, "size:", fileInfo.exists ? (fileInfo as any).size : 0);
        if (!fileInfo.exists) {
          throw new Error("Downloaded file does not exist");
        }
        await Sharing.shareAsync(downloadResult.uri, { mimeType: "application/pdf" });
      } else {
        const base64PDF = data.data;

        if (!base64PDF) {
          throw new Error("No PDF data received");
        }

        const filename = data.filename || "blade-passport.pdf";
        console.log("[Passport] PDF - Saving file:", filename, "data length:", base64PDF.length);
        await shareOrDownload(base64PDF, filename, "application/pdf");
      }
    } catch (error: any) {
      console.error("[Passport] PDF error:", error);
      console.error("[Passport] PDF error message:", error.message);
      Alert.alert("PDF Error", `${error.message || "Unknown error"}`);
    } finally {
      setSavingPDF(false);
    }
  };

  const renderInfoRow = (label: string, value: string) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

  const renderSectionHeader = (title: string) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={BladeColors.primary} />
        <Text style={styles.loadingText}>Loading passport...</Text>
      </View>
    );
  }

  if (!isLoading && registeredMotors.length === 0) {
    return (
      <View style={[styles.screen, styles.centered, { paddingHorizontal: Spacing.xl }]}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.lockedCard}>
          <Feather name="lock" size={48} color="#D1D5DB" />
          <Text style={styles.lockedTitle}>Passport Locked</Text>
          <Text style={styles.lockedDescription}>
            Your outboard motor must be linked to your account via Anti-Theft
            protection before you can access your digital passport. Connect your
            motor via Bluetooth and enable Anti-Theft to register it.
          </Text>
          <Pressable
            style={styles.lockedButton}
            onPress={() => navigation.goBack()}
            testID="button-go-back"
          >
            <Feather name="arrow-left" size={16} color="#FFFFFF" />
            <Text style={styles.lockedButtonText}>Go Back</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  const truncatedId = user?.id
    ? user.id.length > 8
      ? `${user.id.substring(0, 8)}...`
      : user.id
    : "Not available";

  return (
    <View style={styles.screen}>
      <FeatureIntroOverlay
        storageKey={INTRO_KEY_PASSPORT}
        animation={require("../../assets/lottie/telemetry.json")}
        pages={[
          {
            title: "Digital Outboard Passport",
            subtitle: "Your outboard's verified identity card. Contains model, serial number, specifications, and ownership details all in one place.",
            hints: [
              "Displays your outboard's model, serial number, and power rating",
              "Shows boat registration details like name, hull ID, and dimensions",
              "Includes UKCA/CE compliance markings for your motor's certification",
              "Passport data is synced from your account and updates automatically",
            ],
          },
          {
            title: "Wallet & PDF Export",
            subtitle: "Carry your outboard's passport everywhere. Add it to Apple Wallet, Google Wallet, or download a professional PDF certificate.",
            hints: [
              "Add to Apple Wallet for quick access from your iPhone lock screen",
              "Add to Google Wallet on Android for instant access anywhere",
              "Download a certified PDF with full specifications and QR code",
              "Share the PDF with marine insurers, dealers, or harbour authorities",
              "The QR code on your passport links to your motor's verified profile",
            ],
          },
        ]}
        gradientColors={["#1E2530", "#141B24"]}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: insets.bottom + Spacing["2xl"],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View ref={cardRef} entering={FadeInUp.duration(500).springify()} style={styles.card}>
          <View style={styles.logoContainer}>
            <Image
              source={bladePassportLogo}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.passportTitle}>OUTBOARD PASSPORT</Text>

          <View style={styles.divider} />

          <View style={styles.outboardImageContainer}>
            <Image
              source={haloOutboard}
              style={styles.outboardImage}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.productName}>Blade Halo 6</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitleText}>3000W Continuous</Text>
            <Text style={styles.subtitleDivider}>|</Text>
            <Text style={styles.subtitleText}>1700Wh Battery</Text>
          </View>

          <View style={styles.sectionContainer}>
            {renderSectionHeader("OWNER INFORMATION")}
            {renderInfoRow("Email", user?.email || "Not available")}
            {renderInfoRow("Account ID", truncatedId)}
          </View>

          <View style={styles.sectionContainer}>
            {renderSectionHeader("MOTOR INFORMATION")}
            {renderInfoRow("Serial Number", serialNumber)}
            {renderInfoRow("Purchase Date", "February 1, 2026")}
            {renderInfoRow("Warranty Expires", "February 1, 2028")}
          </View>

          <View style={styles.sectionContainer}>
            {renderSectionHeader("VESSEL INFORMATION")}
            {renderInfoRow(
              "Vessel Name",
              boatData?.vesselName || "Not available"
            )}
            {renderInfoRow(
              "Vessel Type",
              boatData?.boatType || "Not available"
            )}
            {renderInfoRow(
              "Vessel Length",
              boatData?.lengthMeters
                ? `${metersToFeet(boatData.lengthMeters).toFixed(1)} ft (${boatData.lengthMeters.toFixed(1)} m)`
                : "Not available"
            )}
            {renderInfoRow("Vessel HIN", boatData?.vin || "Not available")}
          </View>

          <View style={styles.regulatorySection}>
            {renderSectionHeader("REGULATORY COMPLIANCE")}
            <View style={styles.regulatoryRow}>
              <Image
                source={ukcaLogo}
                style={styles.ukcaImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.qrSection}>
            {renderSectionHeader("WARRANTY & SERVICE")}
            <View style={styles.qrContainer}>
              <View style={styles.qrCodeWrapper}>
                <QRCode
                  value={qrCodeUrl}
                  size={120}
                  backgroundColor="#FFFFFF"
                  color="#1F2937"
                />
              </View>
              <View style={styles.qrTextContainer}>
                <Text style={styles.qrTitle}>Scan for Warranty Lookup</Text>
                <Text style={styles.qrDescription}>
                  Use this QR code at authorized Blade service centers worldwide
                  for warranty verification, service history, and promotional
                  prize eligibility at international boat shows and tradeshows.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.companyName}>Blade Marine Technologies Ltd</Text>
          <Text style={styles.disclaimerText}>
            This passport serves as proof of ownership and registration for your
            Blade outboard motor. Keep this document safe for warranty and
            service purposes.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(150).duration(400).springify()} style={styles.buttonsContainer}>
          <Pressable
            onPress={handleAddToAppleWallet}
            disabled={addingToWallet}
            style={[styles.walletButton, styles.appleWalletButton]}
            testID="button-apple-wallet"
          >
            {addingToWallet ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="smartphone" size={18} color="#FFFFFF" />
                <Text style={styles.appleWalletText}>Add to Apple Wallet</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={handleAddToGoogleWallet}
            disabled={addingToWallet}
            style={[styles.walletButton, styles.googleWalletButton]}
            testID="button-google-wallet"
          >
            {addingToWallet ? (
              <ActivityIndicator size="small" color="#1F2937" />
            ) : (
              <>
                <Feather name="credit-card" size={18} color="#1F2937" />
                <Text style={styles.googleWalletText}>
                  Add to Google Wallet
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={handleSavePDF}
            disabled={savingPDF}
            style={[styles.walletButton, styles.pdfButton]}
            testID="button-save-pdf"
          >
            {savingPDF ? (
              <ActivityIndicator size="small" color={BladeColors.primary} />
            ) : (
              <>
                <Feather name="file-text" size={18} color={BladeColors.primary} />
                <Text style={styles.pdfButtonText}>Save as PDF</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8F9FB",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
    color: "#6B7280",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "#E8ECF0",
    padding: 24,
    ...Platform.select({
      web: {
        boxShadow: "0px 2px 12px rgba(0, 0, 0, 0.06)",
      },
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  logo: {
    width: 200,
    height: 56,
  },
  passportTitle: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: "#9CA3AF",
    textTransform: "uppercase",
    marginBottom: Spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: "#E8ECF0",
    marginVertical: Spacing.lg,
  },
  outboardImageContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  outboardImage: {
    width: 200,
    height: 150,
  },
  productName: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    letterSpacing: -0.3,
    marginBottom: Spacing.xs,
  },
  subtitleRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  subtitleText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  subtitleDivider: {
    fontSize: 13,
    color: "#D1D5DB",
    fontWeight: "300",
  },
  sectionContainer: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: "#9CA3AF",
    textTransform: "uppercase",
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  infoLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "400",
  },
  infoValue: {
    fontSize: 13,
    color: "#1F2937",
    fontWeight: "500",
    textAlign: "right",
    flexShrink: 1,
    marginLeft: Spacing.md,
  },
  regulatorySection: {
    marginBottom: Spacing.lg,
  },
  regulatoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  ukcaImage: {
    width: 180,
    height: 50,
  },
  qrSection: {
    marginBottom: Spacing.md,
  },
  qrContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.lg,
  },
  qrCodeWrapper: {
    padding: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E8ECF0",
  },
  qrTextContainer: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: Spacing.xs,
  },
  qrDescription: {
    fontSize: 11,
    color: "#6B7280",
    lineHeight: 16,
  },
  companyName: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: Spacing.xs,
  },
  disclaimerText: {
    textAlign: "center",
    fontSize: 10,
    color: "#D1D5DB",
    lineHeight: 14,
  },
  buttonsContainer: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  walletButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  appleWalletButton: {
    backgroundColor: "#1F2937",
  },
  appleWalletText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  googleWalletButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
  },
  googleWalletText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
  },
  pdfButton: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: BladeColors.primary,
  },
  pdfButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: BladeColors.primary,
  },
  lockedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "#E8ECF0",
    padding: 32,
    alignItems: "center",
    gap: Spacing.md,
    ...Platform.select({
      web: {
        boxShadow: "0px 2px 12px rgba(0, 0, 0, 0.06)",
      },
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  lockedTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: Spacing.sm,
  },
  lockedDescription: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 21,
  },
  lockedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F2937",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  lockedButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
