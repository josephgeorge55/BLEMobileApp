import React, { useState, useCallback, useRef } from "react";
import { StyleSheet, View, ScrollView, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import LottieView from "lottie-react-native";

import { ThemedText } from "@/components/ThemedText";
import { FirmwareCard } from "@/components/FirmwareCard";
import { FirmwareCardSkeleton } from "@/components/SkeletonLoader";
import { OTAInstallModal } from "@/components/OTAInstallModal";
import { useMotor } from "@/context/MotorContext";
import { Spacing, BorderRadius, BladeColors } from "@/constants/theme";
import {
  checkFirmwareEligibility,
  downloadFirmwareData,
  FirmwareRelease,
} from "@/lib/firebase";
import {
  FirmwareOTAService,
  prepareFirmwareData,
} from "@/lib/firmware-ota-service";
import {
  sendBinaryData,
  receiveBinaryData,
  setOTAMode,
  isClassicConnected,
} from "@/lib/bluetooth-classic-service";
import FeatureIntroOverlay, { INTRO_KEY_UPDATES } from "@/components/FeatureIntroOverlay";
import {
  sendBleBinaryData,
  receiveBleBinaryData,
  setBleOTAMode,
  isConnected as isBleConnected,
} from "@/lib/ble-service";

type OTAModalState = "idle" | "downloading" | "installing" | "complete" | "error";

export default function UpdatesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { motor, telemetry, sendCommand } = useMotor();

  const [availableUpdates, setAvailableUpdates] = useState<FirmwareRelease[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [otaState, setOtaState] = useState<OTAModalState>("idle");
  const [otaProgress, setOtaProgress] = useState(0);
  const [otaStatusMessage, setOtaStatusMessage] = useState("");
  const [otaErrorMessage, setOtaErrorMessage] = useState<string | undefined>();

  const otaServiceRef = useRef<FirmwareOTAService | null>(null);

  const serialNumber = motor?.serialNumber;
  const currentVersion = telemetry?.tillerFirmwareVersion || motor?.firmwareVersion || "1.0.0";

  const checkForUpdates = useCallback(async () => {
    if (!serialNumber) return;
    setIsLoading(true);
    try {
      const eligible = await checkFirmwareEligibility(serialNumber);
      const filtered = eligible.filter((fw) => {
        const fwParts = fw.version.split(".").map(Number);
        const curParts = currentVersion.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          const fv = fwParts[i] || 0;
          const cv = curParts[i] || 0;
          if (fv > cv) return true;
          if (fv < cv) return false;
        }
        return false;
      });
      setAvailableUpdates(filtered);
      setHasChecked(true);
    } catch (error) {
      console.error("[UpdatesScreen] Error checking firmware:", error);
      setAvailableUpdates([]);
      setHasChecked(true);
    } finally {
      setIsLoading(false);
    }
  }, [serialNumber, currentVersion]);

  React.useEffect(() => {
    if (serialNumber && !hasChecked) {
      checkForUpdates();
    }
  }, [serialNumber, hasChecked, checkForUpdates]);

  const onRefresh = async () => {
    setRefreshing(true);
    setHasChecked(false);
    await checkForUpdates();
    setRefreshing(false);
  };

  const handleInstall = useCallback(
    async (firmware: FirmwareRelease) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      setDownloadingVersion(firmware.version);
      setDownloadProgress(0);
      setModalVisible(true);
      setOtaState("downloading");
      setOtaProgress(0);
      setOtaStatusMessage("Downloading firmware...");
      setOtaErrorMessage(undefined);

      try {
        const fwData = await downloadFirmwareData(firmware.id);
        if (!fwData) {
          throw new Error("Failed to download firmware data");
        }

        setDownloadProgress(100);
        setOtaProgress(10);
        setOtaStatusMessage("Firmware downloaded. Preparing update...");

        const firmwareBytes = prepareFirmwareData(fwData.fileData, true);
        console.log(`[OTA] Firmware prepared: ${firmwareBytes.length} bytes`);

        setOtaState("installing");
        setOtaStatusMessage("Starting firmware installation...");

        const useClassic = isClassicConnected();
        const useBle = isBleConnected();

        if (!useClassic && !useBle) {
          throw new Error("No Bluetooth connection available. Please reconnect to your motor.");
        }

        const sendFn = useClassic ? sendBinaryData : sendBleBinaryData;
        const recvFn = useClassic ? receiveBinaryData : receiveBleBinaryData;
        const setOtaModeFn = useClassic ? setOTAMode : setBleOTAMode;

        setOtaModeFn(true);

        const otaService = new FirmwareOTAService(
          sendFn,
          recvFn,
          (level, message) => {
            console.log(`[OTA][${level}] ${message}`);
            if (level !== "debug") {
              setOtaStatusMessage(message);
            }
          },
          (progress) => {
            const mappedProgress = 10 + (progress.progress * 0.9);
            setOtaProgress(Math.min(mappedProgress, 100));
            if (progress.state !== "programming" || progress.currentBlock % 10 === 0) {
              setOtaStatusMessage(progress.message);
            }
          }
        );

        otaServiceRef.current = otaService;

        const enteredBootloader = await otaService.enterBootloaderMode();
        if (!enteredBootloader) {
          throw new Error("Failed to enter bootloader mode");
        }

        const success = await otaService.performFullUpdate(firmwareBytes);

        setOtaModeFn(false);
        otaServiceRef.current = null;

        if (success) {
          setOtaState("complete");
          setOtaProgress(100);
          setOtaStatusMessage("Firmware update complete!");
        } else {
          throw new Error("Firmware update failed. Please try again.");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("[OTA] Update failed:", errorMsg);
        setOtaState("error");
        setOtaErrorMessage(errorMsg);
        setOtaStatusMessage("Update failed");

        try {
          if (isClassicConnected()) setOTAMode(false);
          if (isBleConnected()) setBleOTAMode(false);
        } catch {}
      } finally {
        setDownloadingVersion(null);
        setDownloadProgress(0);
      }
    },
    [sendCommand]
  );

  const handleOtaCancel = useCallback(() => {
    if (otaServiceRef.current) {
      otaServiceRef.current.abort();
    }
    setOtaState("idle");
    setModalVisible(false);
    setDownloadingVersion(null);
    setDownloadProgress(0);
    try {
      if (isClassicConnected()) setOTAMode(false);
      if (isBleConnected()) setBleOTAMode(false);
    } catch {}
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setOtaState("idle");
    setOtaProgress(0);
    setOtaStatusMessage("");
    setOtaErrorMessage(undefined);
    if (otaState === "complete") {
      setHasChecked(false);
    }
  }, [otaState]);

  if (!motor) {
    return (
      <View style={styles.noMotorContainer}>
        <LottieView
          source={require("../../assets/lottie/ota.json")}
          autoPlay
          loop
          style={styles.noMotorLottie}
        />
        <View style={styles.noMotorContent}>
          <View style={styles.noMotorIconCircle}>
            <Feather name="download-cloud" size={32} color="#FFFFFF" />
          </View>
          <ThemedText type="h2" style={styles.noMotorTitle}>
            No Motor Connected
          </ThemedText>
          <ThemedText type="body" style={styles.noMotorDescription}>
            Connect to your Blade outboard to check for firmware updates.
          </ThemedText>
        </View>
      </View>
    );
  }

  const hasUpdates = availableUpdates.length > 0;

  return (
    <>
      <FeatureIntroOverlay
        storageKey={INTRO_KEY_UPDATES}
        animation={require("../../assets/lottie/ota.json")}
        pages={[
          {
            title: "Over-the-Air Updates",
            subtitle: "Receive the latest firmware improvements and new features wirelessly via Bluetooth. No cables or laptop needed.",
            hints: [
              "Updates are delivered over Bluetooth directly to your motor controller",
              "Your outboard must be connected and powered on throughout the update",
              "Each update includes release notes describing what's new or improved",
              "The app checks for eligible updates specific to your motor's serial number",
            ],
          },
          {
            title: "The Update Process",
            subtitle: "Firmware is downloaded to your phone first, then flashed to the outboard in a secure three-step process using the HALO FOTA v2.0 protocol.",
            hints: [
              "Step 1: Firmware is downloaded securely to your phone",
              "Step 2: Data is transferred over Bluetooth to the motor controller",
              "Step 3: The motor verifies and installs the new firmware",
              "A progress bar shows real-time status during the entire process",
              "Do not power off or move away from the motor during installation",
            ],
          },
          {
            title: "Important Tips",
            subtitle: "Follow these best practices to make sure every update installs smoothly and safely.",
            hints: [
              "Ensure your phone has at least 30% battery before starting an update",
              "Stay within 2 metres of the outboard during the flashing process",
              "If an update fails, the motor safely rolls back to the previous version",
              "Pull to refresh on the updates screen to check for new releases",
              "Updates can improve performance, efficiency, and add new drive modes",
            ],
          },
        ]}
        gradientColors={["#1A2332", "#0F1720"]}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: "#F2F2F7" }]}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.md,
          paddingBottom: tabBarHeight + Spacing["3xl"],
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BladeColors.primary}
          />
        }
      >
        <Animated.View entering={FadeInUp.duration(350).springify()}>
          <View style={styles.heroTile}>
            <View style={styles.heroIconRow}>
              <View style={styles.heroIconCircle}>
                <Feather name="download-cloud" size={24} color={BladeColors.accent} />
              </View>
              <View style={styles.heroTextGroup}>
                <ThemedText type="h2" style={styles.heroTitle}>
                  OTA Updates
                </ThemedText>
                <ThemedText type="small" style={styles.heroSubtitle}>
                  Over-The-Air Firmware
                </ThemedText>
              </View>
            </View>
            <View style={styles.heroDivider} />
            <ThemedText type="small" style={styles.heroDescription}>
              Firmware updates are delivered wirelessly over Bluetooth. Connect your Blade Halo outboard, and updates will be flashed directly to the motor controller — no cables or laptop needed.
            </ThemedText>
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(100).duration(300)}>
          <ThemedText
            type="caption"
            style={{ color: "#8E8E93", marginBottom: Spacing.sm, marginTop: Spacing.md }}
          >
            INSTALLED FIRMWARE
          </ThemedText>
          <FirmwareCard
            version={currentVersion}
            isCurrent
            releaseDate={new Date()}
          />
        </Animated.View>

        {isLoading ? (
          <View style={styles.loadingSection}>
            <ThemedText
              type="caption"
              style={{ color: "#8E8E93", marginBottom: Spacing.sm }}
            >
              CHECKING FOR UPDATES...
            </ThemedText>
            <FirmwareCardSkeleton />
          </View>
        ) : hasUpdates ? (
          <Animated.View
            entering={FadeIn.delay(200).duration(300)}
            style={styles.updatesSection}
          >
            <ThemedText
              type="caption"
              style={{ color: "#8E8E93", marginBottom: Spacing.sm }}
            >
              AVAILABLE UPDATES
            </ThemedText>
            {availableUpdates.map((fw) => (
              <FirmwareCard
                key={fw.id}
                version={fw.version}
                releaseNotes={fw.releaseNotes ?? undefined}
                releaseDate={fw.releaseDate ? new Date(fw.releaseDate) : undefined}
                isMandatory={fw.isMandatory ?? false}
                isDownloading={downloadingVersion === fw.version}
                downloadProgress={
                  downloadingVersion === fw.version ? downloadProgress : 0
                }
                onDownload={() => handleInstall(fw)}
              />
            ))}
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeIn.delay(200).duration(300)}
            style={styles.upToDateSection}
          >
            <View style={styles.upToDateCard}>
              <View style={styles.checkCircle}>
                <Feather name="check" size={32} color="#FFFFFF" />
              </View>
              <ThemedText type="h3" style={styles.upToDateTitle}>
                You're All Set
              </ThemedText>
              <ThemedText type="body" style={styles.upToDateText}>
                Your Blade Halo is running the latest firmware. No action needed right now.
              </ThemedText>
            </View>

            <ThemedText
              type="caption"
              style={{ color: "#8E8E93", marginBottom: Spacing.sm, marginTop: Spacing.xl }}
            >
              ABOUT OTA UPDATES
            </ThemedText>
            <View style={styles.aboutCard}>
              <View style={styles.aboutRow}>
                <View style={styles.aboutIconWrap}>
                  <Feather name="zap" size={16} color={BladeColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={styles.aboutRowTitle}>Performance</ThemedText>
                  <ThemedText type="small" style={styles.aboutRowDesc}>
                    Motor efficiency, throttle response, and power curve optimisations.
                  </ThemedText>
                </View>
              </View>
              <View style={styles.aboutSeparator} />
              <View style={styles.aboutRow}>
                <View style={styles.aboutIconWrap}>
                  <Feather name="shield" size={16} color={BladeColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={styles.aboutRowTitle}>Safety</ThemedText>
                  <ThemedText type="small" style={styles.aboutRowDesc}>
                    Temperature protection, battery management, and fault detection improvements.
                  </ThemedText>
                </View>
              </View>
              <View style={styles.aboutSeparator} />
              <View style={styles.aboutRow}>
                <View style={styles.aboutIconWrap}>
                  <Feather name="star" size={16} color={BladeColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={styles.aboutRowTitle}>New Features</ThemedText>
                  <ThemedText type="small" style={styles.aboutRowDesc}>
                    New drive modes, telemetry data, and connectivity enhancements.
                  </ThemedText>
                </View>
              </View>
              <View style={styles.aboutSeparator} />
              <View style={styles.aboutRow}>
                <View style={styles.aboutIconWrap}>
                  <Feather name="bluetooth" size={16} color={BladeColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={styles.aboutRowTitle}>Wireless Delivery</ThemedText>
                  <ThemedText type="small" style={styles.aboutRowDesc}>
                    Updates are sent from your phone to the motor over Bluetooth — no cables required.
                  </ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.pullHint}>
              <Feather name="refresh-cw" size={14} color="rgba(255,255,255,0.3)" />
              <ThemedText type="caption" style={styles.pullHintText}>
                Pull down to check for new updates
              </ThemedText>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <OTAInstallModal
        visible={modalVisible}
        onClose={handleModalClose}
        otaState={otaState}
        progress={otaProgress}
        statusMessage={otaStatusMessage}
        errorMessage={otaErrorMessage}
        onCancel={handleOtaCancel}
      />
    </>
  );
}

const DARK_TILE = "rgba(44,44,46,0.92)";
const TILE_BORDER = "rgba(255,255,255,0.08)";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  noMotorContainer: {
    flex: 1,
    backgroundColor: "#636366",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden" as const,
  },
  noMotorLottie: {
    position: "absolute" as const,
    width: "100%",
    height: "100%",
    opacity: 0.25,
  },
  noMotorContent: {
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  noMotorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  noMotorTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  noMotorDescription: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  heroTile: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  heroIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(164,208,139,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(164,208,139,0.25)",
  },
  heroTextGroup: {
    flex: 1,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  heroDivider: {
    height: 1,
    backgroundColor: TILE_BORDER,
    marginVertical: Spacing.lg,
  },
  heroDescription: {
    color: "rgba(255,255,255,0.45)",
    lineHeight: 20,
  },
  loadingSection: {
    marginTop: Spacing["2xl"],
  },
  updatesSection: {
    marginTop: Spacing["2xl"],
  },
  upToDateSection: {
    marginTop: Spacing.lg,
  },
  upToDateCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: Spacing.xl,
    alignItems: "center",
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BladeColors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  upToDateTitle: {
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  upToDateText: {
    textAlign: "center",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 22,
  },
  aboutCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: Spacing.lg,
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  aboutIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(164,208,139,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  aboutRowTitle: {
    color: "#FFFFFF",
    fontWeight: "600",
    marginBottom: 3,
  },
  aboutRowDesc: {
    color: "rgba(255,255,255,0.45)",
    lineHeight: 19,
  },
  aboutSeparator: {
    height: 1,
    backgroundColor: TILE_BORDER,
    marginVertical: Spacing.xs,
  },
  pullHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  pullHintText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
  },
});
