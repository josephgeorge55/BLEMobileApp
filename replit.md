# Blade Outboards Mobile App

## Overview

Blade Outboards is a cross-platform mobile application (iOS, Android, Web) for monitoring and managing electric outboard motors. The system provides real-time telemetry monitoring, anti-theft GPS tracking, firmware update management, and push notifications for marine environments with intermittent connectivity.

The application consists of an Expo/React Native mobile client and an Express.js backend API, connected via REST endpoints and designed for BLE (Bluetooth Low Energy) communication with physical outboard motors.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Expo SDK 54 with React Native 0.81
- **Navigation**: React Navigation v7 with native stack and bottom tab navigators
- **State Management**: React Context for motor/settings state, TanStack React Query for server state
- **Styling**: Custom theming system with light/dark mode support, Reanimated for animations
- **Path Aliases**: `@/` maps to `./client`, `@shared/` maps to `./shared`

### Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all database tables and Zod validation schemas
- **API Pattern**: RESTful endpoints under `/api/motor/:serialNumber/*`

### Key Design Patterns
- **Shared Schema**: Database schemas and validation types are shared between client and server via the `shared/` directory
- **Platform-Specific Files**: Location screen uses `.native.tsx` and `.web.tsx` suffixes for platform-specific implementations
- **Marine-First Design**: High-contrast UI optimized for outdoor/sunlight visibility with deep ocean blue color palette

### Core Features
1. **Dashboard**: Real-time telemetry display (speed, battery, power consumption)
2. **Location**: GPS tracking with map visualization for anti-theft monitoring
3. **Updates**: OTA firmware management with version targeting
4. **Settings**: Device management and notification preferences
5. **BLE Scanner**: Bluetooth device discovery and motor pairing

### Data Flow
- Motors identified by serial number
- Telemetry reported at 1-5 Hz when connected
- Location data stored with live/historical status
- Push notifications delivered via Expo Push service

## External Dependencies

### Database
- **PostgreSQL**: Primary data store for motors, locations, firmware versions, push tokens, and notifications
- **Drizzle ORM**: Type-safe database access with schema in `shared/schema.ts`

### Mobile Services
- **Expo Location**: GPS tracking for motor position
- **Expo Notifications**: Push notification delivery
- **React Native Maps**: Native map rendering (iOS/Android only)
- **AsyncStorage**: Local persistence for motor and settings data

### Build & Development
- **Expo**: Managed workflow for cross-platform builds
- **Metro Bundler**: React Native JavaScript bundler
- **Drizzle Kit**: Database migrations (`drizzle-kit push`)

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `EXPO_PUBLIC_DOMAIN`: API server domain for client requests
- `REPLIT_DEV_DOMAIN`: Development domain (auto-set in Replit)