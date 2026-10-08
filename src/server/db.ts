/**
 * In-Memory Civic Database with 30 Seed Reports, 6 Municipal Services,
 * SLA Tracking, and Real-Time Event Bus
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import {
  AppealCategory,
  AppealStatus,
  CivicAppeal,
  MunicipalService,
  StatusEventRecord,
} from '../shared/types.ts';
import {
  appendStatusOnChain,
  deriveReportPda,
  registerReportOnChain,
  sha256,
} from './solanaRelayer.ts';

export const civicEventBus = new EventEmitter();

// 6 Municipal Services
export const MUNICIPAL_SERVICES: MunicipalService[] = [
  {
    id: 'srv_roads',
    name: 'ГорДорСтрой (Дорожная служба)',
    code: 'roads',
    categories: ['pothole', 'damaged_road_sign', 'broken_traffic_light'],
    phone: '+7 (7172) 55-01-01',
    email: 'roads@oziz.gov',
    sla_hours: { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 },
    stats: {
      total_assigned: 142,
      resolved: 118,
      in_progress: 19,
      avg_response_hours: 14.2,
      sla_violations: 3,
      reopened_count: 2,
    },
  },
  {
    id: 'srv_lighting',
    name: 'ГорСвет (Электросети и освещение)',
    code: 'lighting',
    categories: ['broken_streetlight'],
    phone: '+7 (7172) 55-02-02',
    email: 'lighting@oziz.gov',
    sla_hours: { CRITICAL: 6, HIGH: 36, MEDIUM: 96, LOW: 192 },
    stats: {
      total_assigned: 89,
      resolved: 74,
      in_progress: 12,
      avg_response_hours: 18.5,
      sla_violations: 2,
      reopened_count: 1,
    },
  },
  {
    id: 'srv_water',
    name: 'ГорВодоканал (Водопровод и ливневки)',
    code: 'water',
    categories: ['open_manhole', 'flooding'],
    phone: '+7 (7172) 55-03-03',
    email: 'water@oziz.gov',
    sla_hours: { CRITICAL: 2, HIGH: 12, MEDIUM: 48, LOW: 96 },
    stats: {
      total_assigned: 115,
      resolved: 98,
      in_progress: 14,
      avg_response_hours: 5.6,
      sla_violations: 1,
      reopened_count: 0,
    },
  },
  {
    id: 'srv_utilities',
    name: 'ЖКХ-Инфра (Благоустройство дворов)',
    code: 'utilities',
    categories: ['damaged_sidewalk', 'graffiti'],
    phone: '+7 (7172) 55-04-04',
    email: 'utilities@oziz.gov',
    sla_hours: { CRITICAL: 12, HIGH: 48, MEDIUM: 120, LOW: 240 },
    stats: {
      total_assigned: 76,
      resolved: 55,
      in_progress: 16,
      avg_response_hours: 32.1,
      sla_violations: 5,
      reopened_count: 4,
    },
  },
  {
    id: 'srv_ecology',
    name: 'Зеленстрой & Экологический патруль',
    code: 'ecology',
    categories: ['illegal_dump', 'fallen_tree'],
    phone: '+7 (7172) 55-05-05',
    email: 'ecology@oziz.gov',
    sla_hours: { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 144 },
    stats: {
      total_assigned: 93,
      resolved: 81,
      in_progress: 9,
      avg_response_hours: 11.4,
      sla_violations: 2,
      reopened_count: 1,
    },
  },
  {
    id: 'srv_emergency',
    name: 'Служба спасения 112 (Чрезвычайные ситуации)',
    code: 'emergency',
    categories: ['open_manhole', 'fallen_tree', 'flooding'],
    phone: '112',
    email: 'emergency@oziz.gov',
    sla_hours: { CRITICAL: 1, HIGH: 4, MEDIUM: 12, LOW: 24 },
    stats: {
      total_assigned: 38,
      resolved: 36,
      in_progress: 2,
      avg_response_hours: 1.1,
      sla_violations: 0,
      reopened_count: 0,
    },
  },
];

export function findServiceForCategory(category: AppealCategory, isEmergency: boolean): MunicipalService {
  if (isEmergency && (category === 'open_manhole' || category === 'fallen_tree')) {
    return MUNICIPAL_SERVICES.find(s => s.id === 'srv_emergency') || MUNICIPAL_SERVICES[0];
  }
  const match = MUNICIPAL_SERVICES.find(s => s.categories.includes(category));
  return match || MUNICIPAL_SERVICES[0];
}

// In-Memory store for appeals
export let appealsStore: CivicAppeal[] = [];

// Realistic curated photos for civic seed data
const SAMPLE_PHOTOS = {
  pothole_deep: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
  pothole_asphalt: 'https://images.unsplash.com/photo-1599839575945-a9e5af0c3fa5?auto=format&fit=crop&w=800&q=80',
  manhole_danger: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=800&q=80',
  streetlight_dark: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=800&q=80',
  dump_trash: 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&w=800&q=80',
  sidewalk_broken: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
  tree_fallen: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
  flooding_road: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
  traffic_light: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=800&q=80',
  road_fixed: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
};

// Seed 30 realistic appeals
export function initSeedData() {
  if (appealsStore.length > 0) return;

  const rawSeeds = [
    {
      id: 'c1a01101-7001-4000-8000-000000000001',
      short_code: 'OZIZ-2026-001',
      title: 'Критическая яма 80 см на ул. Мангилик Ел',
      user_description: 'Огромная яма на перекрестке возле Назарбаев Университета, уже пробило 2 колеса!',
      photo: SAMPLE_PHOTOS.pothole_deep,
      cat: 'pothole' as AppealCategory,
      subcat: 'Выбоина дорожного полотна',
      lat: 51.0905,
      lng: 71.4021,
      district: 'Есильский район',
      address: 'пр. Мангилик Ел, 52',
      road_type: 'arterial' as const,
      near: ['school', 'bus_stop'] as any,
      severity: 5,
      is_emergency: true,
      hazard: ['drivers', 'cyclists'] as any,
      status: 'IN_PROGRESS' as AppealStatus,
      confirmations: 14,
      service_id: 'srv_roads',
      hours_ago: 8,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000002',
      short_code: 'OZIZ-2026-002',
      title: 'Открытый колодец возле детской площадки',
      user_description: 'Люк сдвинут, крышки нет! В темноте дети могут упасть.',
      photo: SAMPLE_PHOTOS.manhole_danger,
      cat: 'open_manhole' as AppealCategory,
      subcat: 'Сорванная крышка канализационного люка',
      lat: 51.1342,
      lng: 71.4308,
      district: 'Алматинский район',
      address: 'ул. Тауелсиздик, 14',
      road_type: 'yard' as const,
      near: ['kindergarten', 'school'] as any,
      severity: 5,
      is_emergency: true,
      hazard: ['pedestrians', 'children'] as any,
      status: 'ASSIGNED' as AppealStatus,
      confirmations: 23,
      service_id: 'srv_water',
      hours_ago: 3,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000003',
      short_code: 'OZIZ-2026-003',
      title: 'Не работает уличное освещение вдоль аллеи',
      user_description: 'Пять фонарей подряд не горят уже третью неделю, ходить страшно.',
      photo: SAMPLE_PHOTOS.streetlight_dark,
      cat: 'broken_streetlight' as AppealCategory,
      subcat: 'Повреждение кабельной линии опор освещения',
      lat: 51.1601,
      lng: 71.4285,
      district: 'Байконурский район',
      address: 'ул. Сейфуллина, 88',
      road_type: 'local' as const,
      near: ['bus_stop', 'park'] as any,
      severity: 3,
      is_emergency: false,
      hazard: ['pedestrians'] as any,
      status: 'NEW' as AppealStatus,
      confirmations: 7,
      service_id: 'srv_lighting',
      hours_ago: 36,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000004',
      short_code: 'OZIZ-2026-004',
      title: 'Стихийная свалка строительных мешков',
      user_description: 'Неизвестные выгрузили ночью кучу мусора прямо на газоне у реки.',
      photo: SAMPLE_PHOTOS.dump_trash,
      cat: 'illegal_dump' as AppealCategory,
      subcat: 'Несанкционированное складирование ТБО',
      lat: 51.1215,
      lng: 71.4722,
      district: 'Есильский район',
      address: 'набережная р. Есиль, ур. Акбулак',
      road_type: 'local' as const,
      near: ['park'] as any,
      severity: 3,
      is_emergency: false,
      hazard: ['environment'] as any,
      status: 'RESOLVED' as AppealStatus,
      confirmations: 12,
      service_id: 'srv_ecology',
      hours_ago: 72,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000005',
      short_code: 'OZIZ-2026-005',
      title: 'Провал брусчатки перед городской больницей №1',
      user_description: 'Коляски и пожилые люди спотыкаются, глубина ямы около 15 см.',
      photo: SAMPLE_PHOTOS.sidewalk_broken,
      cat: 'damaged_sidewalk' as AppealCategory,
      subcat: 'Проседание пешеходного полотна',
      lat: 51.1788,
      lng: 71.4110,
      district: 'Сарыаркинский район',
      address: 'пр. Республики, 34',
      road_type: 'sidewalk' as const,
      near: ['hospital', 'bus_stop'] as any,
      severity: 4,
      is_emergency: false,
      hazard: ['pedestrians', 'children'] as any,
      status: 'CONFIRMED_BY_CITIZEN' as AppealStatus,
      confirmations: 18,
      service_id: 'srv_utilities',
      hours_ago: 120,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000006',
      short_code: 'OZIZ-2026-006',
      title: 'Поваленный тополь перегородил полосу движения',
      user_description: 'Сильный ветер повалил дерево на контактные провода и проезжую часть!',
      photo: SAMPLE_PHOTOS.tree_fallen,
      cat: 'fallen_tree' as AppealCategory,
      subcat: 'Ветровал на линии электропередач',
      lat: 51.1450,
      lng: 71.4550,
      district: 'Алматинский район',
      address: 'ул. Сатпаева, 19',
      road_type: 'arterial' as const,
      near: ['school'] as any,
      severity: 5,
      is_emergency: true,
      hazard: ['drivers', 'pedestrians'] as any,
      status: 'IN_PROGRESS' as AppealStatus,
      confirmations: 31,
      service_id: 'srv_emergency',
      hours_ago: 2,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000007',
      short_code: 'OZIZ-2026-007',
      title: 'Затопление перекрестка после дождя, забита ливневка',
      user_description: 'Машины глохнут, уровень воды по колено, пешеходный переход залит.',
      photo: SAMPLE_PHOTOS.flooding_road,
      cat: 'flooding' as AppealCategory,
      subcat: 'Заиливание ливнеприемного колодца',
      lat: 51.1120,
      lng: 71.4210,
      district: 'Есильский район',
      address: 'пр. Кабанбай батыра, 62',
      road_type: 'arterial' as const,
      near: ['bus_stop', 'hospital'] as any,
      severity: 4,
      is_emergency: true,
      hazard: ['drivers', 'pedestrians'] as any,
      status: 'ASSIGNED' as AppealStatus,
      confirmations: 9,
      service_id: 'srv_water',
      hours_ago: 4,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000008',
      short_code: 'OZIZ-2026-008',
      title: 'Сломанный светофор, мигает желтым',
      user_description: 'Нерегулируемый выезд с боковой улицы создает затор и аварии.',
      photo: SAMPLE_PHOTOS.traffic_light,
      cat: 'broken_traffic_light' as AppealCategory,
      subcat: 'Сбой контроллера светофорного объекта',
      lat: 51.1388,
      lng: 71.4190,
      district: 'Сарыаркинский район',
      address: 'ул. Кенесары, 40',
      road_type: 'arterial' as const,
      near: ['school'] as any,
      severity: 4,
      is_emergency: true,
      hazard: ['drivers', 'pedestrians'] as any,
      status: 'IN_PROGRESS' as AppealStatus,
      confirmations: 16,
      service_id: 'srv_roads',
      hours_ago: 6,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000009',
      short_code: 'OZIZ-2026-009',
      title: 'Повторное появление выбоины после ямочного ремонта',
      user_description: 'Залатали неделю назад, и асфальт снова выкрошился!',
      photo: SAMPLE_PHOTOS.pothole_asphalt,
      cat: 'pothole' as AppealCategory,
      subcat: 'Дефект гарантийного ремонта',
      lat: 51.1550,
      lng: 71.4050,
      district: 'Сарыаркинский район',
      address: 'ул. Бейбитшилик, 25',
      road_type: 'local' as const,
      near: ['school'] as any,
      severity: 3,
      is_emergency: false,
      hazard: ['drivers'] as any,
      status: 'REOPENED' as AppealStatus,
      confirmations: 8,
      service_id: 'srv_roads',
      hours_ago: 48,
    },
    {
      id: 'c1a01101-7001-4000-8000-000000000010',
      short_code: 'OZIZ-2026-010',
      title: 'Поврежденный знак "Пешеходный переход" у школы',
      user_description: 'Знак согнут грузовиком, водители не замечают детей.',
      photo: SAMPLE_PHOTOS.traffic_light,
      cat: 'damaged_road_sign' as AppealCategory,
      subcat: 'Деформация дорожного знака',
      lat: 51.1290,
      lng: 71.4410,
      district: 'Алматинский район',
      address: 'ул. Майлина, 10',
      road_type: 'local' as const,
      near: ['school', 'kindergarten'] as any,
      severity: 4,
      is_emergency: false,
      hazard: ['children', 'pedestrians'] as any,
      status: 'ASSIGNED' as AppealStatus,
      confirmations: 11,
      service_id: 'srv_roads',
      hours_ago: 18,
    },
  ];

  // Generate 20 additional reports with varied parameters to reach 30
  for (let i = 11; i <= 30; i++) {
    const cats: AppealCategory[] = ['pothole', 'broken_streetlight', 'open_manhole', 'illegal_dump', 'damaged_sidewalk', 'flooding', 'graffiti'];
    const cat = cats[i % cats.length];
    const statuses: AppealStatus[] = ['NEW', 'AI_VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CONFIRMED_BY_CITIZEN'];
    const status = statuses[i % statuses.length];
    const latOffset = (Math.sin(i) * 0.05);
    const lngOffset = (Math.cos(i) * 0.05);

    rawSeeds.push({
      id: `c1a01101-7001-4000-8000-${String(i).padStart(12, '0')}`,
      short_code: `OZIZ-2026-${String(i).padStart(3, '0')}`,
      title: `Городской дефект #${i} (${cat})`,
      user_description: `Зафиксировано обращение жителей квартала по адресу микрорайон Самал, дом ${i}.`,
      photo: i % 2 === 0 ? SAMPLE_PHOTOS.pothole_asphalt : SAMPLE_PHOTOS.dump_trash,
      cat,
      subcat: `Инфраструктурный дефект категории ${cat}`,
      lat: 51.1300 + latOffset,
      lng: 71.4300 + lngOffset,
      district: i % 2 === 0 ? 'Есильский район' : 'Алматинский район',
      address: `микрорайон Самал, ул. Култегин, д. ${i}`,
      road_type: (i % 3 === 0 ? 'arterial' : 'yard') as any,
      near: (i % 2 === 0 ? ['school', 'bus_stop'] : ['park']) as any,
      severity: (i % 4) + 1,
      is_emergency: cat === 'open_manhole' || i % 7 === 0,
      hazard: ['pedestrians', 'drivers'] as any,
      status,
      confirmations: (i * 3) % 19,
      service_id: cat === 'open_manhole' || cat === 'flooding' ? 'srv_water' : cat === 'broken_streetlight' ? 'srv_lighting' : 'srv_roads',
      hours_ago: i * 3,
    });
  }

  // Construct full model objects with priority breakdown & cryptographic hash chains
  appealsStore = rawSeeds.map((seed, idx) => {
    const service = MUNICIPAL_SERVICES.find(s => s.id === seed.service_id) || MUNICIPAL_SERVICES[0];
    const createdAt = new Date(Date.now() - seed.hours_ago * 3600 * 1000).toISOString();
    const deadlineHours = service.sla_hours[seed.severity >= 5 ? 'CRITICAL' : seed.severity >= 4 ? 'HIGH' : seed.severity >= 3 ? 'MEDIUM' : 'LOW'];
    const slaDeadline = new Date(new Date(createdAt).getTime() + deadlineHours * 3600 * 1000).toISOString();
    const slaViolated = (seed.status !== 'RESOLVED' && seed.status !== 'CONFIRMED_BY_CITIZEN') && (Date.now() > new Date(slaDeadline).getTime());

    const aiAnalysis = {
      category: seed.cat,
      subcategory: seed.subcat,
      description_ai: `ИИ-верификация OZIZ: подтвержден дефект "${seed.subcat}". Степень тяжести ${seed.severity}/5.`,
      severity: seed.severity,
      hazard_to: seed.hazard,
      estimated_size: { value: 0.8, unit: 'm' as const },
      confidence: 0.93,
      text_photo_consistent: true,
      needs_human_review: false,
      is_emergency: seed.is_emergency,
      emergency_reason: seed.is_emergency ? 'Угроза безопасности движения и граждан' : null,
      detected_objects: ['городская инфраструктура', seed.cat],
      language_detected: 'ru' as const,
    };

    const context = {
      location: {
        lat: seed.lat,
        lng: seed.lng,
        accuracy_m: 8.5,
        address: seed.address,
        district: seed.district,
        road_type: seed.road_type,
        near: seed.near,
      },
      weather: {
        temp_c: 12.0,
        precipitation_mm: 0.0,
        wind_ms: 3.5,
        forecast_24h: 'clear' as const,
        source: 'Open-Meteo',
      },
      time: {
        reported_at: createdAt,
        is_night: false,
        is_rush_hour: true,
      },
      traffic: {
        level: (seed.road_type === 'arterial' ? 'high' : 'medium') as any,
        source: 'Yandex/2GIS estimate',
      },
      history: {
        similar_reports_100m: seed.confirmations > 10 ? 3 : 1,
        unresolved_days_nearest: 2,
        reporter_trust_score: 0.94,
      },
    };

    // Calculate priority
    const prioScore = Math.min(100, Math.max(15, (seed.severity * 16) + (seed.is_emergency ? 20 : 0) + (seed.confirmations * 1.5)));
    const prioLevel = prioScore >= 85 || seed.is_emergency ? 'CRITICAL' : prioScore >= 65 ? 'HIGH' : prioScore >= 40 ? 'MEDIUM' : 'LOW';

    const priority = {
      score: Math.round(prioScore),
      level: prioLevel as any,
      factors: {
        severity_norm: { value: seed.severity / 5, weight: 25, contribution: Math.round((seed.severity / 5) * 25) },
        location_risk: { value: seed.near.includes('school') ? 0.8 : 0.4, weight: 20, contribution: seed.near.includes('school') ? 16 : 8, note: seed.near.join(', ') },
        weather_factor: { value: 0.3, weight: 15, contribution: 5, note: 'Ясно' },
        traffic_factor: { value: seed.road_type === 'arterial' ? 1 : 0.5, weight: 10, contribution: seed.road_type === 'arterial' ? 10 : 5 },
        duplicates_factor: { value: Math.min(1, seed.confirmations / 15), weight: 15, contribution: Math.round(Math.min(1, seed.confirmations / 15) * 15) },
        age_factor: { value: Math.min(1, seed.hours_ago / 72), weight: 10, contribution: Math.round(Math.min(1, seed.hours_ago / 72) * 10) },
        emergency_bonus: { value: seed.is_emergency ? 1 : 0, weight: 25, contribution: seed.is_emergency ? 25 : 0 },
        confidence_multiplier: 0.96,
      },
    };

    // Build on-chain cryptographic event chain
    const reportPda = deriveReportPda(seed.id);
    const mediaSha256 = sha256(`media_${seed.id}`);
    const mediaCid = `bafybeig${mediaSha256.slice(0, 46)}`;
    const textSha256 = sha256(seed.user_description);
    const aiSha256 = sha256(JSON.stringify(aiAnalysis));

    const events: StatusEventRecord[] = [];
    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

    // 0. NEW
    const genEvent = appendStatusOnChain(reportPda, 0, prevHash, 'NEW', 'citizen', 'Гражданин (Relayer Gasless)', seed.user_description);
    events.push(genEvent);
    prevHash = genEvent.event_hash;

    // 1. AI_VERIFIED
    const aiEvent = appendStatusOnChain(reportPda, 1, prevHash, 'AI_VERIFIED', 'oracle', 'OZIZ AI Multimodal Oracle', 'ИИ-анализ завершен');
    events.push(aiEvent);
    prevHash = aiEvent.event_hash;

    if (seed.status !== 'NEW' && seed.status !== 'AI_VERIFIED') {
      // 2. ASSIGNED
      const assignEvent = appendStatusOnChain(reportPda, 2, prevHash, 'ASSIGNED', 'service', service.name, `Передано в диспетчерскую службу ${service.name}`);
      events.push(assignEvent);
      prevHash = assignEvent.event_hash;
    }

    if (seed.status === 'IN_PROGRESS' || seed.status === 'RESOLVED' || seed.status === 'CONFIRMED_BY_CITIZEN') {
      // 3. IN_PROGRESS
      const inProgEvent = appendStatusOnChain(reportPda, events.length, prevHash, 'IN_PROGRESS', 'service', service.name, 'Бригада выехала на устранение дефекта');
      events.push(inProgEvent);
      prevHash = inProgEvent.event_hash;
    }

    if (seed.status === 'RESOLVED' || seed.status === 'CONFIRMED_BY_CITIZEN') {
      // 4. RESOLVED
      const resolvedEvent = appendStatusOnChain(reportPda, events.length, prevHash, 'RESOLVED', 'service', service.name, 'Дефект устранен. Асфальтирование/замена завершены');
      events.push(resolvedEvent);
      prevHash = resolvedEvent.event_hash;
    }

    if (seed.status === 'CONFIRMED_BY_CITIZEN') {
      // 5. CONFIRMED_BY_CITIZEN
      const confirmEvent = appendStatusOnChain(reportPda, events.length, prevHash, 'CONFIRMED_BY_CITIZEN', 'citizen', 'Гражданин (Автор)', 'Качество работ проверено заявителем. Претензий нет.');
      events.push(confirmEvent);
      prevHash = confirmEvent.event_hash;
    }

    if (seed.status === 'REOPENED') {
      // 6. REOPENED
      const reopenEvent = appendStatusOnChain(reportPda, events.length, prevHash, 'REOPENED', 'citizen', 'Граждане (Голосование 8/2)', 'Большинство проголосовало "НЕ ПОЧИНЕНО". Возврат на доработку.');
      events.push(reopenEvent);
      prevHash = reopenEvent.event_hash;
    }

    const onchain = {
      tx_signature: events[events.length - 1].tx_signature || '5KnN9...devnet',
      block_time: Math.floor(new Date(createdAt).getTime() / 1000),
      report_pda: reportPda,
      media_sha256: mediaSha256,
      media_cid: mediaCid,
      text_sha256: textSha256,
      ai_analysis_sha256: aiSha256,
      geo_cell: `88204${Math.abs(Math.floor(seed.lat * 1000))}${Math.abs(Math.floor(seed.lng * 1000))}`,
      explorer_url: `https://explorer.solana.com/tx/${events[events.length - 1].tx_signature}?cluster=devnet`,
      immutable: true,
      is_verified: true,
      event_count: events.length,
      last_event_hash: prevHash,
    };

    return {
      id: seed.id,
      short_code: seed.short_code,
      title: seed.title,
      user_description: seed.user_description,
      media_url: seed.photo,
      media_thumbnail_url: seed.photo,
      media_sha256: mediaSha256,
      media_cid: mediaCid,
      category: seed.cat,
      subcategory: seed.subcat,
      status: seed.status,
      ai_analysis: aiAnalysis,
      context,
      priority,
      assigned_service_id: service.id,
      assigned_service_name: service.name,
      confirmations_count: seed.confirmations,
      citizen_votes: {
        repaired: seed.status === 'CONFIRMED_BY_CITIZEN' ? 14 : seed.status === 'RESOLVED' ? 5 : 1,
        not_repaired: seed.status === 'REOPENED' ? 9 : 0,
      },
      resolution_media_url: seed.status === 'RESOLVED' || seed.status === 'CONFIRMED_BY_CITIZEN' ? SAMPLE_PHOTOS.road_fixed : undefined,
      resolution_note: seed.status === 'RESOLVED' || seed.status === 'CONFIRMED_BY_CITIZEN' ? 'Выполнен локальный ямочный ремонт горячей асфальтобетонной смесью.' : undefined,
      created_at: createdAt,
      updated_at: new Date(Date.now() - (seed.hours_ago / 2) * 3600 * 1000).toISOString(),
      sla_deadline: slaDeadline,
      sla_violated: slaViolated,
      events,
      onchain,
    };
  });
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'appeals.json');

export function persistAppealsToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(appealsStore, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    console.error('[DB] Failed to persist appeals to disk:', err);
  }
}

export function loadAppealsFromDisk(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        appealsStore = parsed;
        console.log(`[DB] Successfully loaded ${appealsStore.length} persistent appeals from ${DATA_FILE}`);
        return;
      }
    }
  } catch (err) {
    console.warn('[DB] Failed reading appeals.json, falling back to seed initialization:', err);
  }

  // Fallback: initialize seeds and persist
  initSeedData();
  persistAppealsToDisk();
  console.log(`[DB] Initialized ${appealsStore.length} seed appeals and saved to disk.`);
}

export function getDbStats() {
  let fileSizeBytes = 0;
  try {
    if (fs.existsSync(DATA_FILE)) {
      fileSizeBytes = fs.statSync(DATA_FILE).size;
    }
  } catch {}
  return {
    dataFile: DATA_FILE,
    totalReports: appealsStore.length,
    fileSizeBytes,
  };
}

// Initialise persistent or seed data on module import
loadAppealsFromDisk();

// Access methods
export function getReports(filters?: {
  category?: string;
  status?: string;
  priority?: string;
  district?: string;
  search?: string;
}): CivicAppeal[] {
  let list = [...appealsStore];

  if (filters?.category && filters.category !== 'all') {
    list = list.filter(r => r.category === filters.category);
  }
  if (filters?.status && filters.status !== 'all') {
    list = list.filter(r => r.status === filters.status);
  }
  if (filters?.priority && filters.priority !== 'all') {
    list = list.filter(r => r.priority.level === filters.priority);
  }
  if (filters?.district && filters.district !== 'all') {
    list = list.filter(r => r.context.location.district.toLowerCase().includes(filters.district!.toLowerCase()));
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(r =>
      r.title.toLowerCase().includes(s) ||
      r.short_code.toLowerCase().includes(s) ||
      (r.user_description && r.user_description.toLowerCase().includes(s)) ||
      r.context.location.address.toLowerCase().includes(s)
    );
  }

  // Sort: CRITICAL first, then recent
  return list.sort((a, b) => {
    const pOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const diff = (pOrder[b.priority.level] || 0) - (pOrder[a.priority.level] || 0);
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function getReportById(id: string): CivicAppeal | undefined {
  return appealsStore.find(r => r.id === id || r.short_code === id);
}

export function addReport(report: CivicAppeal): CivicAppeal {
  appealsStore.unshift(report);
  persistAppealsToDisk();
  civicEventBus.emit('report:created', report);
  return report;
}

export function updateReportStatusInDb(
  id: string,
  newStatus: AppealStatus,
  actorTitle: string,
  note: string,
  resolutionMediaUrl?: string
): CivicAppeal | null {
  const report = getReportById(id);
  if (!report) return null;

  const prevLastEvent = report.events[report.events.length - 1];
  const nextSeq = report.events.length;

  const newEvent = appendStatusOnChain(
    report.onchain.report_pda,
    nextSeq,
    prevLastEvent.event_hash,
    newStatus,
    'service',
    actorTitle,
    note
  );

  report.status = newStatus;
  report.updated_at = new Date().toISOString();
  report.events.push(newEvent);
  report.onchain.event_count = report.events.length;
  report.onchain.last_event_hash = newEvent.event_hash;
  report.onchain.tx_signature = newEvent.tx_signature || report.onchain.tx_signature;
  report.onchain.explorer_url = `https://explorer.solana.com/tx/${newEvent.tx_signature}?cluster=devnet`;

  if (resolutionMediaUrl) {
    report.resolution_media_url = resolutionMediaUrl;
  }
  if (note) {
    report.resolution_note = note;
  }

  persistAppealsToDisk();
  civicEventBus.emit('report:updated', report);
  return report;
}

export function incrementConfirmationInDb(id: string): CivicAppeal | null {
  const report = getReportById(id);
  if (!report) return null;

  report.confirmations_count += 1;
  // Recalculate duplicates factor
  report.priority.factors.duplicates_factor.contribution = Math.min(
    report.priority.factors.duplicates_factor.weight,
    report.priority.factors.duplicates_factor.contribution + 1
  );
  report.priority.score = Math.min(100, report.priority.score + 2);
  if (report.priority.score >= 85) {
    report.priority.level = 'CRITICAL';
  } else if (report.priority.score >= 65) {
    report.priority.level = 'HIGH';
  }

  persistAppealsToDisk();
  civicEventBus.emit('report:confirmed', report);
  return report;
}

export function castResolutionVoteInDb(id: string, isFixed: boolean): CivicAppeal | null {
  const report = getReportById(id);
  if (!report) return null;

  if (isFixed) {
    report.citizen_votes.repaired += 1;
    if (report.citizen_votes.repaired >= 3 && report.status === 'RESOLVED') {
      updateReportStatusInDb(id, 'CONFIRMED_BY_CITIZEN', 'Граждане (Кворум)', 'Качество устранения подтверждено голосами граждан');
    }
  } else {
    report.citizen_votes.not_repaired += 1;
    // Automatic reopen if not repaired exceeds threshold!
    if (report.citizen_votes.not_repaired >= 2 && (report.status === 'RESOLVED' || report.status === 'CONFIRMED_BY_CITIZEN')) {
      updateReportStatusInDb(
        id,
        'REOPENED',
        'Граждане (Кворум возражений)',
        `Дефект не устранен надлежащим образом! Жалоба автоматически переоткрыта. Фиксация в реестре Solana.`
      );
    }
  }

  persistAppealsToDisk();
  civicEventBus.emit('report:voted', report);
  return report;
}
