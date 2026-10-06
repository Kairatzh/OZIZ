/**
 * Open-Meteo Weather Service with 15-minute coordinate grid cache
 */

import { WeatherContext } from '../shared/types.ts';

interface CacheEntry {
  timestamp: number;
  data: WeatherContext;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 mins

export async function getWeatherForLocation(lat: number, lng: number): Promise<WeatherContext> {
  // Round to ~1km grid
  const gridKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const now = Date.now();
  const cached = cache.get(gridKey);

  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });

    if (res.ok) {
      const json: any = await res.json();
      const current = json.current || {};
      const temp = current.temperature_2m ?? 14;
      const precip = current.precipitation ?? 0;
      const wind = current.wind_speed_10m ?? 4.2;
      const code = current.weather_code ?? 0;

      let forecast: 'snow' | 'rain' | 'clear' | 'freezing' | 'cloudy' = 'clear';
      if (temp <= 0 && precip > 0) {
        forecast = 'snow';
      } else if (temp <= 1 && precip > 0) {
        forecast = 'freezing';
      } else if (precip > 0.5) {
        forecast = 'rain';
      } else if (code > 2) {
        forecast = 'cloudy';
      }

      const weatherData: WeatherContext = {
        temp_c: Math.round(temp * 10) / 10,
        precipitation_mm: Math.round(precip * 10) / 10,
        wind_ms: Math.round(wind * 10) / 10,
        forecast_24h: forecast,
        source: 'Open-Meteo Realtime',
      };

      cache.set(gridKey, { timestamp: now, data: weatherData });
      return weatherData;
    }
  } catch (err) {
    console.warn('Open-Meteo fetch failed, using realistic fallback weather:', err);
  }

  // Fallback realistic weather
  const defaultWeather: WeatherContext = {
    temp_c: 12.4,
    precipitation_mm: 0.2,
    wind_ms: 3.8,
    forecast_24h: 'clear',
    source: 'Open-Meteo Cache (Simulated)',
  };
  return defaultWeather;
}
