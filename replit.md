# Blade Outboards Mobile App

## Overview
Blade Outboards is a cross-platform mobile application (iOS, Android, Web) for monitoring and managing electric outboard motors. It provides real-time telemetry, anti-theft GPS tracking, firmware update management, and push notifications, specifically engineered for marine environments with intermittent connectivity. The project aims to offer a premium, robust solution for electric outboard motor management, enhancing safety and control for users of electric outboards.

## User Preferences
Preferred communication style: Simple, everyday language.
Design aesthetic: iOS-style light gray theme with translucent white cards, green accents (#34C759), and high-contrast text optimized for outdoor marine environments. Moved away from previous dark blue navy theme.

## System Architecture

### Frontend
- **Framework**: Expo SDK with React Native
- **Navigation**: React Navigation
- **State Management**: React Context (local), TanStack React Query (server)
- **Styling**: Custom theming with light/dark mode, Reanimated for animations, Expo Linear Gradient
- **UI/UX Decisions**: iOS-style light gray interface (#F2F2F7 backgrounds, rgba(255,255,255,0.85) translucent cards, rgba(60,60,67,0.12) borders), iOS system colors (#1C1C1E text, #8E8E93 secondary, #34C759 green accent), optimized for outdoor visibility.
- **Key Features**: Authentication, real-time dashboard, GPS tracking, trip recording and export, OTA firmware updates, device settings, BLE motor pairing, anti-theft functionality, custom STM32 bootloader flashing, Live Activities/Persistent Notifications for real-time telemetry, Digital Outboard Passport (ownership certificate with QR code, PDF export, Apple/Google Wallet integration), and Apple Watch companion app.

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
- **Device Name Filtering**: BLE and Classic scan results are filtered to only show devices with names containing "blade", "halo", "motor", or "boat" (case-insensitive).
- **Serial Number Validation**: Anti-theft motor binding requires serial numbers starting with "BLD" or "JK". Invalid serials show a graceful message instead of allowing registration.

### PDF Generation
- Server-side PDF generation using PDFKit, with custom base64 encoding for React Native compatibility.
- Generates professional engineering-style trip reports including detailed trip data, graphs, and system information.

### Trip Recording System
- **Storage**: Trips are stored locally in AsyncStorage with comprehensive metadata.
- **Telemetry Interval**: 4-second intervals for logging telemetry data points.
- **Data Points**: Records phone GPS, outboard GPS, battery status, consumption, RPM, temperatures, throttle, and drive mode (mapped from telemetry: Normal→N, Eco→E, Docking→D, Sport→S).
- **Metadata Capture**: At trip start, captures firmware version, connection type (BLE/Classic/Demo), phone app version, device name/type/OS, user email/ID, and starting odometer. At trip end, persists max/avg consumption, amperage, RPM, odometer end, and max phone/outboard GPS speeds.
- **GPS Speed Filtering**: Phone and outboard GPS speeds >80 km/h are filtered as unrealistic for electric outboard boats.
- **Energy Calculation**: Uses direct BMS/VESC wattage readings for accuracy, with voltage*current fallback.
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

### Digital Outboard Passport & Wallet Passes
- **Motor Binding Requirement**: Passport is locked unless motor is registered via Anti-Theft (Firebase registration check). PassportScreen checks `registeredMotors.length > 0`.
- **Apple Wallet**: Real `.pkpass` generation using `passkit-generator` (PKPass v3 API). Pass type: `generic`. Dark navy background (#142841), white text, light blue-gray labels. QR barcode for warranty/service verification. Requires: `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_TEAM_IDENTIFIER`, `APPLE_PASS_CERTIFICATE_PEM`, `APPLE_PASS_KEY_PEM`, `APPLE_WWDR_CERTIFICATE_PEM`. Falls back to PDF if certs not configured.
- **Google Wallet**: JWT-based pass generation using `jsonwebtoken`. Generic pass object with service account signing. Requires: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY`. Falls back to PDF if creds not configured.
- **Pass Assets**: Icon (green Blade icon) and logo (white Blade text) resized via `sharp` to Apple Wallet required sizes (icon: 29/58/87px, logo: 160x50/320x100, thumbnail: 90/180px). Source images in `server/wallet-assets/`.
- **Architecture**: `server/walletPassGenerator.ts` exports `generateAppleWalletPass()` and `generateGoogleWalletUrl()`. Routes in `server/routes.ts` use dynamic import. Client in `client/screens/PassportScreen.tsx` handles `pkpass`, `google_wallet`, and `pdf_fallback` response types.
- **Native File Download Pattern**: On native platforms (iOS/Android Xcode builds), `expo-file-system` `writeAsStringAsync` fails at the Swift level. Solution: Server endpoints accept `x-download-mode: native` header → server buffers the file and returns JSON with `{ downloadPath: "/api/passport/download/{uuid}" }` → client uses `FileSystem.downloadAsync(url, localPath)` to save the file natively → share via `expo-sharing`. Temporary downloads expire after 5 minutes. This same pattern is used for trip report PDFs (`/api/trip/report`), passport PDFs (`/api/passport/pdf`), and Apple Wallet passes (`/api/passport/wallet/apple`). Web platform continues using base64 data transfer.

### Apple Watch Companion App (EAS Build Only)
- **Architecture**: Separate watchOS target bundled via Expo config plugin (`plugins/withAppleWatch.js`). Watch app source in `plugins/watch-app/`.
- **Communication**: WatchConnectivity framework. iPhone-side bridge module at `modules/blade-watch-connectivity/` sends telemetry via `updateApplicationContext` + `sendMessage`. Watch receives data and can send trip start/stop commands back.
- **Screens**: 3 SwiftUI pages (Home: connection status/serial/Blade Halo, Telemetry: speed/battery/wattage, Trip: start/end/stopwatch).
- **Requirement**: Only works when iPhone has active Bluetooth connection to motor. Watch does not connect to motor directly.
- **Bundle ID**: `com.bladeoutboards.app.watchkitapp` (companion of `com.bladeoutboards.app`).
- **Design**: Dark navy background (#0A1628), Blade accent blue (#0A4D6E), Watch-optimized font sizes.

### PDF Generation Architecture
- **Buffered Response**: Trip report PDFs are generated using PDFKit, buffered entirely in memory, then sent with explicit `Content-Type: application/pdf` and `Content-Length` headers. This prevents Replit's proxy from overwriting the Content-Type to `text/html` (which happens with streamed/piped responses).
- **Web Path**: Client receives PDF as ArrayBuffer, converts to base64, writes via `expo-file-system`.
- **Native Path**: Trip reports use the ArrayBuffer → base64 → `writeAsStringAsync` approach.
- **Apple Wallet Native Module**: `modules/blade-wallet-pass/` wraps iOS `PKAddPassesViewController` via ExpoModulesCore. Client receives base64 pkpass data from server, passes to native module which presents the native "Add to Apple Wallet" dialog. Falls back to share sheet (`expo-sharing` with UTI `com.apple.pkpass`) in Expo Go or on error. Android stub returns false.

### Push Notification System
- **Dual-Transport Architecture**: iOS uses direct APNs (HTTP/2 + JWT auth) for Xcode builds; Android uses Expo Push API for EAS builds.
- **Token Types**: `push_tokens` table has `token_type` column: `"apns"` for iOS device tokens, `"expo"` for Android Expo push tokens.
- **iOS Token**: Client calls `getDevicePushTokenAsync()` on iOS to get raw APNs device token. Server sends directly to `api.push.apple.com` using ES256-signed JWT.
- **Android Token**: Client calls `getExpoPushTokenAsync()` on Android. Server sends via Expo Push API (`exp.host`).
- **APNs Service**: `server/apnsPushService.ts` - JWT caching (50min), batch size 50, production/sandbox toggle via `APNS_ENVIRONMENT` env var.
- **APNs Secrets**: `APPLE_APNS_KEY_P8` (.p8 key content), `APPLE_APNS_KEY_ID`, `APPLE_TEAM_IDENTIFIER`, `APPLE_BUNDLE_ID`.
- **Routing**: `server/routes.ts` `/api/notifications/send` splits tokens by `tokenType`, routes APNs tokens to Apple and Expo tokens to Expo API.
- **Token Registration**: Client registers tokens via `POST /api/push-tokens/register` with `tokenType` field (`apns` or `expo`).
- **Preference Syncing**: Client syncs notification toggle changes to server via `PUT /api/push-tokens/preferences`. Preferences stored per-token in `push_tokens` table.
- **Three Categories**:
  1. **News/Promotions** (`notif_news`): Sent to all opted-in users. Mapped from client `announcements` setting. Type: `"announcement"` or `"news"`.
  2. **Service/Warranty** (`notif_service`): Time-based reminders from backend. Mapped from client `maintenance` setting. Type: `"service"` or `"maintenance"`.
  3. **Motor-Specific** (`notif_motor`): Targeted by serial number for firmware/recalls. Mapped from client `firmware` setting. Uses `targetSerialNumber` field.
- **Expo Service**: `server/pushNotificationService.ts` handles batched sending (100 per batch) with error tracking.
- **Client Integration**: `SettingsContext.tsx` handles platform detection, permission request, token retrieval (APNs on iOS, Expo on Android), server registration with tokenType, and preference syncing on toggle changes.
- **NOT for real-time**: Push is NOT used for BLE disconnect, sensor faults, low battery, or overheating (those use local haptics/alerts).

### Third-Party APIs
- **OpenStreetMap-based Leaflet.js**: Map visualization.