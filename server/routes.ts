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
} from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

const LOG_DIR = join(process.cwd(), "logs");
const AUTH_LOG_FILE = join(LOG_DIR, "auth.log");

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

  const httpServer = createServer(app);

  return httpServer;
}
