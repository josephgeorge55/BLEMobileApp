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
- **OpenStreetMap Integration**: Uses WebView-based Leaflet.js maps for cross-platform compatibility (no Google API required)
- **Marine-First Design**: High-contrast UI optimized for outdoor/sunlight visibility with deep ocean blue color palette
- **User-Motor Linking**: Motors are linked to user accounts via userId for anti-theft protection

### Core Features
1. **Authentication**: User account creation with email and 6-digit PIN, login/logout
2. **Dashboard**: Real-time telemetry display (speed, battery, power consumption)
3. **Location**: GPS tracking with map visualization for anti-theft monitoring
4. **My Trips**: Trip recording with automatic telemetry capture, history, and PDF export
5. **Updates**: OTA firmware management with version targeting
6. **Settings**: Device management, user account info, notification preferences, legal links
7. **BLE Scanner**: Bluetooth device discovery and motor pairing
8. **Anti-Theft**: Motors linked to user accounts for ownership protection
9. **Custom Firmware Update**: User can upload .hex firmware files directly from their phone and flash to the Tiller board via Bluetooth OTA

### Custom Firmware OTA System
The app includes a complete STM32 bootloader FOTA implementation for flashing custom firmware to the Tiller board:

**Location:** Settings > Connected Outboard > Custom Firmware Update

**Components:**
- `client/lib/hex-parser.ts` - Intel HEX file parser that converts .hex files into 256-byte memory blocks
- `client/lib/firmware-ota-service.ts` - STM32 bootloader protocol implementation
- `client/components/FirmwareUpdateModal.tsx` - Full-featured UI with file picker, progress bar, log console

**STM32 Bootloader Protocol:**
- Communication: UART over Bluetooth SPP (115200 baud, 8N1, Even parity)
- Init: Send 0x7F, expect ACK (0x79)
- GET: 0x00 + 0xFF → 13-byte response with protocol version
- GET ID: 0x02 + 0xFD → 5-byte response with chip ID
- ERASE: 0x43 + 0xBC → ACK → 0xFF + 0x00 → ACK (mass erase)
- WRITE: 0x31 + 0xCE → address+checksum → data+checksum (256-byte blocks)
- GO: 0x21 + 0xDE → start address+checksum (start firmware)

**Requirements:**
- Tiller board must be in bootloader mode (hardware switch or software command)
- Bluetooth must be connected via the Scanner first
- Firmware files must be in Intel HEX format (.hex)

### Trip Recording System
- **Automatic Data Capture**: Records 17 telemetry parameters every 15 seconds during active trips
- **Metrics Tracked**: Speed (km/h), GPS coordinates, battery level/voltage/current/temp, motor RPM/current/temp, VESC power/current/temp, throttle position
- **Trip Calculations**: Total distance (nm), max/avg speed (km/h), energy consumption (Wh), efficiency (Wh/nm)
- **PDF Export**: Generate and share professional trip reports with route map visualization via expo-print and expo-sharing
- **Route Visualization**: OpenStreetMap displays recorded GPS route with start/end markers
- **Auto-End on App Close**: Trips automatically end when app goes to background or is closed (via AppState listener)
- **Offline Persistence**: Active trip state persisted to AsyncStorage for recovery on app restart
- **Context**: TripContext manages active trip state and automatic recording when motor is connected

### Data Flow
- Users authenticate with email and 6-digit PIN
- Motors identified by serial number and linked to user accounts
- Telemetry reported at 2 Hz (500ms intervals) when connected via BLE
- Location data stored with live/historical status
- Push notifications delivered via Expo Push service

### BLE Protocol (Halo Outboards Tiller Board v1.3)
The app parses comma-separated data frames from the tiller board via Bluetooth Classic serial:

**Frame Types:**
1. **GNSS** - GPS/GLONASS location data
   - Format: `$GNSS,G1,<TimeUTC>,<Latitude>,<Longitude>,<Course>,<Speed>`
   - Speed in km/h, converted to knots for display

2. **BMS** - Battery Management System
   - Format: `$BMS,G1,<Voltage>,<Capacity>,<Current>,<Wattage>,<Temperature>`
   - Voltage (V), Capacity (%), Current (A), Wattage (W), Temp (°C)

