import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  doublePrecision,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  pin: varchar("pin", { length: 6 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const motors = pgTable("motors", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  serialNumber: varchar("serial_number", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  firmwareVersion: varchar("firmware_version", { length: 20 }),
  userId: varchar("user_id").references(() => users.id),
  registeredAt: timestamp("registered_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at"),
});

export const motorLocations = pgTable("motor_locations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  motorId: varchar("motor_id")
    .notNull()
    .references(() => motors.id),
  serialNumber: varchar("serial_number", { length: 50 }).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isLive: boolean("is_live").default(true),
});

export const firmwareVersions = pgTable("firmware_versions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  version: varchar("version", { length: 20 }).notNull().unique(),
  releaseNotes: text("release_notes"),
  fileUrl: varchar("file_url", { length: 500 }),
  fileSize: integer("file_size"),
  isMandatory: boolean("is_mandatory").default(false),
  releaseDate: timestamp("release_date").defaultNow(),
  minCompatibleVersion: varchar("min_compatible_version", { length: 20 }),
});

export const firmwareEligibility = pgTable("firmware_eligibility", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  motorSerialNumber: varchar("motor_serial_number", { length: 50 }).notNull(),
  firmwareVersionId: varchar("firmware_version_id")
    .notNull()
    .references(() => firmwareVersions.id),
  isAvailable: boolean("is_available").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pushTokens = pgTable("push_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  motorSerialNumber: varchar("motor_serial_number", { length: 50 }),
  platform: varchar("platform", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  data: text("data"),
  targetSerialNumber: varchar("target_serial_number", { length: 50 }),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("pending"),
});

export const telemetryData = pgTable("telemetry_data", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  motorSerialNumber: varchar("motor_serial_number", { length: 50 }).notNull(),
  speed: doublePrecision("speed"),
  stateOfCharge: doublePrecision("state_of_charge"),
  powerConsumption: doublePrecision("power_consumption"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = z.infer<typeof selectUserSchema>;

export const insertMotorSchema = createInsertSchema(motors);
export const selectMotorSchema = createSelectSchema(motors);
export type InsertMotor = z.infer<typeof insertMotorSchema>;
export type Motor = z.infer<typeof selectMotorSchema>;

export const insertLocationSchema = createInsertSchema(motorLocations);
export const selectLocationSchema = createSelectSchema(motorLocations);
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type MotorLocation = z.infer<typeof selectLocationSchema>;

export const insertFirmwareSchema = createInsertSchema(firmwareVersions);
export const selectFirmwareSchema = createSelectSchema(firmwareVersions);
export type InsertFirmware = z.infer<typeof insertFirmwareSchema>;
export type FirmwareVersion = z.infer<typeof selectFirmwareSchema>;

export const insertPushTokenSchema = createInsertSchema(pushTokens);
export const selectPushTokenSchema = createSelectSchema(pushTokens);
export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type PushToken = z.infer<typeof selectPushTokenSchema>;

export const insertNotificationSchema = createInsertSchema(notifications);
export const selectNotificationSchema = createSelectSchema(notifications);
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = z.infer<typeof selectNotificationSchema>;

export const insertTelemetrySchema = createInsertSchema(telemetryData);
export const selectTelemetrySchema = createSelectSchema(telemetryData);
export type InsertTelemetry = z.infer<typeof insertTelemetrySchema>;
export type Telemetry = z.infer<typeof selectTelemetrySchema>;

export const locationReportSchema = z.object({
  serialNumber: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().optional(),
  heading: z.number().optional(),
});

export const firmwareCheckSchema = z.object({
  serialNumber: z.string().min(1),
  currentVersion: z.string().optional(),
});

export const sendNotificationSchema = z.object({
  type: z.enum([
    "maintenance",
    "firmware",
    "service",
    "announcement",
    "promotion",
  ]),
  title: z.string().min(1),
  body: z.string().min(1),
  targetSerialNumber: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

export const registerTokenSchema = z.object({
  token: z.string().min(1),
  motorSerialNumber: z.string().optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

export const telemetryReportSchema = z.object({
  serialNumber: z.string().min(1),
  speed: z.number().optional(),
  stateOfCharge: z.number().min(0).max(100).optional(),
  powerConsumption: z.number().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const createAccountSchema = z.object({
  email: z.string().email(),
  pin: z.string().length(6).regex(/^\d{6}$/, "PIN must be 6 digits"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  pin: z.string().length(6),
});

export const linkMotorSchema = z.object({
  serialNumber: z.string().min(1),
  userId: z.string().min(1),
});

export type LocationReport = z.infer<typeof locationReportSchema>;
export type FirmwareCheck = z.infer<typeof firmwareCheckSchema>;
export type SendNotification = z.infer<typeof sendNotificationSchema>;
export type RegisterToken = z.infer<typeof registerTokenSchema>;
export type TelemetryReport = z.infer<typeof telemetryReportSchema>;
export type CreateAccount = z.infer<typeof createAccountSchema>;
export type Login = z.infer<typeof loginSchema>;
export type LinkMotor = z.infer<typeof linkMotorSchema>;
