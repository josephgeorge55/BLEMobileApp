import React, { useRef, useEffect, useState, useCallback } from "react";
import { StyleSheet, View, ActivityIndicator, Platform, Linking, Alert } from "react-native";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { BladeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface MarkerProps {
  coordinate: Coordinate;
  title?: string;
  color?: string;
  isLive?: boolean;
}

interface PolylineProps {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
}

interface Props {
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  markers?: MarkerProps[];
  polyline?: Coordinate[] | PolylineProps;
  polylineColor?: string;
  showUserLocation?: boolean;
  style?: any;
  onMapReady?: () => void;
  minimal?: boolean;
}

export function OpenStreetMap({
  initialRegion,
  markers = [],
  polyline = [],
  polylineColor = BladeColors.accent,
  showUserLocation = false,
  style,
  onMapReady,
  minimal = false,
}: Props) {
  const { isDark } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);

  const defaultRegion = initialRegion || {
    latitude: 25.7617,
    longitude: -80.1918,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const markersJSON = JSON.stringify(markers);
  
  const normalizedPolyline = Array.isArray(polyline) 
    ? polyline 
    : (polyline?.coordinates || []);
  const polylineStrokeColor = Array.isArray(polyline) 
    ? polylineColor 
    : (polyline?.strokeColor || polylineColor);
  const polylineStrokeWidth = Array.isArray(polyline) 
    ? 4 
    : (polyline?.strokeWidth || 4);
  const polylineJSON = JSON.stringify(normalizedPolyline);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #0d1117; }
    
    /* Brighten the map tiles */
    .leaflet-tile-pane { filter: brightness(1.15); }
    
    /* Hide default Leaflet controls */
    .leaflet-control-zoom { display: none !important; }
    .leaflet-control-attribution { 
      background: rgba(0,0,0,0.6) !important; 
      color: rgba(255,255,255,0.5) !important;
      font-size: 9px !important;
      padding: 2px 8px !important;
      border-radius: 8px 0 0 0 !important;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .leaflet-control-attribution a { color: rgba(255,255,255,0.7) !important; }
    ${minimal ? `
    .leaflet-control-attribution { display: none !important; }
    .premium-controls { display: none !important; }
    .scale-bar { display: none !important; }
    ` : ''}
    /* Premium floating controls container */
    .premium-controls {
      position: absolute;
      right: 16px;
      top: 60px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    /* Glass effect button base */
    .glass-btn {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: rgba(20, 30, 50, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .glass-btn:hover {
      background: rgba(30, 45, 70, 0.9);
      transform: scale(1.05);
    }
    .glass-btn:active {
      transform: scale(0.95);
    }
    .glass-btn svg {
      width: 22px;
      height: 22px;
      fill: white;
    }
    
    /* Zoom button group */
    .zoom-group {
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    .zoom-group .glass-btn {
      border-radius: 0;
      box-shadow: none;
    }
    .zoom-group .glass-btn:first-child {
      border-radius: 14px 14px 0 0;
    }
    .zoom-group .glass-btn:last-child {
      border-radius: 0 0 14px 14px;
    }
    .zoom-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
    }
    
    /* Compass */
    .compass {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(20, 30, 50, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      transition: transform 0.3s ease;
    }
    .compass-needle {
      width: 20px;
      height: 20px;
    }
    .compass-needle .north { fill: #FF4757; }
    .compass-needle .south { fill: white; }
    
    /* Scale bar */
    .scale-bar {
      position: absolute;
      left: 16px;
      bottom: 24px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .scale-line {
      height: 3px;
      background: white;
      border-radius: 2px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.5);
      min-width: 60px;
    }
    .scale-text {
      color: white;
      font-size: 11px;
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }
    
    /* Premium DJI-style motor marker */
    .marker-container {
      position: relative;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .marker-outer-ring {
      position: absolute;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(10, 77, 110, 0.3) 0%, rgba(10, 77, 110, 0.1) 100%);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .marker-outer-ring.live {
      animation: outerPulse 2.5s infinite ease-out;
    }
    .marker-inner {
      position: relative;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: linear-gradient(145deg, ${BladeColors.marine} 0%, ${BladeColors.primary} 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 
        0 4px 20px rgba(10, 77, 110, 0.5),
        0 8px 32px rgba(0, 0, 0, 0.3),
        inset 0 2px 4px rgba(255, 255, 255, 0.2),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.9);
    }
    .marker-inner.live {
      background: linear-gradient(145deg, ${BladeColors.accent} 0%, #5a9a30 100%);
      box-shadow: 
        0 4px 20px rgba(141, 198, 63, 0.5),
        0 8px 32px rgba(0, 0, 0, 0.3),
        inset 0 2px 4px rgba(255, 255, 255, 0.2),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
    }
    .marker-inner svg {
      width: 22px;
      height: 22px;
      fill: white;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }
    .marker-glow {
      position: absolute;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(10, 77, 110, 0.4) 0%, transparent 70%);
      opacity: 0;
    }
    .marker-glow.live {
      background: radial-gradient(circle, rgba(141, 198, 63, 0.4) 0%, transparent 70%);
      animation: glowPulse 2.5s infinite ease-out;
    }
    .marker-pointer {
      position: absolute;
      bottom: -8px;
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 12px solid rgba(255, 255, 255, 0.9);
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }
    @keyframes outerPulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.5; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    @keyframes glowPulse {
      0% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 0; transform: scale(1.5); }
    }
    
    /* User location */
    .user-location-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-location {
      background: #4285F4;
      border: 3px solid white;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      box-shadow: 0 2px 10px rgba(66, 133, 244, 0.6);
      z-index: 2;
    }
    .user-location-ring {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(66, 133, 244, 0.25);
      animation: userPulse 2s infinite;
      z-index: 1;
    }
    @keyframes userPulse {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  
  <!-- Premium floating controls -->
  <div class="premium-controls">
    <!-- Compass -->
    <div class="compass" id="compass">
      <svg class="compass-needle" viewBox="0 0 24 24">
        <path class="north" d="M12 2L8 12h8L12 2z"/>
        <path class="south" d="M12 22l4-10H8l4 10z"/>
      </svg>
    </div>
    
    <!-- Zoom buttons -->
    <div class="zoom-group">
      <div class="glass-btn" id="zoom-in">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </div>
      <div class="zoom-divider"></div>
      <div class="glass-btn" id="zoom-out">
        <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
      </div>
    </div>
    
    <!-- Locate / recenter button -->
    <div class="glass-btn" id="locate">
      <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
    </div>
  </div>
  
  <!-- Scale bar -->
  <div class="scale-bar">
    <div class="scale-line" id="scale-line"></div>
    <div class="scale-text" id="scale-text">100 m</div>
  </div>
  
  <script>
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: ${minimal ? 'false' : 'true'},
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      zoomSnap: 0.5,
      wheelPxPerZoomLevel: 120,
      ${minimal ? `
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
      ` : ''}
    }).setView([${defaultRegion.latitude}, ${defaultRegion.longitude}], 15);

    // CartoDB Dark Matter tiles - free, no API key required, high-res support
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}' + (window.devicePixelRatio > 1 ? '@2x' : '') + '.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 20,
      subdomains: 'abcd'
    }).addTo(map);
    
    // Custom zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut());
    
    // Locate button - center on markers or user
    document.getElementById('locate').addEventListener('click', () => {
      const markers = ${markersJSON};
      if (markers.length > 0) {
        map.flyTo([markers[0].coordinate.latitude, markers[0].coordinate.longitude], 16, { duration: 0.8 });
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 });
        });
      }
    });
    
    // Update scale bar
    function updateScale() {
      const meters = map.distance(
        map.containerPointToLatLng([0, 0]),
        map.containerPointToLatLng([100, 0])
      );
      let scaleText, scaleWidth;
      if (meters < 1000) {
        const rounded = Math.round(meters / 10) * 10;
        scaleText = rounded + ' m';
        scaleWidth = Math.round(100 * rounded / meters);
      } else {
        const km = meters / 1000;
        const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
        scaleText = rounded + ' km';
        scaleWidth = Math.round(100 * (rounded * 1000) / meters);
      }
      document.getElementById('scale-line').style.width = Math.min(scaleWidth, 120) + 'px';
      document.getElementById('scale-text').textContent = scaleText;
    }
    map.on('zoomend moveend', updateScale);
    updateScale();

    // Navigation/location pin icon - clean and modern
    const locationIcon = '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="white"/></svg>';

    const createMarkerIcon = (color, isLive) => {
      const liveClass = isLive ? 'live' : '';
      return L.divIcon({
        className: '',
        html: \`
          <div class="marker-container">
            <div class="marker-glow \${liveClass}"></div>
            <div class="marker-outer-ring \${liveClass}"></div>
            <div class="marker-inner \${liveClass}">
              \${locationIcon}
            </div>
            <div class="marker-pointer"></div>
          </div>
        \`,
        iconSize: [56, 72],
        iconAnchor: [28, 64],
        popupAnchor: [0, -56]
      });
    };

    const markers = ${markersJSON};
    const polylineCoords = ${polylineJSON};
    
    // Copy to clipboard function
    function copyToClipboard(text) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'copied', text: text }));
        }).catch(() => {
          window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'copyFailed' }));
        });
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'copied', text: text }));
      }
    }
    
    // Open Google Maps directions
    function openDirections(lat, lng) {
      const url = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'openDirections', url: url, lat: lat, lng: lng }));
    }

    markers.forEach(m => {
      const icon = createMarkerIcon(m.color || '${BladeColors.primary}', m.isLive);
      const marker = L.marker([m.coordinate.latitude, m.coordinate.longitude], { icon });
      
      const lat = m.coordinate.latitude;
      const lng = m.coordinate.longitude;
      const coords = lat.toFixed(6) + ', ' + lng.toFixed(6);
      
      const popupContent = \`
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; min-width: 180px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1a1a1a;">\${m.title || 'Motor Location'}</div>
          <div style="font-size: 12px; color: #666; margin-bottom: 12px;">\${coords}</div>
          <div style="display: flex; gap: 8px;">
            <button onclick="openDirections(\${lat}, \${lng})" style="
              flex: 1;
              padding: 10px 12px;
              background: linear-gradient(145deg, #0A4D6E, #083d58);
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
            ">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M21.71 11.29l-9-9c-.39-.39-1.02-.39-1.41 0l-9 9c-.39.39-.39 1.02 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9c.39-.38.39-1.01 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>
              Directions
            </button>
            <button onclick="copyToClipboard('\${coords}')" style="
              flex: 1;
              padding: 10px 12px;
              background: #f0f0f0;
              color: #333;
              border: none;
              border-radius: 8px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
            ">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#333"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              Copy
            </button>
          </div>
        </div>
      \`;
      
      marker.bindPopup(popupContent, { 
        className: 'custom-popup',
        closeButton: true,
        maxWidth: 250
      });
      marker.addTo(map);
    });

    if (polylineCoords.length > 0) {
      const latlngs = polylineCoords.map(c => [c.latitude, c.longitude]);
      L.polyline(latlngs, {
        color: '${polylineStrokeColor}',
        weight: ${polylineStrokeWidth},
        opacity: 0.8,
        smoothFactor: 1
      }).addTo(map);

      if (latlngs.length > 1) {
        map.fitBounds(latlngs, { padding: [30, 30] });
      }
    }

    ${showUserLocation ? `
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        // Accuracy ring
        L.circle([pos.coords.latitude, pos.coords.longitude], {
          radius: pos.coords.accuracy || 50,
          fillColor: '#4285F4',
          color: '#4285F4',
          weight: 1,
          fillOpacity: 0.1,
          opacity: 0.3
        }).addTo(map);
        
        // User location dot with pulsing effect
        const userIcon = L.divIcon({
          className: '',
          html: '<div style="position:relative;"><div class="user-location-ring"></div><div class="user-location"></div></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        L.marker([pos.coords.latitude, pos.coords.longitude], { icon: userIcon }).addTo(map);
      }, null, { enableHighAccuracy: true });
    }
    ` : ''}

    window.ReactNativeWebView?.postMessage('mapReady');
  </script>
</body>
</html>
  `;

  const handleMessage = useCallback((event: any) => {
    const data = event.nativeEvent.data;
    
    if (data === "mapReady") {
      setIsLoading(false);
      onMapReady?.();
      return;
    }
    
    try {
      const message = JSON.parse(data);
      
      if (message.type === "copied") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Coordinates Copied", message.text);
      } else if (message.type === "copyFailed") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Copy Failed", "Could not copy coordinates to clipboard");
      } else if (message.type === "openDirections") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Linking.openURL(message.url).catch(() => {
          Alert.alert("Could Not Open Maps", "Please install Google Maps or try copying the coordinates");
        });
      }
    } catch (e) {
      // Not a JSON message, ignore
    }
  }, [onMapReady]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style]}>
        <iframe
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none" }}
          title="Map"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        scalesPageToFit
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={BladeColors.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
  },
});
