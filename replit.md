# Blade Outboards Mobile App

## Overview

Blade Outboards is a cross-platform mobile application (iOS, Android, Web) for monitoring and managing electric outboard motors. The system provides real-time telemetry monitoring, anti-theft GPS tracking, firmware update management, and push notifications for marine environments with intermittent connectivity.

The application consists of an Expo/React Native mobile client and an Express.js backend API, connected via REST endpoints and designed for BLE (Bluetooth Low Energy) communication with physical outboard motors.

## User Preferences

Preferred communication style: Simple, everyday language.
Design aesthetic: Premium DJI-style with high-contrast design optimized for outdoor marine environments.

## System Architecture

### Frontend Architecture
- **Framework**: Expo SDK 54 with React Native 0.81
- **Navigation**: React Navigation v7 with native stack and bottom tab navigators
- **State Management**: React Context for motor/settings/user state, TanStack React Query for server state
- **Styling**: Custom theming system with light/dark mode support, Reanimated for animations, expo-linear-gradient for premium effects
- **Path Aliases**: `@/` maps to `./client`, `@shared/` maps to `./shared`

### Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all database tables and Zod validation schemas
- **API Pattern**: RESTful endpoints under `/api/motor/:serialNumber/*` and `/api/auth/*`
- **Auth Logging**: Auth events logged to `logs/auth.log`

### Key Design Patterns
- **Shared Schema**: Database schemas and validation types are shared between client and server via the `shared/` directory
- **Platform-Specific Files**: Location screen uses `.native.tsx` and `.web.tsx` suffixes for platform-specific implementations
- **Marine-First Design**: High-contrast UI optimized for outdoor/sunlight visibility with deep ocean blue color palette
- **User-Motor Linking**: Motors are linked to user accounts via userId for anti-theft protection

### Core Features
1. **Authentication**: User account creation with email and 6-digit PIN, login/logout
2. **Dashboard**: Real-time telemetry display (speed, battery, power consumption)
3. **Location**: GPS tracking with map visualization for anti-theft monitoring
4. **Updates**: OTA firmware management with version targeting
5. **Settings**: Device management, user account info, notification preferences, legal links
6. **BLE Scanner**: Bluetooth device discovery and motor pairing
7. **Anti-Theft**: Motors linked to user accounts for ownership protection

### Data Flow
- Users authenticate with email and 6-digit PIN
- Motors identified by serial number and linked to user accounts
- Telemetry reported at 1-5 Hz when connected
- Location data stored with live/historical status
- Push notifications delivered via Expo Push service

## Database Schema

### Tables
- **users**: User accounts with email, PIN, timestamps
- **motors**: Motor records with serialNumber, userId (for anti-theft), firmware info
- **motor_locations**: GPS location history
- **firmware_versions**: Available firmware updates
- **firmware_eligibility**: Serial-specific firmware targeting
- **push_tokens**: Expo push notification tokens
- **notifications**: Notification history
- **telemetry_data**: Real-time telemetry records

## External Dependencies

### Database
- **PostgreSQL**: Primary data store for users, motors, locations, firmware versions, push tokens, and notifications
- **Drizzle ORM**: Type-safe database access with schema in `shared/schema.ts`

### Mobile Services
- **Expo Location**: GPS tracking for motor position
- **Expo Notifications**: Push notification delivery
- **React Native Maps**: Native map rendering (iOS/Android only)
- **AsyncStorage**: Local persistence for user, motor, and settings data
- **Expo Linear Gradient**: Premium gradient effects

### Build & Development
- **Expo**: Managed workflow for cross-platform builds
- **Metro Bundler**: React Native JavaScript bundler
- **Drizzle Kit**: Database migrations (`drizzle-kit push`)

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `EXPO_PUBLIC_DOMAIN`: API server domain for client requests
- `REPLIT_DEV_DOMAIN`: Development domain (auto-set in Replit)

## Company Information
- **Company**: Blade Marine Technologies Limited
- **Privacy Policy**: https://www.bladeoutboards.com/privacy-policy
- **Terms & Conditions**: https://www.bladeoutboards.com/tandc
