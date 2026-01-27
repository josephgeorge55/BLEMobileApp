# Blade Outboards Mobile App — Design Guidelines

## Brand Identity

**Purpose**: A professional marine control system for electric outboard operators requiring reliable telemetry monitoring, location tracking, and firmware management in challenging marine environments.

**Aesthetic Direction**: Industrial-Marine Precision
- Clean, high-contrast interface optimized for outdoor visibility in bright sunlight
- Purposeful hierarchy with critical information immediately accessible
- Utilitarian design language that prioritizes function and reliability
- Professional-grade feel that inspires confidence in harsh marine conditions

**Memorable Element**: A distinctive deep ocean blue gradient header that evokes marine environments while providing high contrast for outdoor readability. Bold, clear typography and generously-sized touch targets suitable for wet or gloved hands.

---

## Navigation Architecture

**Root Navigation**: Tab Navigation (4 tabs + Floating Action)

**Tabs**:
1. **Dashboard** - Real-time telemetry and status
2. **Location** - Anti-theft map tracking
3. **Updates** - Firmware management
4. **Settings** - Preferences and device management

**Floating Action Button**: BLE connection status/toggle (always visible, positioned bottom-right)

**Modal Screens**:
- Firmware Update Progress (full-screen modal during OTA)
- Notification Permissions (first launch only)

---

## Screen Specifications

### 1. Dashboard Screen
**Purpose**: Monitor real-time outboard telemetry at a glance

**Layout**:
- **Header**: Transparent with serial number display (left) and notification bell icon (right)
- **Content**: Scrollable with large metric cards
- **Safe Area**: Top: headerHeight + Spacing.xl, Bottom: tabBarHeight + Spacing.xl

**Components**:
- Large metric cards (4 cards, 2x2 grid):
  - Speed (knots) - Large number, unit label
  - State of Charge (%) - Progress ring visualization
  - Power Consumption (kW) - Large number with trend indicator
  - Firmware Version - Version number with "Update Available" badge if applicable
- Connection status banner (when disconnected, amber warning at top)
- Empty state: "Connect to Your Outboard" illustration when no BLE connection

### 2. Location Screen
**Purpose**: View current or last known outboard location for anti-theft

**Layout**:
- **Header**: Transparent with "Location" title centered
- **Content**: Full-screen map (non-scrollable)
- **Safe Area**: None (map fills screen edge-to-edge under transparent header and tab bar)

**Components**:
- Full-screen map view with outboard marker pin
- Floating info card (bottom, above tab bar):
  - Last updated timestamp
  - GPS coordinates
  - "Live" or "Last Known" status indicator
- Map controls (zoom, recenter) in bottom-right corner
- Empty state: If no location data, show centered message card "No Location Data Available"

### 3. Updates Screen
**Purpose**: Manage firmware updates for the outboard

**Layout**:
- **Header**: Default navigation header with "Firmware Updates" title
- **Content**: Scrollable list
- **Safe Area**: Top: Spacing.xl, Bottom: tabBarHeight + Spacing.xl

**Components**:
- Current firmware card (top):
  - "Current Version" label
  - Version number (large)
  - Install date
- Available updates list:
  - Update card with version number, "Mandatory" or "Optional" badge
  - "Download & Install" button
  - Release notes expandable section
- Update progress card (replaces list during download/install):
  - Progress bar
  - Status text ("Downloading...", "Installing...", "Complete")
- Empty state: "Your Outboard is Up to Date" checkmark illustration

### 4. Settings Screen
**Purpose**: Configure app preferences and device management

**Layout**:
- **Header**: Default navigation header with "Settings" title
- **Content**: Scrollable form
- **Safe Area**: Top: Spacing.xl, Bottom: tabBarHeight + Spacing.xl

