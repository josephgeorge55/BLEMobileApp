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
    html, body, #map { width: 100%; height: 100%; }
    .custom-marker {
      background: ${BladeColors.primary};
      border: 3px solid white;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .custom-marker.live {
      background: ${BladeColors.accent};
      animation: pulse 2s infinite;
    }
    .custom-marker svg {
      width: 20px;
      height: 20px;
      fill: white;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(141, 198, 63, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(141, 198, 63, 0); }
      100% { box-shadow: 0 0 0 0 rgba(141, 198, 63, 0); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', {
      zoomControl: true,
      attributionControl: true
    }).setView([${defaultRegion.latitude}, ${defaultRegion.longitude}], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

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
        L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
          radius: 8,
          fillColor: '#4285F4',
          color: 'white',
          weight: 2,
          fillOpacity: 1
        }).addTo(map);
      });
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