3. **MOTOR** - Motor telemetry
   - Format: `$MOTOR,G1,<PhaseCurrent>,<MotorRPM>,<Temperature>`
   - Phase Current (A), RPM, Temp (°C)

4. **VESC** - Motor controller data
   - Format: `$VESC,G1,<Voltage>,<Current>,<Wattage>,<Throttle>,<Temperature>`
   - Voltage (V), Current (A), Wattage (W), Throttle (%), Temp (°C)

**Parser Location:** `client/lib/ble-parser.ts`

### Bluetooth Data Flow
The app supports both real Bluetooth connections and simulation mode:

**Real Connection (Custom Build):**
1. BleScannerModal discovers devices via `bluetooth-classic-service.ts` or `ble-service.ts`
2. When user connects, `connectToClassicDevice` is called with callbacks
3. The `onConnected` callback calls `MotorContext.connectToMotor(serialNumber, false)` - the `false` prevents simulation
4. The `onDataReceived` callback passes parsed data directly to `MotorContext.processParsedData()`
5. Telemetry updates flow to the Dashboard in real-time

**Simulation Mode (Expo Go):**
1. BleScannerModal shows mock devices when Bluetooth is unavailable
2. `connectToMotor(serialNumber, true)` starts the BLE simulation
3. Mock frames are generated at 2Hz and processed by `processBLEFrame()`

**Key Context Functions:**
- `processBLEFrame(frame: string)` - Parses raw frame string and updates telemetry
- `processParsedData(data: ParseResult)` - Directly accepts already-parsed data from Bluetooth services

### Anti-Theft Location Tracking
- Motors report GPS location via cellular every hour
- Continues for up to 30 days after last power on
- Enables recovery of stolen motors even when powered off

## Database Schema

### Tables
- **users**: User accounts with email, PIN, timestamps
- **motors**: Motor records with serialNumber, userId (for anti-theft), firmware info
- **motor_locations**: GPS location history
- **trips**: Trip records with start/end times, battery levels, calculated metrics (distance, speed, energy)
- **trip_data_points**: Individual telemetry snapshots captured during trips (17 parameters per point)
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

### BLE Hardware Support
The app includes real Bluetooth Low Energy support via `react-native-ble-plx`. This requires a custom native build.

**Expo Go Limitations:**
- Expo Go does NOT support native BLE modules
- The app automatically falls back to demo mode in Expo Go
- Demo mode shows simulated devices for UI/UX testing

**Custom Build for Real BLE:**
To test with actual Bluetooth hardware (Halo Tiller Board), you need a custom development build:

1. **Clone the project locally**
   ```bash
   git clone <repository-url>
   cd blade-outboards
   npm install
   ```

2. **Install react-native-ble-plx and add plugin to app.json**
   ```bash
   npm install react-native-ble-plx
   ```
   
   Then add to app.json plugins array:
   ```json
   [
     "react-native-ble-plx",
     {
       "isBackgroundEnabled": false,
       "modes": ["peripheral", "central"],
       "bluetoothAlwaysPermission": "Blade Outboards uses Bluetooth to connect to your outboard motor."
     }
   ]
   ```

3. **Create development build**
   ```bash
   # Generate native projects
   npx expo prebuild
   
   # Build for Android
   npx expo run:android
   
   # Build for iOS (requires Mac + Xcode)
   npx expo run:ios
   ```

4. **Or use EAS Build (cloud)**
   ```bash
   npm install -g eas-cli
   eas login
   eas build --profile development --platform android
   eas build --profile development --platform ios
   ```

**BLE Service UUIDs:**
- Service: `0000ffe0-0000-1000-8000-00805f9b34fb`
- Characteristic: `0000ffe1-0000-1000-8000-00805f9b34fb`

**Supported Device Names:**
- Devices starting with "Blade" or "Halo"
- Serial number pattern: `BLD-XXXX-XXXX` or `HALO-XXXX-XXXX`

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `EXPO_PUBLIC_DOMAIN`: API server domain for client requests
- `REPLIT_DEV_DOMAIN`: Development domain (auto-set in Replit)

## Company Information
- **Company**: Blade Marine Technologies Limited
- **Privacy Policy**: https://www.bladeoutboards.com/privacy-policy
- **Terms & Conditions**: https://www.bladeoutboards.com/tandc
