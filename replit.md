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
- **Offline Support**: Trip data recorded locally using AsyncStorage (no server dependency).
- **Anti-Theft Location**: Motors report GPS hourly via cellular for up to 30 days post-power-off.
- **Firestore Integration**: Used for fetching latest GPS coordinates when not connected via Bluetooth, leveraging collection group queries.

### Trip Recording System
The trip system has been simplified to work on both web (demo mode) and native (real Bluetooth):

**Key Features:**
- **Demo Mode**: Trips work on web without real Bluetooth - uses "DEMO-MOTOR" as fallback serial
- **Local Storage Only**: Trips stored in AsyncStorage at `@blade_local_trips` - no server sync required
- **Telemetry Interval**: 4-second intervals for logging telemetry data points (per PDF spec)
- **Duration Timer**: 1-second intervals for live duration display
- **Weather Recording**: Captures weather at trip start, hourly during trip, and at trip end
- **Wh Calculation**: Uses 48V battery voltage × current (from VESC or BMS)
- **Data Points Storage**: TripDataPoint arrays stored at `@blade_trip_data_points_{tripId}`
- **Weather Storage**: Weather snapshots stored at `@blade_trip_weather_{tripId}` (startWeather, endWeather, hourlyWeather[])

**Trip Validation Rules:**
- Trips under 60 seconds are automatically deleted when ended
- Maximum 8-hour trip limit with auto-end
- 600-second inactivity timeout triggers auto-end
- End reasons tracked: user_button, auto_8hr_limit, auto_inactivity_600s, app_closure

**Extended Telemetry Tracking:**
- Phone GPS (latitude, longitude, speed)
- Outboard GPS (from GNSS frame)
- Battery SOC, voltage, current
- Consumption (kW), phase amperage
- RPM, motor temp, VESC temp
- Throttle percent, drive mode
- Hydro-regen and reverse detection

**Trip Requirements:**
- Only requires user ID (guest mode works)
- Motor connection NOT required for demo/testing purposes
- When connected, prefers real serial from telemetry over Bluetooth MAC address

### PDF Report Generation
Professional engineering-style PDF reports for completed trips:

**Service:** `client/services/TripReportService.ts`
**Types:** `client/types/TripReport.ts`

**PDF Structure (A4 Landscape):**
1. **Page 1 - Introduction**: Device info, firmware version, user info, report metadata
2. **Page 2 - Trip Summary**: Weather, GPS start/end, battery usage, route map, overview graph
3. **Pages 3+ - Trip Detail**: One page per 600-second segment with 3 graphs each (speed, consumption, battery)
4. **Final Page - Conclusion**: Notes, disclaimers, multi-language safety reminders (EN, DE, IT, ES)

**Header/Footer Features:**
- Blade Outboards logo
- Multi-language page titles
- Report ID with QR code placeholder
- Serial number with barcode placeholder
- CE/UKCA/RoHS certification logos
- Page numbering
- Generation timestamp (UTC and local)

**Page 1 - Introduction:**
- Device info, firmware version, user info, report metadata
- GS1 SKU: 199284191679 (fixed value)
- CO2 Saved: trip minutes × 0.14833 kg
- Boat info: vessel name (profanity-filtered), VIN/HIN, type, length, weight

**Page 2 - Trip Summary:**
- Weather with sunrise/sunset times
- GPS start/end coordinates and addresses
- Battery usage, route map, overview graph
- Error codes section (E00-E99): At Start, During Trip, At End phases

**Pages 3+ - Trip Detail:**
- One page per 600-second segment with 3 graphs (speed, consumption, battery)

**Page 4 - Conclusion:**
- Trip summary with distance, odometer, performance metrics
- CO2 Saved displayed in performance summary
- Data interpretation guide
- ISO Standards Used: ISO 8178-4, 16315, 12217, 10005, 19650, 8601, WGS 84
- Legal disclaimer and multi-language safe boating reminders

### Critical: Motor Serial Number Flow
When connecting to a real motor via Bluetooth:
1. **Initial Connection**: Motor's `serialNumber` is set to the Bluetooth MAC address (e.g., `AA:BB:CC:DD:EE:FF`)
2. **INFOR G1 Frame Received**: The real serial number (e.g., `BLD-2024-0001`) arrives and MotorContext updates `motor.serialNumber`
3. **Anti-Theft Registration**: BleScannerModal waits up to 3 seconds for the real serial before registering with Firebase
4. **Trip Recording**: Uses `telemetry.tillerSerialNumber` as fallback when `motor.serialNumber` is still a Bluetooth address
5. **Location Lookup**: LocationScreen checks for valid serial (no `:` colons) from motor, telemetry, or registered motors list

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

## Firebase Configuration

### Required Firestore Security Rules
The anti-theft system requires proper Firestore security rules to allow authenticated users to write to their own user documents. Configure these rules in the Firebase Console:

1. Go to Firebase Console > Firestore Database > Rules
2. Replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read and write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Device telemetry can be read by authenticated users
    match /devices/{deviceId}/telemetry/{docId} {
      allow read: if request.auth != null;
      allow write: if true; // Motors write without auth
    }
  }
}
```

3. Click "Publish" to apply the rules.

### Key Firebase Collections
- `users/{userId}`: User documents with `registeredMotors` array for anti-theft
- `devices/{deviceName}/telemetry/{docId}`: Motor GPS telemetry data

### Troubleshooting Firebase Permission Errors
If you see "permission-denied" errors:
1. Verify Firestore security rules are published (see above)
2. Check that the user is signed in with email/password (not guest mode)
3. Confirm Firebase Auth is properly initialized (check console for "[Firebase] Initialized successfully")
4. Sign out and sign back in if auth state seems stale