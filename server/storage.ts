import {
  motors,
  motorLocations,
  firmwareVersions,
  firmwareEligibility,
  pushTokens,
  notifications,
  telemetryData,
  type Motor,
  type InsertMotor,
  type MotorLocation,
  type InsertLocation,
  type FirmwareVersion,
  type InsertFirmware,
  type PushToken,
  type InsertPushToken,
  type Notification,
  type InsertNotification,
  type Telemetry,
  type InsertTelemetry,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getMotorBySerial(serialNumber: string): Promise<Motor | undefined>;
  createOrUpdateMotor(motor: InsertMotor): Promise<Motor>;
  updateMotorLastSeen(serialNumber: string): Promise<void>;

  getLatestLocation(serialNumber: string): Promise<MotorLocation | undefined>;
  createLocation(location: InsertLocation): Promise<MotorLocation>;

  getFirmwareVersions(): Promise<FirmwareVersion[]>;
  getFirmwareById(id: string): Promise<FirmwareVersion | undefined>;
  createFirmwareVersion(firmware: InsertFirmware): Promise<FirmwareVersion>;
  getAvailableFirmware(
    serialNumber: string,
  ): Promise<FirmwareVersion[]>;

  getPushTokensBySerial(serialNumber: string): Promise<PushToken[]>;
  getAllPushTokens(): Promise<PushToken[]>;
  registerPushToken(token: InsertPushToken): Promise<PushToken>;

  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(serialNumber?: string): Promise<Notification[]>;

  createTelemetry(telemetry: InsertTelemetry): Promise<Telemetry>;
}

export class DatabaseStorage implements IStorage {
  async getMotorBySerial(serialNumber: string): Promise<Motor | undefined> {
    const [motor] = await db
      .select()
      .from(motors)
      .where(eq(motors.serialNumber, serialNumber));
    return motor || undefined;
  }

  async createOrUpdateMotor(motor: InsertMotor): Promise<Motor> {
    const existing = await this.getMotorBySerial(motor.serialNumber!);
    if (existing) {
      const [updated] = await db
        .update(motors)
        .set({ ...motor, lastSeenAt: new Date() })
        .where(eq(motors.serialNumber, motor.serialNumber!))
        .returning();
      return updated;
    }
    const [created] = await db.insert(motors).values(motor).returning();
    return created;
  }

  async updateMotorLastSeen(serialNumber: string): Promise<void> {
    await db
      .update(motors)
      .set({ lastSeenAt: new Date() })
      .where(eq(motors.serialNumber, serialNumber));
  }

  async getLatestLocation(
    serialNumber: string,
  ): Promise<MotorLocation | undefined> {
    const [location] = await db
      .select()
      .from(motorLocations)
      .where(eq(motorLocations.serialNumber, serialNumber))
      .orderBy(desc(motorLocations.timestamp))
      .limit(1);
    return location || undefined;
  }

  async createLocation(location: InsertLocation): Promise<MotorLocation> {
    const [created] = await db
      .insert(motorLocations)
      .values(location)
      .returning();
    return created;
  }

  async getFirmwareVersions(): Promise<FirmwareVersion[]> {
    return db
      .select()
      .from(firmwareVersions)
      .orderBy(desc(firmwareVersions.releaseDate));
  }

  async getFirmwareById(id: string): Promise<FirmwareVersion | undefined> {
    const [firmware] = await db
      .select()
      .from(firmwareVersions)
      .where(eq(firmwareVersions.id, id));
    return firmware || undefined;
  }

  async createFirmwareVersion(
    firmware: InsertFirmware,
  ): Promise<FirmwareVersion> {
    const [created] = await db
      .insert(firmwareVersions)
      .values(firmware)
      .returning();
    return created;
  }

  async getAvailableFirmware(serialNumber: string): Promise<FirmwareVersion[]> {
    const eligible = await db
      .select({
        firmware: firmwareVersions,
      })
      .from(firmwareEligibility)
      .innerJoin(
        firmwareVersions,
        eq(firmwareEligibility.firmwareVersionId, firmwareVersions.id),
      )
      .where(
        and(
          eq(firmwareEligibility.motorSerialNumber, serialNumber),
          eq(firmwareEligibility.isAvailable, true),
        ),
      )
      .orderBy(desc(firmwareVersions.releaseDate));

    if (eligible.length > 0) {
      return eligible.map((e) => e.firmware);
    }

    return db
      .select()
      .from(firmwareVersions)
      .orderBy(desc(firmwareVersions.releaseDate))
      .limit(3);
  }

  async getPushTokensBySerial(serialNumber: string): Promise<PushToken[]> {
    return db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.motorSerialNumber, serialNumber));
  }

  async getAllPushTokens(): Promise<PushToken[]> {
    return db.select().from(pushTokens);
  }

  async registerPushToken(token: InsertPushToken): Promise<PushToken> {
    const existing = await db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.token, token.token!));

    if (existing.length > 0) {
      const [updated] = await db
        .update(pushTokens)
        .set({
          motorSerialNumber: token.motorSerialNumber,
          lastUsedAt: new Date(),
        })
        .where(eq(pushTokens.token, token.token!))
        .returning();
      return updated;
    }

    const [created] = await db.insert(pushTokens).values(token).returning();
    return created;
  }

  async createNotification(
    notification: InsertNotification,
  ): Promise<Notification> {
    const [created] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return created;
  }

  async getNotifications(serialNumber?: string): Promise<Notification[]> {
    if (serialNumber) {
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.targetSerialNumber, serialNumber))
        .orderBy(desc(notifications.sentAt));
    }
    return db.select().from(notifications).orderBy(desc(notifications.sentAt));
  }

  async createTelemetry(telemetry: InsertTelemetry): Promise<Telemetry> {
    const [created] = await db
      .insert(telemetryData)
      .values(telemetry)
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
