import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator, Image, KeyboardAvoidingView, Dimensions, Linking, Modal } from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOut } from "react-native-reanimated";
import { initializeBle, startScan, stopScan, connectToDevice, disconnect as disconnectDevice } from "@/lib/ble-service";
import type { BleDevice, BleServiceCallbacks } from "@/lib/ble-service";
import type { INFORG1Data } from "@/lib/ble-parser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import Checkbox from "expo-checkbox";
import LottieView from "lottie-react-native";
import { ThemedText } from "@/components/ThemedText";
import { DatePickerField } from "@/components/DatePickerField";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import { Spacing, BladeColors, BorderRadius } from "@/constants/theme";
import { saveWarrantyRegistration, getWarrantyData, getAllWarranties, getUserCountry, getBoatData, type WarrantyData, type BoatData } from "@/lib/firebase";
import { getApiUrl } from "@/lib/query-client";

const DARK_TILE = "rgba(44,44,46,0.92)";
const INPUT_BG = "rgba(255,255,255,0.08)";
const TILE_BORDER = "rgba(255,255,255,0.08)";
const SECTION_LABEL_COLOR = "#8E8E93";
const LOTTIE_HEADER_BG = "#1A2332";
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const LOTTIE_HEADER_HEIGHT = SCREEN_HEIGHT * 0.30;