**Components**:
- Sectioned list with toggles and navigation items:
  - **Device Section**: Connected outboard name, serial number, "Disconnect" button
  - **Notifications**: Toggle switches for each notification type (Maintenance, Updates, Announcements)
  - **Privacy**: Anonymous data sharing toggle (OFF by default) with info icon
  - **About**: Link to bladeoutboards.com, app version
- Each section has clear headers and dividers

### Floating Action Button (BLE Connection)
- Positioned bottom-right, 16px from edges
- Circular button, 56x56px
- Shows BLE icon with pulsing indicator when scanning
- Green dot when connected, gray when disconnected
- Tapping opens BLE device scanner sheet
- Drop shadow: offset (0, 2), opacity 0.10, radius 2

---

## Color Palette

**Primary (Ocean Blue)**: `#0A4D6E` - Headers, primary actions, active states
**Primary Dark**: `#063549` - Gradient end, pressed states
**Accent (Marine Teal)**: `#00B8A9` - Success states, "Live" indicators, progress fills
**Warning (Amber)**: `#F59E0B` - Disconnected states, optional updates
**Error (Coral Red)**: `#DC2626` - Mandatory updates, critical alerts
**Background**: `#F8FAFC` - App background (light mode)
**Surface**: `#FFFFFF` - Cards, modals
**Text Primary**: `#0F172A` - Headings, numbers
**Text Secondary**: `#64748B` - Labels, descriptions
**Border**: `#E2E8F0` - Dividers, card borders

**Visual Principle**: High contrast throughout for outdoor visibility. Primary blue used sparingly for headers and key actions, with generous white space and clear text hierarchy.

---

## Typography

**Font Family**: 
- Primary: **Inter** (Google Font) - Highly legible sans-serif optimized for screens
- Numeric: System Default Monospace - For telemetry values and version numbers

**Type Scale**:
- **Hero (Metric Values)**: 48px, Bold - Dashboard numbers
- **H1 (Screen Titles)**: 28px, Bold - Screen headers
- **H2 (Section Headers)**: 20px, Semibold - Card titles, settings sections
- **Body**: 16px, Regular - Descriptions, labels
- **Caption**: 14px, Regular - Timestamps, secondary info
- **Button**: 16px, Semibold - All buttons

**Line Height**: 1.5x for body text, 1.2x for headings

---

## Visual Design

**Icons**: Feather icons from @expo/vector-icons (activity, map-pin, download-cloud, settings, bell, bluetooth)

**Touch Targets**: Minimum 44x44px for all interactive elements (marine/gloved hand optimization)

**Card Style**:
- Background: Surface color
- Border radius: 12px
- Border: 1px solid Border color
- No drop shadow (clean, flat design)

**Button Style**:
- Primary: Background Primary color, white text, 12px border radius
- Secondary: Border 2px Primary color, Primary text, 12px border radius
- Pressed state: Reduce opacity to 0.8
- Minimum height: 48px

**Progress Indicators**:
- Ring progress (SOC): Stroke width 8px, Accent color fill
- Linear progress (firmware): Height 8px, rounded ends, Accent color fill

---

## Assets to Generate

1. **icon.png** - App icon: Bold "B" lettermark in white on ocean blue gradient background
   - WHERE USED: Device home screen

2. **splash-icon.png** - Splash screen icon: Same "B" lettermark as app icon
   - WHERE USED: App launch screen

3. **empty-dashboard.png** - Illustration: Simple outline of outboard motor with "Connect" prompt
   - WHERE USED: Dashboard screen when no BLE connection

4. **empty-location.png** - Illustration: Stylized map pin with question mark
   - WHERE USED: Location screen when no GPS data available

5. **firmware-success.png** - Illustration: Checkmark in circular badge
   - WHERE USED: Updates screen when firmware is current, update completion state

6. **notification-bell.png** - Simple bell icon for notification prompt
   - WHERE USED: Notification permission request modal

**Style for all illustrations**: Minimal line-art style in Primary color, single-color, no gradients, optimized for clarity at small sizes.