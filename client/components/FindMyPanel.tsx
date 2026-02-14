import React, { useEffect, useState } from "react";
import { StyleSheet, View, Image, Pressable, ActivityIndicator, ScrollView, Dimensions, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withSpring, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BladeColors, BorderRadius, Shadows } from "@/constants/theme";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const supportsGlass = Platform.OS === "ios" && isLiquidGlassAvailable();
const MIN_HEIGHT = 220;
const MAX_HEIGHT = SCREEN_HEIGHT * 0.6;

interface FindMyPanelProps {
  motorName: string;
  serialNumber: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  isLive: boolean;
  onFind: () => void;
}

export function FindMyPanel({
  motorName,
  serialNumber,
  latitude,
  longitude,
  timestamp,
  isLive,
  onFind,
}: FindMyPanelProps) {
  const { theme } = useTheme();
  const [locationName, setLocationName] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isFinding, setIsFinding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const panelHeight = useSharedValue(MIN_HEIGHT);

  const updateExpanded = (expanded: boolean) => {
    setIsExpanded(expanded);
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const newHeight = isExpanded 
        ? MAX_HEIGHT - e.translationY 
        : MIN_HEIGHT - e.translationY;
      panelHeight.value = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight));
    })
    .onEnd((e) => {
      const shouldExpand = e.velocityY < -500 || (!isExpanded && panelHeight.value > (MIN_HEIGHT + MAX_HEIGHT) / 2);
      const shouldCollapse = e.velocityY > 500 || (isExpanded && panelHeight.value < (MIN_HEIGHT + MAX_HEIGHT) / 2);
      
      if (shouldExpand) {
        panelHeight.value = withSpring(MAX_HEIGHT, { damping: 20, stiffness: 200 });
        runOnJS(updateExpanded)(true);
      } else if (shouldCollapse) {
        panelHeight.value = withSpring(MIN_HEIGHT, { damping: 20, stiffness: 200 });
        runOnJS(updateExpanded)(false);
      } else {
        panelHeight.value = withSpring(isExpanded ? MAX_HEIGHT : MIN_HEIGHT, { damping: 20, stiffness: 200 });
      }
    });

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: panelHeight.value,
  }));

  useEffect(() => {
    let isMounted = true;
    
    const reverseGeocode = async () => {
      if (!isMounted) return;
      setIsLoadingLocation(true);
      
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        
        if (!isMounted) return;
        
        if (results && results.length > 0) {
          const place = results[0];
          const parts: string[] = [];
          
          if (place.street) {
            parts.push(place.street);
          }
          if (place.city) {
            parts.push(place.city);
          } else if (place.subregion) {
            parts.push(place.subregion);
          }
          
          if (parts.length > 0) {
            setLocationName(`Near ${parts.join(", ")}`);
          } else if (place.name) {
            setLocationName(`Near ${place.name}`);
          } else {
            setLocationName(null);
          }
        } else {
          setLocationName(null);
        }
      } catch (error) {
        console.warn("Reverse geocode error:", error);
        if (isMounted) {
          setLocationName(null);
        }
      } finally {
        if (isMounted) {
          setIsLoadingLocation(false);
        }
      }
    };

    // Delay geocoding to avoid startup issues
    const timeout = setTimeout(() => {
      reverseGeocode();
    }, 500);
    
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [latitude, longitude]);

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const handleFind = async () => {
    setIsFinding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFind();
    setTimeout(() => setIsFinding(false), 2000);
  };

  const formatCoordinates = () => {
    const latDir = latitude >= 0 ? "N" : "S";
    const lonDir = longitude >= 0 ? "E" : "W";
    return `${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lonDir}`;
  };

  const handleExpandToggle = () => {
    const targetHeight = isExpanded ? MIN_HEIGHT : MAX_HEIGHT;
    panelHeight.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
    setIsExpanded(!isExpanded);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={FadeInUp.duration(400).springify()}
        style={[styles.container, !supportsGlass && { backgroundColor: "rgba(44,44,46,0.92)" }, Shadows.large, animatedContainerStyle]}
      >
        {supportsGlass ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor="rgba(255,255,255,0.08)"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Pressable onPress={handleExpandToggle} style={styles.handleContainer}>
          <View style={styles.handle} />
          <ThemedText type="caption" style={{ color: theme.textTertiary, marginTop: Spacing.xs }}>
            {isExpanded ? "Swipe down to minimize" : "Swipe up for details"}
          </ThemedText>
        </Pressable>
        
        <ScrollView 
          style={styles.scrollContent}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEnabled={isExpanded}
        >
        <View style={styles.motorSection}>
          <View style={styles.imageContainer}>
            <Image
              source={require("../../assets/images/halo-outboard.png")}
              style={styles.motorImage}
              resizeMode="contain"
            />
          </View>
          
          <View style={styles.motorInfo}>
            <ThemedText type="h3" style={styles.motorName}>
              {motorName}
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {serialNumber}
            </ThemedText>
            
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isLive ? BladeColors.success : BladeColors.warning },
                ]}
              />
              <ThemedText
                type="small"
                style={{ color: isLive ? BladeColors.success : theme.textSecondary }}
              >
                {isLive ? "Connected" : "Last Seen"}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 4 }}>
                {formatTimestamp(timestamp)}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={[styles.locationSection, { borderTopColor: theme.border }]}>
          <View style={styles.locationIcon}>
            <Feather name="map-pin" size={20} color={theme.textSecondary} />
          </View>
          <View style={styles.locationInfo}>
            {isLoadingLocation ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.textSecondary} />
                <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 8 }}>
                  Finding location...
                </ThemedText>
              </View>
            ) : locationName ? (
              <>
                <ThemedText type="body" style={styles.locationName}>
                  {locationName}
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  {formatCoordinates()}
                </ThemedText>
              </>
            ) : (
              <>
                <ThemedText type="body" style={styles.locationName}>
                  Location Available
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  {formatCoordinates()}
                </ThemedText>
              </>
            )}
          </View>
        </View>

        <Pressable
          onPress={handleFind}
          disabled={isFinding}
          style={({ pressed }) => [
            styles.findButton,
            { backgroundColor: BladeColors.accent },
            pressed && styles.findButtonPressed,
            isFinding && styles.findButtonDisabled,
          ]}
        >
          {isFinding ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="navigation" size={18} color="#FFFFFF" />
              <ThemedText type="body" style={styles.findButtonText}>
                Find
              </ThemedText>
            </>
          )}
        </Pressable>

        <View style={styles.antiTheftNote}>
          <Feather name="shield" size={14} color={theme.textSecondary} />
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: 6, flex: 1 }}>
            Anti-theft tracking active. Your outboard reports location every hour for up to 30 days.
          </ThemedText>
        </View>

        {isExpanded ? (
          <View style={[styles.additionalInfo, { borderTopColor: theme.border }]}>
            <ThemedText type="caption" style={{ color: theme.textSecondary, fontWeight: "600", marginBottom: Spacing.sm }}>
              ADDITIONAL DETAILS
            </ThemedText>
            <View style={styles.infoRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Coordinates</ThemedText>
              <ThemedText type="mono" style={{ fontSize: 12 }}>{formatCoordinates()}</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Last Update</ThemedText>
              <ThemedText type="small">{timestamp.toLocaleString()}</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Tracking Status</ThemedText>
              <ThemedText type="small" style={{ color: BladeColors.success }}>Active</ThemedText>
            </View>
          </View>
        ) : null}
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    overflow: "hidden",
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
  },
  motorSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(142,142,147,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  motorImage: {
    width: 60,
    height: 60,
  },
  motorInfo: {
    flex: 1,
  },
  motorName: {
    fontWeight: "700",
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  locationSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    marginBottom: Spacing.lg,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(142,142,147,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  locationInfo: {
    flex: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  findButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  findButtonPressed: {
    opacity: 0.8,
  },
  findButtonDisabled: {
    opacity: 0.6,
  },
  findButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  antiTheftNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: "rgba(142,142,147,0.10)",
    borderRadius: BorderRadius.md,
  },
  additionalInfo: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
});