export default function WarrantyRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, isFirebaseReady } = useUser();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [existingWarranty, setExistingWarranty] = useState<WarrantyData | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [boatData, setBoatData] = useState<BoatData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [allWarranties, setAllWarranties] = useState<WarrantyData[]>([]);

  const [serialNumber, setSerialNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [dealerName, setDealerName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannerLockRef = useRef(false);

  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState<"scanning" | "connecting" | "reading" | "verifying" | "success" | "error" | "timeout" | "mismatch">("scanning");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [foundDevice, setFoundDevice] = useState<BleDevice | null>(null);
  const [motorSerial, setMotorSerial] = useState<string | null>(null);
  const verificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id || !isFirebaseReady) return;
    loadData();
  }, [user?.id, isFirebaseReady]);

  useEffect(() => {
    return () => {
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
      }
    };
  }, []);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [warranty, userCountry, boat, warranties] = await Promise.all([
        getWarrantyData(user.id),
        getUserCountry(),
        getBoatData(user.id),
        getAllWarranties(user.id),
      ]);
      setExistingWarranty(warranty);
      setCountry(userCountry);
      setBoatData(boat);
      setAllWarranties(warranties);
    } catch (error) {
      console.error("[Warranty] Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const serialNumberValid = /^JK\d{6}$/.test(serialNumber.trim());

  const isFormValid =
    serialNumberValid &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    phoneNumber.trim().length > 0 &&
    termsAccepted;

  const handleSerialNumberChange = (text: string) => {
    let value = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!value.startsWith("JK")) {
      const digitsOnly = value.replace(/[^0-9]/g, "");
      value = "JK" + digitsOnly;
    }
    if (value.length > 8) {
      value = value.substring(0, 8);
    }
    setSerialNumber(value);
  };

  const handleOpenScanner = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        showError("Camera permission is required to scan QR codes.");
        return;
      }
    }
    scannerLockRef.current = false;
    setShowScanner(true);
  };

  const handleBarCodeScanned = (result: { data: string }) => {
    if (scannerLockRef.current) return;
    scannerLockRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSerialNumber(result.data);
    setShowScanner(false);
  };


  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setReceiptBase64(result.assets[0].base64 || null);
        setReceiptUri(result.assets[0].uri);
      }
    } catch (error: any) {
      showError("Failed to pick image.");
    }
  };

  const startBluetoothVerification = async () => {
    setShowVerificationModal(true);
    setVerificationStep("scanning");
    setVerificationMessage("Searching for your outboard motor...");
    setFoundDevice(null);
    setMotorSerial(null);

    if (verificationTimeoutRef.current) {
      clearTimeout(verificationTimeoutRef.current);
    }

    verificationTimeoutRef.current = setTimeout(() => {
      stopScan();
      try { disconnectDevice(); } catch (e) {}
      setVerificationStep("timeout");
      setVerificationMessage("Could not connect to motor within 20 seconds. Ensure your outboard is powered on and nearby.");
    }, 20000);

    try {
      const bleReady = await initializeBle();
      if (!bleReady) {
        clearTimeout(verificationTimeoutRef.current!);
        setVerificationStep("error");
        setVerificationMessage("Bluetooth is not available. Please enable Bluetooth and try again.");
        return;
      }

      let deviceConnected = false;

      const callbacks: BleServiceCallbacks = {
        onDeviceFound: (device: BleDevice) => {
          if (deviceConnected) return;
          const name = device.name || "";
          if (name.toLowerCase().startsWith("blade") || name.toLowerCase().startsWith("halo")) {
            deviceConnected = true;
            stopScan();
            setFoundDevice(device);
            setVerificationStep("connecting");
            setVerificationMessage(`Found ${device.name}. Connecting...`);
            connectToDevice(device.id, callbacks);
          }
        },
        onConnected: (device: BleDevice) => {
          setVerificationStep("reading");
          setVerificationMessage("Connected. Reading serial number from motor...");
        },
        onDisconnected: (_deviceId: string) => {
        },
        onDataReceived: (data) => {
          if (data.type === "INFOR" && data.group === "G1") {
            const inforData = data.data as INFORG1Data;
            if (inforData.serialNumber) {
              if (verificationTimeoutRef.current) {
                clearTimeout(verificationTimeoutRef.current);
              }
              setMotorSerial(inforData.serialNumber);
              const enteredSerial = serialNumber.trim().toUpperCase();
              const motorSerialUpper = inforData.serialNumber.toUpperCase();
              if (enteredSerial === motorSerialUpper) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setVerificationStep("success");
                setVerificationMessage("Serial number verified successfully!");
                try { disconnectDevice(); } catch (e) {}
                setTimeout(() => {
                  setShowVerificationModal(false);
                  proceedWithSubmission();
                }, 1500);
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setVerificationStep("mismatch");
                setVerificationMessage(`Serial number mismatch. Form: ${enteredSerial}, Motor: ${motorSerialUpper}`);
                try { disconnectDevice(); } catch (e) {}
              }
            }
          }
        },
        onError: (error: Error) => {
          console.error("[Warranty BLE Verify] Error:", error.message);
          if (verificationTimeoutRef.current) {
            clearTimeout(verificationTimeoutRef.current);
          }
          setVerificationStep("error");
          setVerificationMessage(`Bluetooth error: ${error.message}`);
          try { disconnectDevice(); } catch (e) {}
        },
      };

      startScan({ onDeviceFound: callbacks.onDeviceFound, onError: callbacks.onError });
    } catch (error: any) {
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
      }
      setVerificationStep("error");
      setVerificationMessage(error.message || "An unexpected error occurred.");
    }
  };

  const handleCloseVerification = () => {
    if (verificationTimeoutRef.current) {
      clearTimeout(verificationTimeoutRef.current);
    }
    stopScan();
    try { disconnectDevice(); } catch (e) {}
    setShowVerificationModal(false);
  };

  const handleRetryVerification = () => {
    startBluetoothVerification();
  };

  const proceedWithSubmission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const result = await saveWarrantyRegistration(user!.id, {
        serialNumber: serialNumber.trim(),
        purchaseDate: purchaseDate.toISOString(),
        dealerName: dealerName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim(),
        email: user!.email,
        country: country || "Unknown",
        receiptPhotoBase64: receiptBase64 || null,
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess("Warranty registered successfully!");
        setSubmitSuccess(true);
        loadData();

        try {
          const warrantyStart = purchaseDate.toISOString();
          const expirationDate = new Date(purchaseDate);
          const normalizedCountry = (country || "").toLowerCase().trim();
          const years = (normalizedCountry === "hungary" || normalizedCountry === "hu") ? 3 : 2;
          expirationDate.setFullYear(expirationDate.getFullYear() + years);

          const emailRes = await fetch(new URL("/api/warranty/send-confirmation", getApiUrl()).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipientEmail: user!.email,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              serialNumber: serialNumber.trim(),
              purchaseDate: warrantyStart,
              dealerName: dealerName.trim() || undefined,
              warrantyStartDate: warrantyStart,
              warrantyExpirationDate: expirationDate.toISOString(),
              country: country || "Unknown",
            }),
          });
          const emailData = await emailRes.json();
          if (emailData.success && emailData.registrationNumber) {
            showSuccess("Confirmation email sent!");
          }
        } catch (emailError) {
          console.log("[Warranty] Email send failed (non-critical):", emailError);
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showError(result.error || "Failed to register warranty.");
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError(error.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      showError("Please enter your first name");
      return;
    }
    if (!lastName.trim()) {
      showError("Please enter your last name");
      return;
    }
    if (!serialNumber.trim() || !serialNumberValid) {
      showError("Please enter a valid serial number (format: JK followed by 6 digits)");
      return;
    }
    if (!purchaseDate) {
      showError("Please select your purchase date");
      return;
    }
    if (!termsAccepted) {
      showError("Please accept the terms and conditions");
      return;
    }
    if (!user?.id) {
      showError("You need to sign in to register a warranty");
      return;
    }

    if (Platform.OS === "web") {
      proceedWithSubmission();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      startBluetoothVerification();
    }
  };

  const handleRegisterAnother = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitSuccess(false);
    setExistingWarranty(null);
    setSerialNumber("");
    setPurchaseDate(new Date());
    setDealerName("");
    setFirstName("");
    setLastName("");
    setPhoneNumber("");
    setReceiptBase64(null);
    setReceiptUri(null);
    setTermsAccepted(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (showScanner) {
    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8"] }}
          onBarcodeScanned={handleBarCodeScanned}
        />
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame} />
          <ThemedText type="body" style={styles.scannerText}>
            {"Point camera at the serial number barcode"}
          </ThemedText>
        </View>
        <Pressable
          style={styles.scannerCloseBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowScanner(false);
          }}
          testID="button-close-scanner"
        >
          <Feather name="x" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centeredContainer, { backgroundColor: "#F2F2F7", paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={BladeColors.accent} />
        <ThemedText type="small" style={{ color: SECTION_LABEL_COLOR, marginTop: Spacing.md }}>
          {"Loading warranty information..."}
        </ThemedText>
      </View>
    );
  }

  if (existingWarranty || submitSuccess) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
        <View style={[styles.lottieHeader, { paddingTop: insets.top }]}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            testID="button-back"
          >
            <Feather name="chevron-left" size={28} color="#FFFFFF" />
          </Pressable>
          <LottieView
            source={require("../../assets/lottie/warranty.json")}
            autoPlay
            loop
            style={styles.lottieAnimation}
          />
          <Text style={styles.lottieTitle}>{"Warranty Registration"}</Text>
          <Text style={styles.lottieSubtitle}>{"Protect your Blade outboard"}</Text>
        </View>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{
            paddingTop: Spacing.xl,
            paddingBottom: insets.bottom + Spacing["4xl"],
            paddingHorizontal: Spacing.screenPadding,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(500)}>
            <View style={styles.successCard}>
              <View style={styles.successIconCircle}>
                <Feather name="check-circle" size={40} color={BladeColors.accent} />
              </View>
              <ThemedText type="h2" style={styles.successTitle}>
                {submitSuccess ? "Warranty Registered" : "Warranty Active"}
              </ThemedText>
              <ThemedText type="small" style={styles.successSubtitle}>
                {submitSuccess
                  ? "Your Blade outboard has been successfully registered"
                  : "Your products are covered under warranty"}
              </ThemedText>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(150).duration(500)}>
            <View style={styles.disclaimerCard}>
              <View style={styles.disclaimerIconWrap}>
                <Feather name="info" size={18} color="#FF9F0A" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={styles.disclaimerText}>
                  {"Warranty registration and anti-theft tracking are independent features. Registering your product under warranty does not automatically enable anti-theft protection. To activate anti-theft, please link your motor via Bluetooth in the Dashboard."}
                </ThemedText>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(300).duration(500)}>
            <View style={styles.sectionHeader}>
              <ThemedText type="caption" style={styles.sectionLabel}>
                {"REGISTERED PRODUCTS"}
              </ThemedText>
            </View>

            {allWarranties.length > 0 ? (
              allWarranties.map((w, index) => (
                <View key={w.serialNumber + index} style={[styles.detailCard, index > 0 ? { marginTop: Spacing.md } : null]}>
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrap}>
                      <Feather name="hash" size={16} color={BladeColors.accent} />
                    </View>
                    <View style={styles.detailContent}>
                      <ThemedText type="caption" style={styles.detailLabel}>{"Serial Number"}</ThemedText>
                      <ThemedText type="body" style={styles.detailValue}>{w.serialNumber}</ThemedText>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: w.status === "approved" ? BladeColors.accent + "20" : "#FF9F0A20" }]}>
                      <ThemedText type="caption" style={{ color: w.status === "approved" ? BladeColors.accent : "#FF9F0A", fontWeight: "600", fontSize: 11 }}>
                        {w.status === "approved" ? "Active" : w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.detailDivider} />
                  {w.registrationNumber ? (
                    <>
                      <View style={styles.detailRow}>
                        <View style={styles.detailIconWrap}>
                          <Feather name="file-text" size={16} color={BladeColors.accent} />
                        </View>
                        <View style={styles.detailContent}>
                          <ThemedText type="caption" style={styles.detailLabel}>{"Registration Number"}</ThemedText>
                          <ThemedText type="body" style={[styles.detailValue, { color: BladeColors.accent, fontWeight: "700", letterSpacing: 0.5 }]}>{w.registrationNumber}</ThemedText>
                        </View>
                      </View>
                      <View style={styles.detailDivider} />
                    </>
                  ) : null}
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrap}>
                      <Feather name="user" size={16} color={BladeColors.accent} />
                    </View>
                    <View style={styles.detailContent}>
                      <ThemedText type="caption" style={styles.detailLabel}>{"Registered To"}</ThemedText>
                      <ThemedText type="body" style={styles.detailValue}>{w.firstName} {w.lastName}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.detailDivider} />
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrap}>
                      <Feather name="calendar" size={16} color={BladeColors.accent} />
                    </View>
                    <View style={styles.detailContent}>
                      <ThemedText type="caption" style={styles.detailLabel}>{"Purchase Date"}</ThemedText>
                      <ThemedText type="body" style={styles.detailValue}>{formatDate(w.purchaseDate)}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.detailDivider} />
                  <View style={styles.warrantyDatesRow}>
                    <View style={styles.warrantyDateItem}>
                      <Feather name="shield" size={14} color={BladeColors.accent} />
                      <View>
                        <ThemedText type="caption" style={styles.detailLabel}>{"Start"}</ThemedText>
                        <ThemedText type="small" style={styles.detailValue}>{formatDate(w.warrantyStartDate)}</ThemedText>
                      </View>
                    </View>
                    <View style={styles.warrantyDateDivider} />
                    <View style={styles.warrantyDateItem}>
                      <Feather name="clock" size={14} color={BladeColors.accent} />
                      <View>
                        <ThemedText type="caption" style={styles.detailLabel}>{"Expires"}</ThemedText>
                        <ThemedText type="small" style={styles.detailValue}>{formatDate(w.warrantyExpirationDate)}</ThemedText>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            ) : existingWarranty ? (
              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrap}>
                    <Feather name="hash" size={16} color={BladeColors.accent} />
                  </View>
                  <View style={styles.detailContent}>
                    <ThemedText type="caption" style={styles.detailLabel}>{"Serial Number"}</ThemedText>
                    <ThemedText type="body" style={styles.detailValue}>{existingWarranty.serialNumber}</ThemedText>
                  </View>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrap}>
                    <Feather name="user" size={16} color={BladeColors.accent} />
                  </View>
                  <View style={styles.detailContent}>
                    <ThemedText type="caption" style={styles.detailLabel}>{"Registered To"}</ThemedText>
                    <ThemedText type="body" style={styles.detailValue}>{existingWarranty.firstName} {existingWarranty.lastName}</ThemedText>
                  </View>
                </View>
              </View>
            ) : null}
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(450).duration(500)}>
            <Pressable
              style={styles.registerAnotherButton}
              onPress={handleRegisterAnother}
              testID="button-register-another"
            >
              <Feather name="plus-circle" size={20} color={BladeColors.accent} />
              <ThemedText type="body" style={styles.registerAnotherText}>
                {"Register Another Product"}
              </ThemedText>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
        <View style={[styles.lottieHeader, { paddingTop: insets.top }]}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            testID="button-back"
          >
            <Feather name="chevron-left" size={28} color="#FFFFFF" />
          </Pressable>
          <LottieView
            source={require("../../assets/lottie/warranty.json")}
            autoPlay
            loop
            style={styles.lottieAnimation}
          />
          <Text style={styles.lottieTitle}>{"Warranty Registration"}</Text>
          <Text style={styles.lottieSubtitle}>{"Protect your Blade outboard"}</Text>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={{
            paddingTop: Spacing.xl,
            paddingBottom: insets.bottom + Spacing["4xl"],
            paddingHorizontal: Spacing.screenPadding,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.powerOnBanner}>
              <View style={styles.powerOnIconWrap}>
                <Feather name="zap" size={18} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={styles.powerOnText}>
                  {"Ensure your outboard motor is powered on and nearby before submitting."}
                </ThemedText>
              </View>
            </View>
          </Animated.View>

          {!boatData ? (
            <Animated.View entering={FadeIn.duration(400)}>
              <Pressable
                style={styles.boatPromptCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.goBack();
                }}
                testID="button-boat-prompt"
              >
                <View style={styles.boatPromptIcon}>
                  <Feather name="anchor" size={20} color={BladeColors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                    {"Complete Your Boat Information"}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                    {"Adding boat details in Settings improves your warranty record. Tap to go back."}
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </Animated.View>
          ) : null}

          <View style={styles.sectionHeader}>
            <ThemedText type="caption" style={styles.sectionLabel}>
              {"ACCOUNT INFORMATION"}
            </ThemedText>
          </View>
          <View style={styles.formCard}>
            <View style={styles.readOnlyRow}>
              <View style={styles.readOnlyIconWrap}>
                <Feather name="mail" size={16} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="caption" style={styles.readOnlyLabel}>{"Email (bound to warranty)"}</ThemedText>
                <ThemedText type="body" style={styles.readOnlyValue}>{user?.email || "Not available"}</ThemedText>
              </View>
              <Feather name="lock" size={14} color="rgba(255,255,255,0.3)" />
            </View>
            <View style={styles.formDivider} />
            <View style={styles.readOnlyRow}>
              <View style={styles.readOnlyIconWrap}>
                <Feather name="globe" size={16} color={BladeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="caption" style={styles.readOnlyLabel}>{"Country (bound to warranty)"}</ThemedText>
                <ThemedText type="body" style={styles.readOnlyValue}>{country || "Not set"}</ThemedText>
              </View>
              <Feather name="lock" size={14} color="rgba(255,255,255,0.3)" />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText type="caption" style={styles.sectionLabel}>
              {"MOTOR INFORMATION"}
            </ThemedText>
          </View>
          <View style={styles.formCard}>
            <ThemedText type="caption" style={styles.inputLabel}>{"Serial Number *"}</ThemedText>
            <View style={styles.serialRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={serialNumber}
                onChangeText={handleSerialNumberChange}
                placeholder="JK000000"
                placeholderTextColor="rgba(255,255,255,0.3)"
                autoCapitalize="characters"
                maxLength={8}
                returnKeyType="next"
                testID="input-serial-number"
              />
              <Pressable
                style={styles.scanButton}
                onPress={handleOpenScanner}
                testID="button-scan-qr"
              >
                <Feather name="camera" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.formDivider} />

            <ThemedText type="caption" style={styles.inputLabel}>{"Date of Purchase *"}</ThemedText>
            <DatePickerField
              value={purchaseDate}
              onChange={(date: Date) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPurchaseDate(date);
              }}
              maximumDate={new Date()}
            />

            <View style={styles.formDivider} />

            <ThemedText type="caption" style={styles.inputLabel}>{"Dealer/Reseller Name (if applicable)"}</ThemedText>
            <TextInput
              style={styles.input}
              value={dealerName}
              onChangeText={setDealerName}
              placeholder="Enter dealer or reseller name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              returnKeyType="next"
              testID="input-dealer-name"
            />
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText type="caption" style={styles.sectionLabel}>
              {"PERSONAL DETAILS"}
            </ThemedText>
          </View>
          <View style={styles.formCard}>
            <ThemedText type="caption" style={styles.inputLabel}>{"First Name *"}</ThemedText>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter your first name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="words"
              returnKeyType="next"
              testID="input-first-name"
            />

            <View style={styles.formDivider} />

            <ThemedText type="caption" style={styles.inputLabel}>{"Last Name *"}</ThemedText>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter your last name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="words"
              returnKeyType="next"
              testID="input-last-name"
            />

            <View style={styles.formDivider} />

            <ThemedText type="caption" style={styles.inputLabel}>{"Phone Number *"}</ThemedText>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+44 7700 900000"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="phone-pad"
              returnKeyType="done"
              testID="input-phone-number"
            />
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText type="caption" style={styles.sectionLabel}>
              {"PROOF OF PURCHASE"}
            </ThemedText>
          </View>
          <View style={styles.formCard}>
            <ThemedText type="caption" style={[styles.inputLabel, { marginBottom: Spacing.sm }]}>
              {"Upload receipt or invoice photo"}
            </ThemedText>
            <Pressable
              style={styles.uploadReceiptButton}
              onPress={handlePickImage}
              testID="button-upload-receipt"
            >
              <Feather name="upload" size={18} color="#FFFFFF" />
              <ThemedText type="caption" style={styles.photoButtonText}>{"Upload Receipt"}</ThemedText>
            </Pressable>
            {receiptUri ? (
              <View style={styles.receiptPreview}>
                <Image source={{ uri: receiptUri }} style={styles.receiptImage} resizeMode="cover" />
                <Pressable
                  style={styles.receiptRemoveBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setReceiptBase64(null);
                    setReceiptUri(null);
                  }}
                  testID="button-remove-receipt"
                >
                  <Feather name="x-circle" size={22} color={BladeColors.error} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText type="caption" style={styles.sectionLabel}>
              {"TERMS & CONDITIONS"}
            </ThemedText>
          </View>
          <View style={styles.formCard}>
            <ScrollView style={styles.termsScroll} nestedScrollEnabled>
              <ThemedText type="small" style={styles.termsText}>
                {"1. This warranty covers manufacturing defects in materials and workmanship of your Blade electric outboard motor for a period of two years (or three years in applicable jurisdictions) from the date of purchase."}
              </ThemedText>
              <ThemedText type="small" style={styles.termsText}>
                {"2. This warranty does not cover damage resulting from misuse, unauthorised modifications, improper installation, neglect, accident, or use contrary to the product instructions and guidelines."}
              </ThemedText>
              <ThemedText type="small" style={styles.termsText}>
                {"3. To be eligible for warranty coverage, the product must be registered within 30 days of the original purchase date through this application with valid proof of purchase."}
              </ThemedText>
              <ThemedText type="small" style={styles.termsText}>
                {"4. This warranty is transferable to subsequent owners of the product, provided that the original warranty registration remains valid and the transfer is notified to Blade Marine Technologies Limited in writing."}
              </ThemedText>
              <ThemedText type="small" style={styles.termsText}>
                {"5. Blade Marine Technologies Limited's liability under this warranty is limited to the repair or replacement of the defective product at our sole discretion. In no event shall we be liable for any indirect, incidental, or consequential damages."}
              </ThemedText>
              <ThemedText type="small" style={styles.termsText}>
                {"6. Any disputes arising from this warranty shall be resolved through binding arbitration in accordance with the laws of England and Wales, with proceedings conducted in London, United Kingdom."}
              </ThemedText>
            </ScrollView>
            <Pressable
              onPress={() => Linking.openURL("https://www.bladeoutboards.com/warranty-policy")}
              style={styles.warrantyPolicyLink}
              testID="button-warranty-policy"
            >
              <Feather name="external-link" size={14} color={BladeColors.accent} />
              <ThemedText type="small" style={styles.warrantyPolicyLinkText}>
                {"Full terms and conditions can be found here"}
              </ThemedText>
            </Pressable>
            <View style={styles.checkboxRow}>
              <Checkbox
                value={termsAccepted}
                onValueChange={(val: boolean) => {
                  Haptics.selectionAsync();
                  setTermsAccepted(val);
                }}
                color={termsAccepted ? BladeColors.accent : undefined}
                style={styles.checkbox}
                testID="checkbox-terms"
              />
              <ThemedText type="small" style={styles.checkboxLabel}>
                {"I have read and accept the terms and conditions"}
              </ThemedText>
            </View>
          </View>

          <Pressable
            style={[
              styles.submitButton,
              submitting ? styles.submitButtonDisabled : null,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            testID="button-submit-warranty"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="shield" size={20} color="#FFFFFF" style={{ marginRight: Spacing.sm }} />
                <ThemedText type="button" style={{ color: "#FFFFFF" }}>
                  {"Register Warranty"}
                </ThemedText>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
      <Modal
        visible={showVerificationModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseVerification}
      >
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.verificationModal}>
            <Text style={styles.verificationTitle}>{"Bluetooth Verification"}</Text>
            <Text style={styles.verificationSubtitle}>{"Authenticating serial number with motor"}</Text>

            <View style={styles.verificationSteps}>
              <VerificationStepRow
                label="Scanning for motor"
                status={
                  verificationStep === "scanning" ? "active" :
                  (verificationStep === "connecting" || verificationStep === "reading" || verificationStep === "verifying" || verificationStep === "success") ? "done" :
                  "pending"
                }
              />
              <VerificationStepRow
                label="Connecting to device"
                status={
                  verificationStep === "connecting" ? "active" :
                  (verificationStep === "reading" || verificationStep === "verifying" || verificationStep === "success") ? "done" :
                  "pending"
                }
              />
              <VerificationStepRow
                label="Reading serial number"
                status={
                  verificationStep === "reading" ? "active" :
                  (verificationStep === "verifying" || verificationStep === "success" || verificationStep === "mismatch") ? "done" :
                  "pending"
                }
              />
              <VerificationStepRow
                label="Verifying serial match"
                status={
                  verificationStep === "success" ? "done" :
                  verificationStep === "mismatch" ? "error" :
                  (verificationStep === "verifying") ? "active" :
                  "pending"
                }
              />
            </View>

            {(verificationStep === "error" || verificationStep === "timeout" || verificationStep === "mismatch") ? (
              <View style={styles.verificationErrorContainer}>
                <Feather
                  name={verificationStep === "timeout" ? "clock" : "alert-circle"}
                  size={20}
                  color={BladeColors.error}
                />
                <Text style={styles.verificationErrorText}>{verificationMessage}</Text>
              </View>
            ) : null}

            {verificationStep === "success" ? (
              <View style={styles.verificationSuccessContainer}>
                <Feather name="check-circle" size={20} color={BladeColors.success} />
                <Text style={styles.verificationSuccessText}>{verificationMessage}</Text>
              </View>
            ) : null}

            <View style={styles.verificationButtons}>
              {(verificationStep === "error" || verificationStep === "timeout" || verificationStep === "mismatch") ? (
                <Pressable
                  style={styles.verificationRetryButton}
                  onPress={handleRetryVerification}
                  testID="button-retry-verification"
                >
                  <Feather name="refresh-cw" size={16} color="#FFFFFF" />
                  <Text style={styles.verificationRetryText}>{"Retry"}</Text>
                </Pressable>
              ) : null}
              {verificationStep !== "success" ? (
                <Pressable
                  style={styles.verificationCancelButton}
                  onPress={handleCloseVerification}
                  testID="button-cancel-verification"
                >
                  <Text style={styles.verificationCancelText}>{"Cancel"}</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function VerificationStepRow({ label, status }: { label: string; status: "pending" | "active" | "done" | "error" }) {
  return (
    <View style={vstyles.row}>
      <View style={vstyles.iconContainer}>
        {status === "done" ? (
          <Feather name="check-circle" size={20} color={BladeColors.success} />
        ) : status === "active" ? (
          <ActivityIndicator size="small" color={BladeColors.accent} />
        ) : status === "error" ? (
          <Feather name="x-circle" size={20} color={BladeColors.error} />
        ) : (
          <View style={vstyles.pendingDot} />
        )}
      </View>
      <Text style={[
        vstyles.label,
        status === "done" ? vstyles.labelDone : null,
        status === "active" ? vstyles.labelActive : null,
        status === "error" ? vstyles.labelError : null,
      ]}>{label}</Text>
    </View>
  );
}

const vstyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  iconContainer: {
    width: 24,
    alignItems: "center",
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  label: {
    fontSize: 15,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "500",
  },
  labelDone: {
    color: BladeColors.success,
  },
  labelActive: {
    color: "#FFFFFF",
  },
  labelError: {
    color: BladeColors.error,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  lottieHeader: {
    backgroundColor: LOTTIE_HEADER_BG,
    alignItems: "center",
    paddingBottom: Spacing.xl,
    minHeight: LOTTIE_HEADER_HEIGHT,
    justifyContent: "flex-end",
  },
  backButton: {
    position: "absolute",
    top: 0,
    left: Spacing.md,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  lottieAnimation: {
    width: 140,
    height: 140,
  },
  lottieTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  lottieSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  sectionHeader: {
    marginTop: Spacing["2xl"],
    marginBottom: Spacing.sm,
    marginLeft: Spacing.md,
  },
  sectionLabel: {
    letterSpacing: 0.8,
    fontWeight: "600",
    color: SECTION_LABEL_COLOR,
  },
  formCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    borderWidth: 1,
    borderColor: TILE_BORDER,
  },
  inputLabel: {
    color: "rgba(255,255,255,0.5)",
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: "#FFFFFF",
    fontSize: 16,
  },
  serialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    backgroundColor: BladeColors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  formDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: Spacing.md,
  },
  readOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  readOnlyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: INPUT_BG,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  readOnlyLabel: {
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.5,
  },
  readOnlyValue: {
    color: "#FFFFFF",
    marginTop: 2,
  },
  uploadReceiptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INPUT_BG,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  photoButtonText: {
    color: "#FFFFFF",
  },
  receiptPreview: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    position: "relative",
  },
  receiptImage: {
    width: "100%",
    height: 200,
    borderRadius: BorderRadius.sm,
  },
  receiptRemoveBtn: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  termsScroll: {
    maxHeight: 200,
    marginBottom: Spacing.md,
  },
  termsText: {
    color: "rgba(255,255,255,0.7)",
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  checkboxLabel: {
    color: "#FFFFFF",
    flex: 1,
  },
  submitButton: {
    backgroundColor: BladeColors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing["2xl"],
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  successCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BladeColors.accent + "30",
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: BladeColors.accent + "20",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  successTitle: {
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  successSubtitle: {
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  detailCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: TILE_BORDER,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  detailIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: INPUT_BG,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.5,
  },
  detailValue: {
    color: "#FFFFFF",
    marginTop: 2,
  },
  detailDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  boatPromptCard: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BladeColors.warning + "30",
    gap: Spacing.md,
  },
  boatPromptIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BladeColors.warning + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scannerFrame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: BladeColors.accent,
    borderRadius: BorderRadius.lg,
  },
  scannerText: {
    color: "#FFFFFF",
    marginTop: Spacing.xl,
    textAlign: "center",
  },
  scannerCloseBtn: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  disclaimerCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,159,10,0.08)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,159,10,0.2)",
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  disclaimerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,159,10,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  disclaimerText: {
    color: "#78590A",
    lineHeight: 20,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  warrantyDatesRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  warrantyDateItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  warrantyDateDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: Spacing.sm,
  },
  registerAnotherButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    marginTop: Spacing["2xl"],
    borderWidth: 1,
    borderColor: BladeColors.accent + "30",
    gap: Spacing.sm,
  },
  registerAnotherText: {
    color: BladeColors.accent,
    fontWeight: "600",
  },
  warrantyPolicyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  warrantyPolicyLinkText: {
    color: BladeColors.accent,
    textDecorationLine: "underline",
  },
  powerOnBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(52,199,89,0.08)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(52,199,89,0.2)",
    gap: Spacing.sm,
    alignItems: "center",
  },
  powerOnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(52,199,89,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  powerOnText: {
    color: "#2D6A3F",
    lineHeight: 20,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  verificationModal: {
    backgroundColor: DARK_TILE,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: TILE_BORDER,
  },
  verificationTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  verificationSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  verificationSteps: {
    marginBottom: Spacing.lg,
  },
  verificationErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,69,58,0.1)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  verificationErrorText: {
    color: BladeColors.error,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  verificationSuccessContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(52,199,89,0.1)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  verificationSuccessText: {
    color: BladeColors.success,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  verificationButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
  },
  verificationRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BladeColors.accent,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  verificationRetryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  verificationCancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  verificationCancelText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontWeight: "500",
  },
});
