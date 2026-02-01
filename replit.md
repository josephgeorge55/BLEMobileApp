# Blade Outboards Mobile App

## Overview
Blade Outboards is a cross-platform mobile application (iOS, Android, Web) designed for monitoring and managing electric outboard motors. It provides real-time telemetry, anti-theft GPS tracking, firmware update management, and push notifications, specifically engineered for marine environments with intermittent connectivity. The project aims to offer a premium, robust solution for electric outboard motor management.

## User Preferences
Preferred communication style: Simple, everyday language.
Design aesthetic: Premium DJI-style with high-contrast design optimized for outdoor marine environments.

## System Architecture
The application comprises an Expo/React Native mobile client and an Express.js backend API, communicating via REST endpoints and utilizing BLE (Bluetooth Low Energy) for interaction with physical outboard motors.

### Frontend
- **Framework**: Expo SDK with React Native
- **Navigation**: React Navigation (native stack, bottom tab navigators)
- **State Management**: React Context (local state), TanStack React Query (server state)
- **Styling**: Custom theming with light/dark mode, Reanimated for animations, Expo Linear Gradient
- **UI/UX Decisions**: High-contrast interface, deep ocean blue palette, optimized for outdoor visibility.
- **Key Features**:
    - **Authentication**: Email and 6-digit PIN.
    - **Dashboard**: Real-time telemetry (speed, battery, power).
    - **Location**: GPS tracking, map visualization (OpenStreetMap-based Leaflet.js).
    - **My Trips**: Recording, history, PDF export, route visualization.
    - **Updates**: OTA firmware management.
    - **Settings**: Device management, user account, notifications.
    - **BLE Scanner**: Bluetooth device discovery and motor pairing.
    - **Anti-Theft**: Motor-to-user account linking, extended GPS tracking.
    - **Custom Firmware Update**: In-app .hex firmware flashing via Bluetooth OTA using a custom STM32 bootloader protocol.

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API Pattern**: RESTful, structured for motor-specific and authentication endpoints.

### Core Design Patterns
- **Shared Schema**: Database schemas and validation types (`shared/schema.ts`) are shared between client and server.
- **Platform-Specific Files**: Uses `.native.tsx` and `.web.tsx` for platform-specific implementations.
- **Marine-First Design**: UI optimized for marine conditions.
- **User-Motor Linking**: Motors are linked to user accounts for security.

### Data Flow & Protocols
- **Telemetry**: Real-time data reported at 2 Hz via Bluetooth Classic serial frames (GNSS, BMS, MOTOR, VESC, INFOR frame types).
- **Firmware OTA**: Specific STM32 bootloader protocol commands for flashing firmware.
- **Offline Support**: Trip data recorded locally and synced when connectivity is restored.
- **Anti-Theft Location**: Motors report GPS hourly via cellular for up to 30 days post-power-off.
- **Firestore Integration**: Used for fetching latest GPS coordinates when not connected via Bluetooth, leveraging collection group queries.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database access.

### Mobile Services
- **Expo Location**: GPS tracking.
- **Expo Notifications**: Push notification delivery.
- **React Native Maps**: Native map rendering.
- **AsyncStorage**: Local data persistence.
- **Expo Linear Gradient**: UI effects.
- **react-native-ble-plx**: Bluetooth Low Energy support (requires custom native build).

### Build & Development
- **Expo**: Managed workflow for cross-platform builds.
- **Metro Bundler**: JavaScript bundler.
- **Drizzle Kit**: Database migrations.

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `EXPO_PUBLIC_DOMAIN`: API server domain.