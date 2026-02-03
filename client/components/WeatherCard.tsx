import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from './ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BladeColors, BorderRadius } from '@/constants/theme';
import {
  WeatherData,
  WeatherAlert,
  HourlyWeather,
  AirQualityData,
  TemperatureUnit,
  formatTemp,
  getWeatherIconName,
  getWindSpeedKnots,
  getWindDirection,
  getWeatherSeverity,
  isMarineRelevant,
  getAqiLabel,
  getWeatherWithLocation,
} from '@/services/weatherService';

interface WeatherCardProps {
  onRefresh?: () => void;
}

export function WeatherCard({ onRefresh }: WeatherCardProps) {
  const { theme } = useTheme();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [unit, setUnit] = useState<TemperatureUnit>('C');
  const [showAlerts, setShowAlerts] = useState(false);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const result = await getWeatherWithLocation();
    
    if (result.success && result.data) {
      setWeather(result.data);
      setPermissionDenied(false);
    } else {
      setError(result.error || 'Failed to fetch weather');
      setPermissionDenied(result.permissionDenied || false);
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  const handleRefresh = () => {
    fetchWeather();
    onRefresh?.();
  };

  const toggleUnit = () => {
    setUnit(prev => prev === 'C' ? 'F' : 'C');
  };

  if (loading && !weather) {
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[styles.container, { backgroundColor: theme.surfaceElevated }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText type="caption" style={{ marginTop: Spacing.sm, color: theme.textSecondary }}>
            Loading weather...
          </ThemedText>
        </View>
      </Animated.View>
    );
  }

  if (permissionDenied) {
    return (
      <Animated.View
        entering={FadeInUp.duration(300)}
        style={[styles.container, styles.errorContainer, { backgroundColor: BladeColors.error + '15', borderColor: BladeColors.error + '40' }]}
      >
        <View style={styles.errorContent}>
          <Feather name="map-pin" size={24} color={BladeColors.error} />
          <View style={styles.errorTextContainer}>
            <ThemedText type="body" style={{ color: BladeColors.error, fontWeight: '600' }}>
              Location Required
            </ThemedText>
            <ThemedText type="small" style={{ color: BladeColors.error, opacity: 0.8 }}>
              Enable location access to view weather conditions
            </ThemedText>
          </View>
        </View>
        <Pressable onPress={handleRefresh} style={styles.retryButton}>
          <Feather name="refresh-cw" size={16} color={BladeColors.error} />
        </Pressable>
      </Animated.View>
    );
  }

  if (error && !weather) {
    return (
      <Animated.View
        entering={FadeInUp.duration(300)}
        style={[styles.container, styles.errorContainer, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
      >
        <View style={styles.errorContent}>
          <Feather name="cloud-off" size={24} color={theme.textSecondary} />
          <View style={styles.errorTextContainer}>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              Weather Unavailable
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textTertiary }}>
              {error}
            </ThemedText>
          </View>
        </View>
        <Pressable onPress={handleRefresh} style={styles.retryButton}>
          <Feather name="refresh-cw" size={16} color={theme.textSecondary} />
        </Pressable>
      </Animated.View>
    );
  }

  if (!weather) return null;

  const current = weather.current;
  const hourlyForecast = weather.hourly.slice(1, 4);
  const alerts = weather.alerts || [];
  const airQuality = weather.airQuality;
  const marineWarning = isMarineRelevant(current, airQuality);
  const currentIcon = getWeatherIconName(current.weather[0]?.icon || '01d');
  const windKnots = getWindSpeedKnots(current.wind_speed);
  const windDir = getWindDirection(current.wind_deg);
  const gustKnots = current.wind_gust ? getWindSpeedKnots(current.wind_gust) : null;
  const aqiInfo = airQuality ? getAqiLabel(airQuality.aqi) : null;

  return (
    <Animated.View entering={FadeInUp.duration(400).springify()}>
      {alerts.length > 0 ? (
        <Pressable onPress={() => setShowAlerts(!showAlerts)}>
          <View style={[styles.alertBanner, { backgroundColor: BladeColors.warning + '20', borderColor: BladeColors.warning }]}>
            <Feather name="alert-triangle" size={16} color={BladeColors.warning} />
            <ThemedText type="small" style={{ color: BladeColors.warning, flex: 1, marginLeft: Spacing.sm, fontWeight: '600' }}>
              {alerts.length} Weather Alert{alerts.length > 1 ? 's' : ''} Active
            </ThemedText>
            <Feather name={showAlerts ? 'chevron-up' : 'chevron-down'} size={16} color={BladeColors.warning} />
          </View>
        </Pressable>
      ) : null}

      {showAlerts && alerts.length > 0 ? (
        <View style={[styles.alertsExpanded, { backgroundColor: BladeColors.warning + '10', borderColor: BladeColors.warning + '40' }]}>
          {alerts.map((alert, index) => (
            <View key={index} style={styles.alertItem}>
              <ThemedText type="caption" style={{ color: BladeColors.warning, fontWeight: '700' }}>
                {alert.event}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={3}>
                {alert.description}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      {marineWarning.relevant ? (
        <View style={[styles.marineWarning, { backgroundColor: BladeColors.error + '15', borderColor: BladeColors.error + '40' }]}>
          <Feather name="alert-circle" size={14} color={BladeColors.error} />
          <ThemedText type="small" style={{ color: BladeColors.error, marginLeft: Spacing.xs, fontWeight: '500' }}>
            {marineWarning.reason}
          </ThemedText>
        </View>
      ) : null}

      <View style={[styles.container, { backgroundColor: theme.surfaceElevated }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Feather name="navigation" size={12} color={theme.textTertiary} />
            <ThemedText type="caption" style={{ color: theme.textTertiary, marginLeft: 4 }}>
              Phone GPS
            </ThemedText>
          </View>
          <Pressable onPress={toggleUnit} style={styles.unitToggle}>
            <ThemedText type="caption" style={{ color: unit === 'C' ? theme.primary : theme.textTertiary, fontWeight: unit === 'C' ? '700' : '400' }}>
              C
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.textTertiary }}> / </ThemedText>
            <ThemedText type="caption" style={{ color: unit === 'F' ? theme.primary : theme.textTertiary, fontWeight: unit === 'F' ? '700' : '400' }}>
              F
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.currentWeather}>
          <View style={styles.currentMain}>
            <Feather name={currentIcon as any} size={48} color={theme.primary} />
            <View style={styles.currentTemp}>
              <ThemedText type="h1" style={{ color: theme.text, fontSize: 48, lineHeight: 52 }}>
                {formatTemp(current.temp, unit)}
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Feels {formatTemp(current.feels_like, unit)}
              </ThemedText>
            </View>
          </View>
          
          <View style={styles.currentDetails}>
            <View style={styles.detailRow}>
              <Feather name="wind" size={14} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 6 }}>
                {windKnots} kts {windDir}
                {gustKnots ? ` (G${gustKnots})` : ''}
              </ThemedText>
            </View>
            <View style={styles.detailRow}>
              <Feather name="droplet" size={14} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 6 }}>
                {current.humidity}% humidity
              </ThemedText>
            </View>
            <View style={styles.detailRow}>
              <Feather name="eye" size={14} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 6 }}>
                {(current.visibility / 1000).toFixed(1)} km vis
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Air Quality & Conditions Section */}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        
        <View style={styles.conditionsSection}>
          <ThemedText type="caption" style={{ color: theme.textTertiary, marginBottom: Spacing.sm }}>
            Conditions at Sea Level
          </ThemedText>
          <View style={styles.conditionsRow}>
            {/* Wind */}
            <View style={styles.conditionItem}>
              <View style={[styles.conditionIcon, { backgroundColor: theme.primary + '15' }]}>
                <Feather name="wind" size={18} color={theme.primary} />
              </View>
              <ThemedText type="small" style={{ color: theme.textTertiary, marginTop: 4 }}>Wind</ThemedText>
              <ThemedText type="body" style={{ color: theme.text, fontWeight: '600' }}>
                {windKnots} kts
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>{windDir}</ThemedText>
            </View>
            
            {/* Visibility */}
            <View style={styles.conditionItem}>
              <View style={[styles.conditionIcon, { backgroundColor: BladeColors.marine + '15' }]}>
                <Feather name="eye" size={18} color={BladeColors.marine} />
              </View>
              <ThemedText type="small" style={{ color: theme.textTertiary, marginTop: 4 }}>Visibility</ThemedText>
              <ThemedText type="body" style={{ color: theme.text, fontWeight: '600' }}>
                {(current.visibility / 1000).toFixed(1)} km
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {current.visibility >= 10000 ? 'Clear' : current.visibility >= 5000 ? 'Good' : current.visibility >= 2000 ? 'Moderate' : 'Poor'}
              </ThemedText>
            </View>
            
            {/* Air Quality */}
            <View style={styles.conditionItem}>
              <View style={[styles.conditionIcon, { backgroundColor: (aqiInfo?.color || theme.textTertiary) + '15' }]}>
                <Feather name="cloud" size={18} color={aqiInfo?.color || theme.textTertiary} />
              </View>
              <ThemedText type="small" style={{ color: theme.textTertiary, marginTop: 4 }}>Air Quality</ThemedText>
              {aqiInfo ? (
                <>
                  <ThemedText type="body" style={{ color: aqiInfo.color, fontWeight: '600' }}>
                    {aqiInfo.label}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>AQI {airQuality?.aqi}</ThemedText>
                </>
              ) : (
                <ThemedText type="body" style={{ color: theme.textSecondary }}>N/A</ThemedText>
              )}
            </View>
          </View>
          
          {/* Air quality warning for poor conditions */}
          {aqiInfo && airQuality && airQuality.aqi >= 3 ? (
            <View style={[styles.aqiWarning, { backgroundColor: aqiInfo.color + '15', borderColor: aqiInfo.color + '40' }]}>
              <Feather name="alert-circle" size={12} color={aqiInfo.color} />
              <ThemedText type="small" style={{ color: aqiInfo.color, marginLeft: Spacing.xs, flex: 1 }}>
                {airQuality.aqi >= 4 ? 'Dense air pollution may reduce visibility' : aqiInfo.description}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.forecastSection}>
          <ThemedText type="caption" style={{ color: theme.textTertiary, marginBottom: Spacing.sm }}>
            3-Hour Forecast
          </ThemedText>
          <View style={styles.forecastRow}>
            {hourlyForecast.map((hour, index) => (
              <HourlyItem key={index} hour={hour} unit={unit} theme={theme} />
            ))}
          </View>
        </View>

        <View style={[styles.disclaimer, { backgroundColor: theme.backgroundTertiary + '50' }]}>
          <Feather name="info" size={12} color={theme.textTertiary} />
          <ThemedText type="small" style={{ color: theme.textTertiary, marginLeft: 6, flex: 1 }}>
            Weather can change quickly. Monitor local conditions and heed all warnings. Boat safely.
          </ThemedText>
        </View>
      </View>
    </Animated.View>
  );
}

