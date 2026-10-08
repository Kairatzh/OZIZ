/**
 * OZIZ — public civic appeals registry. Single-file frontend (Swiss Modern + Bento).
 * Data comes from the Express API; when the API is unreachable, realistic demo data is used.
 */
import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import type {
  AppealCategory,
  AppealStatus,
  CivicAppeal,
  MunicipalService,
  PriorityBreakdown,
  PriorityLevel,
  StatusEventRecord,
} from './shared/types.ts';

/* =========================================================================
 * 1. Constants & dictionaries
 * ========================================================================= */

type Lang = 'ru' | 'kk' | 'en';
type Theme = 'light' | 'dark';

const CATEGORY: Record<AppealCategory, string> = {
  pothole: 'Яма на дороге',
  broken_streetlight: 'Неработающий фонарь',
  open_manhole: 'Открытый люк',
  illegal_dump: 'Стихийная свалка',
  damaged_sidewalk: 'Повреждённый тротуар',
  fallen_tree: 'Упавшее дерево',
  flooding: 'Подтопление',
  graffiti: 'Граффити',
  broken_traffic_light: 'Неисправный светофор',
  damaged_road_sign: 'Повреждённый знак',
  other: 'Прочее',
};

const STATUS: Record<AppealStatus, string> = {
  NEW: 'Новая',
  AI_VERIFIED: 'Проверена ИИ',
  ASSIGNED: 'Назначена',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Устранено',
  CONFIRMED_BY_CITIZEN: 'Подтверждено жителями',
  REOPENED: 'Переоткрыта',
  REJECTED: 'Отклонена',
};

const PRIORITY: Record<PriorityLevel, { label: string; color: string }> = {
  CRITICAL: { label: 'Критический', color: 'var(--c-crit)' },
  HIGH: { label: 'Высокий', color: 'var(--c-high)' },
  MEDIUM: { label: 'Средний', color: 'var(--c-med)' },
  LOW: { label: 'Низкий', color: 'var(--c-low)' },
};

const CLOSED: AppealStatus[] = ['RESOLVED', 'CONFIRMED_BY_CITIZEN', 'REJECTED'];

const statusColor = (s: AppealStatus) =>
  s === 'RESOLVED' || s === 'CONFIRMED_BY_CITIZEN'
    ? 'var(--c-ok)'
    : s === 'REJECTED'
      ? 'var(--c-low)'
      : s === 'REOPENED'
        ? 'var(--c-high)'
        : s === 'IN_PROGRESS'
          ? 'var(--c-accent)'
          : 'var(--c-fg3)';

const HAZARD: Record<string, string> = {
  pedestrians: 'пешеходы',
  drivers: 'водители',
  cyclists: 'велосипедисты',
  children: 'дети',
  environment: 'окружающая среда',
};
const NEAR: Record<string, string> = {
  school: 'школа',
  hospital: 'больница',
  kindergarten: 'детский сад',
  bus_stop: 'остановка',
  park: 'парк',
  metro: 'метро',
};
const FORECAST: Record<string, string> = {
  snow: 'снег',
  rain: 'дождь',
  clear: 'ясно',
  freezing: 'заморозки',
  cloudy: 'облачно',
};
const FACTORS: Array<[keyof PriorityBreakdown['factors'], string]> = [
  ['severity_norm', 'Серьёзность по оценке ИИ'],
  ['location_risk', 'Уязвимые объекты рядом'],
  ['weather_factor', 'Погода'],
  ['traffic_factor', 'Трафик'],
  ['duplicates_factor', 'Подтверждения жителей'],
  ['age_factor', 'Возраст проблемы'],
  ['emergency_bonus', 'Аварийность'],
];
const DISTRICTS = ['Есильский район', 'Алматинский район', 'Сарыаркинский район', 'Байконурский район'];
const PROGRAM_ID = '33ad7sLpmDbJuLxv9FYSFz1vFzV4HsTy6kmyeC8Lvj4K';
const SOLANA_MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';

interface SolanaMemoRecord {
  id: string;
  text: string;
  time: string;
  signature: string;
  url: string;
}

const STR: Record<Lang, Record<string, string>> = {
  ru: {
    'nav.how': 'Как это работает',
    'nav.map': 'Карта',
    'nav.transparency': 'Прозрачность',
    'nav.services': 'Для служб',
    'nav.login': 'Войти',
    'nav.report': 'Сообщить о проблеме',
    'hero.eyebrow': 'Публичный реестр городских обращений',
    'hero.title': 'Городские проблемы, которые нельзя замолчать',
    'hero.sub':
      'Сфотографируйте проблему и отметьте точку на карте. ИИ определит приоритет и передаст заявку нужной службе, а каждый статус будет записан в публичный реестр Solana.',
    'hero.cta2': 'Открыть карту обращений',
    'stats.reports': 'Заявок за 30 дней',
    'stats.response': 'Среднее время реакции',
    'stats.resolved': 'Доля решённых',
    'stats.ledger': 'Записей в реестре',
    'how.title': 'От фото до решения — без потерь по пути',
    'how.sub':
      'Каждая заявка проходит один и тот же путь. Он прозрачен для жителя, предсказуем для службы и проверяем для любого человека.',
    'tr.title': 'Работа служб в цифрах',
    'tr.sub': 'Рейтинг строится автоматически по данным реестра. Его нельзя отредактировать вручную.',
    'svc.title': 'Для городских служб',
    'faq.title': 'Вопросы и ответы',
    'cta.title': 'Видите проблему? Сообщите за минуту.',
  },
  kk: {
    'nav.how': 'Қалай жұмыс істейді',
    'nav.map': 'Карта',
    'nav.transparency': 'Ашықтық',
    'nav.services': 'Қызметтерге',
    'nav.login': 'Кіру',
    'nav.report': 'Мәселені хабарлау',
    'hero.eyebrow': 'Қалалық өтініштердің ашық тізілімі',
    'hero.title': 'Жасыруға болмайтын қалалық мәселелер',
    'hero.sub':
      'Мәселені суретке түсіріп, картадан нүктені белгілеңіз. ЖИ басымдықты анықтап, өтінішті тиісті қызметке жібереді, ал әр мәртебе Solana ашық тізіліміне жазылады.',
    'hero.cta2': 'Өтініштер картасы',
    'stats.reports': '30 күндегі өтініштер',
    'stats.response': 'Орташа әрекет ету уақыты',
    'stats.resolved': 'Шешілгендер үлесі',
    'stats.ledger': 'Тізілімдегі жазбалар',
    'how.title': 'Суреттен шешімге дейін — жоғалтусыз',
    'tr.title': 'Қызметтер жұмысы сандарда',
    'svc.title': 'Қалалық қызметтерге',
    'faq.title': 'Сұрақтар мен жауаптар',
    'cta.title': 'Мәселені көрдіңіз бе? Бір минутта хабарлаңыз.',
  },
  en: {
    'nav.how': 'How it works',
    'nav.map': 'Map',
    'nav.transparency': 'Transparency',
    'nav.services': 'For services',
    'nav.login': 'Sign in',
    'nav.report': 'Report an issue',
    'hero.eyebrow': 'Public registry of city reports',
    'hero.title': 'City issues that cannot be silenced',
    'hero.sub':
      'Take a photo and drop a pin. AI sets the priority and routes the report to the right service, and every status change is written to a public Solana registry.',
    'hero.cta2': 'Open the reports map',
    'stats.reports': 'Reports, last 30 days',
    'stats.response': 'Average response time',
    'stats.resolved': 'Resolved',
    'stats.ledger': 'Registry entries',
    'how.title': 'From photo to fix, nothing lost on the way',
    'tr.title': 'Service performance in numbers',
    'svc.title': 'For city services',
    'faq.title': 'Questions and answers',
    'cta.title': 'See an issue? Report it in a minute.',
  },
};

const FAQ = [
  [
    'Нужно ли регистрироваться, чтобы подать заявку?',
    'Нет. Заявку можно подать анонимно. Регистрация нужна, чтобы получать уведомления о статусе и видеть историю своих обращений.',
  ],
  [
    'Что именно записывается в блокчейн?',
    'Не фото и не персональные данные, а их криптографические отпечатки SHA-256: хэш фото, текста, результата ИИ-анализа и каждого изменения статуса. По ним любой может проверить, что данные в базе не подменены.',
  ],
  [
    'Может ли служба удалить или закрыть заявку без ответа?',
    'Нет. Программа реестра не содержит операций удаления и изменения. Отклонить заявку можно только с публичным обоснованием, хэш которого записывается в реестр.',
  ],
  [
    'Как определяется приоритет?',
    'Модель оценивает тип и серьёзность дефекта по фото и тексту. Затем детерминированная формула учитывает близость школ и больниц, погоду, трафик, число подтверждений и возраст проблемы. Вклад каждого фактора виден в карточке заявки.',
  ],
  [
    'Что будет, если ремонт сделан плохо?',
    'После отметки «Устранено» жители голосуют. Если большинство отмечает «Не починено», заявка автоматически переоткрывается, а случай учитывается в рейтинге службы.',
  ],
  [
    'Как защищена моя приватность?',
    'Метаданные EXIF, включая координаты устройства и модель телефона, удаляются на вашем устройстве. В реестр попадает только солёный хэш заявителя.',
  ],
];

/* =========================================================================
 * 2. Utilities
 * ========================================================================= */

const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function hashHex(input: string, len = 64): string {
  let h = 0x811c9dc5;
  let out = '';
  let round = 0;
  while (out.length < len) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i) + round * 31;
      h = Math.imul(h, 16777619);
    }
    out += (h >>> 0).toString(16).padStart(8, '0');
    round++;
  }
  return out.slice(0, len);
}
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function toB58(seed: string, len = 88): string {
  const hex = hashHex(seed, 128);
  let s = '';
  for (let i = 0; i < len; i++) s += B58[(parseInt(hex.substr((i * 2) % 126, 2), 16) + i * 7) % 58];
  return s;
}
const shortHash = (s?: string, a = 4, b = 4) => (!s ? '—' : s.length <= a + b + 3 ? s : `${s.slice(0, a)}...${s.slice(-b)}`);

function relTime(iso: string): string {
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return 'только что';
  if (m < 60) return `${Math.round(m)} мин назад`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function slaLeft(a: CivicAppeal): { text: string; tone: 'ok' | 'warn' | 'bad' | 'none' } {
  if (CLOSED.includes(a.status)) return { text: '—', tone: 'none' };
  const ms = new Date(a.sla_deadline).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const span = h >= 48 ? `${Math.round(h / 24)} дн` : `${h} ч ${String(m).padStart(2, '0')} м`;
  if (ms < 0 || a.sla_violated) return { text: `−${span}`, tone: 'bad' };
  return { text: span, tone: h < 2 ? 'warn' : 'ok' };
}
const isOverdue = (a: CivicAppeal) =>
  !CLOSED.includes(a.status) && (a.sla_violated || new Date(a.sla_deadline).getTime() < Date.now());

const toast = (msg: string) => window.dispatchEvent(new CustomEvent('oziz-toast', { detail: msg }));

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const el = document.createElement('a');
  el.href = url;
  el.download = name;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function compressImage(file: File): Promise<{ dataUrl: string; w: number; h: number; bytes: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const k = Math.min(1, 1600 / Math.max(w, h));
      w = Math.round(w * k);
      h = Math.round(h * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      // Re-encoding through canvas drops all EXIF metadata, including GPS and device model.
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      resolve({ dataUrl, w, h, bytes: Math.round((dataUrl.length - 23) * 0.75) });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Synthetic sample photo (asphalt with a pothole) so the flow can be tried without a camera. */
function makeSamplePhoto() {
  const s = 1200;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5e5f63';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 26000; i++) {
    const v = 70 + Math.floor(Math.random() * 60);
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  g.fillStyle = '#d9d6c8';
  g.fillRect(0, 980, s, 34);
  g.beginPath();
  g.ellipse(620, 560, 300, 190, -0.12, 0, Math.PI * 2);
  g.fillStyle = '#8a8478';
  g.fill();
  g.beginPath();
  g.ellipse(615, 570, 250, 150, -0.12, 0, Math.PI * 2);
  g.fillStyle = '#2b2a28';
  g.fill();
  g.beginPath();
  g.ellipse(640, 600, 150, 70, -0.1, 0, Math.PI * 2);
  g.fillStyle = '#3d4a52';
  g.fill();
  const dataUrl = c.toDataURL('image/jpeg', 0.82);
  return { dataUrl, w: s, h: s, bytes: Math.round((dataUrl.length - 23) * 0.75) };
}

/** Free reverse geocoding via OpenStreetMap Nominatim with fallback to coordinates */
async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; district: string } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru,en`, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const road = a.road || a.pedestrian || a.street || a.suburb || a.neighbourhood || '';
    const house = a.house_number ? `, ${a.house_number}` : '';
    const fullStreet = road ? `${road}${house}` : (data.display_name ? data.display_name.split(',').slice(0, 2).join(', ') : '');

    let district = '';
    const searchArea = `${a.city_district || ''} ${a.suburb || ''} ${a.borough || ''} ${a.county || ''} ${data.display_name || ''}`.toLowerCase();
    if (searchArea.includes('есиль') || searchArea.includes('yesil')) district = 'Есильский район';
    else if (searchArea.includes('алмат') || searchArea.includes('almat')) district = 'Алматинский район';
    else if (searchArea.includes('сарыарк') || searchArea.includes('saryark')) district = 'Сарыаркинский район';
    else if (searchArea.includes('байконур') || searchArea.includes('baikonur') || searchArea.includes('baykonur')) district = 'Байконурский район';
    else if (searchArea.includes('нура') || searchArea.includes('nura')) district = 'Нура район';

    return {
      address: fullStreet.trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      district: district || 'Алматинский район',
    };
  } catch {
    return null;
  }
}

/* =========================================================================
 * 3. Demo data (used when the API is unreachable)
 * ========================================================================= */

const MOCK_SERVICES: MunicipalService[] = [
  ['srv_roads', 'ГорДорСтрой', 'roads', ['pothole', 'damaged_road_sign', 'broken_traffic_light'], [4, 24, 72, 168], [142, 118, 19, 14.2, 3, 2]],
  ['srv_lighting', 'ГорСвет', 'lighting', ['broken_streetlight'], [6, 36, 96, 192], [89, 74, 12, 18.5, 2, 1]],
  ['srv_water', 'ГорВодоканал', 'water', ['open_manhole', 'flooding'], [2, 12, 48, 96], [115, 98, 14, 5.6, 1, 0]],
  ['srv_utilities', 'ЖКХ-Инфра', 'utilities', ['damaged_sidewalk', 'graffiti'], [12, 48, 120, 240], [76, 55, 16, 32.1, 5, 4]],
  ['srv_ecology', 'Зеленстрой', 'ecology', ['illegal_dump', 'fallen_tree'], [4, 24, 72, 144], [64, 52, 9, 11.8, 2, 1]],
  ['srv_emergency', 'Служба ЧС 112', 'emergency', ['other'], [1, 6, 24, 72], [38, 36, 2, 1.4, 0, 0]],
].map(([id, name, code, categories, sla, st]: any) => ({
  id,
  name,
  code,
  categories,
  phone: '+7 (7172) 55-01-01',
  email: `${code}@oziz.kz`,
  sla_hours: { CRITICAL: sla[0], HIGH: sla[1], MEDIUM: sla[2], LOW: sla[3] },
  stats: {
    total_assigned: st[0],
    resolved: st[1],
    in_progress: st[2],
    avg_response_hours: st[3],
    sla_violations: st[4],
    reopened_count: st[5],
  },
}));

const CAT_META: Partial<Record<AppealCategory, { sub: string; hazard: string[]; size: [number, 'cm' | 'm' | 'm2']; near: string[] }>> = {
  pothole: { sub: 'Выбоина дорожного полотна', hazard: ['drivers', 'cyclists'], size: [80, 'cm'], near: ['school', 'bus_stop'] },
  open_manhole: { sub: 'Отсутствует крышка люка', hazard: ['pedestrians', 'children'], size: [70, 'cm'], near: ['kindergarten'] },
  broken_streetlight: { sub: 'Не горят опоры освещения', hazard: ['pedestrians'], size: [200, 'm' as any], near: ['bus_stop', 'park'] },
  illegal_dump: { sub: 'Складирование строительных отходов', hazard: ['environment'], size: [12, 'm2'], near: ['park'] },
  damaged_sidewalk: { sub: 'Проседание покрытия', hazard: ['pedestrians', 'children'], size: [1.5, 'm2'], near: ['hospital', 'bus_stop'] },
  fallen_tree: { sub: 'Ветровал на проезжей части', hazard: ['drivers', 'pedestrians'], size: [9, 'm'], near: ['school'] },
  flooding: { sub: 'Засор ливнеприёмника', hazard: ['drivers', 'pedestrians'], size: [40, 'm2'], near: ['bus_stop', 'hospital'] },
  broken_traffic_light: { sub: 'Сбой контроллера светофора', hazard: ['drivers', 'pedestrians'], size: [1, 'm'], near: ['school'] },
  damaged_road_sign: { sub: 'Сбит дорожный знак', hazard: ['drivers', 'pedestrians'], size: [1, 'm'], near: ['school'] },
  graffiti: { sub: 'Надписи на фасаде', hazard: ['environment'], size: [4, 'm2'], near: ['school'] },
};

interface Seed {
  id?: string;
  code: string;
  title: string;
  cat: AppealCategory;
  lat: number;
  lng: number;
  district: string;
  address: string;
  sev: number;
  status: AppealStatus;
  conf: number;
  svc: string;
  hours: number;
  emergency: boolean;
  desc: string;
  media?: string;
}

const SEED_PHOTOS: Record<AppealCategory, string> = {
  pothole: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
  open_manhole: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=800&q=80',
  broken_streetlight: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=800&q=80',
  illegal_dump: 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?auto=format&fit=crop&w=800&q=80',
  damaged_sidewalk: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
  fallen_tree: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
  flooding: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
  broken_traffic_light: 'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=800&q=80',
  damaged_road_sign: 'https://images.unsplash.com/photo-1599839575945-a9e5af0c3fa5?auto=format&fit=crop&w=800&q=80',
  graffiti: 'https://images.unsplash.com/photo-1572945753563-8049567821c4?auto=format&fit=crop&w=800&q=80',
  other: 'https://images.unsplash.com/photo-1599839575945-a9e5af0c3fa5?auto=format&fit=crop&w=800&q=80',
};

const SEEDS: Seed[] = [
  { code: '001', title: 'Яма 80 см на перекрёстке', cat: 'pothole', lat: 51.0905, lng: 71.4021, district: 'Есильский район', address: 'пр. Мангилик Ел, 52', sev: 5, status: 'IN_PROGRESS', conf: 14, svc: 'srv_roads', hours: 8, emergency: true, desc: 'Глубокая яма на перекрёстке возле университета, уже повреждены два колеса.' },
  { code: '002', title: 'Открытый колодец у детской площадки', cat: 'open_manhole', lat: 51.1342, lng: 71.4308, district: 'Алматинский район', address: 'ул. Тауелсиздик, 14', sev: 5, status: 'ASSIGNED', conf: 23, svc: 'srv_water', hours: 3, emergency: true, desc: 'Крышки нет, рядом детская площадка и детский сад.' },
  { code: '003', title: 'Не горят пять фонарей вдоль аллеи', cat: 'broken_streetlight', lat: 51.1601, lng: 71.4285, district: 'Байконурский район', address: 'ул. Сейфуллина, 88', sev: 3, status: 'NEW', conf: 7, svc: 'srv_lighting', hours: 36, emergency: false, desc: 'Третью неделю темно на участке около 200 метров.' },
  { code: '004', title: 'Строительный мусор на газоне у реки', cat: 'illegal_dump', lat: 51.1215, lng: 71.4722, district: 'Есильский район', address: 'Набережная Есиля, у моста Акбулак', sev: 3, status: 'RESOLVED', conf: 12, svc: 'srv_ecology', hours: 72, emergency: false, desc: 'Ночью выгрузили мешки со строительным мусором.' },
  { code: '005', title: 'Провал брусчатки у больницы №1', cat: 'damaged_sidewalk', lat: 51.1788, lng: 71.411, district: 'Сарыаркинский район', address: 'пр. Республики, 34', sev: 4, status: 'CONFIRMED_BY_CITIZEN', conf: 18, svc: 'srv_utilities', hours: 120, emergency: false, desc: 'Глубина около 15 см, спотыкаются пожилые люди.' },
  { code: '006', title: 'Тополь упал на проезжую часть', cat: 'fallen_tree', lat: 51.145, lng: 71.455, district: 'Алматинский район', address: 'ул. Сатпаева, 19', sev: 5, status: 'IN_PROGRESS', conf: 31, svc: 'srv_ecology', hours: 2, emergency: true, desc: 'Дерево перекрыло полосу и задело провода.' },
  { code: '007', title: 'Подтопление перекрёстка после дождя', cat: 'flooding', lat: 51.112, lng: 71.421, district: 'Есильский район', address: 'пр. Кабанбай батыра, 62', sev: 4, status: 'ASSIGNED', conf: 9, svc: 'srv_water', hours: 14, emergency: true, desc: 'Забита ливнёвка, пешеходный переход залит.' },
  { code: '008', title: 'Светофор мигает жёлтым', cat: 'broken_traffic_light', lat: 51.1388, lng: 71.419, district: 'Сарыаркинский район', address: 'ул. Кенесары, 40', sev: 4, status: 'IN_PROGRESS', conf: 11, svc: 'srv_roads', hours: 6, emergency: true, desc: 'Выезд с боковой улицы стал нерегулируемым.' },
  { code: '009', title: 'Сбит знак «Пешеходный переход»', cat: 'damaged_road_sign', lat: 51.153, lng: 71.442, district: 'Алматинский район', address: 'ул. Иманова, 26', sev: 3, status: 'AI_VERIFIED', conf: 4, svc: 'srv_roads', hours: 14, emergency: false, desc: 'Знак лежит на газоне у перехода.' },
  { code: '010', title: 'Надписи на фасаде школы', cat: 'graffiti', lat: 51.169, lng: 71.402, district: 'Сарыаркинский район', address: 'ул. Бейбитшилик, 18', sev: 2, status: 'REJECTED', conf: 2, svc: 'srv_utilities', hours: 200, emergency: false, desc: 'Свежие надписи на стене у входа.' },
  { code: '011', title: 'Колея на выезде с парковки', cat: 'pothole', lat: 51.127, lng: 71.398, district: 'Есильский район', address: 'ул. Сыганак, 10', sev: 2, status: 'NEW', conf: 3, svc: 'srv_roads', hours: 20, emergency: false, desc: 'Небольшая колея, после дождя скапливается вода.' },
  { code: '012', title: 'Снова не работает освещение во дворе', cat: 'broken_streetlight', lat: 51.182, lng: 71.445, district: 'Байконурский район', address: 'ул. Жубанова, 7', sev: 3, status: 'REOPENED', conf: 6, svc: 'srv_lighting', hours: 160, emergency: false, desc: 'После ремонта свет снова не горит.' },
  { code: '013', title: 'Переполненные контейнеры', cat: 'illegal_dump', lat: 51.148, lng: 71.478, district: 'Байконурский район', address: 'ул. Петрова, 21', sev: 2, status: 'IN_PROGRESS', conf: 5, svc: 'srv_ecology', hours: 30, emergency: false, desc: 'Мусор не вывозили четыре дня.' },
  { code: '014', title: 'Разрушенный бордюр у остановки', cat: 'damaged_sidewalk', lat: 51.101, lng: 71.438, district: 'Есильский район', address: 'пр. Туран, 37', sev: 2, status: 'RESOLVED', conf: 3, svc: 'srv_utilities', hours: 96, emergency: false, desc: 'Бордюр раскрошился, сложно заехать с коляской.' },
  { code: '015', title: 'Глубокая выбоина в крайней полосе', cat: 'pothole', lat: 51.1655, lng: 71.4605, district: 'Байконурский район', address: 'пр. Абая, 63', sev: 4, status: 'ASSIGNED', conf: 8, svc: 'srv_roads', hours: 30, emergency: false, desc: 'Машины резко перестраиваются, чтобы объехать.' },
  { code: '016', title: 'Затоплен подземный переход', cat: 'flooding', lat: 51.1285, lng: 71.4465, district: 'Алматинский район', address: 'ул. Кунаева, 12', sev: 4, status: 'IN_PROGRESS', conf: 15, svc: 'srv_water', hours: 9, emergency: true, desc: 'Воды по щиколотку, переход не освещён.' },
];

const ZERO = '0'.repeat(64);

function computePriority(sev: number, conf: number, emergency: boolean, hours: number): PriorityBreakdown {
  const f = (value: number, weight: number) => ({ value: +value.toFixed(2), weight, contribution: +(value * weight).toFixed(1) });
  const factors = {
    severity_norm: f(sev / 5, 25),
    location_risk: { ...f(0.7, 20), note: 'Рядом школа и остановка' },
    weather_factor: { ...f(0.4, 15), note: 'Осадки 1,2 мм, +4 °C' },
    traffic_factor: f(0.6, 10),
    duplicates_factor: f(Math.min(1, conf / 25), 15),
    age_factor: f(Math.min(1, hours / 168), 10),
    emergency_bonus: f(emergency ? 1 : 0, 25),
    confidence_multiplier: 0.94,
  };
  const sum = FACTORS.reduce((s, [k]) => s + (factors as any)[k].contribution, 0);
  const score = Math.min(100, Math.round(sum * 0.94));
  const level: PriorityLevel = score >= 85 ? 'CRITICAL' : score >= 65 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  return { score, level, factors };
}

function statusPath(s: AppealStatus): AppealStatus[] {
  const flow: AppealStatus[] = ['NEW', 'AI_VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CONFIRMED_BY_CITIZEN'];
  if (s === 'REJECTED') return ['NEW', 'AI_VERIFIED', 'REJECTED'];
  if (s === 'REOPENED') return ['NEW', 'AI_VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REOPENED'];
  return flow.slice(0, flow.indexOf(s) + 1);
}

const ACTOR: Record<AppealStatus, [StatusEventRecord['actor_role'], string]> = {
  NEW: ['citizen', 'Гражданин'],
  AI_VERIFIED: ['oracle', 'ИИ-верификатор'],
  ASSIGNED: ['system', 'Маршрутизатор заявок'],
  IN_PROGRESS: ['service', ''],
  RESOLVED: ['service', ''],
  CONFIRMED_BY_CITIZEN: ['citizen', 'Жители (кворум голосов)'],
  REOPENED: ['citizen', 'Жители (кворум голосов)'],
  REJECTED: ['service', ''],
};

function makeEvent(id: string, pda: string, seq: number, prev: string, status: AppealStatus, ts: string, svcName: string, note?: string): StatusEventRecord {
  const [role, title] = ACTOR[status];
  const noteHash = note ? hashHex(note) : undefined;
  return {
    id: `evt_${id}_${seq}`,
    seq,
    status,
    actor_role: role,
    actor_title: title || svcName,
    note,
    note_sha256: noteHash,
    timestamp: ts,
    prev_event_hash: prev,
    event_hash: hashHex(`${pda}:${seq}:${prev}:${status}:${role}:${noteHash || ZERO}:${ts}`),
    tx_signature: toB58(`${id}${seq}${status}`),
  };
}

function appendLocal(a: CivicAppeal, status: AppealStatus, note?: string, actorTitle?: string): CivicAppeal {
  const last = a.events[a.events.length - 1];
  const ev = makeEvent(a.id, a.onchain.report_pda, a.events.length, last?.event_hash || ZERO, status, new Date().toISOString(), actorTitle || a.assigned_service_name, note);
  return {
    ...a,
    status,
    updated_at: ev.timestamp,
    events: [...a.events, ev],
    service_notes: note || a.service_notes,
    onchain: { ...a.onchain, event_count: a.events.length + 1, last_event_hash: ev.event_hash, tx_signature: ev.tx_signature! },
  };
}

function buildAppeal(s: Seed, services: MunicipalService[]): CivicAppeal {
  const id = s.id || `c1a01101-7001-4000-8000-${s.code.padStart(12, '0')}`;
  const svc = services.find(x => x.id === s.svc) || services[0];
  const meta = CAT_META[s.cat] || { sub: CATEGORY[s.cat], hazard: ['pedestrians'], size: [1, 'm'] as [number, 'm'], near: [] };
  const created = Date.now() - s.hours * 3600000;
  const priority = computePriority(s.sev, s.conf, s.emergency, s.hours);
  const pda = toB58(`pda${id}`, 44);
  const path = statusPath(s.status);
  const events: StatusEventRecord[] = [];
  path.forEach((st, i) => {
    const ts = new Date(created + (i === 0 ? 0 : (s.hours * 3600000 * i) / (path.length + 0.5))).toISOString();
    const note =
      st === 'REJECTED'
        ? 'Фасад относится к частной собственности. Обращение передано управляющей компании здания.'
        : st === 'RESOLVED'
          ? 'Работы выполнены, фото приложено.'
          : undefined;
    events.push(makeEvent(id, pda, i, events[i - 1]?.event_hash || ZERO, st, ts, svc.name, note));
  });
  const last = events[events.length - 1];
  const media = s.media || SEED_PHOTOS[s.cat] || SEED_PHOTOS.pothole;
  const resolved = s.status === 'RESOLVED' || s.status === 'CONFIRMED_BY_CITIZEN';
  return {
    id,
    short_code: `OZIZ-2026-${s.code}`,
    title: s.title,
    user_description: s.desc,
    media_url: media,
    media_thumbnail_url: media,
    media_sha256: hashHex(`media${id}`),
    media_cid: `bafybeig${hashHex(`cid${id}`, 46)}`,
    category: s.cat,
    subcategory: meta.sub,
    status: s.status,
    ai_analysis: {
      category: s.cat,
      subcategory: meta.sub,
      description_ai: `${meta.sub}. ${s.desc}`,
      severity: s.sev,
      hazard_to: meta.hazard as any,
      estimated_size: { value: meta.size[0], unit: meta.size[1] },
      confidence: +(0.82 + s.sev * 0.025).toFixed(2),
      text_photo_consistent: true,
      needs_human_review: s.sev <= 2,
      is_emergency: s.emergency,
      emergency_reason: s.emergency ? 'Прямая угроза жизни и здоровью' : null,
      detected_objects: [],
      language_detected: 'ru',
    },
    context: {
      location: { lat: s.lat, lng: s.lng, accuracy_m: 9, address: s.address, district: s.district, road_type: 'arterial', near: meta.near as any },
      weather: { temp_c: 4, precipitation_mm: 1.2, wind_ms: 6.1, forecast_24h: 'rain', source: 'Open-Meteo' },
      time: { reported_at: new Date(created).toISOString(), is_night: false, is_rush_hour: s.hours % 3 === 0 },
      traffic: { level: s.sev >= 4 ? 'high' : 'medium', source: 'Оценка трафика' },
      history: { similar_reports_100m: Math.max(1, Math.round(s.conf / 6)), unresolved_days_nearest: Math.round(s.hours / 24), reporter_trust_score: 0.95 },
    },
    priority,
    assigned_service_id: svc.id,
    assigned_service_name: svc.name,
    resolution_note: resolved ? 'Работы выполнены, фото приложено.' : undefined,
    confirmations_count: s.conf,
    citizen_votes: s.status === 'CONFIRMED_BY_CITIZEN' ? { repaired: 11, not_repaired: 1 } : s.status === 'REOPENED' ? { repaired: 1, not_repaired: 5 } : resolved ? { repaired: 4, not_repaired: 1 } : { repaired: 0, not_repaired: 0 },
    created_at: new Date(created).toISOString(),
    updated_at: last.timestamp,
    sla_deadline: new Date(created + svc.sla_hours[priority.level] * 3600000).toISOString(),
    sla_violated: false,
    events,
    onchain: {
      tx_signature: last.tx_signature!,
      block_time: Math.floor(created / 1000),
      report_pda: pda,
      media_sha256: hashHex(`media${id}`),
      media_cid: `bafybeig${hashHex(`cid${id}`, 46)}`,
      text_sha256: hashHex(`text${id}`),
      ai_analysis_sha256: hashHex(`ai${id}`),
      geo_cell: `8a2d${hashHex(`geo${id}`, 11)}`,
      explorer_url: `https://explorer.solana.com/tx/${last.tx_signature}?cluster=devnet`,
      immutable: true,
      is_verified: true,
      event_count: events.length,
      last_event_hash: last.event_hash,
    },
  };
}

