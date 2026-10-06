/**
 * OZIZ Explainable Priority Engine
 * Computes deterministic, auditable priority scores from multimodal AI analysis & geographic context
 */

import {
  AiAnalysisResult,
  PriorityBreakdown,
  PriorityLevel,
  ReportContext,
} from '../shared/types.ts';

// Configurable weights (sum up to 100 max before multiplier)
const WEIGHTS = {
  w1_severity: 25,     // Severity (1..5)
  w2_location: 20,     // Proximity to vulnerable landmarks
  w3_weather: 15,      // Precip, frost, night
  w4_traffic: 10,      // Traffic load
  w5_duplicates: 15,   // Community confirmations
  w6_age: 10,          // Days without resolution
  w7_emergency: 25,    // Emergency flag bonus
};

export function calculatePriority(
  ai: AiAnalysisResult,
  context: ReportContext,
  confirmationsCount: number = 0,
  ageDays: number = 0
): PriorityBreakdown {
  // 1. Severity contribution (1..5 => 0.2..1.0)
  const severityNorm = (ai.severity / 5);
  const severityContrib = Math.round(severityNorm * WEIGHTS.w1_severity);

  // 2. Location risk
  let locRiskScore = 0.2;
  const locNotes: string[] = [];
  if (context.location.near.includes('school') || context.location.near.includes('kindergarten')) {
    locRiskScore += 0.5;
    locNotes.push('Рядом школа/детский сад');
  }
  if (context.location.near.includes('hospital')) {
    locRiskScore += 0.3;
    locNotes.push('Рядом больница');
  }
  if (context.location.road_type === 'highway' || context.location.road_type === 'arterial') {
    locRiskScore += 0.3;
    locNotes.push('Магистральная дорога с высоким скоростным режимом');
  }
  locRiskScore = Math.min(1.0, locRiskScore);
  const locationContrib = Math.round(locRiskScore * WEIGHTS.w2_location);

  // 3. Weather factor
  let weatherRisk = 0.1;
  const weatherNotes: string[] = [];
  if (context.weather.precipitation_mm > 1.0) {
    weatherRisk += 0.4;
    weatherNotes.push(`Осадки ${context.weather.precipitation_mm} мм/ч (риск потери сцепления)`);
  }
  if (context.weather.temp_c <= 0 || context.weather.forecast_24h === 'freezing' || context.weather.forecast_24h === 'snow') {
    weatherRisk += 0.4;
    weatherNotes.push('Заморозки/гололедица');
  }
  if (context.time.is_night) {
    weatherRisk += 0.2;
    weatherNotes.push('Ночное время (ограниченная видимость)');
  }
  weatherRisk = Math.min(1.0, weatherRisk);
  const weatherContrib = Math.round(weatherRisk * WEIGHTS.w3_weather);

  // 4. Traffic factor
  let trafficScore = 0.3;
  if (context.traffic.level === 'high' || context.time.is_rush_hour) {
    trafficScore = 1.0;
  } else if (context.traffic.level === 'medium') {
    trafficScore = 0.6;
  }
  const trafficContrib = Math.round(trafficScore * WEIGHTS.w4_traffic);

  // 5. Duplicates factor (community resonance)
  const duplicatesNorm = Math.min(1.0, (confirmationsCount * 0.2) + (context.history.similar_reports_100m * 0.15));
  const duplicatesContrib = Math.round(duplicatesNorm * WEIGHTS.w5_duplicates);

  // 6. Age factor (escalates over time if unresolved)
  const ageNorm = Math.min(1.0, ageDays / 7);
  const ageContrib = Math.round(ageNorm * WEIGHTS.w6_age);

  // 7. Emergency bonus
  const emergencyContrib = ai.is_emergency ? WEIGHTS.w7_emergency : 0;

  // Confidence multiplier (0.80 .. 1.00)
  const confidenceMultiplier = 0.8 + (Math.max(0.5, ai.confidence) * 0.2);

  const rawSum = severityContrib + locationContrib + weatherContrib + trafficContrib + duplicatesContrib + ageContrib + emergencyContrib;
  const totalScore = Math.min(100, Math.max(5, Math.round(rawSum * confidenceMultiplier)));

  let level: PriorityLevel = 'LOW';
  if (totalScore >= 85 || ai.is_emergency) {
    level = 'CRITICAL';
  } else if (totalScore >= 65) {
    level = 'HIGH';
  } else if (totalScore >= 40) {
    level = 'MEDIUM';
  }

  return {
    score: totalScore,
    level,
    factors: {
      severity_norm: {
        value: Math.round(severityNorm * 100) / 100,
        weight: WEIGHTS.w1_severity,
        contribution: severityContrib,
      },
      location_risk: {
        value: Math.round(locRiskScore * 100) / 100,
        weight: WEIGHTS.w2_location,
        contribution: locationContrib,
        note: locNotes.join(', ') || 'Стандартная городская зона',
      },
      weather_factor: {
        value: Math.round(weatherRisk * 100) / 100,
        weight: WEIGHTS.w3_weather,
        contribution: weatherContrib,
        note: weatherNotes.join(', ') || 'Благоприятные метеоусловия',
      },
      traffic_factor: {
        value: trafficScore,
        weight: WEIGHTS.w4_traffic,
        contribution: trafficContrib,
      },
      duplicates_factor: {
        value: Math.round(duplicatesNorm * 100) / 100,
        weight: WEIGHTS.w5_duplicates,
        contribution: duplicatesContrib,
      },
      age_factor: {
        value: Math.round(ageNorm * 100) / 100,
        weight: WEIGHTS.w6_age,
        contribution: ageContrib,
      },
      emergency_bonus: {
        value: ai.is_emergency ? 1 : 0,
        weight: WEIGHTS.w7_emergency,
        contribution: emergencyContrib,
      },
      confidence_multiplier: Math.round(confidenceMultiplier * 100) / 100,
    },
  };
}
