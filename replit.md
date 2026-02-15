# Blade Outboards Mobile App

## Overview
Blade Outboards is a cross-platform mobile application (iOS, Android, Web) designed for monitoring and managing electric outboard motors. It provides real-time telemetry, anti-theft GPS tracking, firmware update management, and push notifications. The application is optimized for marine environments with intermittent connectivity, aiming to deliver a premium, robust solution for enhanced safety and control for users of electric outboards.

## User Preferences
Preferred communication style: Simple, everyday language.
Design aesthetic: iOS-style light gray theme with translucent white cards, green accents (#34C759), and high-contrast text optimized for outdoor marine environments.

## System Architecture

### Frontend
- **Framework**: Expo SDK with React Native.
- **Navigation**: React Navigation.
- **State Management**: React Context for local state, TanStack React Query for server state.
- **Styling**: Custom theming with light/dark mode, Reanimated for animations, Expo Linear Gradient.
- **UI/UX Decisions**: iOS-style light gray interface with specific color codes for backgrounds, translucent cards, borders, and text, optimized for outdoor visibility in marine environments.
- **Key Features**: User authentication, real-time data dashboard, GPS tracking with trip recording and export, OTA firmware updates, device settings management, BLE motor pairing, anti-theft functionality, Live Activities/Persistent Notifications, Digital Outboard Passport, Apple Watch/Android Wear OS companion apps, range estimator, trip auto-resume, shareable trip summary, first-launch onboarding carousel, animated number gauges (AnimatedValue), airport-style flip board telemetry initialization (FlipBoard), haptic feedback patterns for events (sounds.ts), and smooth screen transitions.

### Android Wear OS Companion App
- **Location**: `android-wear-app/` (standalone project).
- **Language/Framework**: Kotlin + Jetpack Compose for Wear OS.
- **Min SDK**: Wear OS 3.0+ (API 30).
- **Architecture**: MotorState singleton (StateFlow) for shared reactive state.
- **Communication**: Google Wearable Data Layer API for phone-watch data sync.
- **Screens**: HomeScreen, TelemetryScreen, TripScreen.
- **Theme**: BladeWearTheme with BladeColors matching iOS dark navy background.

### Factory Testing App
- **Location**: `factory-app/` (standalone Expo project).
- **Purpose**: Manufacturing testing for Blade outboard motors with an 8-step factory checklist, BLE/Bluetooth Classic commands, GPS verification, firmware validation, MQTT/4G connectivity check, and PDF report generation.
- **Languages**: English (US), Chinese (Simplified), Vietnamese.
- **Theme**: Light theme with factory/manufacturing aesthetic, green/red indicators.
- **No Login**: Captures operator name only.
- **Firmware Update**: Custom FOTA v2.0 flashing via FirmwareUpdateModal, supporting BLE and Bluetooth Classic.
- **Checklist Steps**: Set Serial Number, Set Device Name, Check BLE Data Integrity, Check GPS Coordinates, Set Dethrottle 100%, Display Firmware Version, Reset Odometer, MQTT/4G Firestore Check.
- **PDF Report**: Generated via expo-print with operator info, checklist results, timestamps, location data.

### Backend
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **API Pattern**: RESTful.

### Core Design Patterns
- **Shared Schema**: Database schemas and validation types shared between client and server.
- **Platform-Specific Files**: Uses `.native.tsx` and `.web.tsx`.
- **Marine-First Design**: UI and functionalities optimized for marine conditions.
- **User-Motor Linking**: Motors securely linked to user accounts.

### Data Flow & Protocols
- **Telemetry**: Real-time data via Bluetooth Classic serial frames.
- **Firmware OTA (FOTA v2.0)**: HALO FOTA v2.0 protocol for firmware updates. Firmware eligibility tracked in Firestore `firmware_releases` collection.
- **Offline Support**: Trip data recorded locally using AsyncStorage.
- **Anti-Theft Location**: Motors report GPS hourly via cellular for up to 30 days post-power-off.
- **Bluetooth Platform Support**: Full BLE on iOS/Android; Bluetooth Classic on Android only. Web platform provides mock mode.

### PDF Generation
- Server-side PDF generation using PDFKit for professional engineering-style trip reports.

### Trip Recording System
- **Storage**: Trips stored locally in AsyncStorage with telemetry data points.
- **Data Points**: Records phone GPS, outboard GPS, battery status, consumption, RPM, temperatures, throttle, and drive mode.
- **Validation**: Rules for minimum duration, maximum limit, and inactivity timeouts.
- **Demo Mode**: Supports web-based demo mode without physical motor connection.

### Critical: Motor Serial Number Flow
Manages motor identification from Bluetooth MAC to actual serial number for anti-theft registration and trip recording.

### Push Notification System
- **Dual-Transport Architecture**: iOS uses direct APNs; Android uses Expo Push API.
- **Categories**: News/promotions, service/warranty reminders, motor-specific notifications.

### Resilience & Error Handling
- **Global Error Handler**: Catches unhandled JS errors and logs non-fatal errors.
- **Error Message Sanitization**: Maps internal errors to user-friendly messages.
- **Network Retry Logic**: Exponential backoff for retries; 4xx errors not retried.
- **BLE Auto-Reconnect**: Auto-reconnects on unexpected disconnects.
- **Auth State Sync**: Validates Firebase auth on app foreground.
- **Motor Foreground Check**: Checks BLE/Classic connection state and clears stale UI.

### Security & Rate Limiting
- **Rate Limiting Middleware**: In-memory Map-based rate limiting for various endpoints (login, registration, motor linking, general API).
- **Client-Side Rate Limiting**: Boat data saves throttled to 1 per 30 seconds.
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy.
- **CORS**: Explicitly lists allowed headers.
- **Body Size Limits**: Reduced JSON and URL-encoded body size limits.
- **Auth Logging**: PINs are no longer logged.

## External Dependencies

### Database
- **PostgreSQL**: Main relational database.
- **Drizzle ORM**: Object-relational mapper.

### Mobile Services
- **Expo Location**: GPS tracking.
- **Expo Notifications**: Push notifications.
- **React Native Maps**: Map visualization.
- **AsyncStorage**: Local data persistence.
- **Expo Linear Gradient**: UI effects.
- **react-native-ble-plx**: Bluetooth Low Energy (BLE) communication.
- **react-native-bluetooth-classic**: Bluetooth Classic communication (Android only).
- **Firebase Firestore**: Anti-theft location tracking and motor data storage.
- **Firebase Authentication**: User authentication.

### Build & Development
- **Expo**: Cross-platform application builds.
- **Metro Bundler**: JavaScript bundler for React Native.
- **Drizzle Kit**: Database schema migrations.

### Third-Party APIs
- **OpenStreetMap-based Leaflet.js**: Map visualization.