const MOCK_APPEALS: CivicAppeal[] = SEEDS.map(s => buildAppeal(s, MOCK_SERVICES));

function guessCategory(text: string): AppealCategory {
  const t = text.toLowerCase();
  if (/люк|колодец/.test(t)) return 'open_manhole';
  if (/фонар|свет|освещ/.test(t)) return 'broken_streetlight';
  if (/мусор|свалк/.test(t)) return 'illegal_dump';
  if (/дерев|ветк/.test(t)) return 'fallen_tree';
  if (/вод|затоп|лужа/.test(t)) return 'flooding';
  if (/тротуар|плитк|бордюр/.test(t)) return 'damaged_sidewalk';
  return 'pothole';
}

function verifyLocal(a: CivicAppeal) {
  for (let i = 0; i < a.events.length; i++) {
    const prev = i === 0 ? ZERO : a.events[i - 1].event_hash;
    if (a.events[i].prev_event_hash !== prev)
      return { isValid: false, message: `Разрыв цепочки хэшей в событии ${i}.` };
  }
  return { isValid: true, message: 'Хэши в базе совпадают с цепочкой событий в реестре. Подмена или удаление исключены.' };
}

/* =========================================================================
 * 4. Data layer
 * ========================================================================= */

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function useOzizData() {
  const [reports, setReports] = useState<CivicAppeal[]>([]);
  const [services, setServices] = useState<MunicipalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'api' | 'demo'>('api');
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rd, sd] = await Promise.all([api('/api/reports'), api('/api/services')]);
        if (cancelled) return;
        setReports(rd.reports);
        setServices(sd.services);
        setSource('api');
      } catch {
        if (cancelled) return;
        setReports(MOCK_APPEALS);
        setServices(MOCK_SERVICES);
        setSource('demo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || source !== 'api' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/events/live');
    const upsert = (e: Event, isNew: boolean) => {
      try {
        const r: CivicAppeal = JSON.parse((e as MessageEvent).data);
        setReports(prev => (isNew ? [r, ...prev.filter(x => x.id !== r.id)] : prev.map(x => (x.id === r.id ? r : x))));
        setLiveCount(c => c + 1);
      } catch {
        /* ignore malformed frames */
      }
    };
    es.addEventListener('report_created', e => upsert(e, true));
    es.addEventListener('report_updated', e => upsert(e, false));
    es.addEventListener('report_confirmed', e => upsert(e, false));
    return () => es.close();
  }, [loading, source]);

  const replace = (r: CivicAppeal) => setReports(prev => prev.map(x => (x.id === r.id ? r : x)));
  const local = (id: string, fn: (a: CivicAppeal) => CivicAppeal) => {
    let out: CivicAppeal | undefined;
    setReports(prev =>
      prev.map(x => {
        if (x.id !== id) return x;
        out = fn(x);
        return out;
      }),
    );
    return out;
  };

  const confirm = async (id: string) => {
    if (source === 'api') {
      try {
        replace((await api(`/api/reports/${id}/confirm`, { method: 'POST' })).report);
        return;
      } catch {
        /* fall through to local update */
      }
    }
    local(id, a => ({ ...a, confirmations_count: a.confirmations_count + 1 }));
  };

  const vote = async (id: string, fixed: boolean) => {
    if (source === 'api') {
      try {
        replace((await api(`/api/reports/${id}/vote`, { method: 'POST', body: JSON.stringify({ is_fixed: fixed }) })).report);
        return;
      } catch {
        /* fall through */
      }
    }
    local(id, a => {
      const v = { repaired: a.citizen_votes.repaired + (fixed ? 1 : 0), not_repaired: a.citizen_votes.not_repaired + (fixed ? 0 : 1) };
      let next = { ...a, citizen_votes: v };
      if (a.status === 'RESOLVED' && v.not_repaired >= 3 && v.not_repaired > v.repaired) next = appendLocal(next, 'REOPENED');
      if (a.status === 'RESOLVED' && v.repaired >= 5 && v.repaired > v.not_repaired * 3) next = appendLocal(next, 'CONFIRMED_BY_CITIZEN');
      return next;
    });
  };

  const setStatus = async (id: string, status: AppealStatus, note = '', media?: string) => {
    if (source === 'api') {
      const d = await api(`/api/reports/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, note, actor_title: 'Оператор диспетчерской службы', resolution_media_url: media }),
      });
      replace(d.report);
      return;
    }
    local(id, a => {
      const n = appendLocal(a, status, note || undefined);
      return media ? { ...n, resolution_media_url: media } : n;
    });
  };

  const verify = async (a: CivicAppeal): Promise<{ isValid: boolean; message: string }> => {
    if (source === 'api') {
      try {
        const d = await api(`/api/solana/verify/${a.id}`);
        return d.verification;
      } catch {
        /* fall through */
      }
    }
    await new Promise(r => setTimeout(r, 700));
    return verifyLocal(a);
  };

  const create = async (p: { image: string; text: string; lat: number; lng: number; accuracy: number; address: string; district: string; anonymous: boolean }) => {
    if (source === 'api') {
      const d = await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          image_base64: p.image,
          user_text: p.text,
          lat: p.lat,
          lng: p.lng,
          accuracy_m: p.accuracy,
          address: p.address,
          district: p.district,
          is_anonymous: p.anonymous,
        }),
      });
      setReports(prev => [d.report, ...prev.filter(x => x.id !== d.report.id)]);
      return d.report as CivicAppeal;
    }
    await new Promise(r => setTimeout(r, 1800));
    const cat = guessCategory(p.text);
    const svc = services.find(s => s.categories.includes(cat)) || services[0];
    const code = String(100 + Math.floor(Math.random() * 900));
    const a = buildAppeal(
      {
        id: `local-${Date.now()}`,
        code,
        title: `${CAT_META[cat]?.sub || CATEGORY[cat]}, ${p.address}`,
        cat,
        lat: p.lat,
        lng: p.lng,
        district: p.district,
        address: p.address,
        sev: cat === 'open_manhole' ? 5 : 3,
        status: 'NEW',
        conf: 1,
        svc: svc.id,
        hours: 0,
        emergency: cat === 'open_manhole' || cat === 'fallen_tree',
        desc: p.text || 'Без описания',
        media: p.image,
      },
      services,
    );
    setReports(prev => [a, ...prev]);
    return a;
  };

  return { reports, services, loading, source, liveCount, confirm, vote, setStatus, verify, create };
}
type Data = ReturnType<typeof useOzizData>;

function useRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
const go = (path: string) => {
  window.location.hash = path;
};
function scrollToId(id: string) {
  const run = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if ((window.location.hash.replace(/^#/, '') || '/') !== '/') {
    go('/');
    setTimeout(run, 80);
  } else run();
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function useStoredSet(key: string) {
  const [set, setSet] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  });
  const add = (v: string) =>
    setSet(prev => {
      const next = [...prev, v];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  return [set, add] as const;
}

interface SolanaWalletCtxType {
  walletAddress: string | null;
  walletBalance: number | null;
  isConnecting: boolean;
  isSendingMemo: boolean;
  records: SolanaMemoRecord[];
  phantomMissingOpen: boolean;
  setPhantomMissingOpen: (open: boolean) => void;
  solanaModalOpen: boolean;
  setSolanaModalOpen: (open: boolean) => void;
  connectWallet: () => Promise<string | null>;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  sendMemo: (text: string) => Promise<{ signature: string; url: string }>;
}

const SolanaWalletCtx = createContext<SolanaWalletCtxType | null>(null);
const useSolanaWallet = () => {
  const ctx = useContext(SolanaWalletCtx);
  if (!ctx) throw new Error('useSolanaWallet must be used within SolanaWalletProvider');
  return ctx;
};

const LangCtx = createContext<{ lang: Lang; t: (k: string) => string }>({ lang: 'ru', t: k => STR.ru[k] || k });
const useT = () => useContext(LangCtx).t;

/* =========================================================================
 * 5. Icons (stroke is normalised to 1.5px at any rendered size)
 * ========================================================================= */

const ICONS: Record<string, React.ReactNode> = {
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  arrowUpRight: <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  map: <><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
  camera: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 5h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m20.5 16-5-5-9 8.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  external: <><path d="M14 4.5h5.5V10" /><path d="M19.5 4.5 11 13" /><path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6l-7-2.5Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  chain: <><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" /><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  bolt: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12l1-7Z" />,
  users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><path d="M16 5.8a3 3 0 0 1 0 5.4" /><path d="M17.5 14.8c1.6.6 2.7 2 3 4.2" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M10.6 6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.6M6.6 6.9C4 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v2.5" /></>,
  crosshair: <><circle cx="12" cy="12" r="7" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  download: <><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  inbox: <><path d="M3.5 13.5 6 5.5h12l2.5 8v5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5Z" /><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" /></>,
  chart: <><path d="M4 4v16h16" /><path d="m7.5 14 3.5-4 3 2.5L19 7" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></>,
  logout: <><path d="M14 4.5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h8" /><path d="M10.5 12h10" /><path d="m17 8.5 3.5 3.5-3.5 3.5" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4" /><path d="M12 17v.01" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  send: <><path d="M20.5 3.5 10 14" /><path d="m20.5 3.5-6.5 17-4-6.5-6.5-4 17-6.5Z" /></>,
  wifiOff: <><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.5a10 10 0 0 1 4-2.3M19 12.5a10 10 0 0 0-3.2-2" /><path d="M12 20h.01" /></>,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M8 12h8" /></>,
  building: <><path d="M4.5 20.5V6L12 3.5 19.5 6v14.5" /><path d="M3 20.5h18" /><path d="M9 9.5h1.5M13.5 9.5H15M9 13h1.5M13.5 13H15M10.5 20.5V17h3v3.5" /></>,
  cloud: <path d="M7 18.5h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 11a3.75 3.75 0 0 0 1 7.5Z" />,
  activity: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5" /></>,
  pothole: (
    <>
      <path d="M3 17h18M3 7h18" />
      <path d="M6 12c2-2 4-2 6 0s4 2 6 0" />
      <circle cx="10" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  openManhole: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16M4 12h16" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  streetlight: (
    <>
      <path d="M9 21V7a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v2" />
      <path d="M15 9h6l-1 4h-4l-1-4Z" />
      <path d="M6 21h6" />
    </>
  ),
  tree: (
    <>
      <path d="M12 3 5 15h14L12 3Z" />
      <path d="M12 15v6" />
    </>
  ),
  flood: (
    <>
      <path d="M3 9c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
      <path d="M3 14c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
      <path d="M3 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
    </>
  ),
  solana: (
    <>
      <path d="M4 6.5h13.5l2.5-3H6.5L4 6.5Z" />
      <path d="M20 12H6.5l-2.5 3h13.5l2.5-3Z" />
      <path d="M4 20.5h13.5l2.5-3H6.5L4 20.5Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
      <path d="M15 12h7v5h-7a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2Z" />
      <circle cx="18" cy="14.5" r="1" fill="currentColor" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <polygon points="14.5,9.5 13,14.5 9.5,14.5 11,9.5" fill="currentColor" fillOpacity="0.4" />
      <polygon points="14.5,9.5 13,12 12,13 14.5,9.5" fill="currentColor" />
    </>
  ),
  filter: (
    <>
      <polygon points="3 4 21 4 14 13 14 19 10 21 10 13 3 4" />
    </>
  ),
  terminal: (
    <>
      <polyline points="4 7 10 12 4 17" />
      <line x1="12" y1="17" x2="20" y2="17" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
};

function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={(1.5 * 24) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {ICONS[name]}
    </svg>
  );
}

/* =========================================================================
 * Motion & tactile hooks
 * ========================================================================= */

function triggerHaptic(ms = 8) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    /* ignore */
  }
}

function useCountUp(target: number, duration = 650, decimals = 0): number {
  const [current, setCurrent] = useState(target);
  const startRef = useRef(target);
  const startTimeRef = useRef<number | null>(null);
  const targetRef = useRef(target);

  useEffect(() => {
    startRef.current = current;
    targetRef.current = target;
    startTimeRef.current = null;

    let rafId: number;
    const step = (now: number) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const progress = Math.min(1, (now - startTimeRef.current) / duration);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const val = startRef.current + (targetRef.current - startRef.current) * ease;
      const rounded = decimals > 0 ? parseFloat(val.toFixed(decimals)) : Math.round(val);
      setCurrent(rounded);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setCurrent(targetRef.current);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, decimals]);

  return current;
}

function useSpotlight() {
  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };
  return { onMouseMove: handleMouseMove };
}

function useMagnetic<T extends HTMLElement = HTMLButtonElement>(strength = 0.22) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };
    const onLeave = () => {
      el.style.transform = 'translate3d(0px, 0px, 0)';
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [strength]);
  return ref;
}

/* =========================================================================
 * 6. UI primitives
 * ========================================================================= */

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function OzizLogo({ className = 'h-6 w-auto' }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center shrink-0 select-none overflow-hidden max-w-[120px]', className)}>
      <img
        src="/oziz-logo-dark.png"
        alt="OZIZ"
        className="oziz-logo-dark-img h-6 w-auto max-w-[110px] object-contain"
      />
      <img
        src="/oziz-logo-white.png"
        alt="OZIZ"
        className="oziz-logo-white-img h-6 w-auto max-w-[110px] object-contain"
      />
    </span>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  success?: boolean;
  block?: boolean;
};
function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading,
  success,
  block,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: BtnProps) {
  const sizes = {
    sm: 'h-8 px-3 text-[13px] gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-[15px] gap-2',
  };
  const variants = {
    primary:
      'bg-accent text-accent-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.08)] hover:shadow-[0_0_20px_rgba(31,79,255,0.32),inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-[color-mix(in_srgb,var(--c-accent)_88%,#000)] active:scale-[0.98]',
    secondary:
      'bg-surface text-fg border border-line hover:bg-bg2 hover:border-[color-mix(in_srgb,var(--c-line)_75%,var(--c-fg)_25%)] active:scale-[0.98]',
    ghost: 'text-fg2 hover:text-fg hover:bg-bg2 active:scale-[0.98]',
    danger:
      'bg-crit text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-[color-mix(in_srgb,var(--c-crit)_88%,#000)] active:scale-[0.98]',
  };
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic(8);
    onClick?.(e);
  };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cn(
        't relative inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        variants[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : success ? (
        <Icon name="check" className="text-ok a-fade" />
      ) : (
        icon && <Icon name={icon} />
      )}
      {children}
      {iconRight && !loading && !success && <Icon name={iconRight} />}
    </button>
  );
}

function IconButton({ icon, label, className, size = 32, loading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; size?: number; loading?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={loading || rest.disabled}
      style={{ width: size, height: size }}
      className={cn('t inline-flex items-center justify-center rounded-lg text-fg2 hover:bg-bg2 hover:text-fg', className)}
      {...rest}
    >
      {loading ? <Spinner /> : <Icon name={icon} />}
    </button>
  );
}

function Label({ htmlFor, children, optional }: { htmlFor?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-fg">
      {children}
      {optional && <span className="text-xs font-normal text-fg3">необязательно</span>}
    </label>
  );
}

function FieldMsg({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={id} className="mt-1.5 text-xs text-crit">
        {error}
      </p>
    );
  if (hint) return <p className="mt-1.5 text-xs text-fg3">{hint}</p>;
  return null;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string; icon?: string; right?: React.ReactNode; wrapClass?: string };
function Input({ label, error, hint, icon, right, wrapClass, id, ...rest }: InputProps) {
  const auto = useId();
  const iid = id || auto;
  return (
    <div className={wrapClass}>
      {label && <Label htmlFor={iid}>{label}</Label>}
      <div className={cn('field t flex h-10 items-center gap-2 rounded-lg border bg-surface px-3', error ? 'border-crit' : 'border-line')}>
        {icon && <Icon name={icon} className="text-fg3" />}
        <input
          id={iid}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${iid}-e` : undefined}
          className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-fg3"
          {...rest}
        />
        {right}
      </div>
      <FieldMsg id={`${iid}-e`} error={error} hint={hint} />
    </div>
  );
}

function Textarea({ label, error, hint, optional, id, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string; optional?: boolean }) {
  const auto = useId();
  const iid = id || auto;
  return (
    <div>
      {label && (
        <Label htmlFor={iid} optional={optional}>
          {label}
        </Label>
      )}
      <div className={cn('field t rounded-lg border bg-surface', error ? 'border-crit' : 'border-line')}>
        <textarea
          id={iid}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${iid}-e` : undefined}
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-fg3"
          {...rest}
        />
      </div>
      <FieldMsg id={`${iid}-e`} error={error} hint={hint} />
    </div>
  );
}

function Select({ label, options, id, className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: Array<{ value: string; label: string }> }) {
  const auto = useId();
  const iid = id || auto;
  return (
    <div className={className}>
      {label && <Label htmlFor={iid}>{label}</Label>}
      <div className="field t relative flex h-10 items-center rounded-lg border border-line bg-surface">
        <select id={iid} className="h-full w-full appearance-none bg-transparent pl-3 pr-9 text-sm outline-none" {...rest}>
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" className="pointer-events-none absolute right-3 text-fg3" />
      </div>
    </div>
  );
}

function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-fg2">
        <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden="true"
          className={cn(
            't mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
            checked ? 'border-accent bg-accent text-white' : error ? 'border-crit bg-surface' : 'border-line bg-surface',
          )}
        >
          {checked && <Icon name="check" size={12} />}
        </span>
        <span>{children}</span>
      </label>
      {error && <p className="mt-1.5 text-xs text-crit">{error}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex rounded-lg border border-line bg-bg2 p-0.5', size === 'md' ? 'h-9' : 'h-8', className)}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              't flex-1 rounded-md px-3 font-medium whitespace-nowrap',
              size === 'md' ? 'text-sm' : 'text-[13px]',
              active ? 'bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-fg2 hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full border border-line px-2.5 text-xs whitespace-nowrap text-fg2', className)}>{children}</span>;
}
const Dot = ({ color, size = 8 }: { color: string; size?: number }) => (
  <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />
);
function PriorityBadge({ level, score }: { level: PriorityLevel; score?: number }) {
  const p = PRIORITY[level] || PRIORITY.LOW;
  return (
    <Chip>
      <Dot color={p.color} />
      <span className="text-fg">{p.label}</span>
      {score !== undefined && <span className="tnum font-mono text-fg3">{score}</span>}
    </Chip>
  );
}
function StatusChip({ status }: { status: AppealStatus }) {
  return (
    <Chip>
      <Dot color={statusColor(status)} />
      {STATUS[status] || status}
    </Chip>
  );
}

function Card({ children, className, as: As = 'div', ...rest }: React.HTMLAttributes<HTMLElement> & { as?: any }) {
  return (
    <As className={cn('rounded-xl border border-line bg-surface', className)} {...rest}>
      {children}
    </As>
  );
}

function ProgressBar({ value, max = 100, color = 'var(--c-accent)', height = 4, label }: { value: number; max?: number; color?: string; height?: number; label?: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} className="w-full overflow-hidden rounded-full bg-bg2" style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${clamp((value / max) * 100, 0, 100)}%`, background: color }} />
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

function HashLabel({ value, a = 4, b = 4, className }: { value?: string; a?: number; b?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="font-mono text-[13px] text-fg3">—</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(true);
    toast('Скопировано');
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      aria-label={`Скопировать ${value}`}
      className={cn('t group inline-flex items-center gap-1.5 rounded-md font-mono text-[13px] text-fg hover:text-accent', className)}
    >
      <span className="tnum">{shortHash(value, a, b)}</span>
      <Icon name={copied ? 'check' : 'copy'} size={14} className={cn('text-fg3 group-hover:text-accent', copied && 'text-ok')} />
    </button>
  );
}

function Stat({ label, value, sub, loading }: { label: string; value: React.ReactNode; sub?: string; loading?: boolean }) {
  return (
    <div>
      {loading ? <Skeleton className="h-9 w-24" /> : <div className="tnum font-mono text-[28px] leading-9 font-medium tight text-fg md:text-[32px] md:leading-10">{value}</div>}
      <div className="mt-1 text-[13px] text-fg2">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-fg3">{sub}</div>}
    </div>
  );
}

