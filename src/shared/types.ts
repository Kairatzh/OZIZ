/**
 * OZIZ — Civic Registry Shared Domain Types & Schema
 */

export type AppealCategory =
  | 'pothole'
  | 'broken_streetlight'
  | 'open_manhole'
  | 'illegal_dump'
  | 'damaged_sidewalk'
  | 'fallen_tree'
  | 'flooding'
  | 'graffiti'
  | 'broken_traffic_light'
  | 'damaged_road_sign'
  | 'other';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AppealStatus =
  | 'NEW'
  | 'AI_VERIFIED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CONFIRMED_BY_CITIZEN'
  | 'REOPENED'
  | 'REJECTED';

export type HazardTarget = 'pedestrians' | 'drivers' | 'cyclists' | 'children' | 'environment';

export interface AiAnalysisResult {
  category: AppealCategory;
  subcategory: string;
  description_ai: string;
  severity: number; // 1..5
  hazard_to: HazardTarget[];
  estimated_size: {
    value: number;
    unit: 'cm' | 'm' | 'm2';
  };
  confidence: number; // 0..1
  text_photo_consistent: boolean;
  needs_human_review: boolean;
  is_emergency: boolean;
  emergency_reason: string | null;
  detected_objects: string[];
  language_detected: 'ru' | 'kk' | 'en';
}

export interface ReportLocation {
  lat: number;
  lng: number;
  accuracy_m: number;
  address: string;
  district: string;
  road_type: 'highway' | 'arterial' | 'local' | 'yard' | 'sidewalk';
  near: Array<'school' | 'hospital' | 'kindergarten' | 'bus_stop' | 'park' | 'metro'>;
}

export interface WeatherContext {
  temp_c: number;
  precipitation_mm: number;
  wind_ms: number;
  forecast_24h: 'snow' | 'rain' | 'clear' | 'freezing' | 'cloudy';
  source: string;
}

export interface ReportContext {
  location: ReportLocation;
  weather: WeatherContext;
  time: {
    reported_at: string;
    photo_taken_at?: string;
    is_night: boolean;
    is_rush_hour: boolean;
  };
  traffic: {
    level: 'low' | 'medium' | 'high';
    source: string;
  };
  history: {
    similar_reports_100m: number;
    unresolved_days_nearest: number;
    reporter_trust_score: number;
  };
}

export interface PriorityBreakdown {
  score: number; // 0..100
  level: PriorityLevel;
  factors: {
    severity_norm: { value: number; weight: number; contribution: number };
    location_risk: { value: number; weight: number; contribution: number; note: string };
    weather_factor: { value: number; weight: number; contribution: number; note: string };
    traffic_factor: { value: number; weight: number; contribution: number };
    duplicates_factor: { value: number; weight: number; contribution: number };
    age_factor: { value: number; weight: number; contribution: number };
    emergency_bonus: { value: number; weight: number; contribution: number };
    confidence_multiplier: number;
  };
}

export interface MunicipalService {
  id: string;
  name: string;
  code: 'roads' | 'lighting' | 'water' | 'utilities' | 'ecology' | 'emergency';
  categories: AppealCategory[];
  phone: string;
  email: string;
  sla_hours: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  stats: {
    total_assigned: number;
    resolved: number;
    in_progress: number;
    avg_response_hours: number;
    sla_violations: number;
    reopened_count: number;
  };
}

export interface OnChainRecord {
  tx_signature: string;
  block_time: number;
  report_pda: string;
  media_sha256: string;
  media_cid: string;
  text_sha256: string;
  ai_analysis_sha256: string;
  geo_cell: string; // H3/geohash cell
  explorer_url: string;
  immutable: boolean;
  is_verified: boolean;
  event_count: number;
  last_event_hash: string;
}

export interface StatusEventRecord {
  id: string;
  seq: number;
  status: AppealStatus;
  actor_role: 'citizen' | 'service' | 'oracle' | 'system';
  actor_title: string;
  actor_pubkey?: string;
  note?: string;
  note_sha256?: string;
  timestamp: string;
  prev_event_hash: string;
  event_hash: string;
  tx_signature?: string;
  sla_breached?: boolean;
}

export interface CivicAppeal {
  id: string; // UUID
  short_code: string; // e.g. "OZIZ-2026-482"
  title: string;
  user_description?: string;
  media_url: string;
  media_thumbnail_url?: string;
  media_sha256: string;
  media_cid: string;
  category: AppealCategory;
  subcategory: string;
  status: AppealStatus;
  ai_analysis: AiAnalysisResult;
  context: ReportContext;
  priority: PriorityBreakdown;
  assigned_service_id: string;
  assigned_service_name: string;
  service_notes?: string;
  resolution_media_url?: string;
  resolution_note?: string;
  confirmations_count: number;
  citizen_votes: {
    repaired: number;
    not_repaired: number;
  };
  created_at: string;
  updated_at: string;
  sla_deadline: string;
  sla_violated: boolean;
  events: StatusEventRecord[];
  onchain: OnChainRecord;
}

export interface CreateReportPayload {
  image_base64: string;
  user_text?: string;
  lat: number;
  lng: number;
  accuracy_m?: number;
  address?: string;
  district?: string;
  is_anonymous?: boolean;
}
