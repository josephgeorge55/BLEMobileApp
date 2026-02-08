import {
  users,
  motors,
  motorLocations,
  firmwareVersions,
  firmwareEligibility,
  pushTokens,
  notifications,
  telemetryData,
  trips,
  tripDataPoints,
  type User,
  type InsertUser,
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
  type Trip,
  type InsertTrip,
  type TripDataPoint,
  type InsertTripDataPoint,
} from "@shared/schema";
import { db } from "./db";
import { eq, ne, desc, and, sql, asc } from "drizzle-orm";

export interface IStorage {
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLastLogin(userId: string): Promise<void>;

  getMotorBySerial(serialNumber: string): Promise<Motor | undefined>;
  getMotorsByUserId(userId: string): Promise<Motor[]>;
  createOrUpdateMotor(motor: InsertMotor): Promise<Motor>;
  updateMotorLastSeen(serialNumber: string): Promise<void>;
  linkMotorToUser(serialNumber: string, userId: string): Promise<Motor | undefined>;

  getLatestLocation(serialNumber: string): Promise<MotorLocation | undefined>;
  createLocation(location: InsertLocation): Promise<MotorLocation>;

  getFirmwareVersions(): Promise<FirmwareVersion[]>;
  getFirmwareById(id: string): Promise<FirmwareVersion | undefined>;
  createFirmwareVersion(firmware: InsertFirmware): Promise<FirmwareVersion>;
  getAvailableFirmware(
    serialNumber: string,
  ): Promise<FirmwareVersion[]>;

  getPushTokensBySerial(serialNumber: string): Promise<PushToken[]>;
  getPushTokensByUserId(userId: string): Promise<PushToken[]>;
  getPushTokensForNews(): Promise<PushToken[]>;
  getPushTokensForService(): Promise<PushToken[]>;
  getPushTokensForMotor(serialNumber: string): Promise<PushToken[]>;
  getAllPushTokens(): Promise<PushToken[]>;
  registerPushToken(token: InsertPushToken): Promise<PushToken>;
  updatePushTokenPreferences(token: string, prefs: { notifNews?: boolean; notifService?: boolean; notifMotor?: boolean }): Promise<PushToken | undefined>;
  removePushToken(token: string): Promise<void>;

  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(serialNumber?: string): Promise<Notification[]>;

  createTelemetry(telemetry: InsertTelemetry): Promise<Telemetry>;

  createTrip(trip: InsertTrip): Promise<Trip>;
  getActiveTrip(userId: string): Promise<Trip | undefined>;
  getTripById(tripId: string): Promise<Trip | undefined>;
  getTripsByUserId(userId: string): Promise<Trip[]>;
  endTrip(tripId: string, data: Partial<InsertTrip>): Promise<Trip | undefined>;
  updateTrip(tripId: string, data: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(tripId: string): Promise<void>;
  
  addTripDataPoint(dataPoint: InsertTripDataPoint): Promise<TripDataPoint>;
  getTripDataPoints(tripId: string): Promise<TripDataPoint[]>;
}

export class DatabaseStorage implements IStorage {
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db
      .insert(users)
      .values({ ...user, email: user.email!.toLowerCase() })
      .returning();
    return created;
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getMotorBySerial(serialNumber: string): Promise<Motor | undefined> {
    const [motor] = await db
      .select()
      .from(motors)
      .where(eq(motors.serialNumber, serialNumber));
    return motor || undefined;
  }

  async getMotorsByUserId(userId: string): Promise<Motor[]> {
    return db
      .select()
      .from(motors)
      .where(eq(motors.userId, userId));
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

  async linkMotorToUser(serialNumber: string, userId: string): Promise<Motor | undefined> {
    const [updated] = await db
      .update(motors)
      .set({ userId })
      .where(eq(motors.serialNumber, serialNumber))
      .returning();
    return updated || undefined;
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

  async getPushTokensByUserId(userId: string): Promise<PushToken[]> {
    return db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));
  }

