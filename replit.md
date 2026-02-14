# Blade Outboards Mobile App

## Overview
Blade Outboards is a cross-platform mobile application (iOS, Android, Web) designed for monitoring and managing electric outboard motors. It offers real-time telemetry, anti-theft GPS tracking, firmware update management, and push notifications. The application is specifically engineered for marine environments with intermittent connectivity, aiming to provide a premium, robust solution for enhanced safety and control for users of electric outboards.

## User Preferences
Preferred communication style: Simple, everyday language.
Design aesthetic: iOS-style light gray theme with translucent white cards, green accents (#34C759), and high-contrast text optimized for outdoor marine environments.

## System Architecture

### Frontend
- **Framework**: Expo SDK with React Native for cross-platform development.
- **Navigation**: React Navigation.
- **State Management**: React Context for local state, TanStack React Query for server state.
- **Styling**: Custom theming with light/dark mode, Reanimated for animations, and Expo Linear Gradient for visual effects.
- **UI/UX Decisions**: iOS-style light gray interface with specific color codes for backgrounds, translucent cards, borders, and text, optimized for outdoor visibility in marine environments.
- **Key Features**: User authentication, real-time data dashboard, GPS tracking with trip recording and export, OTA firmware updates, device settings management, BLE motor pairing, anti-theft functionality, custom STM32 bootloader flashing, Live Activities/Persistent Notifications for telemetry, Digital Outboard Passport (ownership certificate with QR code, PDF export, Wallet integration), Apple Watch companion app, Android Wear OS companion app, range estimator (10s avg consumption), trip auto-resume after crash, shareable trip summary card image, and optional country picker on signup.

### Android Wear OS Companion App (Added Feb 2026)
- **Location**: `android-wear-app/` — standalone project, built separately in Android Studio (NOT bundled with Expo).
- **Language/Framework**: Kotlin + Jetpack Compose for Wear OS.
- **Min SDK**: Wear OS 3.0+ (API 30), compileSdk 34.
- **Architecture**: MotorState singleton (StateFlow) for shared reactive state between DataLayerListenerService and UI.
- **Communication**: Google Wearable Data Layer API for phone-watch data sync. DataLayerListenerService extends WearableListenerService.
- **Data Paths**: `/blade/telemetry` (speed, battery, power), `/blade/motor-status` (connection, serial, name), `/blade/trip-status` (active, elapsed, start time), `/blade/trip-command` (start/stop commands sent to phone).
- **Screens**: 3 swipeable pages via HorizontalPager — HomeScreen (connection status, logo, motor name, serial), TelemetryScreen (speed knots, battery %, power kW), TripScreen (timer HH:MM:SS, recording indicator, start/stop button).
- **Theme**: BladeWearTheme with BladeColors matching iOS dark navy (#0A1628) background, marine (#0A4D6E) accents, sage green (#A4D08B) highlights.
- **Build**: Open `android-wear-app/` in Android Studio, sync Gradle, build/deploy to Wear OS device or emulator.
- **EAS Exclusion**: `.easignore` excludes `android-wear-app/` from Expo EAS builds.

### Factory Testing App (Added Feb 2026)
- **Location**: `factory-app/` — standalone Expo project, completely separate from main customer app.
- **Bundle Identifier**: `com.bladefactory.app` (iOS and Android).
- **Purpose**: Manufacturing testing app for Blade outboard motors. 8-step factory checklist with BLE/Bluetooth Classic commands, GPS verification, firmware validation, MQTT/4G connectivity check, and PDF report generation.
- **Languages**: English (US), Chinese (Simplified), Vietnamese — full i18n translations.
- **Theme**: Light theme with factory/manufacturing aesthetic. Green (#34C759) pass / Red (#FF3B30) fail indicators.
- **No Login**: Captures operator first/last name only, no auth required.
- **No Watch/Live Activities**: Standalone phone-only app.
- **Firmware Update**: Custom FOTA v2.0 firmware flashing via FirmwareUpdateModal. Supports both BLE and Bluetooth Classic transports. Auto-detects connection type. File picker for .hex and .bin files. Full OTA console log with progress tracking. Files: `factory-app/src/lib/firmware-ota-service.ts`, `factory-app/src/lib/hex-parser.ts`, `factory-app/src/components/FirmwareUpdateModal.tsx`.
- **8 Checklist Steps**: Set Serial Number, Set Device Name (HALO3/6/10), Check BLE Data Integrity, Check GPS Coordinates (50m threshold), Set Dethrottle 100%, Display Firmware Version (double confirm), Reset Odometer, MQTT/4G Firestore Check.
- **BLE Commands**: `$APP_CONFIG,WRITE_SN,{sn}`, `$APP_CONFIG,WRITE_NAME,{name}`, `$APP_CONFIG,MAX_THROTTLE,100`, `$APP_CONFIG,ODOMETER,0`.
- **INFOR G1 Extended Format**: `$INFOR,G1,firmwareVersion,serialNumber,deviceName` (deviceName is HALO3/HALO6/HALO10).
- **PDF Report**: Generated via expo-print with operator info, checklist results, timestamps, location data.
- **Firebase**: Uses same Firestore config as main app for MQTT telemetry check (collection group query on "telemetry").
- **EAS Exclusion**: `.easignore` in root excludes `factory-app/` from main app builds. Factory app's own `.easignore` excludes root project directories.
- **Build**: Open `factory-app/` as separate project in EAS or Xcode. Run `eas init` to set project ID, then `eas build`.

### Backend
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **API Pattern**: RESTful.

### Core Design Patterns
- **Shared Schema**: Database schemas and validation types are shared between client and server for consistency.
- **Platform-Specific Files**: Utilizes `.native.tsx` and `.web.tsx` for platform-specific code implementation.
- **Marine-First Design**: UI and functionalities are optimized for challenging marine conditions.
- **User-Motor Linking**: Motors are securely linked to user accounts for enhanced security and data management.

### Data Flow & Protocols
- **Telemetry**: Real-time data transmitted at 2 Hz via Bluetooth Classic serial frames.
- **Firmware OTA (FOTA v2.0)**: Uses HALO FOTA v2.0 protocol. Enter bootloader via `$APP_CONFIG,UPDATE_FW` software command. Flow: HELLO (0x7F) → FW_INFO (0x10, start=0x08004000) → ERASE (0x43) → WRITE (0x31, 256-byte blocks) → GOTOAPP (0x21). Supports .bin and .hex files. ACK=0x79, NACK=0x1F. Bootloader entry includes RX buffer drain, 2500ms reset delay, 1500ms init delay, and auto-retry of UPDATE_FW on attempt 3 of 5.
- **Offline Support**: Trip data is recorded locally using AsyncStorage for intermittent connectivity.
- **Anti-Theft Location**: Motors report GPS hourly via cellular for up to 30 days post-power-off, integrating with Firestore for location tracking.
- **Bluetooth Platform Support**: Full BLE support across iOS and Android, with Bluetooth Classic support only on Android. Web platform provides a mock mode without real Bluetooth functionality. BLE and Classic scan results are filtered by device name. Serial number validation is implemented for anti-theft motor binding.

### PDF Generation
- Server-side PDF generation using PDFKit for professional engineering-style trip reports, including detailed data, graphs, and system information.

### Trip Recording System
- **Storage**: Trips are stored locally in AsyncStorage with comprehensive metadata, logging telemetry data points at 4-second intervals.
- **Data Points**: Records phone GPS, outboard GPS, battery status, consumption, RPM, temperatures, throttle, and drive mode.
- **Validation**: Includes rules for minimum trip duration, maximum trip limit, and inactivity timeouts.
- **Demo Mode**: Supports web-based demo mode without requiring a physical motor connection.

### Critical: Motor Serial Number Flow
Manages motor identification from initial Bluetooth MAC address to actual serial number from INFOR G1 frame for anti-theft registration and accurate trip recording, with fallbacks for location lookups.

### Push Notification System
- **Dual-Transport Architecture**: iOS uses direct APNs for Xcode builds; Android uses Expo Push API for EAS builds.
- **Categories**: Supports news/promotions, service/warranty reminders, and motor-specific notifications.

### Resilience & Error Handling (Added Feb 2026)
- **Global Error Handler** (`client/lib/error-handler.ts`): Catches unhandled JS errors via `ErrorUtils.setGlobalHandler` (native) and `window.addEventListener('unhandledrejection')` (web). Non-fatal errors are logged without crashing.
- **Error Message Sanitization**: `sanitizeErrorMessage()` maps internal errors to user-friendly messages (network, auth, BLE, HTTP status codes).
- **Network Retry Logic** (`client/lib/query-client.ts`): Exponential backoff retry (1s → 2s → 4s, max 10s). Queries retry up to 2x, mutations 1x. 4xx client errors are never retried. 30-second AbortController timeout on all API requests. `networkMode: 'online'` prevents offline queries.
- **BLE Auto-Reconnect** (`client/lib/ble-service.ts`): On unexpected disconnect, auto-reconnects up to 3 attempts with delays of 3s, 6s, 12s. Manual disconnects skip reconnection. `cancelAutoReconnect()` exported for external control.
- **Auth State Sync** (`client/context/UserContext.tsx`): When app returns to foreground, validates Firebase auth. If Firebase reports no user but a stale stored session exists, clears it to prevent phantom auth state.
- **Motor Foreground Check** (`client/context/MotorContext.tsx`): On app foreground return, checks actual BLE/Classic connection state. If both disconnected, updates motor state and clears telemetry to prevent stale UI.

### Security & Rate Limiting (Added Feb 2026)
- **Rate Limiting Middleware** (`server/rateLimiter.ts`): In-memory Map-based rate limiting with automatic cleanup.
  - Login: 5 failures per 15 min per IP (15-min block), 10 failures per hour (30-min block). Brute force protection per email (10 failures = 30-min lock).
  - Registration: 3 attempts per 10 min per IP.
  - Motor linking: 1 request per 10 seconds per userId.
  - General API: 100 requests per minute per IP.
- **Client-Side Rate Limiting**: Boat data saves throttled to 1 per 30 seconds (`client/lib/firebase.ts`).
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy.
- **CORS**: Explicitly lists allowed headers including Authorization, x-api-key, expo-platform.
- **Body Size Limits**: JSON reduced to 10mb, URL-encoded to 1mb (from 50mb).
- **Auth Logging**: PINs are no longer logged in auth.log (only email and success/failure).

## External Dependencies

### Database
- **PostgreSQL**: Main relational database.
- **Drizzle ORM**: Object-relational mapper for database interaction.

### Mobile Services
- **Expo Location**: For GPS tracking functionalities.
- **Expo Notifications**: For delivering push notifications.
- **React Native Maps**: For map visualization and interaction.
- **AsyncStorage**: For local data persistence on devices.
- **Expo Linear Gradient**: For implementing linear gradient UI effects.
- **react-native-ble-plx**: For Bluetooth Low Energy (BLE) communication.
- **react-native-bluetooth-classic**: For Bluetooth Classic communication (Android only).
- **Firebase Firestore**: Used for anti-theft location tracking and storing registered motor data.
- **Firebase Authentication**: For user authentication with email/password and PIN.

### Build & Development
- **Expo**: Managed workflow for cross-platform application builds.
- **Metro Bundler**: JavaScript bundler for React Native.
- **Drizzle Kit**: For database schema migrations.

### Third-Party APIs
- **OpenStreetMap-based Leaflet.js**: Integrated for map visualization within the application.