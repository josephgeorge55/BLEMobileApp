import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { storage } from "./storage";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDocs, query, where, collection, serverTimestamp, updateDoc, addDoc, Timestamp } from "firebase/firestore";
import {
  locationReportSchema,
  firmwareCheckSchema,
  sendNotificationSchema,
  registerTokenSchema,
  telemetryReportSchema,
  createAccountSchema,
  loginSchema,
  linkMotorSchema,
  startTripSchema,
  endTripSchema,
  tripDataPointSchema,
  warrantyRegistrationSchema,
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { generateTripPDF } from "./pdfGenerator";
import { generatePassportPDF, generatePassportPDFBuffer } from "./passportPdfGenerator";

import { randomUUID } from "node:crypto";
import { sendExpoPushNotifications } from "./pushNotificationService";
import { sendApnsPushNotifications, isApnsConfigured, testApnsConnection } from "./apnsPushService";
import {
  loginRateLimiter,
  bruteForceProtection,
  registerRateLimiter,
  motorLinkRateLimiter,
  generalApiRateLimiter,
} from "./rateLimiter";

const LOG_DIR = join(process.cwd(), "logs");
const AUTH_LOG_FILE = join(LOG_DIR, "auth.log");

const pendingDownloads = new Map<string, { buffer: Buffer; mimeType: string; filename: string; expiresAt: number }>();

function cleanExpiredDownloads() {
  const now = Date.now();
  for (const [id, entry] of pendingDownloads) {
    if (entry.expiresAt < now) {
      pendingDownloads.delete(id);
    }
  }
}

setInterval(cleanExpiredDownloads, 60000);

function ensureLogDirectory() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logAuthEvent(event: string, email: string, success: boolean) {
  ensureLogDirectory();
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${event} | Email: ${email} | Success: ${success}\n`;
  appendFileSync(AUTH_LOG_FILE, logEntry);
}

function handleZodError(error: unknown, res: Response) {
  if (error instanceof ZodError) {
    const validationError = fromZodError(error);
    return res.status(400).json({ error: validationError.message });
  }
  throw error;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getWarrantyFirestore() {
  const firebaseConfig = {
    apiKey: "AIzaSyAOS_qrKCWdXAENEdrvO3cJ2V8nLmE3v1A",
    authDomain: "bladeobapp.firebaseapp.com",
    projectId: "bladeobapp",
    storageBucket: "bladeobapp.firebasestorage.app",
    messagingSenderId: "416634217131",
    appId: "1:416634217131:web:c45427f52f10285e3d0dee"
  };
  let firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getFirestore(firebaseApp);
}

const THREE_YEAR_WARRANTY_COUNTRIES_SERVER = ["hungary", "hu"];

function calculateWarrantyExpirationServer(purchaseDate: string, country: string): string {
  const date = new Date(purchaseDate);
  const normalizedCountry = country.toLowerCase().trim();
  const years = THREE_YEAR_WARRANTY_COUNTRIES_SERVER.some(
    c => normalizedCountry === c || normalizedCountry.includes("hungary")
  ) ? 3 : 2;
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", registerRateLimiter, async (req, res) => {
    try {
      const body = createAccountSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(body.email);
      if (existingUser) {
        logAuthEvent("REGISTER_FAILED", body.email, false);
        return res.status(400).json({ error: "Email already registered" });
      }

      const user = await storage.createUser({
        email: body.email,
        pin: body.pin,
      });

      logAuthEvent("REGISTER_SUCCESS", body.email, true);

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error registering user:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", loginRateLimiter, bruteForceProtection, async (req, res) => {
    try {
      const body = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(body.email);
      if (!user || user.pin !== body.pin) {
        logAuthEvent("LOGIN_FAILED", body.email, false);
        return res.status(401).json({ error: "Invalid email or PIN" });
      }

      await storage.updateUserLastLogin(user.id);
      logAuthEvent("LOGIN_SUCCESS", body.email, true);

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error logging in:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/motors/link", motorLinkRateLimiter, async (req, res) => {
    try {
      const body = linkMotorSchema.parse(req.body);

      let motor = await storage.getMotorBySerial(body.serialNumber);
      if (!motor) {
        motor = await storage.createOrUpdateMotor({
          serialNumber: body.serialNumber,
          name: `Blade ${body.serialNumber.slice(-4)}`,
          userId: body.userId,
        });
      } else {
        motor = await storage.linkMotorToUser(body.serialNumber, body.userId);
      }

      res.json({
        success: true,
        motor,
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error linking motor:", error);
      res.status(500).json({ error: "Failed to link motor" });
    }
  });

  app.get("/api/user/:userId/motors", async (req, res) => {
    try {
      const { userId } = req.params;
      const userMotors = await storage.getMotorsByUserId(userId);
      res.json(userMotors);
    } catch (error) {
      console.error("Error fetching user motors:", error);
      res.status(500).json({ error: "Failed to fetch motors" });
    }
  });

  app.post("/api/motor/:serialNumber/location", async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const body = locationReportSchema.parse({
        ...req.body,
        serialNumber,
      });

      let motor = await storage.getMotorBySerial(serialNumber);
      if (!motor) {
        motor = await storage.createOrUpdateMotor({
          serialNumber,
          name: `Blade ${serialNumber.slice(-4)}`,
        });
      } else {
        await storage.updateMotorLastSeen(serialNumber);
      }

      const location = await storage.createLocation({
        motorId: motor.id,
        serialNumber,
        latitude: body.latitude,
        longitude: body.longitude,
        speed: body.speed,
        heading: body.heading,
        isLive: true,
      });

      res.json({
        success: true,
        location: {
          id: location.id,
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: location.timestamp,
        },
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error creating location:", error);
      res.status(500).json({ error: "Failed to record location" });
    }
  });

  app.get("/api/motor/:serialNumber/location", async (req, res) => {
    try {
      const { serialNumber } = req.params;

      const location = await storage.getLatestLocation(serialNumber);

      if (!location) {
        return res.status(404).json({ error: "No location data found" });
      }

      const now = new Date();
      const locationTime = new Date(location.timestamp!);
      const diffMinutes =
        (now.getTime() - locationTime.getTime()) / (1000 * 60);
      const isLive = diffMinutes < 5;

      res.json({
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed,
        heading: location.heading,
        timestamp: location.timestamp,
        isLive,
      });
    } catch (error) {
      console.error("Error fetching location:", error);
      res.status(500).json({ error: "Failed to fetch location" });
    }
  });

  app.get("/api/motor/:serialNumber/firmware", async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const motor = await storage.getMotorBySerial(serialNumber);
      const currentVersion = motor?.firmwareVersion || "1.0.0";

      const available = await storage.getAvailableFirmware(serialNumber);

      const updates = available.filter((fw) => {
        const fwParts = fw.version.split(".").map(Number);
        const currentParts = currentVersion.split(".").map(Number);

        for (let i = 0; i < 3; i++) {
          if (fwParts[i] > currentParts[i]) return true;
          if (fwParts[i] < currentParts[i]) return false;
        }
        return false;
      });

      res.json({
        current: currentVersion,
        available: updates,
      });
    } catch (error) {
      console.error("Error fetching firmware:", error);
      res.status(500).json({ error: "Failed to fetch firmware info" });
    }
  });

  app.post("/api/notifications/send", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      const expectedKey = process.env.PUSH_ADMIN_API_KEY;

      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized. Valid API key required." });
      }

      const body = sendNotificationSchema.parse(req.body);

      let tokens: { token: string; tokenType: string | null }[] = [];
      if (body.targetSerialNumber) {
        tokens = await storage.getPushTokensForMotor(body.targetSerialNumber);
      } else if (body.type === "announcement" || body.type === "promotion") {
        tokens = await storage.getPushTokensForNews();
      } else if (body.type === "service" || body.type === "maintenance") {
        tokens = await storage.getPushTokensForService();
      } else {
        tokens = await storage.getAllPushTokens();
      }

      const notification = await storage.createNotification({
        type: body.type,
        title: body.title,
        body: body.body,
        data: body.data ? JSON.stringify(body.data) : undefined,
        targetSerialNumber: body.targetSerialNumber,
        status: "sent",
      });

      const apnsTokens = tokens.filter(t => t.tokenType === "apns").map(t => t.token);
      const expoTokens = tokens.filter(t => t.tokenType !== "apns").map(t => t.token);

      console.log(`[Push] === Notification Send ===`);
      console.log(`[Push] Type: ${body.type}, Title: "${body.title}"`);
      console.log(`[Push] Total tokens found: ${tokens.length}`);
      console.log(`[Push] APNs tokens: ${apnsTokens.length}, Expo tokens: ${expoTokens.length}`);
      tokens.forEach((t, i) => {
        console.log(`[Push] Token ${i + 1}: type=${t.tokenType}, token=${t.token.substring(0, 16)}...`);
      });
      console.log(`[Push] APNs configured: ${isApnsConfigured()}`);

      let apnsResult = { sent: 0, failed: 0 };
      let expoResult = { sent: 0, failed: 0 };

      let apnsDetails: any[] = [];
      if (apnsTokens.length > 0 && isApnsConfigured()) {
        console.log(`[Push] Sending ${apnsTokens.length} via APNs...`);
        const apnsFullResult = await sendApnsPushNotifications(
          apnsTokens,
          body.title,
          body.body,
          body.data as Record<string, unknown> | undefined,
        );
        apnsResult = { sent: apnsFullResult.sent, failed: apnsFullResult.failed };
        if (apnsFullResult.details) {
          apnsDetails = apnsFullResult.details.map((d) => ({
            tokenPrefix: d.token.substring(0, 16) + "...",
            success: d.success,
            statusCode: d.statusCode,
            reason: d.reason || null,
            apnsId: d.apnsId || null,
          }));
          const tokensToRemove: string[] = [];
          apnsFullResult.details.forEach((d) => {
            if (!d.success) {
              console.error(`[Push] APNs detail: token=${d.token.substring(0, 12)}... status=${d.statusCode} reason=${d.reason}`);
              if (d.reason === "Unregistered" || d.reason === "BadDeviceToken" || d.statusCode === 410) {
                tokensToRemove.push(d.token);
              }
            }
          });
          if (tokensToRemove.length > 0) {
            for (const badToken of tokensToRemove) {
              try {
                await storage.removePushToken(badToken);
                console.log(`[Push] Removed invalid token: ${badToken.substring(0, 12)}...`);
              } catch (e) {
                console.error(`[Push] Failed to remove token: ${badToken.substring(0, 12)}...`);
              }
            }
          }
        }
        console.log(`[Push] APNs result: sent=${apnsResult.sent}, failed=${apnsResult.failed}`);
      } else if (apnsTokens.length > 0) {
        console.warn(`[Push] ${apnsTokens.length} APNs tokens found but APNs NOT configured!`);
        console.warn(`[Push] Missing: APPLE_APNS_KEY_P8=${!!process.env.APPLE_APNS_KEY_P8}, APPLE_APNS_KEY_ID=${!!process.env.APPLE_APNS_KEY_ID}, APPLE_TEAM_IDENTIFIER=${!!process.env.APPLE_TEAM_IDENTIFIER}`);
      }

      if (expoTokens.length > 0) {
        console.log(`[Push] Sending ${expoTokens.length} via Expo Push API...`);
        expoResult = await sendExpoPushNotifications(
          expoTokens,
          body.title,
          body.body,
          body.data as Record<string, unknown> | undefined,
        );
        console.log(`[Push] Expo result: sent=${expoResult.sent}, failed=${expoResult.failed}`);
      }

      const pushResult = {
        sent: apnsResult.sent + expoResult.sent,
        failed: apnsResult.failed + expoResult.failed,
        apns: { ...apnsResult, details: apnsDetails },
        expo: expoResult,
      };

      console.log(`[Push] Final: sent=${pushResult.sent}, failed=${pushResult.failed} (APNs: ${apnsResult.sent}/${apnsTokens.length}, Expo: ${expoResult.sent}/${expoTokens.length})`);

      res.json({
        success: true,
        notificationId: notification.id,
        recipientCount: tokens.length,
        pushResult,
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error sending notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.get("/api/notifications/test-apns", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      const expectedKey = process.env.PUSH_ADMIN_API_KEY;

      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized. Valid API key required." });
      }

      console.log("[APNs-Test] Running APNs connection diagnostics...");
      const diagnostics = await testApnsConnection();
      console.log("[APNs-Test] Diagnostics result:", JSON.stringify(diagnostics, null, 2));

      const tokens = await storage.getAllPushTokens();
      const apnsTokens = tokens.filter(t => t.tokenType === "apns");

      res.json({
        diagnostics,
        registeredTokens: {
          total: tokens.length,
          apns: apnsTokens.length,
          expo: tokens.filter(t => t.tokenType !== "apns").length,
          apnsTokenDetails: apnsTokens.map(t => ({
            id: t.id,
            tokenStart: t.token.substring(0, 16),
            tokenLength: t.token.length,
            userId: t.userId,
            createdAt: t.createdAt,
          })),
        },
      });
    } catch (error: any) {
      console.error("[APNs-Test] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/push-tokens/register", async (req, res) => {
    try {
      const body = registerTokenSchema.parse(req.body);

      console.log(`[Push] === Token Registration ===`);
      console.log(`[Push] Token type: ${body.tokenType || "expo"}`);
      console.log(`[Push] Platform: ${body.platform}`);
      console.log(`[Push] User ID: ${body.userId}`);
      console.log(`[Push] Token: ${body.token.substring(0, 20)}...`);
      console.log(`[Push] Preferences: news=${body.notifNews}, service=${body.notifService}, motor=${body.notifMotor}`);

      const token = await storage.registerPushToken({
        token: body.token,
        tokenType: body.tokenType || "expo",
        userId: body.userId,
        motorSerialNumber: body.motorSerialNumber,
        platform: body.platform,
        notifNews: body.notifNews,
        notifService: body.notifService,
        notifMotor: body.notifMotor,
      });

      console.log(`[Push] Token registered successfully: ID=${token.id}`);

      res.json({
        success: true,
        tokenId: token.id,
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error registering token:", error);
      res.status(500).json({ error: "Failed to register push token" });
    }
  });

  app.put("/api/push-tokens/preferences", async (req, res) => {
    try {
      const { token, notifNews, notifService, notifMotor } = req.body;

      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      const updated = await storage.updatePushTokenPreferences(token, {
        notifNews,
        notifService,
        notifMotor,
      });

      if (!updated) {
        return res.status(404).json({ error: "Push token not found" });
      }

      res.json({ success: true, token: updated });
    } catch (error) {
      console.error("Error updating push token preferences:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  app.post("/api/telemetry/:serialNumber", async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const body = telemetryReportSchema.parse({
        ...req.body,
        serialNumber,
      });

      const telemetry = await storage.createTelemetry({
        motorSerialNumber: serialNumber,
        speed: body.speed,
        stateOfCharge: body.stateOfCharge,
        powerConsumption: body.powerConsumption,
        latitude: body.latitude,
        longitude: body.longitude,
      });

      res.json({
        success: true,
        telemetryId: telemetry.id,
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error recording telemetry:", error);
      res.status(500).json({ error: "Failed to record telemetry" });
    }
  });

  app.get("/api/motor/:serialNumber", async (req, res) => {
    try {
      const { serialNumber } = req.params;
      const motor = await storage.getMotorBySerial(serialNumber);

      if (!motor) {
        return res.status(404).json({ error: "Motor not found" });
      }

      res.json(motor);
    } catch (error) {
      console.error("Error fetching motor:", error);
      res.status(500).json({ error: "Failed to fetch motor" });
    }
  });

  app.post("/api/motors/register", async (req, res) => {
    try {
      const { serialNumber, name, firmwareVersion } = req.body;

      if (!serialNumber) {
        return res.status(400).json({ error: "Serial number is required" });
      }

      const motor = await storage.createOrUpdateMotor({
        serialNumber,
        name: name || `Blade ${serialNumber.slice(-4)}`,
        firmwareVersion: firmwareVersion || "1.0.0",
      });

      res.json({
        success: true,
        motor,
      });
    } catch (error) {
      console.error("Error registering motor:", error);
      res.status(500).json({ error: "Failed to register motor" });
    }
  });

  app.post("/api/firmware", async (req, res) => {
    try {
      const { version, releaseNotes, isMandatory, fileUrl, fileSize } =
        req.body;

      if (!version) {
        return res.status(400).json({ error: "Version is required" });
      }

      const firmware = await storage.createFirmwareVersion({
        version,
        releaseNotes,
        isMandatory: isMandatory ?? false,
        fileUrl,
        fileSize,
      });

      res.json({
        success: true,
        firmware,
      });
    } catch (error) {
      console.error("Error creating firmware:", error);
      res.status(500).json({ error: "Failed to create firmware version" });
    }
  });

  app.post("/api/firmware/upload", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"];
      const expectedKey = process.env.PUSH_ADMIN_API_KEY;

      if (!expectedKey || apiKey !== expectedKey) {
        console.log("[Firmware Upload] Unauthorized API key attempt");
        return res.status(401).json({ error: "Unauthorized. Valid API key required." });
      }

      const { version, releaseNotes, isMandatory, fileSize, eligibleSerials, fileData } = req.body;

      if (!version) {
        return res.status(400).json({ error: "Version is required" });
      }

      if (!eligibleSerials || !Array.isArray(eligibleSerials) || eligibleSerials.length === 0) {
        return res.status(400).json({ error: "eligibleSerials array is required" });
      }

      if (!fileData || typeof fileData !== "string") {
        return res.status(400).json({ error: "fileData (base64 encoded) is required" });
      }

      console.log(`[Firmware Upload] Processing firmware upload for version ${version}`);

      const db = getWarrantyFirestore();

      const docId = `fw_v${version.replace(/\./g, '_')}`;

      const firestoreData = {
        version,
        releaseNotes: releaseNotes || null,
        isMandatory: isMandatory ?? false,
        fileSize: fileSize || null,
        eligibleSerials: eligibleSerials.map((s: string) => s.toUpperCase()),
        fileData,
        releaseDate: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "firmware_releases", docId), firestoreData);

      console.log(`[Firmware Upload] Written to Firestore: ${docId}`);

      await storage.createFirmwareVersion({
        version,
        releaseNotes,
        isMandatory: isMandatory ?? false,
        fileSize,
      });

      console.log(`[Firmware Upload] Written to PostgreSQL firmwareVersions table`);

      res.json({
        success: true,
        firmwareId: docId,
      });
    } catch (error) {
      console.error("[Firmware Upload] Error:", error);
      res.status(500).json({ error: "Failed to upload firmware" });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      const { serialNumber } = req.query;
      const notificationsList = await storage.getNotifications(
        serialNumber as string | undefined,
      );
      res.json(notificationsList);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/trips/start", async (req, res) => {
    try {
      const body = startTripSchema.parse(req.body);

      const existingActive = await storage.getActiveTrip(body.userId);
      if (existingActive) {
        return res.status(400).json({ 
          error: "Active trip exists",
          activeTrip: existingActive
        });
      }

      const trip = await storage.createTrip({
        userId: body.userId,
        motorSerialNumber: body.motorSerialNumber,
        name: body.name,
        startBatteryPercent: body.startBatteryPercent,
        isActive: true,
      });

      res.json({ success: true, trip });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error starting trip:", error);
      res.status(500).json({ error: "Failed to start trip" });
    }
  });

  app.post("/api/trips/:tripId/end", async (req, res) => {
    try {
      const { tripId } = req.params;
      const body = endTripSchema.parse({ tripId, ...req.body });

      const trip = await storage.getTripById(tripId);
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      if (!trip.isActive) {
        return res.status(400).json({ error: "Trip already ended" });
      }

      const dataPoints = await storage.getTripDataPoints(tripId);
      
      let totalDistanceKm = body.totalDistanceKm || 0;
      let maxSpeedKmh = body.maxSpeedKmh || 0;
      let avgSpeedKmh = body.avgSpeedKmh || 0;
      let totalEnergyWh = body.totalEnergyWh || 0;

      if (dataPoints.length > 0 && !body.totalDistanceKm) {
        let speedSum = 0;
        let speedCount = 0;

        for (let i = 0; i < dataPoints.length; i++) {
          const point = dataPoints[i];
          
          if (point.speedKmh !== null && point.speedKmh !== undefined) {
            if (point.speedKmh > maxSpeedKmh) maxSpeedKmh = point.speedKmh;
            speedSum += point.speedKmh;
            speedCount++;
          }

          if (point.vescWattage !== null && point.vescWattage !== undefined) {
            totalEnergyWh += (point.vescWattage / 3600) * 30;
          }

          if (i > 0 && point.latitude && point.longitude) {
            const prevPoint = dataPoints[i - 1];
            if (prevPoint.latitude && prevPoint.longitude) {
              const dist = haversineKm(
                prevPoint.latitude, prevPoint.longitude,
                point.latitude, point.longitude
              );
              totalDistanceKm += dist;
            }
          }
        }

        avgSpeedKmh = speedCount > 0 ? speedSum / speedCount : 0;
      }

      const endedTrip = await storage.endTrip(tripId, {
        endBatteryPercent: body.endBatteryPercent,
        totalDistanceKm,
        maxSpeedKmh,
        avgSpeedKmh,
        totalEnergyWh,
      });

      res.json({ success: true, trip: endedTrip });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error ending trip:", error);
      res.status(500).json({ error: "Failed to end trip" });
    }
  });

  app.post("/api/trips/:tripId/data", async (req, res) => {
    try {
      const { tripId } = req.params;
      const body = tripDataPointSchema.parse({ tripId, ...req.body });

      const trip = await storage.getTripById(tripId);
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      if (!trip.isActive) {
        return res.status(400).json({ error: "Cannot add data to ended trip" });
      }

      const dataPoint = await storage.addTripDataPoint(body);
      res.json({ success: true, dataPoint });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error adding trip data:", error);
      res.status(500).json({ error: "Failed to add trip data" });
    }
  });

  app.get("/api/trips/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const userTrips = await storage.getTripsByUserId(userId);
      res.json(userTrips);
    } catch (error) {
      console.error("Error fetching trips:", error);
      res.status(500).json({ error: "Failed to fetch trips" });
    }
  });

  app.get("/api/trips/user/:userId/active", async (req, res) => {
    try {
      const { userId } = req.params;
      const activeTrip = await storage.getActiveTrip(userId);
      res.json(activeTrip || null);
    } catch (error) {
      console.error("Error fetching active trip:", error);
      res.status(500).json({ error: "Failed to fetch active trip" });
    }
  });

  app.get("/api/trips/:tripId", async (req, res) => {
    try {
      const { tripId } = req.params;
      const trip = await storage.getTripById(tripId);
      
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      res.json(trip);
    } catch (error) {
      console.error("Error fetching trip:", error);
      res.status(500).json({ error: "Failed to fetch trip" });
    }
  });

  app.get("/api/trips/:tripId/data", async (req, res) => {
    try {
      const { tripId } = req.params;
      const dataPoints = await storage.getTripDataPoints(tripId);
      res.json(dataPoints);
    } catch (error) {
      console.error("Error fetching trip data:", error);
      res.status(500).json({ error: "Failed to fetch trip data" });
    }
  });

  app.put("/api/trips/:tripId", async (req, res) => {
    try {
      const { tripId } = req.params;
      const { name } = req.body;

      const trip = await storage.updateTrip(tripId, { name });
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      res.json({ success: true, trip });
    } catch (error) {
      console.error("Error updating trip:", error);
      res.status(500).json({ error: "Failed to update trip" });
    }
  });

  app.delete("/api/trips/:tripId", async (req, res) => {
    try {
      const { tripId } = req.params;
      await storage.deleteTrip(tripId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting trip:", error);
      res.status(500).json({ error: "Failed to delete trip" });
    }
  });

  app.post("/api/trip/report", async (req, res) => {
    console.log("[PDF] ====== PDF GENERATION REQUEST START ======");
    try {
      const tripData = req.body;
      console.log("[PDF] Trip ID:", tripData?.id);
      console.log("[PDF] Motor serial:", tripData?.motorSerialNumber);
      console.log("[PDF] Boat info:", JSON.stringify(tripData?.boatInfo));
      console.log("[PDF] Data points count:", tripData?.dataPoints?.length || 0);
      console.log("[PDF] Start time:", tripData?.startTime);
      console.log("[PDF] End time:", tripData?.endTime);
      
      if (!tripData || !tripData.id) {
        console.error("[PDF] Missing trip data or ID");
        return res.status(400).json({ error: "Trip data is required" });
      }
      
      console.log("[PDF] Calling generateTripPDF...");
      await generateTripPDF(res, tripData);
    } catch (error) {
      console.error("[PDF] ====== PDF GENERATION FAILED ======");
      console.error("[PDF] Error:", error);
      console.error("[PDF] Error stack:", error instanceof Error ? error.stack : 'No stack');
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  });

  app.post("/api/passport/pdf", async (req, res) => {
    try {
      const passportData = req.body;
      if (!passportData || !passportData.ownerEmail) {
        return res.status(400).json({ error: "Passport data is required" });
      }
      const wantDownloadUrl = req.headers["x-download-mode"] === "native";
      if (wantDownloadUrl) {
        const pdfBuffer = await generatePassportPDFBuffer(passportData);
        const filename = `blade-passport-${passportData.serialNumber || 'unknown'}.pdf`;
        const downloadId = randomUUID();
        pendingDownloads.set(downloadId, {
          buffer: pdfBuffer,
          mimeType: "application/pdf",
          filename,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return res.json({
          success: true,
          type: "native_download",
          downloadPath: `/api/passport/download/${downloadId}`,
          filename,
        });
      }
      await generatePassportPDF(res, passportData);
    } catch (error) {
      console.error("[Passport PDF] Error:", error);
      res.status(500).json({ error: "Failed to generate passport PDF" });
    }
  });

  app.get("/api/passport/wallet/diagnostics", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"];
      if (!apiKey || apiKey !== process.env.PUSH_ADMIN_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { getWalletPassDiagnostics } = await import("./walletPassGenerator");
      const diagnostics = getWalletPassDiagnostics();
      res.json({ diagnostics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/passport/wallet/debug-log", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] || req.query.key;
      if (!apiKey || apiKey !== process.env.PUSH_ADMIN_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { getWalletDebugLog } = await import("./walletPassGenerator");
      const log = getWalletDebugLog();
      res.json({ log, count: log.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/passport/wallet/test-direct", async (req, res) => {
    try {
      const apiKey = req.query.key;
      if (!apiKey || apiKey !== process.env.PUSH_ADMIN_API_KEY) {
        return res.status(401).send("Unauthorized - add ?key=YOUR_API_KEY");
      }
      const { generateTestPassDirect } = await import("./walletPassGenerator");
      const result = await generateTestPassDirect();

      if ("error" in result) {
        return res.status(500).json({ error: result.error, debugLog: result.debugLog });
      }

      res.removeHeader("X-Powered-By");
      res.setHeader("Content-Type", "application/vnd.apple.pkpass");
      res.setHeader("Content-Length", result.buffer.length.toString());
      res.setHeader("Content-Disposition", 'inline; filename="blade-test-pass.pkpass"');
      res.setHeader("Content-Transfer-Encoding", "binary");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.end(result.buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/wallet-test", async (req, res) => {
    try {
      const { generateTestPassDirect } = await import("./walletPassGenerator");
      const result = await generateTestPassDirect();
      const passReady = !("error" in result);
      const passError = "error" in result ? result.error : null;
      const passSize = passReady && "buffer" in result ? result.buffer.length : 0;

      let downloadId = "";
      if (passReady && "buffer" in result) {
        downloadId = randomUUID();
        pendingDownloads.set(downloadId, {
          buffer: result.buffer,
          mimeType: "application/vnd.apple.pkpass",
          filename: "blade-test-pass.pkpass",
          expiresAt: Date.now() + 10 * 60 * 1000,
        });
      }

      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blade Wallet Pass Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0A1628; color: #fff; padding: 20px; min-height: 100vh; }
    .card { background: rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin: 20px auto; max-width: 500px; }
    h1 { font-size: 24px; margin-bottom: 16px; text-align: center; }
    .status { padding: 12px; border-radius: 8px; margin: 12px 0; font-size: 14px; }
    .ok { background: rgba(52,199,89,0.2); border: 1px solid #34C759; }
    .err { background: rgba(255,59,48,0.2); border: 1px solid #FF3B30; }
    .info { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); }
    .download-btn { display: block; width: 100%; padding: 16px; background: #34C759; color: #fff; border: none; border-radius: 12px; font-size: 18px; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; margin: 16px 0; }
    .download-btn:active { background: #2DA44E; }
    .download-btn.disabled { background: #555; cursor: not-allowed; }
    .instructions { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.7); }
    .instructions li { margin: 8px 0; }
    .debug { font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; margin-top: 12px; color: rgba(255,255,255,0.6); }
    .label { font-size: 12px; color: rgba(255,255,255,0.5); text-transform: uppercase; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Blade Wallet Pass Test</h1>
    
    <div class="status ${passReady ? 'ok' : 'err'}">
      ${passReady ? 'Pass generated successfully (' + (passSize / 1024).toFixed(1) + ' KB)' : 'Error: ' + passError}
    </div>

    ${passReady ? `
    <a class="download-btn" href="/api/passport/download/${downloadId}">
      Download .pkpass File
    </a>
    ` : `
    <div class="download-btn disabled">Pass Generation Failed</div>
    `}

    <div class="card" style="padding: 16px;">
      <div class="label">How to test</div>
      <ol class="instructions">
        <li>Open this page in <strong>Safari on your iPhone</strong></li>
        <li>Tap the green "Download .pkpass" button above</li>
        <li>Safari should show the Apple Wallet "Add Pass" sheet</li>
        <li>If it says "pass is invalid", the signing needs fixing</li>
        <li>If it works, tap "Add" to save it to your Wallet</li>
      </ol>
    </div>

    <div class="card" style="padding: 16px;">
      <div class="label">Other ways to test</div>
      <ul class="instructions">
        <li><strong>Email:</strong> Email the .pkpass file to yourself, open attachment on iPhone</li>
        <li><strong>AirDrop:</strong> AirDrop the .pkpass file to your iPhone</li>
        <li><strong>iMessage:</strong> Send the .pkpass to yourself via iMessage</li>
      </ul>
    </div>

    ${passReady && result.debugLog ? `
    <details>
      <summary style="cursor:pointer; color: rgba(255,255,255,0.5); font-size: 13px; margin-top: 16px;">Debug Log (${result.debugLog.length} entries)</summary>
      <div class="debug">${result.debugLog.join('\\n')}</div>
    </details>
    ` : ''}
  </div>
</body>
</html>`);
    } catch (error: any) {
      res.status(500).send("Error: " + error.message);
    }
  });

  app.get("/api/passport/wallet/test-debug", async (req, res) => {
    try {
      const apiKey = req.query.key;
      if (!apiKey || apiKey !== process.env.PUSH_ADMIN_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { generateTestPassDirect } = await import("./walletPassGenerator");
      const result = await generateTestPassDirect();

      if ("error" in result) {
        return res.json({ success: false, error: result.error, debugLog: result.debugLog });
      }

      res.json({
        success: true,
        passSize: result.buffer.length,
        passSizeKb: (result.buffer.length / 1024).toFixed(2) + " KB",
        passBase64Preview: result.buffer.subarray(0, 100).toString("base64"),
        debugLog: result.debugLog,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/passport/wallet/test", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"];
      if (!apiKey || apiKey !== process.env.PUSH_ADMIN_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { generateAppleWalletPass } = await import("./walletPassGenerator");
      const testData = {
        ownerEmail: "test@bladeoutboards.com",
        ownerId: "test-user-001",
        serialNumber: "BLD-TEST-001",
        purchaseDate: "2025-01-15",
        warrantyExpires: "2027-01-15",
        productName: "Blade Halo 6",
        maxPower: "3000W",
        batteryCapacity: "1700Wh",
      };
      const result = await generateAppleWalletPass(testData);
      if ("error" in result) {
        return res.json({ success: false, error: result.error });
      }
      res.json({
        success: true,
        passSize: result.buffer.length,
        message: "Pass generated successfully",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/passport/wallet/apple", async (req, res) => {
    try {
      const passportData = req.body;
      console.log("[Apple Wallet] POST /api/passport/wallet/apple - serial:", passportData?.serialNumber, "owner:", passportData?.ownerEmail);

      if (!passportData || !passportData.ownerEmail) {
        return res.status(400).json({ error: "Passport data is required" });
      }

      const { generateAppleWalletPass, getWalletDebugLog } = await import("./walletPassGenerator");
      const result = await generateAppleWalletPass(passportData);

      if ("error" in result) {
        console.log("[Apple Wallet] Pass generation failed, falling back to PDF:", result.error);
        const pdfBuffer = await generatePassportPDFBuffer(passportData);
        const filename = `blade-passport-${passportData.serialNumber || 'unknown'}.pdf`;
        const downloadId = randomUUID();
        pendingDownloads.set(downloadId, {
          buffer: pdfBuffer,
          mimeType: "application/pdf",
          filename,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return res.json({
          success: true,
          type: "pdf_fallback",
          message: result.error,
          downloadPath: `/api/passport/download/${downloadId}`,
          filename,
          passSize: pdfBuffer.length,
          serverDebug: getWalletDebugLog().slice(-20),
        });
      }

      const filename = `blade-passport-${passportData.serialNumber || 'unknown'}.pkpass`;
      const downloadId = randomUUID();
      console.log("[Apple Wallet] Pass generated successfully:", result.buffer.length, "bytes, downloadId:", downloadId);

      pendingDownloads.set(downloadId, {
        buffer: result.buffer,
        mimeType: "application/vnd.apple.pkpass",
        filename,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      res.json({
        success: true,
        type: "pkpass",
        downloadPath: `/api/passport/download/${downloadId}`,
        filename,
        passSize: result.buffer.length,
      });
    } catch (error: any) {
      console.error("[Apple Wallet] Error:", error);
      res.status(500).json({ error: `Failed to generate wallet pass: ${error.message}` });
    }
  });

  app.post("/api/passport/wallet/google", async (req, res) => {
    try {
      const passportData = req.body;
      if (!passportData || !passportData.ownerEmail) {
        return res.status(400).json({ error: "Passport data is required" });
      }

      const { generateGoogleWalletUrl } = await import("./walletPassGenerator");
      const result = await generateGoogleWalletUrl(passportData);

      if ("error" in result) {
        const pdfBuffer = await generatePassportPDFBuffer(passportData);
        const base64 = pdfBuffer.toString('base64');
        return res.json({
          success: true,
          type: 'pdf_fallback',
          message: result.error,
          data: base64,
          filename: `blade-passport-${passportData.serialNumber || 'unknown'}.pdf`
        });
      }

      res.json({
        success: true,
        type: 'google_wallet',
        url: result.url
      });
    } catch (error) {
      console.error("[Google Wallet] Error:", error);
      res.status(500).json({ error: "Failed to generate wallet pass" });
    }
  });

  app.get("/api/passport/download/:id", (req, res) => {
    const downloadId = req.params.id;
    console.log(`[Download] GET /api/passport/download/${downloadId}`);
    console.log(`[Download] Pending downloads count: ${pendingDownloads.size}`);

    const entry = pendingDownloads.get(downloadId);
    if (!entry) {
      console.log(`[Download] ID ${downloadId} not found in pending downloads`);
      return res.status(404).json({ error: "Download not found" });
    }
    if (entry.expiresAt < Date.now()) {
      console.log(`[Download] ID ${downloadId} expired (expired ${Math.round((Date.now() - entry.expiresAt) / 1000)}s ago)`);
      pendingDownloads.delete(downloadId);
      return res.status(404).json({ error: "Download expired" });
    }

    console.log(`[Download] Serving ${entry.filename} (${entry.buffer.length} bytes, ${entry.mimeType})`);

    res.removeHeader("X-Powered-By");
    res.setHeader("Content-Type", entry.mimeType);
    res.setHeader("Content-Length", entry.buffer.length.toString());
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (entry.mimeType === "application/vnd.apple.pkpass") {
      res.setHeader("Content-Disposition", `inline; filename="${entry.filename}"`);
      res.setHeader("Content-Transfer-Encoding", "binary");
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${entry.filename}"`);
    }

    res.end(entry.buffer);
    console.log(`[Download] Sent ${entry.buffer.length} bytes for ${downloadId}`);

    setTimeout(() => {
      pendingDownloads.delete(downloadId);
      console.log(`[Download] Cleaned up ${downloadId}`);
    }, 60000);
  });

  app.post("/api/auth/welcome-email", generalApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const { sendWelcomeEmail } = await import("./emailService");
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Missing email address." });
      }

      const result = await sendWelcomeEmail({ recipientEmail: email });

      if (result.success) {
        res.json({ success: true });
      } else {
        console.error("[Welcome Email] Failed:", result.error);
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error("[Welcome Email] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to send welcome email." });
    }
  });

  // Warranty registration - save to Firestore
  app.post("/api/warranty/register", generalApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const data = warrantyRegistrationSchema.parse(req.body);
      const firestoreDb = getWarrantyFirestore();
      const warrantiesCol = collection(firestoreDb, "warranties");
      
      // Check if warranty already exists for this serial + user
      const existingQuery = query(
        warrantiesCol,
        where("firebaseUid", "==", data.firebaseUid),
        where("serialNumber", "==", data.serialNumber.toUpperCase())
      );
      const existingSnap = await getDocs(existingQuery);
      
      const warrantyData = {
        firebaseUid: data.firebaseUid,
        serialNumber: data.serialNumber.toUpperCase(),
        purchaseDate: data.purchaseDate,
        dealerName: data.dealerName || "",
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber || "",
        email: data.email,
        country: data.country || "",
        receiptPhotoBase64: data.receiptPhotoBase64 || null,
        termsAccepted: data.termsAccepted ?? true,
        status: "approved",
        warrantyStartDate: data.purchaseDate,
        warrantyExpirationDate: calculateWarrantyExpirationServer(data.purchaseDate, data.country || ""),
      };
      
      if (!existingSnap.empty) {
        // Update existing
        const existingDoc = existingSnap.docs[0];
        await updateDoc(existingDoc.ref, {
          ...warrantyData,
          updatedAt: serverTimestamp(),
        });
        return res.json({ success: true, warranty: { id: existingDoc.id, ...warrantyData } });
      }
      
      // Create new
      const newDocRef = await addDoc(warrantiesCol, {
        ...warrantyData,
        registeredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      res.json({ success: true, warranty: { id: newDocRef.id, ...warrantyData } });
    } catch (error: any) {
      console.error("[Warranty API] Registration error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ success: false, error: "Invalid warranty data." });
      }
      res.status(500).json({ success: false, error: "Failed to register warranty." });
    }
  });

  app.get("/api/warranty/by-serial/:serialNumber", generalApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const serialNumber = req.params.serialNumber as string;
      const firestoreDb = getWarrantyFirestore();
      const warrantiesCol = collection(firestoreDb, "warranties");
      
      const q = query(warrantiesCol, where("serialNumber", "==", serialNumber.toUpperCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const w = { id: snap.docs[0].id, ...snap.docs[0].data() };
        return res.json({ found: true, warranty: w });
      }
      return res.json({ found: false, warranty: null });
    } catch (error) {
      console.error("[Warranty API] Lookup by serial error:", error);
      res.status(500).json({ found: false, warranty: null, error: "Failed to look up warranty." });
    }
  });

  // Get warranty data for a user
  app.get("/api/warranty/:firebaseUid", generalApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const { firebaseUid } = req.params;
      const { serialNumber } = req.query;
      const firestoreDb = getWarrantyFirestore();
      const warrantiesCol = collection(firestoreDb, "warranties");
      
      if (serialNumber && typeof serialNumber === "string") {
        const q = query(
          warrantiesCol,
          where("firebaseUid", "==", firebaseUid),
          where("serialNumber", "==", serialNumber.toUpperCase())
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docData = snap.docs[0];
          return res.json({ warranty: { id: docData.id, ...docData.data() } });
        }
        return res.json({ warranty: null });
      }
      
      const q = query(warrantiesCol, where("firebaseUid", "==", firebaseUid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0];
        return res.json({ warranty: { id: docData.id, ...docData.data() } });
      }
      return res.json({ warranty: null });
    } catch (error) {
      console.error("[Warranty API] Get error:", error);
      res.status(500).json({ warranty: null, error: "Failed to get warranty data." });
    }
  });

  // Get all warranties for a user
  app.get("/api/warranties/:firebaseUid", generalApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const { firebaseUid } = req.params;
      const firestoreDb = getWarrantyFirestore();
      const warrantiesCol = collection(firestoreDb, "warranties");
      
      const q = query(warrantiesCol, where("firebaseUid", "==", firebaseUid));
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.json({ warranties: results });
    } catch (error) {
      console.error("[Warranty API] Get all error:", error);
      res.status(500).json({ warranties: [], error: "Failed to get warranties." });
    }
  });

  // Warranty confirmation email endpoint
  app.post("/api/warranty/send-confirmation", generalApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const { generateWarrantyRegistrationNumber, sendWarrantyConfirmationEmail } = await import("./emailService");

      const { recipientEmail, firstName, lastName, serialNumber, purchaseDate, dealerName, warrantyStartDate, warrantyExpirationDate, country } = req.body;

      if (!recipientEmail || !firstName || !lastName || !serialNumber || !purchaseDate) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      const registrationNumber = generateWarrantyRegistrationNumber();

      const result = await sendWarrantyConfirmationEmail({
        recipientEmail,
        firstName,
        lastName,
        serialNumber,
        registrationNumber,
        purchaseDate,
        dealerName,
        warrantyStartDate: warrantyStartDate || purchaseDate,
        warrantyExpirationDate: warrantyExpirationDate || "",
        country: country || "Unknown",
      });

      if (result.success) {
        res.json({ success: true, registrationNumber });
      } else {
        console.error("[Warranty Email] Failed:", result.error);
        res.status(500).json({ success: false, error: result.error, registrationNumber });
      }
    } catch (error: any) {
      console.error("[Warranty Email] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to send confirmation email." });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
