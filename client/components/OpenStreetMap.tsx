import React, { useRef, useEffect, useState } from "react";
import { StyleSheet, View, ActivityIndicator, Platform } from "react-native";
import { WebView } from "react-native-webview";
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
}

export function OpenStreetMap({
  initialRegion,
  markers = [],
  polyline = [],
  polylineColor = BladeColors.accent,
  showUserLocation = false,
  style,
  onMapReady,
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
    html, body, #map { width: 100%; height: 100%; background: #1a1a2e; }
    
    /* Hide default Leaflet controls for cleaner look */
    .leaflet-control-attribution { 
      background: rgba(0,0,0,0.5) !important; 
      color: rgba(255,255,255,0.6) !important;
      font-size: 10px !important;
      padding: 2px 6px !important;
      border-radius: 4px 0 0 0 !important;
    }
    .leaflet-control-attribution a { color: rgba(255,255,255,0.8) !important; }
    
    /* Modern zoom controls */
    .leaflet-control-zoom {
      border: none !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      border-radius: 12px !important;
      overflow: hidden;
    }
    .leaflet-control-zoom a {
      background: rgba(30, 40, 60, 0.95) !important;
      color: white !important;
      border: none !important;
      width: 44px !important;
      height: 44px !important;
      line-height: 44px !important;
      font-size: 20px !important;
      font-weight: 300 !important;
    }
    .leaflet-control-zoom a:hover {
      background: rgba(50, 70, 100, 0.95) !important;
    }
    .leaflet-control-zoom-in { border-radius: 12px 12px 0 0 !important; }
    .leaflet-control-zoom-out { border-radius: 0 0 12px 12px !important; }
    
    .custom-marker {
      background: ${BladeColors.primary};
      border: 3px solid white;
      border-radius: 50%;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      transition: transform 0.2s ease;
    }
    .custom-marker.live {
      background: ${BladeColors.accent};
      animation: pulse 2s infinite;
    }
    .custom-marker svg {
      width: 24px;
      height: 24px;
      fill: white;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(141, 198, 63, 0.7); transform: scale(1); }
      50% { box-shadow: 0 0 0 20px rgba(141, 198, 63, 0); transform: scale(1.05); }
      100% { box-shadow: 0 0 0 0 rgba(141, 198, 63, 0); transform: scale(1); }
    }
    
    /* User location marker */
    .user-location {
      background: #4285F4;
      border: 3px solid white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      box-shadow: 0 2px 8px rgba(66, 133, 244, 0.5);
    }
    .user-location-ring {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(66, 133, 244, 0.2);
      animation: userPulse 2s infinite;
    }
    @keyframes userPulse {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', {
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true
    }).setView([${defaultRegion.latitude}, ${defaultRegion.longitude}], 15);

    // Modern CartoDB Dark Matter tiles - premium look with high resolution
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}${window.devicePixelRatio > 1 ? "@2x" : ""}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 20,
      subdomains: 'abcd'
    }).addTo(map);
    
    // Position zoom control on the right
    map.zoomControl.setPosition('topright');

    const anchorIcon = '<svg viewBox="0 0 24 24"><path d="M12 2C10.9 2 10 2.9 10 4C10 4.74 10.4 5.39 11 5.73V7H6V9H11V14.27C9.87 14.63 9 15.72 9 17C9 18.65 10.35 20 12 20C13.65 20 15 18.65 15 17C15 15.72 14.13 14.63 13 14.27V9H18V7H13V5.73C13.6 5.39 14 4.74 14 4C14 2.9 13.1 2 12 2M5 11V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V11H17V19H7V11H5Z"/></svg>';

    const createMarkerIcon = (color, isLive) => {
      return L.divIcon({
        className: '',
        html: '<div class="custom-marker ' + (isLive ? 'live' : '') + '" style="background: ' + color + '">' + anchorIcon + '</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
      });
    };

    const markers = ${markersJSON};
    const polylineCoords = ${polylineJSON};

    markers.forEach(m => {
      const icon = createMarkerIcon(m.color || '${BladeColors.primary}', m.isLive);
      const marker = L.marker([m.coordinate.latitude, m.coordinate.longitude], { icon });
      if (m.title) {
        marker.bindPopup(m.title);
      }
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

  const handleMessage = (event: any) => {
    if (event.nativeEvent.data === "mapReady") {
      setIsLoading(false);
      onMapReady?.();
    }
  };

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
