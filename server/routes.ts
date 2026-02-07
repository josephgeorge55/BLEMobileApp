import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { storage } from "./storage";
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
} from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { generateTripPDF } from "./pdfGenerator";
import { generatePassportPDF, generatePassportPDFBuffer } from "./passportPdfGenerator";

import { randomUUID } from "node:crypto";

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

function logAuthEvent(event: string, email: string, pin: string, success: boolean) {
  ensureLogDirectory();
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${event} | Email: ${email} | PIN: ${pin} | Success: ${success}\n`;
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

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = createAccountSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(body.email);
      if (existingUser) {
        logAuthEvent("REGISTER_FAILED", body.email, body.pin, false);
        return res.status(400).json({ error: "Email already registered" });
      }

      const user = await storage.createUser({
        email: body.email,
        pin: body.pin,
      });

      logAuthEvent("REGISTER_SUCCESS", body.email, body.pin, true);

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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(body.email);
      if (!user || user.pin !== body.pin) {
        logAuthEvent("LOGIN_FAILED", body.email, body.pin, false);
        return res.status(401).json({ error: "Invalid email or PIN" });
      }

      await storage.updateUserLastLogin(user.id);
      logAuthEvent("LOGIN_SUCCESS", body.email, body.pin, true);

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

  app.post("/api/motors/link", async (req, res) => {
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
      const body = sendNotificationSchema.parse(req.body);

      let tokens: { token: string }[] = [];
      if (body.targetSerialNumber) {
        tokens = await storage.getPushTokensBySerial(body.targetSerialNumber);
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

      console.log(
        `Notification sent to ${tokens.length} devices:`,
        body.title,
      );

      res.json({
        success: true,
        notificationId: notification.id,
        recipientCount: tokens.length,
      });
    } catch (error) {
      handleZodError(error, res);
      console.error("Error sending notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/push-tokens/register", async (req, res) => {
    try {
      const body = registerTokenSchema.parse(req.body);

      const token = await storage.registerPushToken({
        token: body.token,
        motorSerialNumber: body.motorSerialNumber,
        platform: body.platform,
      });

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

  app.post("/api/passport/wallet/apple", async (req, res) => {
    try {
      const passportData = req.body;
      if (!passportData || !passportData.ownerEmail) {
        return res.status(400).json({ error: "Passport data is required" });
      }

      const wantDownloadUrl = req.headers["x-download-mode"] === "native";
      const { generateAppleWalletPass } = await import("./walletPassGenerator");
      const result = await generateAppleWalletPass(passportData);

      if ("error" in result) {
        const pdfBuffer = await generatePassportPDFBuffer(passportData);
        const filename = `blade-passport-${passportData.serialNumber || 'unknown'}.pdf`;
        if (wantDownloadUrl) {
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
          });
        }
        const base64 = pdfBuffer.toString('base64');
        return res.json({
          success: true,
          type: 'pdf_fallback',
          message: result.error,
          data: base64,
          filename,
        });
      }

      const filename = `blade-passport-${passportData.serialNumber || 'unknown'}.pkpass`;
      if (wantDownloadUrl) {
        const downloadId = randomUUID();
        pendingDownloads.set(downloadId, {
          buffer: result.buffer,
          mimeType: "application/vnd.apple.pkpass",
          filename,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return res.json({
          success: true,
          type: "pkpass",
          downloadPath: `/api/passport/download/${downloadId}`,
          filename,
        });
      }

      const base64 = result.buffer.toString('base64');
      res.json({
        success: true,
        type: 'pkpass',
        data: base64,
        filename,
      });
    } catch (error) {
      console.error("[Apple Wallet] Error:", error);
      res.status(500).json({ error: "Failed to generate wallet pass" });
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
    const entry = pendingDownloads.get(req.params.id);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) pendingDownloads.delete(req.params.id);
      return res.status(404).json({ error: "Download expired or not found" });
    }
    pendingDownloads.delete(req.params.id);
    res.setHeader("Content-Type", entry.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${entry.filename}"`);
    res.setHeader("Content-Length", entry.buffer.length.toString());
    res.send(entry.buffer);
  });

  const httpServer = createServer(app);

  return httpServer;
}