  async getPushTokensForNews(): Promise<PushToken[]> {
    return db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.notifNews, true));
  }

  async getPushTokensForService(): Promise<PushToken[]> {
    return db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.notifService, true));
  }

  async getPushTokensForMotor(serialNumber: string): Promise<PushToken[]> {
    return db
      .select()
      .from(pushTokens)
      .where(
        and(
          eq(pushTokens.motorSerialNumber, serialNumber),
          eq(pushTokens.notifMotor, true),
        ),
      );
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
          userId: token.userId,
          tokenType: token.tokenType,
          notifNews: token.notifNews,
          notifService: token.notifService,
          notifMotor: token.notifMotor,
          lastUsedAt: new Date(),
        })
        .where(eq(pushTokens.token, token.token!))
        .returning();

      if (token.userId) {
        const deleted = await db
          .delete(pushTokens)
          .where(
            and(
              eq(pushTokens.userId, token.userId),
              ne(pushTokens.token, token.token!),
            ),
          )
          .returning();
        if (deleted.length > 0) {
          console.log(`[Push] Cleaned up ${deleted.length} stale token(s) for user ${token.userId}`);
        }
      }

      return updated;
    }

    if (token.userId) {
      const deleted = await db
        .delete(pushTokens)
        .where(
          and(
            eq(pushTokens.userId, token.userId),
            ne(pushTokens.token, token.token!),
          ),
        )
        .returning();
      if (deleted.length > 0) {
        console.log(`[Push] Cleaned up ${deleted.length} stale token(s) for user ${token.userId}`);
      }
    }

    const [created] = await db.insert(pushTokens).values(token).returning();
    return created;
  }

  async updatePushTokenPreferences(token: string, prefs: { notifNews?: boolean; notifService?: boolean; notifMotor?: boolean }): Promise<PushToken | undefined> {
    const updateData: Record<string, boolean> = {};
    if (prefs.notifNews !== undefined) updateData.notifNews = prefs.notifNews;
    if (prefs.notifService !== undefined) updateData.notifService = prefs.notifService;
    if (prefs.notifMotor !== undefined) updateData.notifMotor = prefs.notifMotor;

    const [updated] = await db
      .update(pushTokens)
      .set(updateData)
      .where(eq(pushTokens.token, token))
      .returning();
    return updated || undefined;
  }

  async removePushToken(token: string): Promise<void> {
    await db.delete(pushTokens).where(eq(pushTokens.token, token));
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

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const [created] = await db.insert(trips).values(trip).returning();
    return created;
  }

  async getActiveTrip(userId: string): Promise<Trip | undefined> {
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.userId, userId), eq(trips.isActive, true)))
      .orderBy(desc(trips.startTime))
      .limit(1);
    return trip || undefined;
  }

  async getTripById(tripId: string): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    return trip || undefined;
  }

  async getTripsByUserId(userId: string): Promise<Trip[]> {
    return db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(desc(trips.startTime));
  }

  async endTrip(tripId: string, data: Partial<InsertTrip>): Promise<Trip | undefined> {
    const [updated] = await db
      .update(trips)
      .set({ ...data, isActive: false, endTime: new Date() })
      .where(eq(trips.id, tripId))
      .returning();
    return updated || undefined;
  }

  async updateTrip(tripId: string, data: Partial<InsertTrip>): Promise<Trip | undefined> {
    const [updated] = await db
      .update(trips)
      .set(data)
      .where(eq(trips.id, tripId))
      .returning();
    return updated || undefined;
  }

  async deleteTrip(tripId: string): Promise<void> {
    await db.delete(tripDataPoints).where(eq(tripDataPoints.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
  }

  async addTripDataPoint(dataPoint: InsertTripDataPoint): Promise<TripDataPoint> {
    const [created] = await db.insert(tripDataPoints).values(dataPoint).returning();
    return created;
  }

  async getTripDataPoints(tripId: string): Promise<TripDataPoint[]> {
    return db
      .select()
      .from(tripDataPoints)
      .where(eq(tripDataPoints.tripId, tripId))
      .orderBy(asc(tripDataPoints.timestamp));
  }
}

export const storage = new DatabaseStorage();
