# Blade Outboards Mobile App

## Overview
Blade Outboards is a cross-platform mobile application (iOS, Android, Web) for monitoring and managing electric outboard motors. It provides real-time telemetry, anti-theft GPS tracking, firmware update management, and push notifications, specifically engineered for marine environments with intermittent connectivity. The project aims to offer a premium, robust solution for electric outboard motor management, enhancing safety and control for users of electric outboards.

## User Preferences
Preferred communication style: Simple, everyday language.
Design aesthetic: Premium DJI-style with high-contrast design optimized for outdoor marine environments.

## System Architecture

### Frontend
- **Framework**: Expo SDK with React Native
- **Navigation**: React Navigation
- **State Management**: React Context (local), TanStack React Query (server)
- **Styling**: Custom theming with light/dark mode, Reanimated for animations, Expo Linear Gradient
- **UI/UX Decisions**: High-contrast interface, deep ocean blue palette, optimized for outdoor visibility.
- **Key Features**: Authentication, real-time dashboard, GPS tracking, trip recording and export, OTA firmware updates, device settings, BLE motor pairing, anti-theft functionality, custom STM32 bootloader flashing, and Live Activities/Persistent Notifications for real-time telemetry.

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API Pattern**: RESTful

### Core Design Patterns
- **Shared Schema**: Database schemas and validation types are shared between client and server.
- **Platform-Specific Files**: Uses `.native.tsx` and `.web.tsx` for platform-specific implementations.
- **Marine-First Design**: UI optimized for marine conditions.
- **User-Motor Linking**: Motors are linked to user accounts for security.

### Data Flow & Protocols
- **Telemetry**: Real-time data reported at 2 Hz via Bluetooth Classic serial frames.
- **Firmware OTA**: Specific STM32 bootloader protocol commands for flashing firmware.
- **Offline Support**: Trip data recorded locally using AsyncStorage.
- **Anti-Theft Location**: Motors report GPS hourly via cellular for up to 30 days post-power-off, integrating with Firestore for latest coordinates.

### Bluetooth Platform Support
- **Android**: Full support for both BLE (`react-native-ble-plx`) and Bluetooth Classic (`react-native-bluetooth-classic`).
- **iOS**: Full BLE support via `react-native-ble-plx`; Bluetooth Classic is not supported due to iOS restrictions. Specific implementations for reliable iOS CoreBluetooth compatibility, including CCC descriptor writes and Nordic UART Service (NUS) fallback.
- **Web**: Mock mode only, no real Bluetooth support.

### PDF Generation
- Server-side PDF generation using PDFKit, with custom base64 encoding for React Native compatibility.
- Generates professional engineering-style trip reports including detailed trip data, graphs, and system information.

### Trip Recording System
- **Storage**: Trips are stored locally in AsyncStorage.
- **Telemetry Interval**: 4-second intervals for logging telemetry data points.
- **Data Points**: Records phone GPS, outboard GPS, battery status, consumption, RPM, temperatures, throttle, and drive mode.
- **Validation**: Includes rules for minimum trip duration, maximum trip limit, and inactivity timeouts.
- **Demo Mode**: Supports web-based demo mode without requiring a physical motor connection.

### Critical: Motor Serial Number Flow
Manages motor identification from initial Bluetooth MAC address to actual serial number from INFOR G1 frame for anti-theft registration and accurate trip recording, with fallbacks for location lookups.

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
- **react-native-ble-plx**: Bluetooth Low Energy support.
- **react-native-bluetooth-classic**: Bluetooth Classic support (Android only).
- **Firebase Firestore**: Used for anti-theft location tracking and storing registered motors.
- **Firebase Authentication**: User authentication with email/password and PIN.

### Build & Development
- **Expo**: Managed workflow for cross-platform builds.
- **Metro Bundler**: JavaScript bundler.
- **Drizzle Kit**: Database migrations.

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `EXPO_PUBLIC_DOMAIN`: API server domain.

### Live Activities & Persistent Notifications (EAS Build Only)
- Custom Expo Module with native iOS (Swift) and Android (Kotlin) bridges for real-time telemetry display on Lock Screen, Dynamic Island, and persistent notifications.
- Utilizes ActivityKit on iOS and Foreground Services on Android.

### Third-Party APIs
- **OpenStreetMap-based Leaflet.js**: Map visualization.