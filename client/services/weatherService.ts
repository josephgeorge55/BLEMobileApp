import * as Location from 'expo-location';
import weatherConfig from '../config/weather.json';

export interface WeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

export interface CurrentWeather {
  temp: number;
  feels_like: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  visibility: number;
  uvi: number;
  clouds: number;
  weather: WeatherCondition[];
  dt: number;
}

export interface HourlyWeather {
  dt: number;
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  wind_gust?: number;
  weather: WeatherCondition[];
  pop: number;
}

export interface WeatherAlert {
  sender_name: string;
  event: string;
  start: number;
  end: number;
  description: string;
  tags: string[];
}

export interface WeatherData {
  lat: number;
  lon: number;
  timezone: string;
  current: CurrentWeather;
  hourly: HourlyWeather[];
  alerts?: WeatherAlert[];
}

export interface WeatherResult {
  success: boolean;
  data?: WeatherData;
  error?: string;
  permissionDenied?: boolean;
}

export type TemperatureUnit = 'C' | 'F';

export function convertTemp(tempCelsius: number, unit: TemperatureUnit): number {
  if (unit === 'F') {
    return (tempCelsius * 9/5) + 32;
  }
  return tempCelsius;
}

export function formatTemp(temp: number, unit: TemperatureUnit): string {
  const value = Math.round(convertTemp(temp, unit));
  return `${value}°${unit}`;
}

export function getWindDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

export function getWindSpeedKnots(metersPerSecond: number): number {
  return Math.round(metersPerSecond * 1.944);
}

export function getWeatherIconName(iconCode: string): string {
  const iconMap: { [key: string]: string } = {
    '01d': 'sun',
    '01n': 'moon',
    '02d': 'cloud',
    '02n': 'cloud',
    '03d': 'cloud',
    '03n': 'cloud',
    '04d': 'cloud',
    '04n': 'cloud',
    '09d': 'cloud-rain',
    '09n': 'cloud-rain',
    '10d': 'cloud-drizzle',
    '10n': 'cloud-drizzle',
    '11d': 'cloud-lightning',
    '11n': 'cloud-lightning',
    '13d': 'cloud-snow',
    '13n': 'cloud-snow',
    '50d': 'wind',
    '50n': 'wind',
  };
  return iconMap[iconCode] || 'cloud';
}

export function getWeatherSeverity(alertEvent: string): 'warning' | 'watch' | 'advisory' | 'info' {
  const eventLower = alertEvent.toLowerCase();
  if (eventLower.includes('warning') || eventLower.includes('emergency') || eventLower.includes('extreme')) {
    return 'warning';
  }
  if (eventLower.includes('watch')) {
    return 'watch';
  }
  if (eventLower.includes('advisory')) {
    return 'advisory';
  }
  return 'info';
}

export function isMarineRelevant(weather: CurrentWeather): { relevant: boolean; reason?: string } {
  const windSpeedKnots = getWindSpeedKnots(weather.wind_speed);
  const gustSpeedKnots = weather.wind_gust ? getWindSpeedKnots(weather.wind_gust) : 0;
  
  if (windSpeedKnots >= 20) {
    return { relevant: true, reason: `High winds: ${windSpeedKnots} kts` };
  }
  if (gustSpeedKnots >= 25) {
    return { relevant: true, reason: `Strong gusts: ${gustSpeedKnots} kts` };
  }
  if (weather.visibility < 1000) {
    return { relevant: true, reason: 'Low visibility' };
  }
  
  const conditionId = weather.weather[0]?.id;
  if (conditionId >= 200 && conditionId < 300) {
    return { relevant: true, reason: 'Thunderstorm activity' };
  }
  
  return { relevant: false };
}

export async function requestLocationPermission(): Promise<{ granted: boolean; error?: string }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { granted: false, error: 'Location permission denied' };
    }
    return { granted: true };
  } catch (error: any) {
    return { granted: false, error: error.message || 'Failed to request location permission' };
  }
}

export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('Failed to get location:', error);
    return null;
  }
}

export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherResult> {
  try {
    const url = new URL(weatherConfig.baseUrl);
    url.searchParams.append('lat', latitude.toString());
    url.searchParams.append('lon', longitude.toString());
    url.searchParams.append('appid', weatherConfig.apiKey);
    url.searchParams.append('units', 'metric');
    url.searchParams.append('exclude', 'minutely,daily');
    
    console.log('[Weather] Fetching weather data...');
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Weather] API error:', response.status, errorText);
      return { 
        success: false, 
        error: `Weather API error: ${response.status}` 
      };
    }
    
    const data: WeatherData = await response.json();
    console.log('[Weather] Data received successfully');
    
    return { success: true, data };
  } catch (error: any) {
    console.error('[Weather] Fetch error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to fetch weather data' 
    };
  }
}

export async function getWeatherWithLocation(): Promise<WeatherResult> {
  const permissionResult = await requestLocationPermission();
  
  if (!permissionResult.granted) {
    return { 
      success: false, 
      error: permissionResult.error, 
      permissionDenied: true 
    };
  }
  
  const location = await getCurrentLocation();
  
  if (!location) {
    return { 
      success: false, 
      error: 'Unable to get current location' 
    };
  }
  
  return fetchWeather(location.latitude, location.longitude);
}