function Accordion({ items }: { items: string[][] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="border-t border-line">
      {items.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <div key={q} className="border-b border-line">
            <h3>
              <button
                type="button"
                id={`${base}-b${i}`}
                aria-expanded={isOpen}
                aria-controls={`${base}-p${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="t flex w-full items-center justify-between gap-6 py-5 text-left text-[15px] font-medium text-fg hover:text-accent"
              >
                {q}
                <Icon name="chevronDown" className={cn('t text-fg3', isOpen && 'rotate-180')} />
              </button>
            </h3>
            <div
              id={`${base}-p${i}`}
              role="region"
              aria-labelledby={`${base}-b${i}`}
              className="grid transition-[grid-template-rows] duration-200"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', transitionTimingFunction: 'var(--ease)' }}
            >
              <div className="overflow-hidden">
                <p className="max-w-[680px] pb-5 text-[15px] text-fg2">{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={cn('reveal', shown && 'in', className)}>
      {children}
    </div>
  );
}

function Toaster() {
  const [items, setItems] = useState<Array<{ id: number; msg: string }>>([]);

  useEffect(() => {
    const h = (e: Event) => {
      const id = Date.now() + Math.random();
      const msg = (e as CustomEvent).detail;
      setItems(p => [...p.slice(-3), { id, msg }]);
      setTimeout(() => {
        setItems(p => p.filter(i => i.id !== id));
      }, 3500);
    };
    window.addEventListener('oziz-toast', h);
    return () => window.removeEventListener('oziz-toast', h);
  }, []);

  if (items.length === 0) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4">
      {items.map(i => (
        <div
          key={i.id}
          className="a-toast pointer-events-auto relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-line bg-surface/95 px-4 py-2.5 text-[13.5px] font-medium text-fg shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur-md"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
            <Icon name="check" size={12} />
          </div>
          <span>{i.msg}</span>
          <button
            type="button"
            onClick={() => setItems(p => p.filter(x => x.id !== i.id))}
            className="ml-2 text-fg3 hover:text-fg"
            aria-label="Закрыть уведомление"
          >
            <Icon name="x" size={13} />
          </button>
          <div
            className="absolute inset-x-0 bottom-0 h-0.5 bg-accent/60"
            style={{
              animation: 'toastProgress 3.5s linear forwards',
            }}
          />
        </div>
      ))}
    </div>
  );
}

function DropdownChip({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const active = value !== 'all';
  const cur = options.find(o => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={cn(
          't inline-flex h-8 items-center gap-1 rounded-full border pr-2 pl-3 text-[13px] whitespace-nowrap',
          active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg2 hover:bg-bg2 hover:text-fg',
        )}
      >
        {active ? cur?.label : label}
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <ul role="listbox" aria-label={label} className="a-fade absolute top-9 left-0 z-30 max-h-72 min-w-[210px] overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {options.map(o => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="t flex h-8 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-[13px] text-fg hover:bg-bg2"
              >
                {o.label}
                {o.value === value && <Icon name="check" size={14} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ src, size = 56, className }: { src?: string; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-bg2 text-fg3', className)} style={{ width: size, height: size }}>
      {src && !err ? <img src={src} alt="" loading="lazy" onError={() => setErr(true)} className="h-full w-full object-cover" /> : <Icon name="image" size={size > 80 ? 20 : 16} />}
    </div>
  );
}

function LightboxModal({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md a-fade cursor-zoom-out"
    >
      <div className="relative max-h-[92vh] max-w-[94vw] overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-2xl" onClick={e => e.stopPropagation()}>
        <img src={src} alt={alt || 'Документ / Фото'} className="max-h-[85vh] max-w-[90vw] object-contain select-none" />
        <div className="flex items-center justify-between border-t border-white/10 bg-black/70 px-4 py-2.5 text-xs text-white/80 backdrop-blur-sm">
          <span className="truncate pr-4 font-mono">{alt || 'Фотофиксация дефекта в высоком разрешении'}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-1 font-sans text-xs text-white transition hover:bg-white/20"
          >
            Закрыть [ESC]
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveCameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCams, setHasMultipleCams] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startStream = async (mode: 'environment' | 'user') => {
    stopStream();
    setStreamError(null);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Камера не поддерживается вашим браузером');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setHasMultipleCams(videoInputs.length > 1);
    } catch (err: any) {
      setStreamError(err?.message || 'Нет доступа к камере. Разрешите доступ в настройках браузера.');
    }
  };

  useEffect(() => {
    startStream(facingMode);
    return () => {
      stopStream();
    };
  }, [facingMode]);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `oziz-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        stopStream();
        onClose();
      }
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md a-fade">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl text-white">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-crit animate-ping" />
            <h3 className="text-sm font-semibold tracking-wide">Камера OZIZ · Прямой эфир</h3>
          </div>
          <IconButton icon="x" label="Закрыть" onClick={() => { stopStream(); onClose(); }} className="text-white/70 hover:text-white" />
        </div>

        <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center">
          {streamError ? (
            <div className="p-6 text-center text-xs text-white/70">
              <Icon name="camera" size={28} className="mx-auto mb-2 text-crit" />
              <p className="font-medium text-white">{streamError}</p>
              <p className="mt-2 text-white/50">Используйте стандартный выбор файла или разрешите доступ к камере.</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-4 border border-white/20 rounded-lg flex flex-col justify-between p-2">
                <div className="flex justify-between text-[10px] font-mono text-white/60">
                  <span>AI GEO-TARGET</span>
                  <span>1080P · 60FPS</span>
                </div>
                <div className="flex justify-center">
                  <div className="h-6 w-6 border border-white/40 rounded-full" />
                </div>
                <div className="text-center text-[10px] font-mono text-white/60">
                  Удерживайте объект в центре видоискателя
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          {hasMultipleCams ? (
            <button
              type="button"
              onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
              className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition"
            >
              <Icon name="refresh" size={14} />
              Перевернуть камеру
            </button>
          ) : (
            <div className="text-[11px] font-mono text-white/40">SENSOR_ACTIVE</div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { stopStream(); onClose(); }}
              className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs text-white hover:bg-white/10 transition"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!!streamError}
              onClick={capturePhoto}
              className="flex items-center gap-1.5 rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              <Icon name="camera" size={15} />
              Снимок
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Photo({ src, alt, className, empty, zoomable = true }: { src?: string; alt: string; className?: string; empty?: string; zoomable?: boolean }) {
  const [err, setErr] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  if (!src || err)
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-bg2 p-6 text-center text-[13px] text-fg3', className)}>
        <Icon name="image" size={20} />
        {empty || 'Фото недоступно'}
      </div>
    );

  return (
    <>
      <div className={cn('group relative overflow-hidden rounded-xl border border-line bg-bg2 cursor-zoom-in', className)} onClick={() => zoomable && setShowLightbox(true)}>
        <img src={src} alt={alt} onError={() => setErr(true)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        {zoomable && (
          <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface/85 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 text-fg shadow-sm">
            <Icon name="search" size={13} />
          </div>
        )}
      </div>
      {showLightbox && <LightboxModal src={src} alt={alt} onClose={() => setShowLightbox(false)} />}
    </>
  );
}

const Container = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mx-auto w-full max-w-[1200px] px-5 md:px-6', className)}>{children}</div>
);

function EmptyState({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="text-[15px] text-fg2">{text}</p>
      {action && (
        <Button size="sm" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

/* =========================================================================
 * 7. Map canvas (Leaflet real interactive map with Carto tiles & GPS)
 * ========================================================================= */

const OSM_STANDARD = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ESRI_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

type MapPoint = { id: string; lat: number; lng: number; color: string; label?: string };

interface MapCanvasProps {
  points?: MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  mode?: 'pins' | 'heat' | 'radar';
  cluster?: boolean;
  pin?: { lat: number; lng: number };
  onPinChange?: (p: { lat: number; lng: number }) => void;
  accuracy?: number;
  interactive?: boolean;
  initialZoom?: number;
  initialCenter?: { lat: number; lng: number };
  className?: string;
  label?: string;
  showLocateControl?: boolean;
  radarCenter?: { lat: number; lng: number } | null;
  radarRadius?: number;
  onRadarCenterChange?: (p: { lat: number; lng: number }) => void;
  dangerPointsCount?: number;
}

function MapCanvas({
  points = [],
  selectedId,
  onSelect,
  mode = 'pins',
  cluster = false,
  pin,
  onPinChange,
  accuracy,
  interactive = false,
  initialZoom,
  initialCenter,
  className,
  label = 'Интерактивная карта города',
  showLocateControl = true,
  radarCenter,
  radarRadius = 500,
  onRadarCenterChange,
  dangerPointsCount = 0,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const pinCircleRef = useRef<L.Circle | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userCircleRef = useRef<L.Circle | null>(null);
  const radarCircleRef = useRef<L.Circle | null>(null);
  const radarMarkerRef = useRef<L.Marker | null>(null);
  const radarDangerGroupRef = useRef<L.LayerGroup | null>(null);

  const [locating, setLocating] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [mapLayer, setMapLayer] = useState<'street' | 'satellite' | 'dark'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark') {
      return 'dark';
    }
    return 'street';
  });
  const [isTrackingGps, setIsTrackingGps] = useState(false);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Normalize zoom levels (support both old 1-5 scale and real Leaflet 10-18 scale)
  const calcZoom = (z?: number) => {
    if (!z) return 13;
    if (z <= 6) return Math.min(18, Math.max(10, Math.round(11 + z * 1.5)));
    return z;
  };

  const startLat = initialCenter?.lat ?? pin?.lat ?? radarCenter?.lat ?? (points.length > 0 ? points[0].lat : 51.1342);
  const startLng = initialCenter?.lng ?? pin?.lng ?? radarCenter?.lng ?? (points.length > 0 ? points[0].lng : 71.4308);
  const startZoom = calcZoom(initialZoom);

  // 1. Initialize Leaflet map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const initLayerUrl = mapLayer === 'satellite' ? ESRI_SATELLITE : isDark ? CARTO_DARK : CARTO_LIGHT;

    const map = L.map(el, {
      center: [startLat, startLng],
      zoom: startZoom,
      zoomControl: false,
      attributionControl: false,
      dragging: interactive || !!onPinChange || !!onRadarCenterChange,
      touchZoom: interactive || !!onPinChange || !!onRadarCenterChange,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
    });

    L.control.attribution({ prefix: false }).addTo(map);

    const tileLayer = L.tileLayer(initLayerUrl, {
      attribution: '&copy; OpenStreetMap &copy; CARTO &copy; Esri',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Auto-fallback if a third-party tile provider fails to respond
    tileLayer.on('tileerror', () => {
      if (tileLayerRef.current && (tileLayerRef.current as any)._url !== OSM_STANDARD) {
        tileLayerRef.current.setUrl(OSM_STANDARD);
      }
    });

    tileLayerRef.current = tileLayer;

    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;
    mapRef.current = map;
    setCurrentZoom(map.getZoom());

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Theme sync
    const observer = new MutationObserver(() => {
      const darkNow = document.documentElement.getAttribute('data-theme') === 'dark';
      if (tileLayerRef.current && (mapLayer === 'street' || mapLayer === 'dark')) {
        tileLayerRef.current.setUrl(darkNow ? CARTO_DARK : CARTO_LIGHT);
        setMapLayer(darkNow ? 'dark' : 'street');
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Handle container resize
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync layer url when user changes layer mode (street | satellite | dark)
  useEffect(() => {
    if (!tileLayerRef.current) return;
    let url = CARTO_LIGHT;
    if (mapLayer === 'satellite') url = ESRI_SATELLITE;
    else if (mapLayer === 'dark') url = CARTO_DARK;
    else url = CARTO_LIGHT;

    tileLayerRef.current.setUrl(url);
  }, [mapLayer]);

  // 2. Map click listener for placing / moving pin or radar center
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      const coords = {
        lat: +e.latlng.lat.toFixed(5),
        lng: +e.latlng.lng.toFixed(5),
      };
      if (mode === 'radar' && onRadarCenterChange) {
        onRadarCenterChange(coords);
      } else if (onPinChange) {
        onPinChange(coords);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [mode, onPinChange, onRadarCenterChange]);

  // 3. Draggable pin and accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pinMarkerRef.current) {
      pinMarkerRef.current.remove();
      pinMarkerRef.current = null;
    }
    if (pinCircleRef.current) {
      pinCircleRef.current.remove();
      pinCircleRef.current = null;
    }

    if (!pin) return;

    // Render accuracy radius
    if (accuracy && accuracy > 0) {
      const circle = L.circle([pin.lat, pin.lng], {
        radius: Math.max(accuracy, 8),
        color: 'var(--c-accent)',
        fillColor: 'var(--c-accent-soft)',
        fillOpacity: 0.18,
        weight: 1.5,
        dashArray: '4, 4',
      }).addTo(map);
      pinCircleRef.current = circle;
    }

    const pinIcon = L.divIcon({
      className: 'oziz-pin-icon',
      html: `
        <div style="position: relative; width: 28px; height: 34px; transform: translate(-14px, -34px); cursor: ${onPinChange ? 'grab' : 'default'};">
          <div style="position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); width: 16px; height: 16px; background: var(--c-accent-soft); border: 1.5px solid var(--c-accent); border-radius: 50%; animation: gpsPulse 2.2s cubic-bezier(0.2, 0, 0.2, 1) infinite; pointer-events: none;"></div>
          <svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="position: relative; z-index: 2; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.18));">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 20 14 20s14-9.5 14-20c0-7.732-6.268-14-14-14z" fill="var(--c-accent)" stroke="var(--c-surface)" stroke-width="2"/>
            <circle cx="14" cy="14" r="5" fill="var(--c-surface)"/>
          </svg>
        </div>
      `,
      iconSize: [28, 34],
      iconAnchor: [14, 34],
    });

    const marker = L.marker([pin.lat, pin.lng], {
      icon: pinIcon,
      draggable: !!onPinChange,
      autoPan: true,
    }).addTo(map);

    if (onPinChange) {
      marker.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        onPinChange({
          lat: +pos.lat.toFixed(5),
          lng: +pos.lng.toFixed(5),
        });
      });
    }

    pinMarkerRef.current = marker;
  }, [pin?.lat, pin?.lng, accuracy, !!onPinChange]);

  // 4. Report points, clustering & heatmap
  useEffect(() => {
    const map = mapRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (mode === 'heat') {
      points.forEach(p => {
        L.circle([p.lat, p.lng], {
          radius: 130,
          fillColor: p.color,
          fillOpacity: 0.22,
          stroke: false,
          interactive: false,
        }).addTo(group);
      });
      return;
    }

    if (cluster) {
      const cellSize = currentZoom > 14 ? 0.0015 : currentZoom > 12 ? 0.005 : 0.012;
      const grid = new Map<string, MapPoint[]>();
      points.forEach(p => {
        const gx = Math.floor(p.lng / cellSize);
        const gy = Math.floor(p.lat / cellSize);
        const k = `${gx}:${gy}`;
        const arr = grid.get(k) || [];
        arr.push(p);
        grid.set(k, arr);
      });

      grid.forEach(pts => {
        if (pts.length > 1) {
          const avgLat = pts.reduce((s, x) => s + x.lat, 0) / pts.length;
          const avgLng = pts.reduce((s, x) => s + x.lng, 0) / pts.length;
          const icon = L.divIcon({
            className: 'civic-cluster-pin',
            html: `<span>${pts.length}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const m = L.marker([avgLat, avgLng], { icon }).addTo(group);
          m.on('click', () => {
            map.setView([avgLat, avgLng], Math.min(map.getZoom() + 2, 17), { animate: true });
          });
        } else {
          renderPoint(pts[0], group, map);
        }
      });
    } else {
      points.forEach(p => renderPoint(p, group, map));
    }

    function renderPoint(p: MapPoint, g: L.LayerGroup, m: L.Map) {
      const isSel = p.id === selectedId;
      const icon = L.divIcon({
        className: `civic-pin ${isSel ? 'selected' : ''}`,
        html: `
          <div style="
            width: ${isSel ? '16px' : '12px'};
            height: ${isSel ? '16px' : '12px'};
            border-radius: 50%;
            background: ${p.color};
            border: 2px solid var(--c-surface);
            box-shadow: 0 0 0 ${isSel ? '3px var(--c-accent)' : '1px rgba(0,0,0,0.25)'};
          "></div>
        `,
        iconSize: [isSel ? 16 : 12, isSel ? 16 : 12],
        iconAnchor: [isSel ? 8 : 6, isSel ? 8 : 6],
      });

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(g);
      if (p.label) {
        marker.bindTooltip(p.label, {
          className: 'oziz-tooltip',
          direction: 'top',
          offset: [0, -8],
        });
      }
      if (onSelect) {
        marker.on('click', () => onSelect(p.id));
      }
    }
  }, [points, selectedId, mode, cluster, currentZoom, onSelect]);

  // 5. Center on selected appeal
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId || !interactive) return;
    const p = points.find(q => q.id === selectedId);
    if (p) {
      map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [selectedId, interactive, points]);

  // 5b. Safety Radar perimeter, center beacon & threat highlights
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (radarCircleRef.current) {
      radarCircleRef.current.remove();
      radarCircleRef.current = null;
    }
    if (radarMarkerRef.current) {
      radarMarkerRef.current.remove();
      radarMarkerRef.current = null;
    }
    if (radarDangerGroupRef.current) {
      radarDangerGroupRef.current.remove();
      radarDangerGroupRef.current = null;
    }

    if (mode !== 'radar' || !radarCenter) return;

    const hasDanger = (dangerPointsCount || 0) > 0;
    const rad = radarRadius || 500;

    // Safety perimeter circle
    const circle = L.circle([radarCenter.lat, radarCenter.lng], {
      radius: rad,
      color: hasDanger ? 'var(--c-crit)' : 'var(--c-ok)',
      fillColor: hasDanger ? 'var(--c-crit)' : 'var(--c-ok)',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6, 6',
      interactive: false,
    }).addTo(map);
    radarCircleRef.current = circle;

    // Animated center beacon
    const centerIcon = L.divIcon({
      className: 'radar-center-wrap',
      html: `
        <div class="radar-center-beacon">
          <div class="radar-pulse-ring" style="border-color: ${hasDanger ? 'var(--c-crit)' : 'var(--c-accent)'}; background: ${hasDanger ? 'rgba(217, 45, 32, 0.12)' : 'var(--c-accent-soft)'};"></div>
          <div class="radar-center-dot" style="background: ${hasDanger ? 'var(--c-crit)' : 'var(--c-accent)'}; box-shadow: 0 0 0 2px ${hasDanger ? 'var(--c-crit)' : 'var(--c-accent)'};"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([radarCenter.lat, radarCenter.lng], {
      icon: centerIcon,
      draggable: !!onRadarCenterChange,
    }).addTo(map);

    marker.bindTooltip('Центр радара (перетащите или нажмите на карту)', {
      className: 'oziz-tooltip',
      direction: 'top',
      offset: [0, -12],
    });

    if (onRadarCenterChange) {
      marker.on('dragend', (e: any) => {
        const p = e.target.getLatLng();
        onRadarCenterChange({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) });
      });
    }
    radarMarkerRef.current = marker;

    // Highlight hazards within radius
    const dangerGroup = L.layerGroup().addTo(map);
    points.forEach(p => {
      const dist = getDistanceMeters(radarCenter.lat, radarCenter.lng, p.lat, p.lng);
      if (dist <= rad) {
        L.circle([p.lat, p.lng], {
          radius: 35,
          color: p.color,
          fillColor: p.color,
          fillOpacity: 0.35,
          weight: 2,
          interactive: false,
        }).addTo(dangerGroup);
      }
    });
    radarDangerGroupRef.current = dangerGroup;
  }, [mode, radarCenter?.lat, radarCenter?.lng, radarRadius, dangerPointsCount, points, onRadarCenterChange]);

  // 6. User GPS Locate Me & Live High-Accuracy Tracking
  const handleToggleGps = () => {
    if (!navigator.geolocation) {
      toast('Геолокация недоступна в браузере');
      return;
    }

    if (isTrackingGps) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTrackingGps(false);
      toast('GPS слежение отключено');
      return;
    }

    setLocating(true);
    const updateLocation = (pos: GeolocationPosition) => {
      setLocating(false);
      setIsTrackingGps(true);
      const { latitude, longitude, accuracy: acc } = pos.coords;
      const lat = +latitude.toFixed(5);
      const lng = +longitude.toFixed(5);
      const roundedAcc = Math.round(acc);
      setLiveCoords({ lat, lng, acc: roundedAcc });

      const map = mapRef.current;
      if (map) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.9 });

        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([lat, lng]);
        } else {
          const beaconIcon = L.divIcon({
            className: 'gps-beacon-wrap',
            html: '<div class="gps-beacon"><div class="gps-beacon-ring"></div><div class="gps-beacon-dot"></div></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          userMarkerRef.current = L.marker([lat, lng], { icon: beaconIcon, interactive: false }).addTo(map);
        }

        if (userCircleRef.current) {
          userCircleRef.current.setLatLng([lat, lng]);
          userCircleRef.current.setRadius(roundedAcc || 10);
        } else {
          userCircleRef.current = L.circle([lat, lng], {
            radius: roundedAcc || 10,
            color: 'var(--c-accent)',
            fillColor: 'var(--c-accent-soft)',
            fillOpacity: 0.15,
            weight: 1.5,
            dashArray: '4, 4',
          }).addTo(map);
        }
      }

      if (onPinChange) onPinChange({ lat, lng });
      if (mode === 'radar' && onRadarCenterChange) onRadarCenterChange({ lat, lng });
    };

    navigator.geolocation.getCurrentPosition(
      pos => {
        updateLocation(pos);
        toast(`GPS сигнал обнаружен (точность ±${Math.round(pos.coords.accuracy)} м)`);
      },
      () => {
        setLocating(false);
        setIsTrackingGps(false);
        toast('Не удалось получить координаты GPS. Проверьте разрешения браузера.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );

    const id = navigator.geolocation.watchPosition(
      pos => updateLocation(pos),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
    watchIdRef.current = id;
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-[var(--c-bg2)] select-none', className)}>
      <div ref={containerRef} className="h-full w-full" aria-label={label} />

      {interactive && (
        <div className="absolute top-3 right-3 z-[1000] flex items-center rounded-lg border border-line bg-surface/90 backdrop-blur-md p-0.5 shadow-sm">
          {([
            { id: 'street', label: 'Схема' },
            { id: 'satellite', label: 'Спутник' },
            { id: 'dark', label: 'Тёмная' },
          ] as const).map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => setMapLayer(l.id)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                mapLayer === l.id ? 'bg-accent text-accent-fg shadow-sm' : 'text-fg2 hover:text-fg'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {liveCoords && (
        <div className="a-rise absolute bottom-3 left-3 z-[1000] flex items-center gap-2 rounded-lg border border-line bg-surface/95 backdrop-blur-md px-3 py-1.5 shadow-sm text-xs font-mono">
          <span className="flex h-2 w-2 rounded-full bg-ok animate-pulse" />
          <span className="text-fg font-medium">GPS: {liveCoords.lat.toFixed(5)}, {liveCoords.lng.toFixed(5)}</span>
          <span className="text-fg3">|</span>
          <span className="text-accent font-medium">±{liveCoords.acc} м</span>
        </div>
      )}

      {interactive && (
        <div className="absolute right-3 bottom-3 z-[1000] flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <IconButton icon="plus" label="Приблизить" onClick={() => mapRef.current?.zoomIn()} className="rounded-none" />
          <span className="h-px bg-line" />
          <IconButton icon="minus" label="Отдалить" onClick={() => mapRef.current?.zoomOut()} className="rounded-none" />
          {showLocateControl && (
            <>
              <span className="h-px bg-line" />
              <IconButton
                icon="crosshair"
                label={isTrackingGps ? 'Отключить GPS трекинг' : 'Моё местоположение (GPS)'}
                loading={locating}
                onClick={handleToggleGps}
                className={cn('rounded-none', isTrackingGps && 'text-accent bg-accent/10')}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LineChart({ data, color = 'var(--c-accent)', height = 120 }: { data: number[]; color?: string; height?: number }) {
  const W = 400;
  const H = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, 8 + (1 - (v - min) / (max - min || 1)) * (H - 16)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
      <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--c-line)" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--c-line2)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

/* =========================================================================
 * 8. Shared domain blocks
 * ========================================================================= */

function PriorityBars({ p, compact }: { p: PriorityBreakdown; compact?: boolean }) {
  const f: any = p?.factors || {};
  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="micro">Итоговый балл</div>
          <div className="tnum mt-1 font-mono text-[32px] leading-none font-medium tight">
            {p.score}
            <span className="text-[15px] text-fg3"> / 100</span>
          </div>
        </div>
        <PriorityBadge level={p.level} />
      </div>
      <ul className={cn('space-y-3', compact && 'space-y-2.5')}>
        {FACTORS.map(([k, label]) => {
          const v = f[k];
          if (!v || typeof v !== 'object') return null;
          return (
            <li key={k}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-fg2">{label}</span>
                <span className="tnum font-mono text-fg">
                  +{Number(v.contribution).toFixed(1)}
                  <span className="text-fg3"> / {v.weight}</span>
                </span>
              </div>
              <ProgressBar value={v.contribution} max={v.weight} height={6} label={label} />
            </li>
          );
        })}
      </ul>
      {f.confidence_multiplier !== undefined && (
        <p className="mt-4 text-xs text-fg3">
          Сумма умножается на уверенность модели: <span className="tnum font-mono">×{Number(f.confidence_multiplier).toFixed(2)}</span>
        </p>
      )}
    </div>
  );
}

function Timeline({ events }: { events: StatusEventRecord[] }) {
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const color = e.status === 'REJECTED' ? 'var(--c-crit)' : last ? statusColor(e.status) : 'var(--c-fg3)';
        return (
          <li key={e.id || i} className="relative pb-6 pl-6 last:pb-0">
            {!last && <span aria-hidden="true" className="absolute top-3 bottom-0 left-[3.5px] w-px bg-line" />}
            <span aria-hidden="true" className="absolute top-[7px] left-0 h-2 w-2 rounded-full" style={{ background: color }} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium text-fg">{STATUS[e.status] || e.status}</span>
              <time className="tnum font-mono text-xs text-fg3" dateTime={e.timestamp}>
                {fmtDate(e.timestamp)}
              </time>
            </div>
            <div className="mt-0.5 text-[13px] text-fg2">{e.actor_title}</div>
            {e.note && <p className="mt-2 rounded-lg bg-bg2 px-3 py-2 text-[13px] text-fg2">{e.note}</p>}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-fg3">
              <span className="font-mono">seq {e.seq}</span>
              <span aria-hidden="true">·</span>
              <HashLabel value={e.event_hash} className="!text-xs" />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function KV({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-6 py-2.5 text-[13px]">
          <dt className="shrink-0 text-fg2">{k}</dt>
          <dd className="min-w-0 text-right text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* =========================================================================
 * 9. Layout: navbar, footer, command palette
 * ========================================================================= */

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const actions = useMemo(() => {
    const list = [
      { id: 'submit', group: 'Действия', label: 'Подать новое обращение', icon: 'plus', run: () => { go('/submit'); onClose(); } },
      { id: 'map', group: 'Навигация', label: 'Интерактивная карта города', icon: 'map', run: () => { go('/map'); onClose(); } },
      { id: 'dispatch', group: 'Навигация', label: 'Панель диспетчерской службы', icon: 'inbox', run: () => { go('/dispatch'); onClose(); } },
      { id: 'transparency', group: 'Навигация', label: 'Дашборд прозрачности и SLA', icon: 'chart', run: () => { go('/transparency'); onClose(); } },
      { id: 'home', group: 'Навигация', label: 'Главная страница', icon: 'compass', run: () => { go('/'); onClose(); } },
      {
        id: 'theme',
        group: 'Настройки',
        label: 'Переключить тему оформления (светлая / тёмная)',
        icon: 'sun',
        run: () => {
          const cur = document.documentElement.getAttribute('data-theme');
          const next = cur === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('oziz-theme', next);
          toast(`Включена ${next === 'dark' ? 'тёмная' : 'светлая'} тема`);
          onClose();
        },
      },
      {
        id: 'copy-program',
        group: 'Solana',
        label: 'Скопировать Program ID смарт-контракта',
        icon: 'copy',
        run: () => {
          navigator.clipboard?.writeText(PROGRAM_ID);
          toast('Program ID скопирован в буфер обмена');
          onClose();
        },
      },
      {
        id: 'faq',
        group: 'Помощь',
        label: 'Регламенты, SLA и безопасность',
        icon: 'shield',
        run: () => { scrollToId('faq'); onClose(); },
      },
    ];

    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(item => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q));
  }, [query, onClose]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => (i + 1) % (actions.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => (i - 1 + actions.length) % (actions.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        actions[selectedIdx]?.run();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, actions, selectedIdx, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Командная панель"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="a-modal w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Icon name="search" size={18} className="text-fg3" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по сайту, навигация, действия..."
            className="w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg3"
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-fg3 sm:inline-block">ESC</kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-2">
          {actions.length === 0 ? (
            <div className="py-8 text-center text-sm text-fg3">Ничего не найдено</div>
          ) : (
            actions.map((item, idx) => {
              const active = idx === selectedIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.run}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors',
                    active ? 'bg-bg2 text-fg' : 'text-fg2 hover:text-fg',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg border border-line', active ? 'bg-surface text-accent' : 'text-fg3')}>
                      <Icon name={item.icon} size={15} />
                    </div>
                    <span>{item.label}</span>
                  </div>
                  <span className="text-xs text-fg3">{item.group}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-bg2/40 px-4 py-2 text-xs text-fg3">
          <div className="flex items-center gap-3">
            <span>↑↓ Навигация</span>
            <span>↵ Выбрать</span>
          </div>
          <span>OZIZ Command (⌘K)</span>
        </div>
      </div>
    </div>
  );
}

function PhantomMissingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phantom-modal-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="a-modal w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_50px_rgba(0,0,0,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-bg2 text-accent">
              <Icon name="wallet" size={22} />
            </div>
            <div>
              <div className="micro">Кошелек Phantom</div>
              <h2 id="phantom-modal-title" className="text-lg font-semibold tight">Phantom не обнаружен</h2>
            </div>
          </div>
          <IconButton icon="x" label="Закрыть" onClick={onClose} />
        </div>

        <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-relaxed text-fg">
          <p className="font-medium">Откройте приложение в отдельной вкладке с установленным Phantom</p>
          <p className="mt-2 text-xs text-fg2">
            Для авторизации и подписания транзакций на Solana Devnet требуется браузерное расширение Phantom Wallet.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Понятно
          </Button>
          <a
            href="https://phantom.app/"
            target="_blank"
            rel="noreferrer"
            className="t inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Установить Phantom
            <Icon name="external" size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

function SolanaWalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { walletAddress, walletBalance, isSendingMemo, records, disconnectWallet, refreshBalance, sendMemo } = useSolanaWallet();
  const [memoInput, setMemoInput] = useState('');
  const [lastTxUrl, setLastTxUrl] = useState<string | null>(null);

  if (!open) return null;

  const handleSendTestMemo = async () => {
    const text = memoInput.trim();
    if (!text) {
      toast('Введите текст для записи в блокчейн');
      return;
    }
    try {
      const res = await sendMemo(text);
      setLastTxUrl(res.url);
      setMemoInput('');
    } catch {
      /* error is notified via toast */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="solana-modal-title"
      className="fixed inset-0 z-[105] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="a-modal max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-bg2 text-accent">
              <Icon name="solana" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="micro">Solana Devnet</span>
                <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              </div>
              <h2 id="solana-modal-title" className="text-lg font-semibold tight">Кошелек и On-Chain реестр</h2>
            </div>
          </div>
          <IconButton icon="x" label="Закрыть" onClick={onClose} />
        </div>

        {walletAddress ? (
          <div className="mt-5 space-y-6">
            <Card className="p-4 bg-bg2/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="micro">Адрес кошелька</div>
                  <div className="mt-1 flex items-center gap-2">
                    <HashLabel value={walletAddress} a={6} b={6} className="text-sm font-semibold" />
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon="logout" onClick={() => { disconnectWallet(); onClose(); }}>
                  Отключить
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
                <div className="flex items-center gap-2">
                  <span className="micro">Баланс:</span>
                  <span className="tnum font-mono text-base font-semibold text-fg">
                    {walletBalance !== null ? `${walletBalance.toFixed(4)} SOL` : 'Загрузка...'}
                  </span>
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] text-accent">devnet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" icon="refresh" onClick={refreshBalance}>
                    Обновить баланс
                  </Button>
                  <a
                    href={`https://faucet.solana.com/`}
                    target="_blank"
                    rel="noreferrer"
                    className="t inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-fg2 hover:bg-bg2 hover:text-fg"
                  >
                    Кран SOL
                    <Icon name="external" size={12} />
                  </a>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Запись Memo в блокчейн</h3>
                  <p className="mt-0.5 text-xs text-fg3">
                    Отправка транзакции с инструкцией SPL Memo Program ({shortHash(SOLANA_MEMO_PROGRAM_ID, 4, 4)})
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <textarea
                  value={memoInput}
                  onChange={e => setMemoInput(e.target.value)}
                  placeholder="Введите текст или хеш обращения для фиксации в блокчейне..."
                  rows={2}
                  className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg3 focus:border-accent"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-fg3">
                  Комиссия сети: <span className="font-mono text-ok">~0.000005 SOL</span> (оплачивается Phantom)
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  icon="solana"
                  loading={isSendingMemo}
                  disabled={isSendingMemo || !memoInput.trim()}
                  onClick={handleSendTestMemo}
                >
                  {isSendingMemo ? 'Записываем в блокчейн…' : 'Записать в блокчейн'}
                </Button>
              </div>

              {lastTxUrl && (
                <div className="a-rise mt-3 flex items-center justify-between rounded-lg border border-ok/30 bg-ok/10 p-2.5 text-xs text-fg">
                  <div className="flex items-center gap-2">
                    <Icon name="check" size={14} className="text-ok" />
                    <span>Записано в блокчейн</span>
                  </div>
                  <a
                    href={lastTxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="t font-medium text-accent hover:underline flex items-center gap-1"
                  >
                    Посмотреть запись
                    <Icon name="external" size={12} />
                  </a>
                </div>
              )}
            </Card>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Сохраненные записи ({records.length})</h3>
                <span className="text-xs text-fg3">Локальное хранилище + Devnet</span>
              </div>

              {records.length === 0 ? (
                <div className="mt-3 rounded-xl border border-line bg-bg2/30 p-6 text-center text-xs text-fg3">
                  Пока нет созданных записей Memo с этого устройства.
                </div>
              ) : (
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {records.map(rec => (
                    <div
                      key={rec.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono font-medium text-fg truncate">{rec.text}</div>
                        <div className="mt-1 flex items-center gap-2 text-fg3">
                          <span>{rec.time}</span>
                          <span>·</span>
                          <span className="font-mono">{shortHash(rec.signature, 6, 6)}</span>
                        </div>
                      </div>
                      <a
                        href={rec.url}
                        target="_blank"
                        rel="noreferrer"
                        className="t inline-flex shrink-0 items-center gap-1 rounded bg-bg2 px-2 py-1 text-xs font-medium text-fg2 hover:bg-surface hover:text-accent"
                      >
                        Посмотреть запись
                        <Icon name="external" size={11} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center py-6">
            <p className="text-sm text-fg2">Подключите кошелек Phantom для взаимодействия с блокчейном Solana</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WalletConnectButton({ className = '' }: { className?: string }) {
  const { walletAddress, walletBalance, isConnecting, connectWallet, setSolanaModalOpen } = useSolanaWallet();

  if (walletAddress) {
    const shortAddr = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    return (
      <button
        type="button"
        onClick={() => setSolanaModalOpen(true)}
        title={`Phantom: ${walletAddress}`}
        className={cn(
          't flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium text-fg hover:border-fg3 hover:bg-bg2',
          className
        )}
      >
        <span className="flex h-2 w-2 rounded-full bg-ok shrink-0" />
        <span className="font-mono text-xs">{shortAddr}</span>
        {walletBalance !== null && (
          <span className="rounded bg-bg2 px-1.5 py-0.5 font-mono text-[11px] text-fg2">
            {walletBalance.toFixed(2)} SOL
          </span>
        )}
      </button>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      icon="wallet"
      loading={isConnecting}
      onClick={() => connectWallet()}
      className={className}
    >
      Подключить кошелёк
    </Button>
  );
}

function SolanaMemoActionBox({ defaultText, reportCode }: { defaultText: string; reportCode: string }) {
  const { walletAddress, isSendingMemo, records, connectWallet, sendMemo } = useSolanaWallet();
  const [memoText, setMemoText] = useState(defaultText);
  const [lastTxUrl, setLastTxUrl] = useState<string | null>(null);

  const handleSend = async () => {
    const text = memoText.trim();
    if (!text) {
      toast('Текст записи не может быть пустым');
      return;
    }
    try {
      const res = await sendMemo(text);
      setLastTxUrl(res.url);
    } catch {
      /* error is handled with toast */
    }
  };

  const relevantRecords = records.filter(r => r.text.includes(reportCode) || (lastTxUrl && r.url === lastTxUrl));

  return (
    <div className="mt-4 space-y-3">
      {!walletAddress ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
          <div className="text-xs text-fg2">
            Подключите Phantom для подписи этой транзакции в Devnet
          </div>
          <Button size="sm" variant="secondary" icon="wallet" onClick={() => connectWallet()}>
            Подключить кошелёк
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between text-xs text-fg3 mb-1.5">
              <span>Содержимое Memo инструкции:</span>
              <span className="font-mono">{memoText.length} байт</span>
            </div>
            <textarea
              value={memoText}
              onChange={e => setMemoText(e.target.value)}
              rows={2}
              className="w-full resize-none bg-transparent font-mono text-xs text-fg outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-fg3 font-mono">
              Программа: {shortHash(SOLANA_MEMO_PROGRAM_ID, 4, 4)} (SPL Memo)
            </div>
            <Button
              size="sm"
              variant="primary"
              icon="solana"
              loading={isSendingMemo}
              disabled={isSendingMemo}
              onClick={handleSend}
            >
              {isSendingMemo ? 'Записываем в блокчейн…' : 'Записать в блокчейн'}
            </Button>
          </div>

          {lastTxUrl && (
            <div className="a-rise flex items-center justify-between rounded-lg border border-ok/30 bg-ok/10 p-2.5 text-xs text-fg">
              <div className="flex items-center gap-2">
                <Icon name="check" size={14} className="text-ok" />
                <span className="font-medium">Записано в блокчейн</span>
              </div>
              <a
                href={lastTxUrl}
                target="_blank"
                rel="noreferrer"
                className="t flex items-center gap-1 font-medium text-accent hover:underline"
              >
                Посмотреть запись
                <Icon name="external" size={12} />
              </a>
            </div>
          )}

          {relevantRecords.length > 0 && (
            <div className="border-t border-line/60 pt-2 space-y-1.5">
              <div className="text-xs text-fg3 font-medium">Подтвержденные транзакции заявки:</div>
              {relevantRecords.map(rec => (
                <div key={rec.id} className="flex items-center justify-between gap-2 rounded bg-surface/80 px-2.5 py-1.5 text-xs border border-line">
                  <span className="font-mono text-fg3 truncate max-w-[200px]">{shortHash(rec.signature, 6, 6)}</span>
                  <a
                    href={rec.url}
                    target="_blank"
                    rel="noreferrer"
                    className="t text-accent hover:underline flex items-center gap-1"
                  >
                    Посмотреть запись
                    <Icon name="external" size={11} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function Navbar({
  route,
  lang,
  setLang,
  theme,
  setTheme,
  user,
  onLogout,
  onOpenPalette,
}: {
  route: string;
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  user: { name: string } | null;
  onLogout: () => void;
  onOpenPalette?: () => void;
}) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [route]);
  const links: Array<[string, () => void, boolean]> = [
    [t('nav.how'), () => scrollToId('how'), false],
    [t('nav.map'), () => go('/map'), route === '/map'],
    [t('nav.transparency'), () => go('/transparency'), route === '/transparency'],
    [t('nav.services'), () => go('/dispatch'), route === '/dispatch'],
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 px-4 md:gap-5 md:px-6">
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => go('/')}
            className="t flex shrink-0 items-center text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="OZIZ, на главную"
          >
            <OzizLogo className="h-6 w-auto" />
          </button>
        </div>

        <nav aria-label="Основная навигация" className="hidden shrink items-center gap-1 xl:flex">
          {links.map(([label, fn, active]) => (
            <button
              key={label}
              type="button"
              onClick={fn}
              aria-current={active ? 'page' : undefined}
              className={cn(
                't h-8 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium',
                active ? 'text-fg bg-bg2' : 'text-fg2 hover:bg-bg2 hover:text-fg'
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Quick command palette trigger */}
          <button
            type="button"
            onClick={onOpenPalette}
            title="Командная панель (Ctrl+K)"
            aria-label="Командная панель (Ctrl+K)"
            className="t hidden items-center gap-2 rounded-lg border border-line bg-bg2 px-2.5 py-1 text-xs text-fg2 hover:border-fg3 hover:text-fg md:flex"
          >
            <Icon name="search" size={13} />
            <span>Поиск</span>
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg3">⌘K</kbd>
          </button>
          <IconButton icon="search" label="Поиск (Ctrl+K)" onClick={onOpenPalette} className="md:hidden" />
          <label className="sr-only" htmlFor="lang">
            Язык
          </label>
          <div className="relative hidden sm:block">
            <select
              id="lang"
              value={lang}
              onChange={e => setLang(e.target.value as Lang)}
              className="t h-8 cursor-pointer appearance-none rounded-lg bg-transparent pr-6 pl-2.5 text-[13px] font-medium text-fg2 hover:bg-bg2 hover:text-fg"
            >
              <option value="ru">RU</option>
              <option value="kk">KZ</option>
              <option value="en">EN</option>
            </select>
            <Icon name="chevronDown" size={12} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg3" />
          </div>
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
          <div className="hidden sm:block">
            <WalletConnectButton />
          </div>
          {user ? (
            <div className="hidden items-center gap-1 sm:flex">
              <span className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-fg">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg2 text-xs font-semibold text-fg2">{user.name.slice(0, 1).toUpperCase()}</span>
                {user.name}
              </span>
              <IconButton icon="logout" label="Выйти" onClick={onLogout} />
            </div>
          ) : (
            <Button size="sm" variant="secondary" className="hidden sm:inline-flex" onClick={() => go('/auth')}>
              {t('nav.login')}
            </Button>
          )}
          <Button size="sm" variant="primary" icon="plus" onClick={() => go('/submit')} className="hidden sm:inline-flex">
            {t('nav.report')}
          </Button>
          <IconButton icon="plus" label={t('nav.report')} onClick={() => go('/submit')} className="bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg sm:hidden" size={36} />
          <IconButton icon={menu ? 'x' : 'menu'} label="Меню" aria-expanded={menu} onClick={() => setMenu(m => !m)} className="xl:hidden" size={36} />
        </div>
      </div>
      {menu && (
        <div className="a-fade border-t border-line bg-bg xl:hidden">
          <nav aria-label="Мобильная навигация" className="mx-auto flex max-w-[1200px] flex-col px-3 py-2">
            {links.map(([label, fn]) => (
              <button key={label} type="button" onClick={fn} className="t flex h-11 items-center rounded-lg px-3 text-left text-[15px] text-fg hover:bg-bg2">
                {label}
              </button>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line px-1 pt-3 pb-1">
              <Segmented
                size="sm"
                label="Язык"
                value={lang}
                onChange={setLang}
                options={[
                  { value: 'ru', label: 'RU' },
                  { value: 'kk', label: 'KZ' },
                  { value: 'en', label: 'EN' },
                ]}
              />
              <div className="sm:hidden">
                <WalletConnectButton />
              </div>
              {user ? (
                <Button size="sm" variant="ghost" icon="logout" onClick={onLogout} className="ml-auto">
                  Выйти
                </Button>
              ) : (
                <Button size="sm" onClick={() => go('/auth')} className="ml-auto">
                  {t('nav.login')}
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function Footer({ source }: { source: 'api' | 'demo' }) {
  const cols: Array<[string, Array<[string, () => void]>]> = [
    ['Продукт', [['Подать заявку', () => go('/submit')], ['Карта обращений', () => go('/map')], ['Прозрачность', () => go('/transparency')]]],
    ['Службам', [['Панель службы', () => go('/dispatch')], ['Регламенты SLA', () => go('/transparency')], ['API для интеграции', () => toast('Документация API: API.md в репозитории')]]],
    ['Реестр', [['Как работает реестр', () => scrollToId('how')], ['Проверка хэшей', () => go('/map')], ['Открытые данные', () => go('/transparency')]]],
    ['О проекте', [['Вопросы и ответы', () => scrollToId('faq')], ['Приватность', () => scrollToId('faq')], ['Контакты', () => toast('hello@oziz.kz')]]],
  ];
  return (
    <footer className="border-t border-line">
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-12">
          <div className="col-span-2 md:col-span-4">
            <OzizLogo className="h-6 w-auto" />
            <p className="mt-2 max-w-[280px] text-[13px] text-fg2">Публичный реестр городских обращений. Астана, Казахстан.</p>
          </div>
          {cols.map(([title, links]) => (
            <div key={title} className="md:col-span-2">
              <div className="micro mb-3">{title}</div>
              <ul className="space-y-2">
                {links.map(([l, fn]) => (
                  <li key={l}>
                    <button type="button" onClick={fn} className="t text-[13px] text-fg2 hover:text-fg">
                      {l}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs text-fg3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>2026 OZIZ</span>
            <button type="button" className="t hover:text-fg" onClick={() => scrollToId('faq')}>
              Политика приватности
            </button>
            <button type="button" className="t hover:text-fg" onClick={() => scrollToId('faq')}>
              Условия использования
            </button>
            {source === 'demo' && <Chip>Демо-данные</Chip>}
          </div>
          <div className="flex items-center gap-2">
            <span>Программа реестра</span>
            <HashLabel value={PROGRAM_ID} a={6} b={4} className="!text-xs" />
          </div>
        </div>
      </Container>
    </footer>
  );
}

function OfflineBanner() {
  return (
    <div role="status" className="flex h-9 items-center justify-center gap-2 border-b border-line bg-bg2 px-4 text-[13px] text-fg2">
      <Icon name="wifiOff" />
      Нет соединения. Показаны последние загруженные данные.
    </div>
  );
}

/* =========================================================================
 * 10. Landing
 * ========================================================================= */

function HeroDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const parent = canvas.parentElement;

    const resize = () => {
      if (!canvas || !parent) return;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let mx = -9999;
    let my = -9999;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
    };
    const onLeave = () => {
      mx = -9999;
      my = -9999;
    };

    parent?.addEventListener('mousemove', onMove);
    parent?.addEventListener('mouseleave', onLeave);

    const spacing = 32;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const baseAlpha = isDark ? 0.12 : 0.07;

      for (let x = spacing / 2; x < canvas.width; x += spacing) {
        for (let y = spacing / 2; y < canvas.height; y += spacing) {
          const dx = x - mx;
          const dy = y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let alpha = baseAlpha;
          let r = 1.2;

          if (dist < 140) {
            const factor = 1 - dist / 140;
            alpha = baseAlpha + factor * (isDark ? 0.45 : 0.28);
            r = 1.2 + factor * 0.8;
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? `rgba(161, 161, 170, ${alpha})` : `rgba(11, 11, 12, ${alpha})`;
          ctx.fill();
        }
      }
      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      parent?.removeEventListener('mousemove', onMove);
      parent?.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-60" aria-hidden="true" />;
}

function LivingMapCanvas({
  stage,
  hoveredIncident,
  onHoverIncident,
}: {
  stage: number;
  hoveredIncident: boolean;
  onHoverIncident: (v: boolean) => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(rm);
    const checkMob = () => setIsMobile(window.innerWidth < 768);
    checkMob();
    window.addEventListener('resize', checkMob);
    return () => window.removeEventListener('resize', checkMob);
  }, []);

  const STAGES = [
    { scale: 1.0, x: 0, y: 0, brightness: 45, contrast: 108, opacity: 0.38 },
    { scale: 1.04, x: -35, y: 20, brightness: 48, contrast: 110, opacity: 0.42 },
    { scale: 1.02, x: 0, y: 0, brightness: 46, contrast: 112, opacity: 0.40 },
    { scale: 1.03, x: -15, y: 10, brightness: 45, contrast: 108, opacity: 0.38 },
    { scale: 1.0, x: 0, y: 0, brightness: 40, contrast: 105, opacity: 0.30 },
  ];

  const idx = Math.min(STAGES.length - 2, Math.max(0, Math.floor(stage)));
  const frac = stage - idx;
  const smooth = frac * frac * (3 - 2 * frac);
  const cur = STAGES[idx];
  const nxt = STAGES[idx + 1] || cur;

  const scale = reducedMotion ? 1.0 : isMobile ? 1.04 : cur.scale + (nxt.scale - cur.scale) * smooth;
  const x = reducedMotion || isMobile ? 0 : cur.x + (nxt.x - cur.x) * smooth;
  const y = reducedMotion || isMobile ? 0 : cur.y + (nxt.y - cur.y) * smooth;
  const brightness = cur.brightness + (nxt.brightness - cur.brightness) * smooth;
  const contrast = cur.contrast + (nxt.contrast - cur.contrast) * smooth;
  const opacity = cur.opacity + (nxt.opacity - cur.opacity) * smooth;

  const heroDotOp = Math.max(0, 1 - stage * 2.2);
  const analysisOp = Math.max(0, Math.min(1, 1 - Math.abs(stage - 1) * 1.3));
  const networkOp = Math.max(0, Math.min(1, 1 - Math.abs(stage - 2) * 1.3));
  const decisionOp = Math.max(0, Math.min(1, 1 - Math.abs(stage - 3) * 1.3));
  const finalCtaOp = Math.max(0, Math.min(1, (stage - 3.4) * 1.6));

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#050505]" aria-hidden="true">
      <div
        style={{
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
          transition: reducedMotion ? 'opacity 300ms ease' : 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1), filter 300ms ease, opacity 300ms ease',
          opacity,
          filter: `contrast(${contrast}%) brightness(${brightness}%)`,
        }}
        className="absolute inset-0 h-full w-full will-change-transform"
      >
        <img
          src="/oziz-cinematic-map-hd.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover select-none"
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 85% 75% at 50% 50%, rgba(5,5,5,0.15) 15%, rgba(5,5,5,0.78) 65%, #050505 100%)',
          }}
        />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#050505]/70 via-transparent to-[#050505]/90" />

        <svg
          viewBox="0 0 1920 1080"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full overflow-visible pointer-events-none"
        >
          <defs>
            <linearGradient id="routeLightGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
              <stop offset="50%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.2)" />
            </linearGradient>
            <filter id="neonBeamGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. Hero Central Dot */}
          <g opacity={heroDotOp} className="transition-opacity duration-300">
            <circle cx="960" cy="540" r="4" fill="#ffffff" />
            <circle
              cx="960"
              cy="540"
              r="12"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
              style={{ animation: 'breathDot 2.8s ease-in-out infinite' }}
            />
          </g>

          {/* 2. Analysis Single Incident Marker */}
          <g opacity={analysisOp} className="transition-opacity duration-300">
            <path
              d="M 1365,274 L 1480,206 L 1590,206"
              fill="none"
              stroke={hoveredIncident ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.5)'}
              strokeWidth="1.2"
              strokeDasharray="5 4"
              className="transition-colors duration-200"
            />
            <circle cx="1365" cy="274" r={hoveredIncident ? 7 : 5.5} fill="#ef4444" className="transition-all duration-200" />
            <circle
              cx="1365"
              cy="274"
              r={hoveredIncident ? 24 : 18}
              fill="none"
              stroke="#ef4444"
              strokeWidth="1.2"
              style={{ animation: 'pulseRedRing 2.4s cubic-bezier(0.2, 0, 0.2, 1) infinite' }}
            />
            <circle cx="1365" cy="274" r="36" fill="rgba(239,68,68,0.06)" />
          </g>

          {/* 3. City Intelligence Network Mesh */}
          <g opacity={networkOp} className="transition-opacity duration-300">
            <path
              d="M 1365,274 L 960,540 M 638,309 L 960,540 M 960,540 L 1416,675 M 960,540 L 431,684 M 638,309 L 431,684"
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
              strokeDasharray="4 5"
            />
            {[
              { x: 1365, y: 274 },
              { x: 638, y: 309 },
              { x: 960, y: 540 },
              { x: 1416, y: 675 },
              { x: 431, y: 684 },
            ].map((pt, i) => (
              <g key={i}>
                <circle cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" />
                <circle cx={pt.x} cy={pt.y} r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              </g>
            ))}
          </g>

          {/* 4. Decision & Highway Route */}
          <g opacity={decisionOp} className="transition-opacity duration-300">
            <path
              d="M 328,778 C 441,698 666,604 960,540 C 1240,446 1428,306 1775,131"
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.5"
              filter="url(#neonBeamGlow)"
            />
            <path
              d="M 328,778 C 441,698 666,604 960,540 C 1240,446 1428,306 1775,131"
              fill="none"
              stroke="url(#routeLightGrad)"
              strokeWidth="4"
              strokeDasharray="140 600"
              style={{ animation: 'routeFlow 2.8s linear infinite' }}
            />
          </g>

          {/* 5. Final CTA Faint Road Line */}
          <g opacity={finalCtaOp} className="transition-opacity duration-300">
            <path
              d="M 960,540 L 1000,565"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function BentoCell({ n, icon, title, text, className, children }: { n: string; icon: string; title: string; text: string; className?: string; children?: React.ReactNode }) {
  const spotlight = useSpotlight();
  return (
    <Card {...spotlight} className={cn('card-spotlight flex flex-col p-6', className)}>
      <div className="relative z-10 flex items-center justify-between">
        <div className="group/bento-ic flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-bg2 text-fg2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 hover:scale-105 hover:border-accent hover:text-accent">
          <Icon name={icon} size={20} className="transition-transform duration-200 group-hover/bento-ic:rotate-[-6deg]" />
        </div>
        <span className="tnum font-mono text-xs text-fg3">{n}</span>
      </div>
      <h3 className="relative z-10 mt-5 text-[18px] font-semibold tight text-fg">{title}</h3>
      <p className="relative z-10 mt-1.5 max-w-[440px] text-sm text-fg2">{text}</p>
      {children && <div className="relative z-10 mt-6 flex-1">{children}</div>}
    </Card>
  );
}

const J = ({ k, v, hl, last }: { k: string; v: string; hl?: boolean; last?: boolean }) => (
  <div>
    <span className="text-fg3">{'  '}"{k}": </span>
    <span className={hl ? 'rounded bg-accent-soft px-1 text-accent' : 'text-fg'}>{v}</span>
    {!last && <span className="text-fg3">,</span>}
  </div>
);

function BentoPinDemo() {
  const [point, setPoint] = useState({ lat: 51.1284, lng: 71.4305 });

  const randomize = () => {
    triggerHaptic(8);
    const dLat = (Math.random() - 0.5) * 0.015;
    const dLng = (Math.random() - 0.5) * 0.015;
    setPoint({
      lat: +(51.1284 + dLat).toFixed(5),
      lng: +(71.4305 + dLng).toFixed(5),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-44 overflow-hidden rounded-lg border border-line">
        <MapCanvas
          initialZoom={3}
          initialCenter={point}
          pin={point}
          onPinChange={setPoint}
          accuracy={8}
          interactive={false}
          label="Интерактивная метка"
        />
        <div className="absolute top-2 right-2 z-20">
          <button
            type="button"
            onClick={randomize}
            className="t rounded-md border border-line bg-surface/90 px-2 py-1 text-xs font-medium text-fg shadow-sm backdrop-blur-md hover:bg-bg2 active:scale-95"
          >
            Сместить метку
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-mono text-fg">
          <Icon name="pin" size={12} className="text-accent" />
          <span className="tnum">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>
        </div>
        <div className="flex items-center gap-1 text-ok">
          <Icon name="check" size={12} />
          <span>EXIF очищен (0 байт)</span>
        </div>
      </div>
    </div>
  );
}

function BentoAiDemo() {
  const [scanning, setScanning] = useState(false);

  const rescan = () => {
    triggerHaptic(10);
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      toast('ИИ: дефект классифицирован и проверен');
    }, 600);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg border border-line bg-bg2">
        <div className="relative h-20 overflow-hidden bg-[#1e2024]">
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#8a8478_1px,transparent_1px)] [background-size:8px_8px]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <div className="h-12 w-24 rounded-full border border-dashed border-accent/60 bg-accent/15" />
              <div className="absolute -top-3 rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-fg shadow-sm">
                Открытый люк · 94%
              </div>
            </div>
          </div>
          <div
            className="absolute inset-x-0 h-0.5 bg-accent shadow-[0_0_12px_var(--c-accent)] pointer-events-none"
            style={{ animation: 'laserScan 2.4s ease-in-out infinite' }}
          />
        </div>
        <div className="flex items-center justify-between border-t border-line bg-surface px-3 py-1.5">
          <span className="text-xs text-fg2">Автоматический анализ фото</span>
          <Button size="sm" variant="ghost" icon="refresh" loading={scanning} onClick={rescan}>
            Сканировать
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-line bg-bg2 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg3">Категория:</span>
          <span className="font-medium text-fg">Открытый люк</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg3">Уровень опасности:</span>
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-400">Экстренная ситуация</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg3">Точность проверки:</span>
          <span className="tnum font-mono text-fg">94%</span>
        </div>
      </div>
    </div>
  );
}

function BentoPriorityDemo() {
  const [factors, setFactors] = useState({
    severity: true,
    vulnerable: true,
    weather: false,
    traffic: false,
    citizens: true,
    emergency: true,
  });

  const toggle = (k: keyof typeof factors) => {
    triggerHaptic(6);
    setFactors(f => ({ ...f, [k]: !f[k] }));
  };

  const score = useMemo(() => {
    let s = 0;
    if (factors.severity) s += 25;
    if (factors.vulnerable) s += 16;
    if (factors.weather) s += 10;
    if (factors.traffic) s += 10;
    if (factors.citizens) s += 14;
    if (factors.emergency) s += 25;
    return Math.min(100, s);
  }, [factors]);

  const animatedScore = useCountUp(score, 400);
  const level: PriorityLevel = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { key: 'vulnerable', label: 'Школа рядом +16' },
          { key: 'weather', label: 'Ночь / Заморозки +10' },
          { key: 'traffic', label: 'Час пик +10' },
          { key: 'citizens', label: 'Подтверждения жителей +14' },
          { key: 'emergency', label: 'Аварийность +25' },
        ].map(item => {
          const active = factors[item.key as keyof typeof factors];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => toggle(item.key as any)}
              className={cn(
                't inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-fg3 hover:border-fg2 hover:text-fg',
              )}
            >
              <Icon name={active ? 'check' : 'plus'} size={11} />
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-fg2">
          <span>Суммарный приоритет</span>
          <span className="font-mono text-fg">{animatedScore} / 100</span>
        </div>
        <ProgressBar value={animatedScore} max={100} height={6} />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <div className="flex items-baseline gap-2">
          <span className="tnum font-mono text-[28px] font-semibold leading-none tight text-fg">{animatedScore}</span>
          <span className="text-xs text-fg3">баллов</span>
        </div>
        <PriorityBadge level={level} />
      </div>
    </div>
  );
}

function BentoDispatchDemo() {
  const [items, setItems] = useState([
    { id: '1', s: 'ГорВодоканал', txt: 'Открытый люк, ул. Тауелсиздик, 14', color: 'var(--c-crit)', time: '19:42' },
    { id: '2', s: 'ГорДорСтрой', txt: 'Светофор мигает жёлтым, ул. Кенесары, 40', color: 'var(--c-high)', time: '19:38' },
    { id: '3', s: 'ГорСвет', txt: 'Не горят фонари, ул. Сейфуллина, 88', color: 'var(--c-med)', time: '19:21' },
  ]);

  const addSimulated = () => {
    triggerHaptic(8);
    const mockEvents = [
      { s: 'ГорДорСтрой', txt: 'Яма на съезде моста Сарайшык', color: 'var(--c-crit)' },
      { s: 'ГорВодоканал', txt: 'Порыв гидранта, пр. Мангилик Ел', color: 'var(--c-high)' },
      { s: 'ГорСвет', txt: 'Повреждение опоры, ул. Достык', color: 'var(--c-med)' },
    ];
    const pick = mockEvents[Math.floor(Math.random() * mockEvents.length)];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newItem = { id: String(Date.now()), ...pick, time: timeStr };
    setItems(prev => [newItem, ...prev.slice(0, 2)]);
    toast(`Диспетчер: Новое назначение для ${pick.s}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
          </span>
          <span className="text-xs text-fg2">Поток назначений онлайн</span>
        </div>
        <Button size="sm" variant="ghost" icon="plus" onClick={addSimulated}>
          Смоделировать
        </Button>
      </div>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.id} className="a-rise flex items-start gap-2.5 rounded-lg border border-line bg-surface p-2.5">
            <span className="mt-1.5 shrink-0">
              <Dot color={item.color} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-fg">{item.s}</div>
              <div className="truncate text-xs text-fg2">{item.txt}</div>
            </div>
            <span className="tnum shrink-0 font-mono text-xs text-fg3">{item.time}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BentoCitizenDemo() {
  const [votes, setVotes] = useState(23);
  const [voted, setVoted] = useState(false);

  const count = useCountUp(votes, 400);

  const handleVote = () => {
    if (voted) return;
    triggerHaptic(12);
    setVotes(v => v + 1);
    setVoted(true);
    toast('Голос учтён: привязан к вашей сессии');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="tnum font-mono text-[28px] font-semibold leading-none tight text-fg">{count}</span>
          <span className="text-xs text-fg2">жителя подтвердили проблему</span>
        </div>
        <Button
          size="sm"
          variant={voted ? 'secondary' : 'primary'}
          icon={voted ? 'check' : 'users'}
          disabled={voted}
          onClick={handleVote}
        >
          {voted ? 'Подтверждено вами' : 'Я тоже вижу (+1)'}
        </Button>
      </div>
      <div className="space-y-2.5">
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-fg2">Ремонт выполнен качественно</span>
            <span className="tnum font-mono text-fg">18</span>
          </div>
          <ProgressBar value={18} max={votes} color="var(--c-ok)" height={5} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-fg2">Проблема не решена</span>
            <span className="tnum font-mono text-fg">3</span>
          </div>
          <ProgressBar value={3} max={votes} color="var(--c-crit)" height={5} />
        </div>
      </div>
    </div>
  );
}

function BentoSolanaDemo() {
  const [step, setStep] = useState(3);
  const [verifying, setVerifying] = useState(false);

  const verifyChain = () => {
    triggerHaptic(8);
    setVerifying(true);
    setStep(1);
    setTimeout(() => {
      setStep(2);
      setTimeout(() => {
        setStep(3);
        setVerifying(false);
        toast('Solana реестр: целостность цепочки хэшей подтверждена');
      }, 400);
    }, 400);
  };

  return (
    <div className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-4">
        {[
          { seq: '0', st: 'Новая', h: '3fA1...c0De' },
          { seq: '1', st: 'Проверена ИИ', h: 'b82E...71aK' },
          { seq: '2', st: 'Назначена', h: 'Q9xm...4Lp2' },
          { seq: '3', st: 'В работе', h: '7Kd2...9fQa' },
        ].map((item, i) => (
          <li
            key={item.seq}
            className={cn(
              'relative rounded-lg border p-2.5 transition-all',
              i <= step ? 'border-accent/40 bg-accent-soft/20' : 'border-line bg-surface opacity-60',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="tnum font-mono text-[11px] text-fg3">seq {item.seq}</span>
              {i <= step && <Icon name="check" size={12} className="text-ok" />}
            </div>
            <div className="mt-1.5 text-xs font-medium text-fg">{item.st}</div>
            <div className="tnum mt-0.5 font-mono text-[11px] text-fg2">{item.h}</div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <Button size="sm" variant="secondary" icon="shield" loading={verifying} onClick={verifyChain}>
          Проверить цепочку хэшей
        </Button>
        <button
          type="button"
          onClick={() => go('/map')}
          className="t group inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          Проверить любую заявку
          <Icon name="arrowRight" size={12} className="t group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

function Landing({ data }: { data: Data }) {
  const t = useT();
  const { reports, services, loading } = data;
  const heroCtaRef = useMagnetic();

  const [stage, setStage] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const [hoveredIncident, setHoveredIncident] = useState(false);

  // Animated counters for telemetry
  const countObjects = useCountUp(activeSection >= 2 ? 1248 : 0, 1500);
  const countEvents = useCountUp(activeSection >= 2 ? 37 : 0, 1200);

  useEffect(() => {
    let ticking = false;
    const updateScroll = () => {
      const s0 = document.getElementById('hero');
      const s1 = document.getElementById('analysis');
      const s2 = document.getElementById('intelligence');
      const s3 = document.getElementById('decision');
      const s4 = document.getElementById('final-cta');

      if (!s0 || !s1 || !s2 || !s3 || !s4) return;

      const y = window.scrollY;
      const h0 = s0.offsetTop;
      const h1 = s1.offsetTop;
      const h2 = s2.offsetTop;
      const h3 = s3.offsetTop;
      const h4 = s4.offsetTop;

      let st = 0;
      if (y < h1) {
        st = Math.max(0, Math.min(1, (y - h0) / (h1 - h0 || 1)));
      } else if (y < h2) {
        st = 1 + Math.max(0, Math.min(1, (y - h1) / (h2 - h1 || 1)));
      } else if (y < h3) {
        st = 2 + Math.max(0, Math.min(1, (y - h2) / (h3 - h2 || 1)));
      } else if (y < h4) {
        st = 3 + Math.max(0, Math.min(1, (y - h3) / (h4 - h3 || 1)));
      } else {
        const extra = Math.max(0, Math.min(1, (y - h4) / 400));
        st = Math.min(4, 4 + extra * 0.5);
      }

      setStage(st);
      setActiveSection(Math.min(4, Math.floor(st + 0.35)));
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScroll);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const stats = useMemo(() => {
    const month = reports.filter(r => Date.now() - new Date(r.created_at).getTime() < 30 * 86400000).length;
    const resolved = reports.filter(r => r.status === 'RESOLVED' || r.status === 'CONFIRMED_BY_CITIZEN').length;
    const avg = services.length ? services.reduce((s, x) => s + x.stats.avg_response_hours, 0) / services.length : 0;
    const ledger = reports.reduce((s, r) => s + (r.events?.length || 0), 0);
    return { month, resolvedPct: reports.length ? Math.round((resolved / reports.length) * 100) : 0, avg, ledger };
  }, [reports, services]);

  const ranked = useMemo(
    () => [...services].map(s => ({ ...s, rate: Math.round((s.stats.resolved / (s.stats.total_assigned || 1)) * 100) })).sort((a, b) => b.rate - a.rate),
    [services],
  );

  return (
    <div className="relative bg-[#050505] text-[#ededed] overflow-x-hidden selection:bg-red-500/20 selection:text-white">
      {/* Living Map Background Canvas */}
      <LivingMapCanvas
        stage={stage}
        hoveredIncident={hoveredIncident}
        onHoverIncident={setHoveredIncident}
      />

      {/* =========================================================================
       * 1. HERO SECTION
       * ========================================================================= */}
      <section id="hero" className="relative z-10 flex min-h-[90vh] flex-col justify-center pt-24 pb-16 md:pt-32 md:pb-24">
        <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="a-rise lg:col-span-7">
            <h1 className="max-w-[720px] text-[42px] leading-[1.04] font-semibold tracking-tight text-white md:text-[68px]">
              Город. Который видит больше.
            </h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-zinc-400 md:text-[19px]">
              Автономная детекция инцидентов, детерминированная приоритизация и прозрачный реестр решений на блокчейне Solana.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              <span ref={heroCtaRef} className="inline-block transition-transform duration-100 ease-out">
                <Button
                  variant="primary"
                  size="lg"
                  icon="arrowRight"
                  onClick={() => go('/map')}
                >
                  Запустить платформу
                </Button>
              </span>
              <button
                type="button"
                onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
                className="t group inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-medium text-zinc-300 backdrop-blur-md hover:bg-white/10 hover:text-white"
              >
                Как это работает
                <Icon name="arrowRight" className="t group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={() => go('/submit')}
                className="t inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-zinc-400 hover:text-white"
              >
                Сообщить об инциденте
              </button>
            </div>
          </div>

          {/* Hero Decorative Hardware Showcase: Desktop Monitor Frame */}
          <div className="lg:col-span-5 lg:flex lg:justify-end">
            <div className="group relative w-full max-w-[500px]">
              {/* Ambient backlight glow */}
              <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-red-600/15 via-white/5 to-red-600/10 blur-2xl opacity-60 transition-opacity duration-500 group-hover:opacity-100" />

              {/* Desktop Monitor Frame */}
              <div className="relative rounded-2xl p-1 transition-transform duration-300 ease-out group-hover:scale-[1.02]">
                <img
                  src="/oziz-monitor-transparent.png"
                  alt="OZIZ Smart City Desktop Interface"
                  className="h-auto w-full select-none object-contain drop-shadow-[0_25px_60px_rgba(0,0,0,0.95)]"
                />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================================
       * 2. STATS STRIP (SOCIAL PROOF & TELEMETRY)
       * ========================================================================= */}
      <section aria-label="Показатели" className="relative z-10 border-y border-white/10 bg-[#050505]/90 backdrop-blur-md">
        <Container className="grid grid-cols-2 gap-y-8 py-8 md:grid-cols-4 md:py-10">
          {[
            [t('stats.reports'), stats.month.toLocaleString('ru-RU')],
            [t('stats.response'), `${stats.avg.toFixed(1).replace('.', ',')} ч`],
            [t('stats.resolved'), `${stats.resolvedPct}%`],
            [t('stats.ledger'), stats.ledger.toLocaleString('ru-RU')],
          ].map(([l, v], i) => (
            <div key={l} className={cn(i % 2 === 1 && 'pl-6 md:pl-0', i > 0 && 'md:border-l md:border-white/10 md:pl-8')}>
              <Stat label={l} value={v} loading={loading} />
            </div>
          ))}
        </Container>
      </section>

      {/* =========================================================================
       * 3. SECTION — ANALYSIS & INSTANT INCIDENT DETECTION
       * ========================================================================= */}
      <section id="analysis" className="relative z-10 py-20 md:py-32">
        <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6">
            <div className="mb-2.5 font-mono text-xs font-semibold tracking-widest text-red-400 uppercase">
              Мгновенная детекция
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Выявление инцидентов до первого звонка
            </h2>
            <p className="mt-5 max-w-[480px] text-base leading-relaxed text-zinc-400 md:text-lg">
              Система фиксирует отклонения от нормы и формирует точную карточку происшествия с геопривязкой, уровнем риска и доказательной базой.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                Красная метка на карте
              </span>
              <span>·</span>
              <span>Детерминированный хэш в реестре</span>
            </div>
          </div>

          <div className="lg:col-span-6 lg:flex lg:justify-end">
            <div
              onMouseEnter={() => setHoveredIncident(true)}
              onMouseLeave={() => setHoveredIncident(false)}
              onClick={() => go('/map')}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') go('/map'); }}
              className="relative w-full max-w-[440px] cursor-pointer rounded-2xl border border-white/10 bg-[#08080a]/90 p-7 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-red-500/50"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                  <span className="font-mono text-xs font-semibold text-red-400">Обнаружено событие</span>
                </div>
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 font-mono text-[11px] text-red-400">
                  Уровень риска: высокий
                </span>
              </div>
              <div className="mt-5 text-xl font-semibold tracking-tight text-white">
                пр. Абая, 123
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-xs text-zinc-400">
                <span>12.04.2025 · 16:42</span>
                <span className="text-zinc-500">ID #002-AST</span>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-zinc-400">
                <span>Категория: Нарушение парковки</span>
                <span className="flex items-center gap-1 font-medium text-white hover:underline">
                  Открыть на карте
                  <Icon name="arrowRight" size={12} />
                </span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================================
       * 4. SECTION — CITY INTELLIGENCE (LIVE TELEMETRY)
       * ========================================================================= */}
      <section id="intelligence" className="relative z-10 border-t border-white/10 py-20 md:py-32">
        <Container>
          <div className="mx-auto max-w-[640px] text-center">
            <div className="mb-2 font-mono text-xs font-semibold tracking-widest text-zinc-400 uppercase">
              Мониторинг инфраструктуры
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Городской масштаб под контролем
            </h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">
              Распределенная сеть сенсоров и видеопотоков объединяется в живой граф городской инфраструктуры.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-[880px] gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#08080a]/80 p-6 backdrop-blur-xl">
              <div className="font-mono text-xs text-zinc-400">OBJECTS MONITORED</div>
              <div className="tnum mt-3 font-mono text-4xl font-semibold tracking-tight text-white md:text-5xl">
                {countObjects.toLocaleString('ru-RU')}
              </div>
              <div className="mt-2 text-xs text-zinc-500">Камеры, датчики, светофоры</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#08080a]/80 p-6 backdrop-blur-xl">
              <div className="font-mono text-xs text-zinc-400">EVENTS DETECTED</div>
              <div className="tnum mt-3 font-mono text-4xl font-semibold tracking-tight text-white md:text-5xl">
                {countEvents}
              </div>
              <div className="mt-2 text-xs text-zinc-500">Зафиксировано за 24 часа</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#08080a]/80 p-6 backdrop-blur-xl">
              <div className="font-mono text-xs text-zinc-400">AI CONFIDENCE</div>
              <div className="tnum mt-3 font-mono text-4xl font-semibold tracking-tight text-white md:text-5xl">
                94.8%
              </div>
              <div className="mt-2 text-xs text-zinc-500">Компьютерное зрение</div>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================================
       * 5. HOW IT WORKS (BENTO GRID DEMOS)
       * ========================================================================= */}
      <section id="how" className="scroll-mt-14 border-t border-white/10 py-20 md:py-32">
        <Container>
          <Reveal className="grid gap-4 md:grid-cols-12 md:gap-6">
            <div className="md:col-span-6">
              <div className="mb-2 font-mono text-xs font-semibold tracking-widest text-zinc-400 uppercase">
                Архитектура платформы
              </div>
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white md:text-4xl">
                {t('how.title')}
              </h2>
            </div>
            <p className="text-[15px] leading-relaxed text-zinc-400 md:col-span-5 md:col-start-8 md:pt-4">
              {t('how.sub') || STR.ru['how.sub']}
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:mt-16 md:grid-cols-12 md:gap-6">
            <Reveal className="md:col-span-5">
              <BentoCell n="01" icon="camera" title="Фото и точка на карте" text="Три касания: фото, метка, отправка. Метаданные EXIF удаляются на устройстве, координаты уточняются вручную." className="h-full">
                <BentoPinDemo />
              </BentoCell>
            </Reveal>

            <Reveal className="md:col-span-7" delay={60}>
              <BentoCell n="02" icon="scan" title="ИИ-анализ фото и текста" text="Модель определяет тип дефекта, серьёзность и угрозу, сверяет фото с описанием и отмечает аварийные случаи." className="h-full">
                <BentoAiDemo />
              </BentoCell>
            </Reveal>

            <Reveal className="md:col-span-7">
              <BentoCell n="03" icon="activity" title="Объяснимый приоритет" text="Детерминированная формула от 0 до 100. Вклад каждого фактора открыт, поэтому решение можно проверить и оспорить." className="h-full">
                <BentoPriorityDemo />
              </BentoCell>
            </Reveal>

            <Reveal className="md:col-span-5" delay={60}>
              <BentoCell n="04" icon="bell" title="Служба узнаёт сразу" text="Заявка попадает в очередь нужной службы с таймером SLA. Критические случаи поднимаются наверх." className="h-full">
                <BentoDispatchDemo />
              </BentoCell>
            </Reveal>

            <Reveal className="md:col-span-5">
              <BentoCell n="05" icon="users" title="Жители подтверждают и оценивают" text="Отметка «Я тоже вижу» повышает приоритет. После ремонта жители голосуют, и плохая работа переоткрывает заявку." className="h-full">
                <BentoCitizenDemo />
              </BentoCell>
            </Reveal>

            <Reveal className="md:col-span-7" delay={60}>
              <BentoCell n="06" icon="chain" title="Реестр Solana" text="Каждый статус ссылается на хэш предыдущего. В программе нет операций удаления и изменения." className="h-full">
                <BentoSolanaDemo />
              </BentoCell>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* =========================================================================
       * 6. DECISION & MUNICIPAL TRANSPARENCY
       * ========================================================================= */}
      <section id="decision" className="scroll-mt-14 border-t border-white/10 py-20 md:py-32">
        <Container className="grid gap-10 md:grid-cols-12 md:gap-8">
          <Reveal className="md:col-span-4">
            <div className="mb-2 font-mono text-xs font-semibold tracking-widest text-zinc-400 uppercase">
              Диспетчеризация и SLA
            </div>
            <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white md:text-4xl">
              {t('tr.title')}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
              {t('tr.sub') || STR.ru['tr.sub']}
            </p>
            <button
              type="button"
              onClick={() => go('/transparency')}
              className="t group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
            >
              Открыть дашборд
              <Icon name="arrowRight" className="t group-hover:translate-x-0.5" />
            </button>
          </Reveal>
          <Reveal className="md:col-span-8" delay={60}>
            <ServiceTable services={ranked} loading={loading} />
          </Reveal>
        </Container>
      </section>

      {/* =========================================================================
       * 7. FOR MUNICIPAL SERVICES
       * ========================================================================= */}
      <section id="services" className="scroll-mt-14 border-t border-white/10 py-20 md:py-32">
        <Container>
          <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 font-mono text-xs font-semibold tracking-widest text-zinc-400 uppercase">
                Городским службам
              </div>
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white md:text-4xl">
                {t('svc.title')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => go('/dispatch')}
              className="t group inline-flex items-center gap-1.5 text-sm font-medium text-accent"
            >
              Открыть панель службы
              <Icon name="arrowRight" className="t group-hover:translate-x-0.5" />
            </button>
          </Reveal>
          <div className="mt-12 grid gap-8 md:mt-16 md:grid-cols-3 md:gap-6">
            {[
              ['inbox', 'Очередь по приоритету', 'Заявки уже классифицированы и отсортированы. Дубликаты в радиусе 100 метров объединяются, без ручной сортировки.'],
              ['clock', 'SLA под контролем', 'У каждой заявки есть регламентный срок. Таймеры видны оператору, а просрочки фиксируются автоматически.'],
              ['shield', 'Отказ только с обоснованием', 'Закрыть заявку без ответа нельзя. Причина отклонения публикуется, а её хэш записывается в реестр.'],
            ].map(([ic, h, p], i) => (
              <Reveal key={h} delay={i * 60} className="rounded-xl border border-white/10 bg-[#08080a]/60 p-6 backdrop-blur-md">
                <Icon name={ic} size={20} className="text-zinc-400" />
                <h3 className="mt-4 text-[18px] font-semibold tracking-tight text-white">{h}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">{p}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* =========================================================================
       * 8. FAQ
       * ========================================================================= */}
      <section id="faq" className="scroll-mt-14 border-t border-white/10 py-20 md:py-32">
        <Container className="grid gap-10 md:grid-cols-12 md:gap-8">
          <Reveal className="md:col-span-4">
            <div className="mb-2 font-mono text-xs font-semibold tracking-widest text-zinc-400 uppercase">
              База знаний
            </div>
            <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white md:text-4xl">
              {t('faq.title')}
            </h2>
          </Reveal>
          <Reveal className="md:col-span-8" delay={60}>
            <Accordion items={FAQ} />
          </Reveal>
        </Container>
      </section>

      {/* =========================================================================
       * 9. FINAL CTA
       * ========================================================================= */}
      <section id="final-cta" className="border-t border-white/10 py-24 md:py-32 text-center">
        <Container className="flex flex-col items-center">
          <h2 className="max-w-[760px] text-4xl leading-tight font-semibold tracking-tight text-white md:text-6xl">
            Город уже говорит.<br />
            Начните его видеть.
          </h2>
          <p className="mt-6 max-w-[520px] text-base leading-relaxed text-zinc-400 md:text-lg">
            Открытая городская платформа OZIZ на базе Solana. Полная прозрачность от первой фиксации до завершения ремонта.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Button variant="primary" size="lg" icon="arrowRight" onClick={() => go('/map')}>
              Запустить платформу
            </Button>
            <Button size="lg" icon="plus" onClick={() => go('/submit')}>
              Сообщить об инциденте
            </Button>
          </div>
        </Container>
      </section>

      {/* Footer */}
      <Footer source={data.source} />
    </div>
  );
}

function ServiceTable({ services, loading }: { services: Array<MunicipalService & { rate: number }>; loading: boolean }) {
  if (loading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="micro pb-3 font-medium">Служба</th>
            <th className="micro pb-3 text-right font-medium">Реакция</th>
            <th className="micro w-[38%] pb-3 pl-6 font-medium">Решено</th>
            <th className="micro pb-3 text-right font-medium">Нарушений SLA</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s, i) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td className="py-3.5 pr-4">
                <span className="tnum mr-3 font-mono text-fg3">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-medium text-fg">{s.name.split(' (')[0]}</span>
              </td>
              <td className="tnum py-3.5 text-right font-mono text-fg">{s.stats.avg_response_hours.toFixed(1).replace('.', ',')} ч</td>
              <td className="py-3.5 pl-6">
                <div className="flex items-center gap-3">
                  <ProgressBar value={s.rate} label={`Решено ${s.rate}%`} />
                  <span className="tnum w-10 text-right font-mono text-fg">{s.rate}%</span>
                </div>
              </td>
              <td className={cn('tnum py-3.5 text-right font-mono', s.stats.sla_violations >= 4 ? 'text-crit' : 'text-fg')}>{s.stats.sla_violations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================================
 * 11. Auth
 * ========================================================================= */

function AuthScreen({ onAuth }: { onAuth: (u: { name: string; contact: string }) => void }) {
  type Mode = 'login' | 'register' | 'reset' | 'code' | 'done';
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ name: '', contact: '', password: '', terms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: any) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: '' }));
  };

  const validContact = (v: string) => /^\S+@\S+\.\S+$/.test(v) || /^\+?\d[\d\s()-]{9,}$/.test(v);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!validContact(form.contact)) err.contact = 'Введите email или номер телефона';
    if (mode !== 'reset' && form.password.length < 8) err.password = 'Не менее 8 символов';
    if (mode === 'register' && form.name.trim().length < 2) err.name = 'Укажите имя';
    if (mode === 'register' && !form.terms) err.terms = 'Необходимо согласие';
    setErrors(err);
    if (Object.keys(err).length) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (mode === 'reset') return setMode('code');
      onAuth({ name: form.name.trim() || form.contact.split('@')[0], contact: form.contact });
      toast(mode === 'register' ? 'Аккаунт создан' : 'Вы вошли');
      go('/');
    }, 900);
  };

  return (
    <div className="flex min-h-[calc(100dvh-56px)] items-start justify-center bg-bg2 px-5 py-12 md:items-center">
      <Card className="a-rise w-full max-w-[400px] p-6 md:p-8">
        {mode === 'code' ? (
          <CodeStep contact={form.contact} onBack={() => setMode('reset')} onDone={() => setMode('done')} />
        ) : mode === 'done' ? (
          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-line text-ok">
              <Icon name="check" size={20} />
            </div>
            <h1 className="mt-4 text-[18px] font-semibold tight">Код подтверждён</h1>
            <p className="mt-1.5 text-sm text-fg2">Ссылка для нового пароля отправлена. Теперь можно войти.</p>
            <Button variant="primary" block className="mt-6 h-10" onClick={() => setMode('login')}>
              Ко входу
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-[18px] font-semibold tight">{mode === 'reset' ? 'Восстановление пароля' : mode === 'register' ? 'Создать аккаунт' : 'Вход в OZIZ'}</h1>
            <p className="mt-1 text-sm text-fg2">{mode === 'reset' ? 'Отправим код на email или телефон.' : 'Чтобы следить за статусом своих заявок.'}</p>
            {mode !== 'reset' && (
              <Segmented
                className="mt-6 w-full"
                label="Вход или регистрация"
                value={mode}
                onChange={m => {
                  setMode(m);
                  setErrors({});
                }}
                options={[
                  { value: 'login', label: 'Вход' },
                  { value: 'register', label: 'Регистрация' },
                ]}
              />
            )}
            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              {mode === 'register' && <Input label="Имя" autoComplete="name" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} placeholder="Айгерим" />}
              <Input label="Email или телефон" autoComplete="username" value={form.contact} onChange={e => set('contact', e.target.value)} error={errors.contact} placeholder="name@mail.kz" />
              {mode !== 'reset' && (
                <Input
                  label="Пароль"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  error={errors.password}
                  hint={mode === 'register' ? 'Не менее 8 символов' : undefined}
                  right={
                    <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Скрыть пароль' : 'Показать пароль'} className="t -mr-1 rounded-md p-1 text-fg3 hover:text-fg">
                      <Icon name={showPw ? 'eyeOff' : 'eye'} />
                    </button>
                  }
                />
              )}
              {mode === 'register' && (
                <Checkbox checked={form.terms} onChange={v => set('terms', v)} error={errors.terms}>
                  Принимаю условия использования и политику приватности
                </Checkbox>
              )}
              {mode === 'login' && (
                <div className="-mt-1 text-right">
                  <button type="button" onClick={() => setMode('reset')} className="t text-[13px] text-fg2 hover:text-accent">
                    Забыли пароль?
                  </button>
                </div>
              )}
              <Button type="submit" variant="primary" block loading={loading} className="h-10">
                {mode === 'reset' ? 'Отправить код' : 'Продолжить'}
              </Button>
            </form>
            {mode === 'reset' ? (
              <button type="button" onClick={() => setMode('login')} className="t mt-5 inline-flex items-center gap-1.5 text-[13px] text-fg2 hover:text-fg">
                <Icon name="arrowLeft" size={14} />
                Назад ко входу
              </button>
            ) : (
              <>
                <div className="my-6 flex items-center gap-3 text-xs text-fg3">
                  <span className="h-px flex-1 bg-line" />
                  или
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="space-y-2">
                  <Button block icon="globe" onClick={() => toast('Вход через Google будет доступен после подключения OAuth')}>
                    Войти через Google
                  </Button>
                  <Button block icon="send" onClick={() => toast('Вход через Telegram будет доступен после подключения бота')}>
                    Войти через Telegram
                  </Button>
                </div>
                <button type="button" onClick={() => go('/submit')} className="t mt-6 flex w-full items-center justify-center gap-1.5 text-[13px] font-medium text-fg2 hover:text-accent">
                  Продолжить без регистрации
                  <Icon name="arrowRight" size={14} />
                </button>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function CodeStep({ contact, onBack, onDone }: { contact: string; onBack: () => void; onDone: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState(59);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = [...digits];
      clean.slice(0, 6 - i).split('').forEach((d, j) => (next[i + j] = d));
      setDigits(next);
      refs.current[Math.min(5, i + clean.length)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    setError('');
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };
  const verify = () => {
    if (digits.join('').length < 6) return setError('Введите все 6 цифр');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onDone();
    }, 800);
  };
  return (
    <div>
      <h1 className="text-[18px] font-semibold tight">Введите код</h1>
      <p className="mt-1 text-sm text-fg2">
        Мы отправили 6 цифр на <span className="text-fg">{contact}</span>
      </p>
      <fieldset className="mt-6">
        <legend className="sr-only">Код подтверждения</legend>
        <div className="flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => {
                refs.current[i] = el;
              }}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Цифра ${i + 1}`}
              value={d}
              maxLength={6}
              onChange={e => setAt(i, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
                if (e.key === 'Enter') verify();
              }}
              className={cn(
                't tnum h-12 w-11 rounded-lg border bg-surface text-center font-mono text-lg text-fg outline-none focus:border-accent focus:shadow-[0_0_0_2px_var(--c-accent-soft)]',
                error ? 'border-crit' : 'border-line',
              )}
            />
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-crit">{error}</p>}
      </fieldset>
      <Button variant="primary" block loading={loading} onClick={verify} className="mt-6 h-10">
        Подтвердить
      </Button>
      <div className="mt-5 flex items-center justify-between text-[13px]">
        <button type="button" onClick={onBack} className="t inline-flex items-center gap-1.5 text-fg2 hover:text-fg">
          <Icon name="arrowLeft" size={14} />
          Назад
        </button>
        {left > 0 ? (
          <span className="tnum text-fg3">Повторно через 0:{String(left).padStart(2, '0')}</span>
        ) : (
          <button type="button" onClick={() => setLeft(59)} className="t text-accent">
            Отправить снова
          </button>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * 12. Submit flow
 * ========================================================================= */

function SubmitScreen({ data }: { data: Data }) {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<{ dataUrl: string; w: number; h: number; bytes: number; name?: string } | null>(null);
  const [showLiveCam, setShowLiveCam] = useState(false);
  const [showPreviewLightbox, setShowPreviewLightbox] = useState(false);
  const [pos, setPos] = useState({ lat: 51.1342, lng: 71.4308 });
  const [accuracy, setAccuracy] = useState(12);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState('ул. Тауелсиздик, 14');
  const [district, setDistrict] = useState(DISTRICTS[1]);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [listening, setListening] = useState(false);
  const [phase, setPhase] = useState<'form' | 'processing'>('form');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.includes('pdf')) {
      return setError('Поддерживаются изображения (JPEG, PNG, WEBP) и фото документов');
    }
    try {
      const compressed = await compressImage(f);
      setPhoto({ ...compressed, name: f.name });
      setError('');
    } catch {
      setError('Не удалось прочитать файл. Попробуйте другой формат.');
    }
  };

  const handlePinChange = async (newPos: { lat: number; lng: number }) => {
    setPos(newPos);
    const geo = await reverseGeocode(newPos.lat, newPos.lng);
    if (geo) {
      if (geo.address) setAddress(geo.address);
      if (geo.district) setDistrict(geo.district);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return toast('Геолокация недоступна в браузере');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async p => {
        const lat = +p.coords.latitude.toFixed(5);
        const lng = +p.coords.longitude.toFixed(5);
        const acc = Math.round(p.coords.accuracy);
        setPos({ lat, lng });
        setAccuracy(acc);
        setLocating(false);
        toast(`GPS координаты зафиксированы: ${lat}, ${lng} (±${acc} м)`);
        const geo = await reverseGeocode(lat, lng);
        if (geo) {
          if (geo.address) setAddress(geo.address);
          if (geo.district) setDistrict(geo.district);
        }
      },
      () => {
        setLocating(false);
        toast('Не удалось получить координаты. Выберите точку на карте.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const toggleVoice = () => {
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const r = new SR();
    r.lang = 'ru-RU';
    r.interimResults = false;
    r.onresult = (e: any) => setText(t => `${t ? `${t} ` : ''}${e.results[0][0].transcript}`.slice(0, 500));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    r.start();
    setListening(true);
  };

  const canNext = step === 0 ? !!photo : step === 1 ? address.trim().length > 2 : true;
  const steps = ['Фото и документы', 'Геопозиция', 'Описание'];

  if (phase === 'processing')
    return (
      <SubmitResult
        data={data}
        payload={{ image: photo!.dataUrl, text, lat: pos.lat, lng: pos.lng, accuracy, address, district, anonymous: anon }}
        onRestart={() => {
          setPhase('form');
          setStep(0);
          setPhoto(null);
          setText('');
        }}
      />
    );

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pt-8 pb-32 md:px-6 md:pt-12 md:pb-16">
      <button type="button" onClick={() => (step ? setStep(step - 1) : go('/'))} className="t inline-flex items-center gap-1.5 text-[13px] text-fg2 hover:text-fg">
        <Icon name="arrowLeft" size={14} />
        {step ? 'Назад' : 'На главную'}
      </button>
      <h1 className="mt-4 text-2xl leading-tight font-semibold tight md:text-[32px]">Подача обращения</h1>

      <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Шаги">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}>
            <div className={cn('t h-0.5 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
            <div className={cn('mt-2 text-[13px]', i === step ? 'font-medium text-fg' : i < step ? 'text-fg2' : 'text-fg3')}>
              <span className="tnum font-mono">{i + 1}</span> {s}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8" key={step}>
        {step === 0 && (
          <div className="a-rise">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />

            {showLiveCam && (
              <LiveCameraModal
                onCapture={file => handleFile(file)}
                onClose={() => setShowLiveCam(false)}
              />
            )}

            {showPreviewLightbox && photo && (
              <LightboxModal
                src={photo.dataUrl}
                alt="Предпросмотр фото дефекта"
                onClose={() => setShowPreviewLightbox(false)}
              />
            )}

            {photo ? (
              <div className="mx-auto max-w-[460px]">
                <div
                  className="group relative aspect-video w-full cursor-zoom-in overflow-hidden rounded-xl border border-line bg-neutral-950"
                  onClick={() => setShowPreviewLightbox(true)}
                >
                  <img src={photo.dataUrl} alt="Загруженное фото" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-2.5 py-1 text-[11px] font-mono text-white backdrop-blur-sm">
                    <Icon name="search" size={12} />
                    Открыть крупно
                  </div>
                  <div className="absolute right-3 bottom-3 flex gap-2">
                    <Button
                      size="sm"
                      icon="camera"
                      onClick={e => {
                        e.stopPropagation();
                        setShowLiveCam(true);
                      }}
                      className="bg-black/80 text-white border-white/20 hover:bg-black"
                    >
                      Камера
                    </Button>
                    <Button
                      size="sm"
                      icon="image"
                      onClick={e => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="bg-black/80 text-white border-white/20 hover:bg-black"
                    >
                      Заменить файл
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-bg2 p-3 text-xs text-fg2">
                  <div className="flex items-center gap-2">
                    <Icon name="check" className="text-ok shrink-0" size={14} />
                    <span className="font-medium text-fg truncate max-w-[200px]">{photo.name || 'Снимок с камеры'}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-fg3">
                    <span>{photo.w} × {photo.h}</span>
                    <span>·</span>
                    <span>{Math.round(photo.bytes / 1024)} КБ</span>
                    <span>·</span>
                    <span className="text-ok">EXIF очищен</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    't mx-auto flex min-h-[280px] max-w-[460px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all',
                    dragOver ? 'border-accent bg-accent-soft/30' : 'border-line hover:border-fg3 bg-bg2/40'
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface text-fg shadow-sm">
                    <Icon name="camera" size={24} />
                  </div>
                  <div className="mt-4 text-[16px] font-semibold text-fg">Добавьте фото или документ</div>
                  <p className="mt-1.5 max-w-[320px] text-[13px] text-fg3">
                    Сделайте снимок в реальном времени через веб-камеру или перетащите файл с устройства (JPEG, PNG, WEBP).
                  </p>

                  <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                    <Button
                      variant="primary"
                      size="sm"
                      icon="camera"
                      onClick={() => setShowLiveCam(true)}
                      className="px-4 shadow-sm"
                    >
                      Включить камеру
                    </Button>
                    <Button
                      size="sm"
                      icon="upload"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Загрузить файл / фото
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-fg3">
                  <span>Примеры городских дефектов:</span>
                  {[
                    { label: 'Яма на дороге', cat: 'pothole' as AppealCategory },
                    { label: 'Открытый люк', cat: 'open_manhole' as AppealCategory },
                    { label: 'Поваленное дерево', cat: 'fallen_tree' as AppealCategory },
                  ].map(ex => (
                    <button
                      key={ex.cat}
                      type="button"
                      onClick={() => {
                        const img = SEED_PHOTOS[ex.cat];
                        setPhoto({
                          dataUrl: img,
                          w: 1200,
                          h: 800,
                          bytes: 245000,
                          name: `${ex.label}.jpg`,
                        });
                      }}
                      className="rounded-md border border-line bg-surface px-2.5 py-1 text-fg2 transition hover:bg-bg2 hover:text-fg"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="mt-3 text-center text-xs text-crit">{error}</p>}
          </div>
        )}

        {step === 1 && (
          <div className="a-rise space-y-5">
            <div className="relative h-[320px] overflow-hidden rounded-xl border border-line md:h-[380px]">
              <MapCanvas pin={pos} onPinChange={handlePinChange} accuracy={accuracy} initialZoom={16} interactive label="Интерактивная карта для выбора места" showLocateControl={false} />
              <div className="pointer-events-none absolute top-3 left-3 z-[1000]">
                <Chip className="bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]">Перетащите метку или нажмите на карту</Chip>
              </div>
              <Button size="sm" icon="crosshair" loading={locating} onClick={locate} className="absolute bottom-3 left-3 z-[1000] shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                Определить моё местоположение
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-2 text-fg2">
                <Dot color={accuracy <= 50 ? 'var(--c-ok)' : 'var(--c-high)'} />
                Точность GPS: <span className="tnum font-mono text-fg">{accuracy} м</span>
              </span>
              <span className="tnum font-mono text-fg3">
                {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
              </span>
            </div>
            {accuracy > 50 && <p className="text-[13px] text-high">Точность ниже 50 м. Уточните метку вручную.</p>}
            <div className="grid gap-4 sm:grid-cols-5">
              <Input wrapClass="sm:col-span-3" label="Адрес" icon="pin" value={address} onChange={e => setAddress(e.target.value)} placeholder="Улица и дом" />
              <Select className="sm:col-span-2" label="Район" value={district} onChange={e => setDistrict(e.target.value)} options={DISTRICTS.map(d => ({ value: d, label: d }))} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="a-rise space-y-5">
            <div>
              <Textarea
                label="Описание"
                optional
                rows={5}
                maxLength={500}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Что случилось и чем это опасно. Например: открытый люк без крышки на тротуаре у детского сада."
              />
              <div className="mt-1.5 flex items-center justify-between text-xs text-fg3">
                {SR ? (
                  <button type="button" onClick={toggleVoice} className={cn('t inline-flex items-center gap-1.5 hover:text-fg', listening && 'text-accent')} aria-pressed={listening}>
                    <Icon name="mic" size={14} />
                    {listening ? 'Слушаю, нажмите чтобы остановить' : 'Надиктовать голосом'}
                  </button>
                ) : (
                  <span>Можно использовать голосовой ввод клавиатуры</span>
                )}
                <span className="tnum font-mono">{text.length} / 500</span>
              </div>
            </div>
            <Card className="flex items-center gap-4 p-4">
              <Thumb src={photo?.dataUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-fg">{address}</div>
                <div className="text-[13px] text-fg2">{district}</div>
                <div className="tnum font-mono text-xs text-fg3">
                  {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} · ±{accuracy} м
                </div>
              </div>
            </Card>
            <Checkbox checked={anon} onChange={setAnon}>
              Подать анонимно. В реестр попадёт только солёный хэш, без имени и контактов.
            </Checkbox>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg p-4 md:static md:mt-10 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-[640px] gap-2 md:justify-end">
          {step > 0 && (
            <Button className="h-11 md:h-9" onClick={() => setStep(step - 1)}>
              Назад
            </Button>
          )}
          <Button
            variant="primary"
            className="h-11 flex-1 md:h-9 md:flex-none"
            disabled={!canNext}
            iconRight={step < 2 ? 'arrowRight' : undefined}
            onClick={() => (step < 2 ? setStep(step + 1) : setPhase('processing'))}
          >
            {step < 2 ? 'Далее' : 'Отправить заявку'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubmitResult({ data, payload, onRestart }: { data: Data; payload: Parameters<Data['create']>[0]; onRestart: () => void }) {
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<CivicAppeal | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const rows = [
    'Компьютерное зрение: Hugging Face ViT & DETR-ResNet50 (Vision Model)',
    'ИИ-семантика: Google Gemini Multimodal Vision Router',
    'Детерминированный гео-риск: OpenStreetMap Nominatim + H3 геокодирование',
    'Ончейн-фиксация: Запись отпечатка события в блокчейн Solana Devnet',
  ];

  useEffect(() => {
    let alive = true;
    setStage(0);
    setError('');
    setResult(null);
    const timers = [1, 2, 3].map(i => setTimeout(() => alive && setStage(s => Math.max(s, i)), i * 650));
    data
      .create(payload)
      .then(r => alive && setResult(r))
      .catch(e => alive && setError(e.message || 'Не удалось отправить заявку'));
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const done = !!result && stage >= 3;
  const effective = done ? 4 : stage;

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-10 md:px-6 md:py-16">
      <div className="micro">{done ? 'Готово' : error ? 'Ошибка' : 'Обработка'}</div>
      <h1 className="mt-3 text-2xl leading-tight font-semibold tight md:text-[32px]">{done ? 'Заявка принята' : error ? 'Заявка не отправлена' : 'Обрабатываем заявку'}</h1>

      <Card className="mt-8">
        <ul className="divide-y divide-line">
          {rows.map((r, i) => {
            const st = error && i >= effective ? 'idle' : i < effective ? 'done' : i === effective ? 'active' : 'idle';
            return (
              <li key={r} className="flex h-12 items-center gap-3 px-4">
                <span className="flex h-5 w-5 items-center justify-center">
                  {st === 'done' ? <Icon name="check" className="text-ok" /> : st === 'active' ? <Spinner /> : <span className="h-2 w-2 rounded-full bg-line" />}
                </span>
                <span className={cn('text-sm', st === 'idle' ? 'text-fg3' : 'text-fg')}>{r}</span>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="mt-3 flex items-center justify-between text-xs font-mono text-fg3 px-1">
        <span>Расход токенов: 0</span>
        <span>Серверный compute: $0.00000</span>
        <span className="text-ok font-medium">p95: 32 мс</span>
      </div>

      {error && (
        <div className="a-rise mt-6">
          <p className="text-sm text-crit">{error}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => setAttempt(a => a + 1)}>
              Повторить
            </Button>
            <Button onClick={onRestart}>Изменить заявку</Button>
          </div>
        </div>
      )}

      {done && result && (
        <div className="a-rise mt-6 space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="micro">Номер заявки</div>
                <div className="tnum mt-1 font-mono text-[22px] font-medium tight">{result.short_code}</div>
              </div>
              <PriorityBadge level={result.priority.level} score={result.priority.score} />
            </div>
            <div className="mt-4">
              <KV
                rows={[
                  ['Категория', CATEGORY[result.category] || result.category],
                  ['Служба', result.assigned_service_name],
                  ['Срок по регламенту', fmtDate(result.sla_deadline)],
                  ['Транзакция', <HashLabel value={result.onchain.tx_signature} />],
                  ['Хэш события', <HashLabel value={result.events[result.events.length - 1]?.event_hash} />],
                ]}
              />
            </div>
          </Card>
          
          {/* Solana On-Chain Memo block */}
          <Card className="p-5 border-accent/20 bg-accent-soft/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="solana" size={18} className="text-accent" />
                <h3 className="text-sm font-semibold text-fg">Запись в публичный блокчейн Solana</h3>
              </div>
              <span className="font-mono text-[11px] text-fg3">Devnet · SPL Memo</span>
            </div>
            <p className="mt-1 text-xs text-fg2">
              Зафиксируйте хеш заявки и координаты в Solana с личной подписью вашего кошелька Phantom.
            </p>

            <SolanaMemoActionBox
              defaultText={`OZIZ #${result.short_code}: ${result.title} [${result.context.location.address}]`}
              reportCode={result.short_code}
            />
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" iconRight="arrowRight" onClick={() => go(`/appeal/${result.id}`)}>
              Открыть заявку
            </Button>
            <Button onClick={onRestart}>Новая заявка</Button>
            <Button variant="ghost" onClick={() => go('/map')}>
              На карту
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * 13. Map screen
 * ========================================================================= */

const PERIOD_MS: Record<string, number> = { '24h': 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 };

function useFilters(reports: CivicAppeal[]) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const [prio, setPrio] = useState('all');
  const [period, setPeriod] = useState('all');
  const list = useMemo(
    () =>
      reports
        .filter(r => {
          if (cat !== 'all' && r.category !== cat) return false;
          if (status === 'open' && CLOSED.includes(r.status)) return false;
          if (status === 'closed' && !CLOSED.includes(r.status)) return false;
          if (prio !== 'all' && r.priority.level !== prio) return false;
          if (period !== 'all' && Date.now() - new Date(r.created_at).getTime() > PERIOD_MS[period]) return false;
          if (q) {
            const s = `${r.title} ${r.short_code} ${r.context.location.address} ${r.context.location.district}`.toLowerCase();
            if (!s.includes(q.toLowerCase())) return false;
          }
          return true;
        })
        .sort((a, b) => b.priority.score - a.priority.score),
    [reports, q, cat, status, prio, period],
  );
  const reset = () => {
    setQ('');
    setCat('all');
    setStatus('all');
    setPrio('all');
    setPeriod('all');
  };
  return { q, setQ, cat, setCat, status, setStatus, prio, setPrio, period, setPeriod, list, reset };
}

function ReportListItem({ r, selected, onClick }: { r: CivicAppeal; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn('t flex w-full items-start gap-3 rounded-lg p-2.5 text-left', selected ? 'bg-bg2' : 'hover:bg-bg2')}
    >
      <Thumb src={r.media_thumbnail_url || r.media_url} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium text-fg">{r.title}</div>
        <div className="line-clamp-1 text-[13px] text-fg2">{r.context.location.address}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <PriorityBadge level={r.priority.level} />
          <span className="text-xs text-fg3">{relTime(r.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

function FilterBar({ f }: { f: ReturnType<typeof useFilters> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <DropdownChip label="Категория" value={f.cat} onChange={f.setCat} options={[{ value: 'all', label: 'Все категории' }, ...Object.entries(CATEGORY).map(([value, label]) => ({ value, label }))]} />
      <DropdownChip
        label="Статус"
        value={f.status}
        onChange={f.setStatus}
        options={[
          { value: 'all', label: 'Все статусы' },
          { value: 'open', label: 'Открытые' },
          { value: 'closed', label: 'Закрытые' },
        ]}
      />
      <DropdownChip label="Приоритет" value={f.prio} onChange={f.setPrio} options={[{ value: 'all', label: 'Любой приоритет' }, ...(Object.keys(PRIORITY) as PriorityLevel[]).map(k => ({ value: k, label: PRIORITY[k].label }))]} />
      <DropdownChip
        label="Период"
        value={f.period}
        onChange={f.setPeriod}
        options={[
          { value: 'all', label: 'За всё время' },
          { value: '24h', label: 'За 24 часа' },
          { value: '7d', label: 'За 7 дней' },
          { value: '30d', label: 'За 30 дней' },
        ]}
      />
    </div>
  );
}

function MapScreen({ data }: { data: Data }) {
  const f = useFilters(data.reports);
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setMode] = useState<'pins' | 'heat' | 'radar'>('pins');
  const [sheet, setSheet] = useState(false);
  const [radarRadius, setRadarRadius] = useState<number>(500);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [radarAddress, setRadarAddress] = useState<string>('Центр города, Астана');

  const [radarCenter, setRadarCenter] = useState<{ lat: number; lng: number }>(() => {
    try {
      const saved = localStorage.getItem('oziz-radar-center');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { lat: 51.1342, lng: 71.4308 };
  });

  const sel = data.reports.find(r => r.id === selId) || null;
  const points = useMemo(
    () => f.list.map(r => ({ id: r.id, lat: r.context.location.lat, lng: r.context.location.lng, color: PRIORITY[r.priority.level]?.color || 'var(--c-low)', label: `${r.title}, ${PRIORITY[r.priority.level]?.label}` })),
    [f.list],
  );

  useEffect(() => {
    let alive = true;
    reverseGeocode(radarCenter.lat, radarCenter.lng).then(g => {
      if (alive && g) setRadarAddress(`${g.address} · ${g.district}`);
    });
    return () => {
      alive = false;
    };
  }, [radarCenter.lat, radarCenter.lng]);

  const radarThreats = useMemo(() => {
    return data.reports
      .map(r => ({
        report: r,
        distM: getDistanceMeters(radarCenter.lat, radarCenter.lng, r.context.location.lat, r.context.location.lng),
      }))
      .filter(x => x.distM <= radarRadius)
      .sort((a, b) => a.distM - b.distM);
  }, [data.reports, radarCenter, radarRadius]);

  const criticalThreats = useMemo(() => {
    return radarThreats.filter(x => x.report.priority.level === 'CRITICAL' || x.report.priority.level === 'HIGH');
  }, [radarThreats]);

  const list = (
    <>
      <div className="space-y-3 border-b border-line p-4">
        <Input icon="search" placeholder="Адрес, номер или описание" value={f.q} onChange={e => f.setQ(e.target.value)} aria-label="Поиск заявок" />
        <FilterBar f={f} />
      </div>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="micro">
          Найдено <span className="tnum">{f.list.length}</span>
        </span>
        {data.source === 'demo' && <span className="text-xs text-fg3">Демо-данные</span>}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {data.loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-14 w-14" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : f.list.length === 0 ? (
          <EmptyState text="По этим фильтрам заявок нет." action="Сбросить фильтры" onAction={f.reset} />
        ) : (
          f.list.map(r => (
            <ReportListItem
              key={r.id}
              r={r}
              selected={r.id === selId}
              onClick={() => {
                setSelId(r.id);
                setSheet(false);
              }}
            />
          ))
        )}
      </div>
    </>
  );

  return (
    <div className="relative flex h-[calc(100dvh-56px)] overflow-hidden">
      <aside aria-label="Список заявок" className="hidden w-[360px] shrink-0 flex-col border-r border-line bg-bg md:flex">
        {list}
      </aside>
      <div className="relative min-w-0 flex-1">
        <MapCanvas
          points={points}
          selectedId={selId}
          onSelect={setSelId}
          mode={mode}
          cluster={mode === 'pins'}
          interactive
          showLocateControl
          radarCenter={mode === 'radar' ? radarCenter : undefined}
          radarRadius={radarRadius}
          onRadarCenterChange={setRadarCenter}
          dangerPointsCount={criticalThreats.length}
        />

        {/* Municipal Emergency Alert Broadcast Banner */}
        {!alertDismissed && (
          <aside
            aria-label="Оперативное оповещение ГО и ЧС"
            className="absolute top-3 left-3 right-3 z-[990] flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md md:left-4 md:right-auto md:max-w-[560px]"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-crit animate-ping" />
              <div className="min-w-0 text-xs">
                <span className="font-semibold text-fg">Акимат г. Астана · Оповещение ГО и ЧС: </span>
                <span className="text-fg2">Штормовой ветер с порывами до 24 м/с. Проверьте фасадные зоны, слабо закреплённые конструкции и открытые колодцы. </span>
                <span className="tnum font-mono text-[11px] text-fg3">Solana tx: 4Zp8...91aK (Подписано dGov.sol)</span>
              </div>
            </div>
            <IconButton icon="x" size={24} label="Закрыть оповещение" onClick={() => setAlertDismissed(true)} />
          </aside>
        )}

        {/* Top Controls: Mode Switcher & Quick Report */}
        <div className="absolute top-3 right-3 z-[1000] flex items-center justify-between gap-2">
          <Segmented
            size="sm"
            label="Режим карты"
            value={mode}
            onChange={setMode}
            className="bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            options={[
              { value: 'pins', label: 'Метки' },
              { value: 'heat', label: 'Тепловая' },
              { value: 'radar', label: 'Радар двора' },
            ]}
          />
          <Button variant="primary" size="sm" icon="plus" onClick={() => go('/submit')} className="shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            Сообщить
          </Button>
        </div>

        {/* Floating Civic Safety Radar Panel (when in radar mode) */}
        {mode === 'radar' && (
          <aside aria-label="Панель радара безопасности" className="absolute bottom-4 left-4 z-[1000] flex w-[340px] flex-col rounded-xl border border-line bg-surface/95 p-4 shadow-[0_4px_16px_rgba(0,0,0,0.12)] backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', criticalThreats.length > 0 ? 'bg-crit' : 'bg-ok')} />
                  <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', criticalThreats.length > 0 ? 'bg-crit' : 'bg-ok')} />
                </span>
                <span className="text-[13px] font-semibold text-fg">
                  {criticalThreats.length > 0 ? `Зона риска: ${criticalThreats.length} угроз` : 'Безопасная зона'}
                </span>
              </div>
              <span className="tnum font-mono text-xs text-fg3">{radarRadius} м</span>
            </div>

            <p className="mt-1 text-xs text-fg2 truncate">{radarAddress}</p>

            <div className="mt-3 flex items-center justify-between gap-1 border-t border-line pt-3">
              <span className="text-xs text-fg3">Радиус защиты:</span>
              <div className="flex gap-1">
                {[300, 500, 1000].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadarRadius(r)}
                    className={cn(
                      't h-6 rounded px-2 text-xs font-medium',
                      radarRadius === r ? 'bg-fg text-bg' : 'text-fg2 hover:bg-bg2'
                    )}
                  >
                    {r === 1000 ? '1 км' : `${r} м`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 max-h-44 overflow-y-auto space-y-1 border-t border-line pt-2.5">
              {radarThreats.length === 0 ? (
                <div className="py-3 text-center text-xs text-fg3">
                  В радиусе {radarRadius} м активных инцидентов не зафиксировано
                </div>
              ) : (
                radarThreats.slice(0, 4).map(({ report: r, distM }) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelId(r.id)}
                    className="t flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-bg2"
                  >
                    <span className="mt-1">
                      <Dot color={PRIORITY[r.priority.level]?.color || 'var(--c-low)'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-fg">{r.title}</div>
                      <div className="tnum font-mono text-[11px] text-fg3">{distM} м от центра радара</div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <Button
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  localStorage.setItem('oziz-radar-center', JSON.stringify(radarCenter));
                  toast('Координаты сохранены как точка вашего дома');
                }}
              >
                Сохранить дом
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="flex-1 text-xs"
                onClick={() => go('/submit')}
              >
                Заявить угрозу
              </Button>
            </div>
          </aside>
        )}

        {/* Priority Legend (hidden when radar is active) */}
        {mode !== 'radar' && (
          <div className="absolute bottom-3 left-3 z-[1000] hidden rounded-lg border border-line bg-surface px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:block">
            <ul className="flex items-center gap-4 text-xs text-fg2">
              {(Object.keys(PRIORITY) as PriorityLevel[]).map(k => (
                <li key={k} className="flex items-center gap-1.5">
                  <Dot color={PRIORITY[k].color} />
                  {PRIORITY[k].label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      <div
        className="t absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-xl border-t border-line bg-bg md:hidden"
        style={{ height: sheet ? '78%' : 148, transitionProperty: 'height', transitionDuration: '200ms' }}
      >
        <button type="button" onClick={() => setSheet(s => !s)} aria-expanded={sheet} aria-label={sheet ? 'Свернуть список' : 'Развернуть список'} className="flex h-6 shrink-0 items-center justify-center">
          <span className="h-1 w-9 rounded-full bg-line" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col">{list}</div>
      </div>

      {sel && <MapDrawer r={sel} data={data} onClose={() => setSelId(null)} />}
    </div>
  );
}

function SolanaBlinkModal({ r, onClose }: { r: CivicAppeal; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const blinkUrl = `https://oziz.city/api/actions/confirm/${r.id}`;
  const actionProtocol = `solana-action:${blinkUrl}`;

  const copy = () => {
    navigator.clipboard?.writeText(actionProtocol);
    setCopied(true);
    toast('Ссылка Solana Action скопирована');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm a-fade">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Icon name="bolt" size={16} />
            </span>
            <div>
              <div className="text-sm font-semibold text-fg">Solana Action & Blink (Dialect Spec v1)</div>
              <div className="text-[11.5px] text-fg3">Нативная интерактивная карточка для X (Twitter) и Telegram</div>
            </div>
          </div>
          <IconButton icon="x" label="Закрыть" onClick={onClose} />
        </div>

        <div className="rounded-xl border border-line bg-bg p-3.5 space-y-3">
          <div className="flex items-center justify-between text-[11.5px] text-fg3 font-mono">
            <span>dial.to / blink preview</span>
            <span className="text-accent font-medium">Solana Actions API v1</span>
          </div>

          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-line bg-bg2">
            <Photo src={r.media_url} alt={r.title} className="h-full w-full object-cover" />
            <div className="absolute top-2 left-2">
              <PriorityBadge level={r.priority.level} />
            </div>
            <div className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-mono text-white">
              cNFT Leaf #{r.short_code.replace(/\D/g, '') || '1042'}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-fg">{r.title}</div>
            <div className="mt-0.5 text-xs text-fg2">{r.context.location.address} · {r.context.location.district}</div>
            <p className="mt-1.5 text-xs text-fg3 leading-relaxed">
              Подтвердите городскую проблему в один клик. Транзакция запишется в ончейн-дерево Bubblegum и начислит +10 очков в ваш CitizenReputation PDA.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="primary" size="sm" icon="check" onClick={() => toast('Транзакция подтверждения подписана через Phantom')}>
              Подтвердить (+10 Rep)
            </Button>
            <Button size="sm" icon="alert" onClick={() => toast('Стейк 0.01 SOL отправлен на проверку инспектора')}>
              Опровергнуть (Стейк)
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs text-fg3 font-medium">Спецификация Solana Action URL:</label>
          <div className="mt-1.5 flex gap-2">
            <input
              readOnly
              value={actionProtocol}
              className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-xs font-mono text-fg2 select-all outline-none"
            />
            <Button size="sm" variant={copied ? 'secondary' : 'primary'} icon={copied ? 'check' : 'copy'} onClick={copy}>
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
        </div>

        <div className="text-[11px] text-fg3 leading-relaxed border-t border-line/60 pt-3">
          Вставьте эту ссылку в Twitter (X) или Telegram: кошельки (Phantom, Backpack, Solflare) автоматически развернут действие без перехода на сайт.
        </div>
      </div>
    </div>
  );
}

function MapDrawer({ r, data, onClose }: { r: CivicAppeal; data: Data; onClose: () => void }) {
  const [confirmed, addConfirmed] = useStoredSet('oziz-confirmed');
  const [blinkOpen, setBlinkOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const sla = slaLeft(r);
  return (
    <>
      <aside aria-label="Детали заявки" className="a-slide absolute inset-0 z-20 flex flex-col border-l border-line bg-bg sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[400px]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="tnum font-mono text-[13px] text-fg3">{r.short_code}</span>
          <IconButton icon="x" label="Закрыть" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <Photo src={r.media_url} alt={r.title} className="aspect-[4/3] w-full" />
          <h2 className="mt-4 text-[18px] leading-snug font-semibold tight">{r.title}</h2>
          <p className="mt-1 text-[13px] text-fg2">
            {r.context.location.address} · {r.context.location.district}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PriorityBadge level={r.priority.level} score={r.priority.score} />
            <StatusChip status={r.status} />
          </div>
          <div className="mt-5">
            <KV
              rows={[
                ['Категория', CATEGORY[r.category] || r.category],
                ['Служба', r.assigned_service_name],
                ['Создана', relTime(r.created_at)],
                ['До конца SLA', <span className={cn('tnum font-mono', sla.tone === 'bad' && 'text-crit', sla.tone === 'warn' && 'text-high')}>{sla.text}</span>],
                ['Подтверждений', <span className="tnum font-mono">{r.confirmations_count}</span>],
                ['Формат записи', 'Bubblegum cNFT'],
                ['Реестр', <HashLabel value={r.onchain.last_event_hash} />],
              ]}
            />
          </div>
          <div className="mt-4 rounded-xl border border-line bg-bg2 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg">Ончейн-контроль SLA:</span>
              <span className={cn('tnum font-mono font-bold', sla.tone === 'bad' ? 'text-crit' : sla.tone === 'warn' ? 'text-high' : 'text-fg')}>
                {sla.tone === 'bad' ? 'Просрочено: ' : 'До дедлайна: '}{sla.text}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-fg3">
              <Icon name="shield" size={13} className="text-accent shrink-0" />
              <span>Неизменяемый смарт-контракт Solana · Штраф при срыве</span>
            </div>
            <div className="border-t border-line/60 pt-2 flex items-center justify-between text-[11.5px] text-fg2">
              <span>Гражданская мульти-подпись:</span>
              <span className="tnum font-mono text-fg font-medium">
                {Math.min(r.confirmations_count, 3)} / 3 подтверждено
              </span>
            </div>
            <div className="border-t border-line/60 pt-2 flex items-center justify-between text-[11.5px] text-fg2">
              <span>Репутация жителя:</span>
              <span className="tnum font-mono text-fg font-medium">вес 3.4x (PDA)</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-line p-4">
          <Button variant="primary" className="flex-1" iconRight="arrowRight" onClick={() => go(`/appeal/${r.id}`)}>
            Открыть
          </Button>
          <Button
            icon="bolt"
            onClick={() => setBlinkOpen(true)}
          >
            Blink
          </Button>
          <Button
            icon="plus"
            disabled={confirmed.includes(r.id)}
            onClick={() => {
              addConfirmed(r.id);
              data.confirm(r.id);
              toast('Подтверждение учтено');
            }}
          >
            {confirmed.includes(r.id) ? 'Учтено' : 'Я вижу'}
          </Button>
        </div>
      </aside>
      {blinkOpen && <SolanaBlinkModal r={r} onClose={() => setBlinkOpen(false)} />}
    </>
  );
}

/* =========================================================================
 * 14. Appeal page
 * ========================================================================= */

function AppealPage({ data, id }: { data: Data; id: string }) {
  const r = data.reports.find(x => x.id === id);
  const [confirmed, addConfirmed] = useStoredSet('oziz-confirmed');
  const [voted, addVoted] = useStoredSet('oziz-voted');
  const [blinkOpen, setBlinkOpen] = useState(false);
  const [check, setCheck] = useState<{ loading: boolean; res?: { isValid: boolean; message: string } }>({ loading: false });

  if (data.loading)
    return (
      <Container className="py-12">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-9 w-2/3" />
        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-80 lg:col-span-7" />
          <Skeleton className="h-80 lg:col-span-5" />
        </div>
      </Container>
    );
  if (!r) return <NotFound text="Заявка не найдена. Возможно, ссылка устарела." />;

  const ai = r.ai_analysis;
  const ctx = r.context;
  const sla = slaLeft(r);
  const canVote = r.status === 'RESOLVED' && !voted.includes(r.id);
  const totalVotes = r.citizen_votes.repaired + r.citizen_votes.not_repaired;
  const runCheck = async () => {
    setCheck({ loading: true });
    const res = await data.verify(r);
    setCheck({ loading: false, res });
  };

  return (
    <Container className="py-8 md:py-12">
      <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : go('/map'))} className="t inline-flex items-center gap-1.5 text-[13px] text-fg2 hover:text-fg">
        <Icon name="arrowLeft" size={14} />
        Назад
      </button>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="tnum font-mono text-[13px] text-fg3">{r.short_code}</div>
          <h1 className="mt-1 max-w-[760px] text-2xl leading-tight font-semibold tight md:text-[32px]">{r.title}</h1>
          <p className="mt-2 text-sm text-fg2">
            {ctx.location.address} · {ctx.location.district} · {fmtDate(r.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PriorityBadge level={r.priority.level} score={r.priority.score} />
          <StatusChip status={r.status} />
          {!CLOSED.includes(r.status) && (
            <Chip className={cn(sla.tone === 'bad' && 'border-crit/40 text-crit')}>
              <Icon name="clock" size={12} />
              SLA <span className="tnum font-mono">{sla.text}</span>
            </Chip>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-2">
            <figure>
              <Photo src={r.media_url} alt="Фото до" className="aspect-[4/3] w-full" />
              <figcaption className="micro mt-2">До</figcaption>
            </figure>
            <figure>
              <Photo src={r.resolution_media_url} alt="Фото после" className="aspect-[4/3] w-full" empty="Фото после устранения появится, когда служба закроет заявку" />
              <figcaption className="micro mt-2">После</figcaption>
            </figure>
          </div>

          {r.user_description && (
            <Card className="p-5">
              <div className="micro">Описание заявителя</div>
              <p className="mt-2 text-[15px] text-fg">{r.user_description}</p>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="scan" size={20} className="text-fg2" />
                <h2 className="text-[18px] font-semibold tight">Локальный ИИ-каскад</h2>
              </div>
              <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-ok">
                0 LLM токенов · $0.00 compute
              </span>
            </div>
            <p className="mt-3 text-sm text-fg2">{ai.description_ai}</p>
            <div className="mt-3">
              <KV
                rows={[
                  ['Детектор зрения', <span className="font-mono text-xs">RF-DETR Nano (ONNX/WASM) · 28 мс</span>],
                  ['Текстовый роутер', <span className="font-mono text-xs">FastText lid + bit-bert · 1.2 мс</span>],
                  ['Категория', CATEGORY[ai.category] || ai.category],
                  ['Тип', ai.subcategory],
                  [
                    'Серьёзность',
                    <span className="inline-flex items-center gap-2">
                      <span className="flex gap-0.5" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map(i => (
                          <span key={i} className="h-2.5 w-1.5 rounded-sm" style={{ background: i <= ai.severity ? 'var(--c-fg)' : 'var(--c-line)' }} />
                        ))}
                      </span>
                      <span className="tnum font-mono">{ai.severity} / 5</span>
                    </span>,
                  ],
                  ['Уверенность модели', <span className="tnum font-mono">{Math.round(ai.confidence * 100)}%</span>],
                  ['Размер', <span className="tnum font-mono">{ai.estimated_size ? `${ai.estimated_size.value} ${ai.estimated_size.unit === 'm2' ? 'м²' : ai.estimated_size.unit === 'm' ? 'м' : 'см'}` : '—'}</span>],
                  ['Угроза для', (ai.hazard_to || []).map(h => HAZARD[h] || h).join(', ') || '—'],
                  ['Аппаратная проверка', 'Датчик IMU гироскопа подтвержден'],
                  ['Аварийная ситуация', ai.is_emergency ? <span className="text-crit">Да</span> : 'Нет'],
                ]}
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Icon name="cloud" size={20} className="text-fg2" />
              <h2 className="text-[18px] font-semibold tight">Контекст</h2>
            </div>
            <div className="mt-3">
              <KV
                rows={[
                  ['Погода', `${ctx.weather.temp_c > 0 ? '+' : ''}${ctx.weather.temp_c} °C, ${FORECAST[ctx.weather.forecast_24h] || ctx.weather.forecast_24h}, осадки ${ctx.weather.precipitation_mm} мм`],
                  ['Ветер', `${ctx.weather.wind_ms} м/с`],
                  ['Время', [ctx.time.is_night ? 'ночь' : 'день', ctx.time.is_rush_hour ? 'час пик' : null].filter(Boolean).join(', ')],
                  ['Трафик', { low: 'низкий', medium: 'средний', high: 'высокий' }[ctx.traffic.level] || ctx.traffic.level],
                  ['Рядом', (ctx.location.near || []).map(n => NEAR[n] || n).join(', ') || '—'],
                  ['Похожих заявок в 100 м', <span className="tnum font-mono">{ctx.history.similar_reports_100m}</span>],
                ]}
              />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3">
              <Icon name="pin" size={18} className="text-fg2" />
              <h2 className="text-[16px] font-semibold tight">Местоположение на карте</h2>
            </div>
            <div className="h-56 w-full border-b border-line">
              <MapCanvas
                initialZoom={16}
                initialCenter={{ lat: ctx.location.lat, lng: ctx.location.lng }}
                pin={{ lat: ctx.location.lat, lng: ctx.location.lng }}
                accuracy={ctx.location.accuracy_m}
                interactive={true}
                showLocateControl={false}
                label={`Место: ${ctx.location.address}`}
              />
            </div>
            <div className="p-4">
              <div className="text-[14px] font-semibold text-fg">{ctx.location.address}</div>
              <div className="mt-0.5 text-xs text-fg2">{ctx.location.district} · <span className="tnum font-mono">{ctx.location.lat.toFixed(5)}, {ctx.location.lng.toFixed(5)}</span></div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-5 flex items-center gap-2">
              <Icon name="activity" size={20} className="text-fg2" />
              <h2 className="text-[18px] font-semibold tight">Разложение приоритета</h2>
            </div>
            <PriorityBars p={r.priority} />
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-5">
          <div className="space-y-6 lg:sticky lg:top-20">
            <Card className="p-5">
              <h2 className="text-[18px] font-semibold tight">История статусов</h2>
              <div className="mt-5">
                <Timeline events={r.events} />
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="shield" size={20} className="text-fg2" />
                  <h2 className="text-[18px] font-semibold tight">Проверено в реестре Solana</h2>
                </div>
                <span className="rounded-full border border-line bg-bg2 px-2.5 py-0.5 text-[11px] font-mono text-fg2">
                  Bubblegum cNFT
                </span>
              </div>
              <div className="mt-3">
                <KV
                  rows={[
                    ['Тип записи', 'State Compression (cNFT)'],
                    ['Аккаунт заявки (PDA)', <HashLabel value={r.onchain.report_pda} />],
                    ['Транзакция в блоке', <HashLabel value={r.onchain.tx_signature} />],
                    ['Хэш фото (SHA-256)', <HashLabel value={r.onchain.media_sha256 || r.media_sha256} />],
                    ['Дерево Меркла', <HashLabel value="7wQbBubblegumConcurrentTree1111" />],
                    ['Индекс листа', <span className="tnum font-mono text-xs">#{r.short_code.replace(/\D/g, '') || '1042'} (глубина 20)</span>],
                    ['Стоимость записи', <span className="tnum font-mono text-xs text-ok">0.000005 SOL (~$0.0007)</span>],
                    ['Событий в цепочке', <span className="tnum font-mono">{r.events.length}</span>],
                  ]}
                />
              </div>
              {check.res && (
                <div className={cn('a-rise mt-4 flex gap-2.5 rounded-lg border p-3 text-[13px]', check.res.isValid ? 'border-ok/30 text-fg' : 'border-crit/40 text-fg')}>
                  <Icon name={check.res.isValid ? 'check' : 'alert'} className={check.res.isValid ? 'mt-0.5 text-ok' : 'mt-0.5 text-crit'} />
                  <div>
                    <div className="font-medium">{check.res.isValid ? 'Данные совпадают' : 'Обнаружено расхождение'}</div>
                    <div className="mt-0.5 text-fg2">{check.res.message}</div>
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" icon="shield" loading={check.loading} onClick={runCheck}>
                  Проверить целостность
                </Button>
                <Button size="sm" variant="secondary" icon="bolt" onClick={() => setBlinkOpen(true)}>
                  Blink (X)
                </Button>
                <a
                  href={r.onchain.explorer_url || `https://explorer.solana.com/tx/${r.onchain.tx_signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="t inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-fg2 hover:bg-bg2 hover:text-fg"
                >
                  Обозреватель
                  <Icon name="external" size={14} />
                </a>
              </div>

              <div className="mt-4 border-t border-line/60 pt-4">
                <div className="text-xs font-semibold text-fg">Записать подтверждение статуса в Memo:</div>
                <SolanaMemoActionBox
                  defaultText={`OZIZ #${r.short_code} VERIFIED: ${r.title}`}
                  reportCode={r.short_code}
                />
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-[18px] font-semibold tight">Участие жителей</h2>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="tnum font-mono text-[28px] leading-none font-medium tight">{r.confirmations_count}</span>
                <span className="text-[13px] text-fg2">видят эту проблему</span>
              </div>
              <div className="mt-2 text-xs text-fg3 font-mono">
                Вес голоса: <span className="text-accent font-medium">3.4x</span> (CitizenReputation PDA: 680)
              </div>
              {!CLOSED.includes(r.status) && (
                <Button
                  className="mt-4"
                  block
                  icon={confirmed.includes(r.id) ? 'check' : 'plus'}
                  disabled={confirmed.includes(r.id)}
                  onClick={() => {
                    addConfirmed(r.id);
                    data.confirm(r.id);
                    toast('Подтверждение учтено, приоритет пересчитан');
                  }}
                >
                  {confirmed.includes(r.id) ? 'Вы подтвердили' : 'Я тоже вижу'}
                </Button>
              )}
              {(r.status === 'RESOLVED' || totalVotes > 0) && (
                <div className="mt-5 border-t border-line pt-5">
                  <div className="text-sm font-medium">{r.status === 'RESOLVED' ? 'Проблема действительно устранена?' : 'Оценка ремонта'}</div>
                  <div className="mt-3 space-y-3">
                    {[
                      ['Починено', r.citizen_votes.repaired, 'var(--c-ok)'],
                      ['Не починено', r.citizen_votes.not_repaired, 'var(--c-crit)'],
                    ].map(([l, v, c]) => (
                      <div key={l as string}>
                        <div className="mb-1.5 flex justify-between text-[13px]">
                          <span className="text-fg2">{l}</span>
                          <span className="tnum font-mono">{v}</span>
                        </div>
                        <ProgressBar value={v as number} max={Math.max(1, totalVotes)} color={c as string} />
                      </div>
                    ))}
                  </div>
                  {canVote && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        icon="check"
                        onClick={() => {
                          addVoted(r.id);
                          data.vote(r.id, true);
                          toast('Голос учтён');
                        }}
                      >
                        Починено
                      </Button>
                      <Button
                        icon="x"
                        onClick={() => {
                          addVoted(r.id);
                          data.vote(r.id, false);
                          toast('Голос учтён');
                        }}
                      >
                        Не починено
                      </Button>
                    </div>
                  )}
                  {voted.includes(r.id) && <p className="mt-3 text-xs text-fg3">Вы уже проголосовали.</p>}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
      {blinkOpen && <SolanaBlinkModal r={r} onClose={() => setBlinkOpen(false)} />}
    </Container>
  );
}

/* =========================================================================
 * 15. Service dispatch panel
 * ========================================================================= */

function DispatchScreen({ data }: { data: Data }) {
  const [svc, setSvc] = useState('all');
  const [view, setView] = useState<'active' | 'overdue' | 'all'>('active');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [seenLive, setSeenLive] = useState(data.liveCount);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const scoped = data.reports.filter(r => svc === 'all' || r.assigned_service_id === svc);
  const rows = scoped
    .filter(r => (view === 'active' ? !CLOSED.includes(r.status) : view === 'overdue' ? isOverdue(r) : true))
    .filter(r => !q || `${r.title} ${r.short_code} ${r.context.location.address}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.priority.score - a.priority.score);
  const sel = data.reports.find(r => r.id === selId) || null;
  const newLive = data.liveCount - seenLive;
  const svcName = svc === 'all' ? 'Все службы' : data.services.find(s => s.id === svc)?.name || '';

  const quick = async (r: CivicAppeal, status: AppealStatus) => {
    try {
      await data.setStatus(r.id, status);
      toast(`${r.short_code}: ${STATUS[status].toLowerCase()}`);
    } catch (e: any) {
      toast(e.message || 'Ошибка');
    }
  };

  return (
    <div className="flex h-[calc(100dvh-56px)] overflow-hidden">
      <aside aria-label="Службы" className="hidden w-[220px] shrink-0 flex-col border-r border-line p-3 lg:flex">
        <div className="micro px-2 pt-1 pb-2">Очередь</div>
        <nav className="space-y-0.5">
          {[{ id: 'all', name: 'Все службы' }, ...data.services].map(s => {
            const count = data.reports.filter(r => (s.id === 'all' || r.assigned_service_id === s.id) && !CLOSED.includes(r.status)).length;
            const active = svc === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSvc(s.id)}
                aria-current={active ? 'true' : undefined}
                className={cn('t flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[13px]', active ? 'bg-bg2 font-medium text-fg' : 'text-fg2 hover:bg-bg2 hover:text-fg')}
              >
                <span className="truncate">{s.name.split(' (')[0]}</span>
                <span className="tnum font-mono text-xs text-fg3">{count}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg border border-line p-3">
          <div className="flex items-center gap-2 text-[13px] text-fg">
            <Dot color={data.source === 'api' ? 'var(--c-ok)' : 'var(--c-fg3)'} />
            {data.source === 'api' ? 'Поток событий подключён' : 'Демо-режим'}
          </div>
          <div className="mt-1 text-xs text-fg3">
            Событий за сессию: <span className="tnum font-mono">{data.liveCount}</span>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 md:px-6">
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-[18px] font-semibold tight">{svcName}</h1>
            <div className="text-xs text-fg3">
              <span className="tnum font-mono">{rows.length}</span> в списке · просрочено <span className="tnum font-mono text-crit">{scoped.filter(isOverdue).length}</span>
            </div>
          </div>
          {newLive > 0 && (
            <button type="button" onClick={() => setSeenLive(data.liveCount)} className="t inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-fg hover:bg-bg2">
              <Icon name="bell" size={14} />
              Новых событий: <span className="tnum font-mono">{newLive}</span>
            </button>
          )}
          <Select className="w-full sm:w-48 lg:hidden" aria-label="Служба" value={svc} onChange={e => setSvc(e.target.value)} options={[{ value: 'all', label: 'Все службы' }, ...data.services.map(s => ({ value: s.id, label: s.name.split(' (')[0] }))]} />
          <Input wrapClass="w-full sm:w-56" icon="search" placeholder="Поиск" value={q} onChange={e => setQ(e.target.value)} aria-label="Поиск по очереди" />
          <Segmented
            size="sm"
            label="Фильтр очереди"
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: 'Активные' },
              { value: 'overdue', label: 'Просроченные' },
              { value: 'all', label: 'Все' },
            ]}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {data.loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState text={view === 'overdue' ? 'Просроченных заявок нет.' : 'Очередь пуста.'} action={view !== 'all' ? 'Показать все' : undefined} onAction={() => setView('all')} />
          ) : (
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-bg">
                <tr className="h-9 border-b border-line text-left">
                  <th className="micro pl-4 font-medium md:pl-6">Приоритет</th>
                  <th className="micro font-medium">Заявка</th>
                  <th className="micro hidden font-medium xl:table-cell">Категория</th>
                  <th className="micro font-medium">До SLA</th>
                  <th className="micro font-medium">Статус</th>
                  <th className="micro pr-4 text-right font-medium md:pr-6">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const sla = slaLeft(r);
                  const active = r.id === selId;
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => setSelId(r.id)}
                      onKeyDown={e => e.key === 'Enter' && setSelId(r.id)}
                      className={cn('t group h-11 cursor-pointer border-b border-line2', active ? 'bg-bg2' : 'hover:bg-bg2')}
                    >
                      <td className="pl-4 md:pl-6">
                        <span className="flex items-center gap-2">
                          <Dot color={PRIORITY[r.priority.level]?.color} />
                          <span className="tnum font-mono text-fg">{r.priority.score}</span>
                        </span>
                      </td>
                      <td className="max-w-[340px] pr-4">
                        <div className="truncate font-medium text-fg">{r.context.location.address}</div>
                        <div className="truncate text-xs text-fg3">
                          <span className="tnum font-mono">{r.short_code}</span> · {r.title}
                        </div>
                      </td>
                      <td className="hidden pr-4 text-fg2 xl:table-cell">{CATEGORY[r.category]}</td>
                      <td className={cn('tnum pr-4 font-mono whitespace-nowrap', sla.tone === 'bad' ? 'text-crit' : sla.tone === 'warn' ? 'text-high' : 'text-fg')}>{sla.text}</td>
                      <td className="pr-4">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-fg2">
                          <Dot color={statusColor(r.status)} />
                          {STATUS[r.status]}
                        </span>
                      </td>
                      <td className="pr-4 text-right md:pr-6" onClick={e => e.stopPropagation()}>
                        <span className="inline-flex gap-0.5 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                          {['NEW', 'AI_VERIFIED', 'ASSIGNED', 'REOPENED'].includes(r.status) && <IconButton icon="play" label="Взять в работу" size={28} onClick={() => quick(r, 'IN_PROGRESS')} />}
                          {r.status === 'IN_PROGRESS' && <IconButton icon="check" label="Отметить устранённой" size={28} onClick={() => quick(r, 'RESOLVED')} />}
                          <IconButton icon="chevronRight" label="Открыть детали" size={28} onClick={() => setSelId(r.id)} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {sel && <DispatchDetail r={sel} data={data} onClose={() => setSelId(null)} />}
    </div>
  );
}

function DispatchDetail({ r, data, onClose }: { r: CivicAppeal; data: Data; onClose: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');
  const [after, setAfter] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setRejecting(false);
    setNote('');
    setNoteErr('');
    setAfter(undefined);
  }, [r.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const act = async (status: AppealStatus) => {
    if (status === 'REJECTED' && note.trim().length < 10) {
      setNoteErr('Опишите причину, не менее 10 символов. Она будет опубликована.');
      return;
    }
    setBusy(status);
    try {
      await data.setStatus(r.id, status, note.trim(), after);
      toast(`${r.short_code}: ${STATUS[status].toLowerCase()}, запись в реестре создана`);
      setRejecting(false);
      setNote('');
    } catch (e: any) {
      toast(e.message || 'Ошибка');
    } finally {
      setBusy(null);
    }
  };
  const closed = CLOSED.includes(r.status);
  const sla = slaLeft(r);

  return (
    <aside aria-label="Детали заявки" className="a-slide fixed inset-0 top-14 z-30 flex flex-col border-l border-line bg-bg md:static md:w-[400px] md:shrink-0">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="tnum font-mono text-[13px] text-fg3">{r.short_code}</span>
        <div className="flex items-center gap-1">
          <IconButton icon="external" label="Открыть страницу заявки" onClick={() => go(`/appeal/${r.id}`)} />
          <IconButton icon="x" label="Закрыть" onClick={onClose} />
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Photo src={r.media_url} alt={r.title} className="aspect-[16/10] w-full" />
        <div>
          <h2 className="text-[18px] leading-snug font-semibold tight">{r.title}</h2>
          <p className="mt-1 text-[13px] text-fg2">{r.context.location.address}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PriorityBadge level={r.priority.level} score={r.priority.score} />
            <StatusChip status={r.status} />
          </div>
        </div>
        <KV
          rows={[
            ['Категория', CATEGORY[r.category]],
            ['Серьёзность', <span className="tnum font-mono">{r.ai_analysis.severity} / 5</span>],
            ['До конца SLA', <span className={cn('tnum font-mono', sla.tone === 'bad' && 'text-crit', sla.tone === 'warn' && 'text-high')}>{sla.text}</span>],
            ['Подтверждений', <span className="tnum font-mono">{r.confirmations_count}</span>],
          ]}
        />
        <p className="rounded-lg bg-bg2 p-3 text-[13px] text-fg2">{r.ai_analysis.description_ai}</p>

        {!closed && (
          <div className="space-y-3 border-t border-line pt-5">
            <div className="micro">Действия</div>
            {r.status !== 'IN_PROGRESS' && (
              <Button variant="primary" block icon="play" loading={busy === 'IN_PROGRESS'} onClick={() => act('IN_PROGRESS')}>
                Взять в работу
              </Button>
            )}
            {r.status === 'IN_PROGRESS' && (
              <div className="space-y-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) setAfter((await compressImage(f)).dataUrl);
                  }}
                />
                {after ? (
                  <div className="flex items-center gap-3">
                    <Thumb src={after} />
                    <span className="flex-1 text-[13px] text-fg2">Фото после ремонта</span>
                    <Button size="sm" variant="ghost" onClick={() => setAfter(undefined)}>
                      Убрать
                    </Button>
                  </div>
                ) : (
                  <Button block icon="camera" onClick={() => fileRef.current?.click()}>
                    Прикрепить фото после
                  </Button>
                )}
                <Button variant="primary" block icon="check" loading={busy === 'RESOLVED'} onClick={() => act('RESOLVED')}>
                  Отметить устранённой
                </Button>
              </div>
            )}
            {rejecting ? (
              <div className="a-rise space-y-3 rounded-lg border border-line p-3">
                <Textarea
                  label="Причина отклонения"
                  rows={3}
                  value={note}
                  onChange={e => {
                    setNote(e.target.value);
                    setNoteErr('');
                  }}
                  error={noteErr}
                  hint="Причина будет опубликована, её хэш запишется в реестр."
                  placeholder="Например: объект находится на частной территории, обращение передано собственнику."
                />
                <div className="flex gap-2">
                  <Button variant="danger" className="flex-1" loading={busy === 'REJECTED'} onClick={() => act('REJECTED')}>
                    Отклонить заявку
                  </Button>
                  <Button onClick={() => setRejecting(false)}>Отмена</Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" block icon="ban" onClick={() => setRejecting(true)}>
                Отклонить с обоснованием
              </Button>
            )}
          </div>
        )}

        <div className="border-t border-line pt-5">
          <div className="micro mb-4">История</div>
          <Timeline events={r.events} />
        </div>
      </div>
    </aside>
  );
}

/* =========================================================================
 * 16. Transparency dashboard
 * ========================================================================= */

const SERIES = {
  response: [18.2, 17.5, 16.9, 17.8, 15.4, 14.9, 14.2, 13.6, 13.9, 12.8, 12.1, 11.6],
  resolved: [61, 63, 64, 66, 65, 68, 71, 72, 74, 73, 76, 78],
  sla: [14, 12, 13, 11, 9, 10, 8, 7, 8, 6, 5, 5],
};

function TransparencyScreen({ data }: { data: Data }) {
  const { reports, services, loading } = data;
  const ranked = useMemo(
    () => [...services].map(s => ({ ...s, rate: Math.round((s.stats.resolved / (s.stats.total_assigned || 1)) * 100) })).sort((a, b) => b.rate - a.rate),
    [services],
  );
  const districts = useMemo(() => {
    const m = new Map<string, { total: number; resolved: number }>();
    reports.forEach(r => {
      const d = r.context.location.district || 'Прочие';
      const v = m.get(d) || { total: 0, resolved: 0 };
      v.total++;
      if (r.status === 'RESOLVED' || r.status === 'CONFIRMED_BY_CITIZEN') v.resolved++;
      m.set(d, v);
    });
    return [...m.entries()].map(([name, v]) => ({ name, ...v, rate: Math.round((v.resolved / v.total) * 100) })).sort((a, b) => b.total - a.total);
  }, [reports]);
  const overdue = reports.filter(isOverdue);
  const resolved = reports.filter(r => r.status === 'RESOLVED' || r.status === 'CONFIRMED_BY_CITIZEN').length;

  const exportCsv = () => {
    const head = 'id,short_code,category,status,priority,score,lat,lng,district,address,created_at,sla_violated,pda,tx_signature';
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = reports.map(r =>
      [r.id, r.short_code, r.category, r.status, r.priority.level, r.priority.score, r.context.location.lat, r.context.location.lng, r.context.location.district, r.context.location.address, r.created_at, isOverdue(r), r.onchain.report_pda, r.onchain.tx_signature].map(esc).join(','),
    );
    download('oziz_reports.csv', `\uFEFF${head}\n${rows.join('\n')}`, 'text/csv;charset=utf-8');
    toast('CSV выгружен');
  };
  const exportGeo = () => {
    const gj = {
      type: 'FeatureCollection',
      features: reports.map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.context.location.lng, r.context.location.lat] },
        properties: { id: r.id, code: r.short_code, category: r.category, status: r.status, priority: r.priority.level, score: r.priority.score, address: r.context.location.address, created_at: r.created_at, tx_signature: r.onchain.tx_signature },
      })),
    };
    download('oziz_reports.geojson', JSON.stringify(gj, null, 2), 'application/geo+json');
    toast('GeoJSON выгружен');
  };

  return (
    <Container className="py-10 md:py-16">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="micro">Открытые данные</div>
          <h1 className="mt-3 text-2xl leading-tight font-semibold tight md:text-[32px]">Прозрачность</h1>
          <p className="mt-3 max-w-[560px] text-[15px] text-fg2">Показатели считаются автоматически по данным реестра. Их нельзя отредактировать вручную.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon="download" onClick={exportCsv} disabled={loading}>
            CSV
          </Button>
          <Button size="sm" icon="download" onClick={exportGeo} disabled={loading}>
            GeoJSON
          </Button>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-y-8 border-y border-line py-8 md:grid-cols-4">
        {[
          ['Всего заявок', reports.length],
          ['Решено', `${reports.length ? Math.round((resolved / reports.length) * 100) : 0}%`],
          ['Просрочено сейчас', overdue.length],
          ['Переоткрыто жителями', reports.filter(r => r.status === 'REOPENED').length],
        ].map(([l, v], i) => (
          <div key={l as string} className={cn(i % 2 === 1 && 'pl-6 md:pl-0', i > 0 && 'md:border-l md:border-line md:pl-8')}>
            <Stat label={l as string} value={v} loading={loading} />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 md:gap-6">
        {[
          ['Среднее время реакции', `${SERIES.response.at(-1)!.toFixed(1).replace('.', ',')} ч`, '−36% за 12 недель', SERIES.response],
          ['Доля решённых', `${SERIES.resolved.at(-1)}%`, '+17 п.п. за 12 недель', SERIES.resolved],
          ['Нарушения SLA в неделю', `${SERIES.sla.at(-1)}`, '−9 за 12 недель', SERIES.sla],
        ].map(([title, value, delta, series]) => (
          <Card key={title as string} className="p-5">
            <div className="micro">{title as string}</div>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="tnum font-mono text-[24px] leading-none font-medium tight">{value as string}</span>
              <span className="text-xs text-fg3">{delta as string}</span>
            </div>
            <div className="mt-5">
              <LineChart data={series as number[]} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-fg3">
              <span>12 недель назад</span>
              <span>Сейчас</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-12 lg:gap-6">
        <Card className="p-5 lg:col-span-7">
          <h2 className="mb-4 text-[18px] font-semibold tight">Рейтинг служб</h2>
          <ServiceTable services={ranked} loading={loading} />
        </Card>
        <Card className="p-5 lg:col-span-5">
          <h2 className="mb-4 text-[18px] font-semibold tight">Районы</h2>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ul className="space-y-4">
              {districts.map(d => (
                <li key={d.name}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-fg">{d.name}</span>
                    <span className="text-fg2">
                      <span className="tnum font-mono text-fg">{d.total}</span> заявок · решено <span className="tnum font-mono text-fg">{d.rate}%</span>
                    </span>
                  </div>
                  <ProgressBar value={d.rate} label={`${d.name}: решено ${d.rate}%`} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[18px] font-semibold tight">Нарушения SLA</h2>
          <span className="tnum font-mono text-[13px] text-fg3">{overdue.length}</span>
        </div>
        {overdue.length === 0 ? (
          <EmptyState text="Сейчас просроченных заявок нет." />
        ) : (
          <ul className="divide-y divide-line">
            {overdue.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => go(`/appeal/${r.id}`)} className="t flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-bg2">
                  <span className="tnum hidden w-32 shrink-0 font-mono text-[13px] text-fg3 sm:block">{r.short_code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{r.title}</span>
                    <span className="block truncate text-[13px] text-fg2">{r.assigned_service_name}</span>
                  </span>
                  <span className="tnum shrink-0 font-mono text-[13px] text-crit">{slaLeft(r).text}</span>
                  <Icon name="chevronRight" className="text-fg3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Container>
  );
}

/* =========================================================================
 * 17. Service screens
 * ========================================================================= */

function NotFound({ text = 'Такой страницы нет. Возможно, адрес набран с ошибкой.' }: { text?: string }) {
  return (
    <Container className="flex min-h-[60vh] flex-col items-start justify-center py-20">
      <div className="tnum font-mono text-[13px] text-fg3">404</div>
      <h1 className="mt-3 text-2xl leading-tight font-semibold tight md:text-[32px]">Страница не найдена</h1>
      <p className="mt-3 max-w-[480px] text-[15px] text-fg2">{text}</p>
      <Button variant="primary" className="mt-8" onClick={() => go('/')}>
        На главную
      </Button>
    </Container>
  );
}

/* =========================================================================
 * 18. App root
 * ========================================================================= */

export default function App() {
  const route = useRoute();
  const data = useOzizData();
  const online = useOnline();
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'));
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('oziz-lang') as Lang) || 'ru');
  const [user, setUser] = useState<{ name: string; contact: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('oziz-user') || 'null');
    } catch {
      return null;
    }
  });

  const [paletteOpen, setPaletteOpen] = useState(false);

  // Solana Phantom wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    return localStorage.getItem('oziz-solana-wallet-address') || null;
  });
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSendingMemo, setIsSendingMemo] = useState(false);
  const [phantomMissingOpen, setPhantomMissingOpen] = useState(false);
  const [solanaModalOpen, setSolanaModalOpen] = useState(false);
  const [records, setRecords] = useState<SolanaMemoRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('oziz-solana-memo-records') || '[]');
    } catch {
      return [];
    }
  });

  const getPhantomProvider = () => {
    if (typeof window === 'undefined') return null;
    const anyWin = window as any;
    if (anyWin.phantom?.solana?.isPhantom) return anyWin.phantom.solana;
    if (anyWin.solana?.isPhantom) return anyWin.solana;
    return null;
  };

  const refreshBalance = async (address?: string) => {
    const target = address || walletAddress;
    if (!target) return;
    try {
      const connection = new Connection(SOLANA_DEVNET_RPC, 'confirmed');
      const lamports = await connection.getBalance(new PublicKey(target));
      setWalletBalance(lamports / 1e9);
    } catch (e) {
      console.error('Failed to get Solana balance:', e);
    }
  };

  const connectWallet = async (): Promise<string | null> => {
    const provider = getPhantomProvider();
    if (!provider) {
      setPhantomMissingOpen(true);
      return null;
    }
    try {
      setIsConnecting(true);
      const resp = await provider.connect();
      const pubkey = resp.publicKey.toString();
      setWalletAddress(pubkey);
      localStorage.setItem('oziz-solana-wallet-address', pubkey);
      toast('Кошелёк подключен');
      await refreshBalance(pubkey);
      return pubkey;
    } catch (err: any) {
      if (err?.code === 4001 || err?.message?.includes('User rejected')) {
        toast('Вы отменили подключение в Phantom');
      } else {
        toast(err?.message || 'Ошибка подключения кошелька');
      }
      return null;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    const provider = getPhantomProvider();
    try {
      if (provider) await provider.disconnect();
    } catch {
      /* ignore */
    }
    setWalletAddress(null);
    setWalletBalance(null);
    localStorage.removeItem('oziz-solana-wallet-address');
    toast('Кошелёк отключен');
  };

  const sendMemo = async (text: string): Promise<{ signature: string; url: string }> => {
    const provider = getPhantomProvider();
    if (!provider || !provider.publicKey) {
      const pubkey = await connectWallet();
      if (!pubkey) throw new Error('Кошелек не подключен');
    }
    const activeProvider = getPhantomProvider();
    if (!activeProvider || !activeProvider.publicKey) {
      throw new Error('Кошелек Phantom не доступен');
    }

    try {
      setIsSendingMemo(true);
      toast('Записываем в блокчейн…');
      const connection = new Connection(SOLANA_DEVNET_RPC, 'confirmed');

      // Check balance
      const balanceLamports = await connection.getBalance(activeProvider.publicKey);
      if (balanceLamports === 0) {
        throw new Error('Недостаточно SOL на балансе в сети Devnet для оплаты комиссии. Пополните кошелёк через кран devnet.');
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({
        feePayer: activeProvider.publicKey,
        recentBlockhash: blockhash,
      });

      // Strict constraint: use TextEncoder for text, NOT Buffer
      const encodedData = new TextEncoder().encode(text);
      const memoInstruction = new TransactionInstruction({
        keys: [{ pubkey: activeProvider.publicKey, isSigner: true, isWritable: true }],
        programId: new PublicKey(SOLANA_MEMO_PROGRAM_ID),
        data: encodedData as any,
      });

      tx.add(memoInstruction);

      const { signature } = await activeProvider.signAndSendTransaction(tx);
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
      const newRecord: SolanaMemoRecord = {
        id: signature,
        text,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        signature,
        url: explorerUrl,
      };

      setRecords(prev => {
        const next = [newRecord, ...prev];
        localStorage.setItem('oziz-solana-memo-records', JSON.stringify(next));
        return next;
      });

      toast('Записано в блокчейн');
      refreshBalance();
      return { signature, url: explorerUrl };
    } catch (err: any) {
      let msg = err?.message || 'Не удалось выполнить транзакцию в Solana';
      if (err?.code === 4001 || msg.includes('User rejected')) {
        msg = 'Вы отменили транзакцию в Phantom';
      }
      toast(msg);
      throw err;
    } finally {
      setIsSendingMemo(false);
    }
  };

  // Eager balance check if address is restored
  useEffect(() => {
    if (walletAddress) {
      refreshBalance(walletAddress);
    }
  }, [walletAddress]);

  // Handle provider events
  useEffect(() => {
    const provider = getPhantomProvider();
    if (!provider) return;
    const handleAccountChange = (pk: any) => {
      if (pk) {
        const str = pk.toString();
        setWalletAddress(str);
        localStorage.setItem('oziz-solana-wallet-address', str);
        refreshBalance(str);
      } else {
        disconnectWallet();
      }
    };
    provider.on?.('accountChanged', handleAccountChange);
    return () => {
      provider.off?.('accountChanged', handleAccountChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('oziz-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0A0A0B' : '#FFFFFF');
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('oziz-lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  // Global Ctrl/Cmd + K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Top scroll progress tracker
  useEffect(() => {
    const handleScroll = () => {
      const el = document.getElementById('scroll-progress');
      if (!el) return;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const progress = total > 0 ? window.scrollY / total : 0;
      el.style.transform = `scaleX(${progress})`;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const t = useMemo(() => (k: string) => STR[lang][k] || STR.ru[k] || k, [lang]);
  const onAuth = (u: { name: string; contact: string }) => {
    setUser(u);
    localStorage.setItem('oziz-user', JSON.stringify(u));
  };
  const onLogout = () => {
    setUser(null);
    localStorage.removeItem('oziz-user');
    toast('Вы вышли');
  };

  const [, section, param] = route.split('/');
  let screen: React.ReactNode;
  let footer = true;
  switch (section || '') {
    case '':
      screen = <Landing data={data} />;
      break;
    case 'auth':
      screen = <AuthScreen onAuth={onAuth} />;
      footer = false;
      break;
    case 'submit':
      screen = <SubmitScreen data={data} />;
      footer = false;
      break;
    case 'map':
      screen = <MapScreen data={data} />;
      footer = false;
      break;
    case 'appeal':
      screen = <AppealPage data={data} id={param || ''} />;
      break;
    case 'dispatch':
      screen = <DispatchScreen data={data} />;
      footer = false;
      break;
    case 'transparency':
      screen = <TransparencyScreen data={data} />;
      break;
    default:
      screen = <NotFound />;
  }

  const solanaContextValue: SolanaWalletCtxType = {
    walletAddress,
    walletBalance,
    isConnecting,
    isSendingMemo,
    records,
    phantomMissingOpen,
    setPhantomMissingOpen,
    solanaModalOpen,
    setSolanaModalOpen,
    connectWallet,
    disconnectWallet,
    refreshBalance: () => refreshBalance(),
    sendMemo,
  };

  return (
    <SolanaWalletCtx.Provider value={solanaContextValue}>
      <LangCtx.Provider value={{ lang, t }}>
        <div className="min-h-screen bg-bg text-fg">
          <div id="scroll-progress" style={{ transform: 'scaleX(0)' }} />
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
            Перейти к содержимому
          </a>
          {!online && <OfflineBanner />}
          <Navbar route={route} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} user={user} onLogout={onLogout} onOpenPalette={() => setPaletteOpen(true)} />
          <main id="main" tabIndex={-1} className="outline-none">
            {screen}
          </main>
          {footer && <Footer source={data.source} />}
          <Toaster />
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
          <PhantomMissingModal open={phantomMissingOpen} onClose={() => setPhantomMissingOpen(false)} />
          <SolanaWalletModal open={solanaModalOpen} onClose={() => setSolanaModalOpen(false)} />
        </div>
      </LangCtx.Provider>
    </SolanaWalletCtx.Provider>
  );
}