interface HourlyItemProps {
  hour: HourlyWeather;
  unit: TemperatureUnit;
  theme: any;
}

function HourlyItem({ hour, unit, theme }: HourlyItemProps) {
  const time = new Date(hour.dt * 1000);
  const timeStr = time.toLocaleTimeString([], { hour: 'numeric' });
  const icon = getWeatherIconName(hour.weather[0]?.icon || '01d');
  const rainChance = Math.round(hour.pop * 100);

  return (
    <View style={styles.hourlyItem}>
      <ThemedText type="caption" style={{ color: theme.textSecondary }}>
        {timeStr}
      </ThemedText>
      <View style={styles.hourlyIconContainer}>
        <Feather name={icon as any} size={20} color={theme.primary} />
        {rainChance > 20 ? (
          <View style={styles.rainBadge}>
            <ThemedText type="small" style={{ color: BladeColors.marine, fontSize: 9 }}>
              {rainChance}%
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="body" style={{ color: theme.text, fontWeight: '600' }}>
        {formatTemp(hour.temp, unit)}
      </ThemedText>
      <View style={styles.hourlyWind}>
        <Feather name="wind" size={10} color={theme.textTertiary} />
        <ThemedText type="small" style={{ color: theme.textTertiary, fontSize: 10, marginLeft: 2 }}>
          {getWindSpeedKnots(hour.wind_speed)}kt
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['2xl'],
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  errorTextContainer: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  retryButton: {
    padding: Spacing.sm,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  alertsExpanded: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  alertItem: {
    marginBottom: Spacing.sm,
  },
  marineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  currentWeather: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  currentMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentTemp: {
    marginLeft: Spacing.md,
  },
  currentDetails: {
    alignItems: 'flex-end',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.lg,
  },
  forecastSection: {},
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hourlyItem: {
    alignItems: 'center',
    flex: 1,
  },
  hourlyIconContainer: {
    marginVertical: Spacing.xs,
    position: 'relative',
  },
  rainBadge: {
    position: 'absolute',
    bottom: -4,
    right: -8,
  },
  hourlyWind: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.lg,
  },
  conditionsSection: {
    marginBottom: Spacing.sm,
  },
  conditionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  conditionItem: {
    flex: 1,
    alignItems: 'center',
  },
  conditionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aqiWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
});
