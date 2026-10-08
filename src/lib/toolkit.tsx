/**
 * OZIZ TOOLKIT: модульная библиотечная коллекция утилит, хуков, Solana/Leaflet хелперов и UI компонентов.
 */

import React, {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

/* Реэкспорт типов и Solana/Leaflet объектов */
export { L, Connection, PublicKey, Transaction, TransactionInstruction, LAMPORTS_PER_SOL };

/* =========================================================================
 * 1. Конфиг и константы
 * ========================================================================= */

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;

export const CONFIG = {
  appName: 'OZIZ',
  solanaRpc: env.VITE_SOLANA_RPC || 'https://api.devnet.solana.com',
  solanaCluster: 'devnet' as const,
  apiBase: env.VITE_API_BASE || '',
  memoProgramId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  memoMaxBytes: 566,
  faucetUrl: 'https://faucet.solana.com/',
  phantomInstallUrl: 'https://phantom.app/',
  defaultCenter: { lat: 51.1342, lng: 71.4308 }, // Астана
  storagePrefix: 'oziz-',
} as const;

export const STORAGE_KEYS = {
  localReports: 'oziz-demo_reports_v1',
  confirmed: 'oziz-confirmed',
  voted: 'oziz-voted',
  memoRecords: 'oziz-solana-memo-records',
  wallet: 'oziz-solana-wallet-address',
  theme: 'oziz-theme',
  lang: 'oziz-lang',
  radarCenter: 'oziz-radar-center',
  user: 'oziz-user',
} as const;

/* =========================================================================
 * 2. Базовые утилиты
 * ========================================================================= */

export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const isBrowser = typeof window !== 'undefined';

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms = 300) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  wrapped.cancel = () => t && clearTimeout(t);
  return wrapped;
}

export function throttle<A extends unknown[]>(fn: (...a: A) => void, ms = 200) {
  let last = 0;
  return (...a: A) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...a);
    }
  };
}

export async function withTimeout<T>(p: Promise<T>, ms: number, message = 'Превышено время ожидания'): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(message)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function retry<T>(fn: () => Promise<T>, tries = 3, baseMs = 400): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      if (i < tries - 1) await sleep(baseMs * 2 ** i);
    }
  }
  throw err;
}

/* Безопасное хранилище */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  clearApp() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(CONFIG.storagePrefix) && k !== STORAGE_KEYS.theme && k !== STORAGE_KEYS.lang)
        .forEach(k => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  },
};

/* Форматирование */
export const shortHash = (s?: string, a = 4, b = 4) =>
  !s ? '—' : s.length <= a + b + 3 ? s : `${s.slice(0, a)}...${s.slice(-b)}`;

export function relTime(iso: string, now = Date.now()): string {
  const m = (now - new Date(iso).getTime()) / 60000;
  if (m < 1) return 'только что';
  if (m < 60) return `${Math.round(m)} мин назад`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}

export const fmtDate = (iso: string, locale = 'ru-RU') =>
  new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fmtNumber = (n: number, locale = 'ru-RU') => n.toLocaleString(locale);

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  if (h >= 48) return `${Math.round(h / 24)} дн`;
  return `${h} ч ${String(m).padStart(2, '0')} м`;
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function clampUtf8(text: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const len = enc.encode(ch).length;
    if (used + len > maxBytes) break;
    out += ch;
    used += len;
  }
  return out;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const notify = (msg: string) => {
  if (isBrowser) window.dispatchEvent(new CustomEvent('oziz-toast', { detail: msg }));
};

export const haptic = (ms = 8) => {
  try {
    if (isBrowser && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
};

/* =========================================================================
 * 3. Крипто-утилиты
 * ========================================================================= */

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function reportFingerprint(p: {
  id: string;
  text?: string;
  lat: number;
  lng: number;
  mediaDataUrl?: string;
}): Promise<string> {
  const media = p.mediaDataUrl ? await sha256Hex(p.mediaDataUrl) : '';
  return sha256Hex([p.id, p.text ?? '', p.lat.toFixed(5), p.lng.toFixed(5), media].join('|'));
}

export function buildMemoText(code: string, hash: string, extra?: string): string {
  const base = `OZIZ|${code}|${hash}`;
  return clampUtf8(extra ? `${base}|${extra}` : base, CONFIG.memoMaxBytes);
}

export function parseMemoText(memo: string): { code: string; hash: string } | null {
  const [tag, code, hash] = memo.split('|');
  return tag === 'OZIZ' && code && hash ? { code, hash } : null;
}

/* =========================================================================
 * 4. API-клиент
 * ========================================================================= */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T = any>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${CONFIG.apiBase}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init?.headers,
    });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new ApiError('API недоступен (ответ не JSON)', r.status);
    const d = await r.json();
    if (!r.ok || d?.success === false) throw new ApiError(d?.error || `HTTP ${r.status}`, r.status);
    return d as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e instanceof Error ? e.message : 'Сеть недоступна');
  } finally {
    clearTimeout(t);
  }
}

export function mergeById<T extends { id: string }>(local: T[], base: T[]): T[] {
  const seen = new Set<string>();
  return [...local, ...base].filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export const localReports = {
  load<T extends { id: string }>(): T[] {
    return store.get<T[]>(STORAGE_KEYS.localReports, []);
  },
  save<T extends { id: string }>(r: T) {
    const next = [r, ...this.load<T>().filter(x => x.id !== r.id)].slice(0, 200);
    store.set(STORAGE_KEYS.localReports, next);
  },
  update<T extends { id: string }>(r: T) {
    const list = this.load<T>();
    if (list.some(x => x.id === r.id)) store.set(STORAGE_KEYS.localReports, list.map(x => (x.id === r.id ? r : x)));
  },
  clear() {
    store.remove(STORAGE_KEYS.localReports);
  },
};

/* =========================================================================
 * 5. Демо-режим
 * ========================================================================= */

export interface DemoFlags {
  demo: boolean;
  reset: boolean;
  forceApi: boolean;
}

export function readDemoFlags(): DemoFlags {
  if (!isBrowser) return { demo: false, reset: false, forceApi: false };
  const q = new URLSearchParams(window.location.search);
  return { demo: q.get('demo') === '1', reset: q.get('reset') === '1', forceApi: q.get('api') === '1' };
}

export function applyDemoFlags(): DemoFlags {
  const flags = readDemoFlags();
  if (flags.reset) {
    store.clearApp();
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url.toString());
    notify('Демо-данные сброшены');
  }
  return flags;
}

export const DEMO_SCRIPT: Array<{ min: string; title: string; say: string; do: string }> = [
  { min: '0:00', title: 'Проблема и идея', say: 'Жалобы теряются, статусы можно скрыть. OZIZ делает обращения публичными и проверяемыми.', do: 'Лендинг, прокрутить до блока про реестр.' },
  { min: '0:30', title: 'Карта', say: 'Все обращения города на одной карте, с приоритетом и фильтрами.', do: 'Открыть карту, включить фильтр по приоритету, показать режим Радар двора.' },
  { min: '1:00', title: 'Подача заявки', say: 'Фото, точка, описание. EXIF удаляется на устройстве.', do: 'Подать заявку с примером фото, перетащить метку.' },
  { min: '1:30', title: 'Приоритет', say: 'Приоритет считается детерминированной формулой, каждый фактор виден.', do: 'Открыть страницу заявки, блок Разложение приоритета.' },
  { min: '2:00', title: 'Solana', say: 'Хэш заявки записывается в Solana Devnet через Memo, подпись делает сам гражданин.', do: 'Подключить Phantom, нажать Записать в блокчейн, открыть ссылку в explorer.' },
  { min: '2:30', title: 'Служба и прозрачность', say: 'Служба берёт заявку в работу, срок SLA виден всем.', do: 'Панель службы, затем Прозрачность и экспорт CSV.' },
  { min: '2:50', title: 'Итог', say: 'Сегодня работает карта, подача, приоритет и запись в Devnet. Дальше смарт-контракт реестра и ИИ-детектор.', do: 'Показать блок Что реализовано и что дальше.' },
];

export const JURY_QA: Array<{ q: string; a: string }> = [
  { q: 'Зачем здесь блокчейн?', a: 'Чтобы ни служба, ни администратор не могли тихо изменить или удалить обращение: запись в публичной сети нельзя переписать, а проверить её может любой.' },
  { q: 'Что именно записывается?', a: 'Не фото и не персональные данные, а SHA-256 отпечаток заявки и короткий код. Фото и текст остаются в базе.' },
  { q: 'Как защищена приватность?', a: 'EXIF с координатами устройства удаляется на клиенте при пережатии фото, подача может быть анонимной.' },
  { q: 'Чем объясним приоритет?', a: 'Формула из семи факторов с видимыми весами. Любой фактор можно оспорить, это не чёрный ящик.' },
  { q: 'Что реально работает сегодня?', a: 'Карта, подача заявки, приоритет, панель службы, экспорт, подпись Memo в Solana Devnet через Phantom.' },
  { q: 'Что в планах?', a: 'Собственная программа реестра, реальный ИИ-детектор, репутация жителей, интеграция с городскими службами.' },
  { q: 'Сколько стоит запись?', a: 'Комиссия сети порядка 0.000005 SOL за транзакцию Memo.' },
  { q: 'Как масштабировать?', a: 'Пакетная запись корневого хэша, сжатые аккаунты, очередь на сервере и индексатор событий.' },
];

/* =========================================================================
 * 6. Хуки React
 * ========================================================================= */

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => store.get<T>(key, initial));
  const set = useCallback(
    (next: T | ((p: T) => T)) => {
      setVal(prev => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        store.set(key, v);
        return v;
      });
    },
    [key],
  );
  return [val, set] as const;
}

export function useMediaQuery(query: string): boolean {
  const get = () => (isBrowser ? window.matchMedia(query).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

export function useOnline(): boolean {
  const [on, setOn] = useState(isBrowser ? navigator.onLine : true);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

export function useEventListener<K extends keyof WindowEventMap>(ev: K, handler: (e: WindowEventMap[K]) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: WindowEventMap[K]) => ref.current(e);
    window.addEventListener(ev, fn);
    return () => window.removeEventListener(ev, fn);
  }, [ev]);
}

export function useHotkey(key: string, cb: () => void, opts: { mod?: boolean } = {}) {
  useEventListener('keydown', e => {
    const modOk = opts.mod ? e.ctrlKey || e.metaKey : true;
    if (modOk && e.key.toLowerCase() === key.toLowerCase()) {
      e.preventDefault();
      cb();
    }
  });
}

export function useEscape(cb: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && cb();
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [cb, active]);
}

export function useOnClickOutside<T extends HTMLElement>(ref: React.RefObject<T | null>, cb: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const fn = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && cb();
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [ref, cb, active]);
}

export function useLockBodyScroll(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

export function useInterval(cb: () => void, ms: number | null) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function useInView<T extends HTMLElement>(margin = '0px 0px -8% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, seen] as const;
}

export function useCopy(timeout = 1200) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      setCopied(ok);
      notify(ok ? 'Скопировано' : 'Не удалось скопировать');
      if (ok) setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );
  return { copied, copy };
}

export function useAsync<T, A extends unknown[]>(fn: (...a: A) => Promise<T>) {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: string }>({ loading: false });
  const run = useCallback(
    async (...a: A) => {
      setState({ loading: true });
      try {
        const data = await fn(...a);
        setState({ loading: false, data });
        return data;
      } catch (e) {
        setState({ loading: false, error: e instanceof Error ? e.message : 'Ошибка' });
        return undefined;
      }
    },
    [fn],
  );
  return { ...state, run };
}

export function useCountUp(target: number, duration = 650, decimals = 0): number {
  const [cur, setCur] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    let raf = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      if (t0 === null) t0 = now;
      const p = Math.min(1, (now - t0) / duration);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const v = start + (target - start) * e;
      setCur(decimals ? parseFloat(v.toFixed(decimals)) : Math.round(v));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, decimals]);
  return cur;
}

export function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const goTo = (path: string) => {
  window.location.hash = path;
};

export function useStoredSet(key: string) {
  const [list, setList] = useLocalStorage<string[]>(key, []);
  const add = useCallback((v: string) => setList(p => (p.includes(v) ? p : [...p, v])), [setList]);
  return [list, add] as const;
}

/* =========================================================================
 * 7. UI-компоненты
 * ========================================================================= */

export class ErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div role="alert" className="mx-auto flex min-h-[50vh] max-w-[480px] flex-col items-start justify-center gap-3 px-6">
        <div className="font-mono text-[13px] text-fg3">ERROR</div>
        <h1 className="text-2xl font-semibold text-fg">Что-то пошло не так</h1>
        <p className="text-[15px] text-fg2">Страница не смогла отобразиться. Данные не потеряны, попробуйте обновить.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.location.reload()} className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg">
            Обновить
          </button>
          <button type="button" onClick={() => { goTo('/'); this.setState({ error: null }); }} className="h-10 rounded-lg border border-line px-4 text-sm text-fg">
            На главную
          </button>
        </div>
      </div>
    );
  }
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);
  useLockBodyScroll(open);
  useEscape(onClose, open);
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    (first || panel.current)?.focus();
    return () => (prevFocus.current as HTMLElement | null)?.focus?.();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div ref={panel} tabIndex={-1} style={{ maxWidth }} className="a-modal max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_50px_rgba(0,0,0,0.24)] outline-none">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="rounded-md px-2 text-fg3 hover:text-fg">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function LoadingList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-2" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyBlock({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="text-[15px] text-fg2">{text}</p>
      {action && (
        <button type="button" onClick={onAction} className="h-8 rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-bg2">
          {action}
        </button>
      )}
    </div>
  );
}

export function ErrorBlock({ text = 'Не удалось загрузить данные', onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-[15px] text-crit">{text}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="h-8 rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-bg2">
          Повторить
        </button>
      )}
    </div>
  );
}

export function CopyButton({ value, label = 'Скопировать', className }: { value: string; label?: string; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      onClick={() => copy(value)}
      className={cn('inline-flex items-center gap-1.5 rounded-md font-mono text-[13px] text-fg hover:text-accent', className)}
    >
      <span className="tabular-nums">{shortHash(value, 6, 6)}</span>
      <span className="text-fg3">{copied ? 'готово' : 'копия'}</span>
    </button>
  );
}

export function LazyImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err)
    return <div className={cn('flex items-center justify-center rounded-lg border border-dashed border-line bg-bg2 text-xs text-fg3', className)}>Нет фото</div>;
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setErr(true)} className={cn('object-cover', className)} />;
}

/* =========================================================================
 * 8. Solana и Phantom
 * ========================================================================= */

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
  on?(ev: string, cb: (...a: any[]) => void): void;
  off?(ev: string, cb: (...a: any[]) => void): void;
}

export type WalletErrorCode =
  | 'NO_PHANTOM'
  | 'REJECTED'
  | 'NO_FUNDS'
  | 'WRONG_NETWORK'
  | 'RPC'
  | 'UNKNOWN';

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}

let _conn: Connection | null = null;
export function getConnection(): Connection {
  if (!_conn) _conn = new Connection(CONFIG.solanaRpc, 'confirmed');
  return _conn;
}

export function getPhantom(): PhantomProvider | null {
  if (!isBrowser) return null;
  const w = window as any;
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana as PhantomProvider;
  if (w.solana?.isPhantom) return w.solana as PhantomProvider;
  return null;
}

export const isInIframe = () => {
  try {
    return isBrowser && window.self !== window.top;
  } catch {
    return true;
  }
};

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${CONFIG.solanaCluster}`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=${CONFIG.solanaCluster}`;

function mapWalletError(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  const err = e as { code?: number; message?: string };
  const msg = err?.message || 'Ошибка кошелька';
  if (err?.code === 4001 || /reject/i.test(msg)) return new WalletError('REJECTED', 'Вы отменили действие в Phantom');
  if (/insufficient|0x1\b|debit/i.test(msg)) return new WalletError('NO_FUNDS', 'Недостаточно SOL в Devnet для комиссии');
  if (/fetch|network|429|rate/i.test(msg)) return new WalletError('RPC', 'RPC Solana недоступен или ограничил запросы. Попробуйте позже.');
  return new WalletError('UNKNOWN', msg);
}

export async function connectPhantom(opts: { silent?: boolean } = {}): Promise<string> {
  const p = getPhantom();
  if (!p) throw new WalletError('NO_PHANTOM', isInIframe() ? 'Откройте сайт в отдельной вкладке: во фрейме Phantom недоступен' : 'Phantom не установлен');
  try {
    const r = await p.connect(opts.silent ? { onlyIfTrusted: true } : undefined);
    const addr = r.publicKey.toString();
    store.set(STORAGE_KEYS.wallet, addr);
    return addr;
  } catch (e) {
    throw mapWalletError(e);
  }
}

export async function disconnectPhantom() {
  try {
    await getPhantom()?.disconnect();
  } catch {
    /* ignore */
  }
  store.remove(STORAGE_KEYS.wallet);
}

export async function getBalanceSol(address: string): Promise<number> {
  try {
    return (await getConnection().getBalance(new PublicKey(address))) / LAMPORTS_PER_SOL;
  } catch (e) {
    throw mapWalletError(e);
  }
}

export async function requestDevnetAirdrop(address: string, sol = 1): Promise<string> {
  try {
    const conn = getConnection();
    const sig = await conn.requestAirdrop(new PublicKey(address), Math.round(sol * LAMPORTS_PER_SOL));
    const bh = await conn.getLatestBlockhash('confirmed');
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    return sig;
  } catch {
    throw new WalletError('RPC', 'Airdrop недоступен (лимит). Используйте faucet.solana.com');
  }
}

export interface MemoResult {
  signature: string;
  url: string;
  text: string;
  time: string;
}

export async function sendMemo(text: string): Promise<MemoResult> {
  const provider = getPhantom();
  if (!provider) throw new WalletError('NO_PHANTOM', isInIframe() ? 'Откройте сайт в отдельной вкладке' : 'Phantom не установлен');
  try {
    if (!provider.publicKey) await provider.connect();
    const payer = provider.publicKey as PublicKey;
    const conn = getConnection();

    const balance = await conn.getBalance(payer);
    if (balance < 10_000) throw new WalletError('NO_FUNDS', 'На Devnet нет SOL. Получите их на faucet.solana.com и проверьте, что Phantom в режиме Devnet.');

    const data = new TextEncoder().encode(clampUtf8(text, CONFIG.memoMaxBytes));
    const BufferCtor = (globalThis as any).Buffer;
    const ix = new TransactionInstruction({
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
      programId: new PublicKey(CONFIG.memoProgramId),
      data: (BufferCtor ? BufferCtor.from(data) : data) as any,
    });
    const bh = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: payer, recentBlockhash: bh.blockhash }).add(ix);

    const { signature } = await provider.signAndSendTransaction(tx);
    try {
      await withTimeout(conn.confirmTransaction({ signature, ...bh }, 'confirmed'), 45_000);
    } catch {
      throw new WalletError('WRONG_NETWORK', 'Транзакция не найдена в Devnet. Проверьте: Phantom, Settings, Developer Settings, Testnet Mode, Solana Devnet.');
    }

    const result: MemoResult = {
      signature,
      url: explorerTx(signature),
      text,
      time: new Date().toLocaleTimeString('ru-RU'),
    };
    saveMemoRecord(result);
    return result;
  } catch (e) {
    throw mapWalletError(e);
  }
}

export function loadMemoRecords(): MemoResult[] {
  return store.get<MemoResult[]>(STORAGE_KEYS.memoRecords, []);
}
export function saveMemoRecord(r: MemoResult) {
  store.set(STORAGE_KEYS.memoRecords, [r, ...loadMemoRecords().filter(x => x.signature !== r.signature)].slice(0, 100));
}

export async function verifyMemoOnChain(signature: string, expectedText?: string): Promise<{ found: boolean; memo?: string; matches?: boolean; slot?: number; blockTime?: number | null }> {
  try {
    const tx = await getConnection().getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx) return { found: false };
    const ixs = tx.transaction.message.instructions as any[];
    const memoIx = ixs.find(i => i.program === 'spl-memo' && typeof i.parsed === 'string');
    const memo = memoIx?.parsed as string | undefined;
    return {
      found: true,
      memo,
      matches: expectedText === undefined ? undefined : memo === expectedText,
      slot: tx.slot,
      blockTime: tx.blockTime,
    };
  } catch (e) {
    throw mapWalletError(e);
  }
}

export function usePhantom() {
  const [address, setAddress] = useState<string | null>(() => store.get<string | null>(STORAGE_KEYS.wallet, null));
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const available = useMemo(() => !!getPhantom(), []);

  const refresh = useCallback(async (a?: string | null) => {
    const target = a ?? address;
    if (!target) return;
    try {
      setBalance(await getBalanceSol(target));
    } catch {
      /* ignore */
    }
  }, [address]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const a = await connectPhantom();
      setAddress(a);
      notify('Кошелёк подключен');
      await refresh(a);
      return a;
    } catch (e) {
      notify((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disconnect = useCallback(async () => {
    await disconnectPhantom();
    setAddress(null);
    setBalance(null);
    notify('Кошелёк отключен');
  }, []);

  useEffect(() => {
    if (!getPhantom()) return;
    connectPhantom({ silent: true }).then(a => { setAddress(a); refresh(a); }).catch(() => {});
    const p = getPhantom();
    const onChange = (pk: PublicKey | null) => (pk ? (setAddress(pk.toString()), refresh(pk.toString())) : disconnect());
    p?.on?.('accountChanged', onChange);
    return () => p?.off?.('accountChanged', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const memo = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        const r = await sendMemo(text);
        if (!address && getPhantom()?.publicKey) setAddress(getPhantom()!.publicKey!.toString());
        notify('Записано в блокчейн');
        refresh();
        return r;
      } catch (e) {
        notify((e as Error).message);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [address, refresh],
  );

  return { address, balance, busy, available, connect, disconnect, refresh, sendMemo: memo };
}

/* =========================================================================
 * 9. Leaflet-хелперы
 * ========================================================================= */

export const TILES = {
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const;

export function createTileLayer(url: string): L.TileLayer {
  const layer = L.tileLayer(url, { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO &copy; Esri' });
  let fell = false;
  layer.on('tileerror', () => {
    if (!fell) {
      fell = true;
      layer.setUrl(TILES.osm);
    }
  });
  return layer;
}

export function pinIcon(color: string, selected = false): L.DivIcon {
  const s = selected ? 16 : 12;
  return L.divIcon({
    className: `civic-pin ${selected ? 'selected' : ''}`,
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid var(--c-surface);box-shadow:0 0 0 ${selected ? '3px var(--c-accent)' : '1px rgba(0,0,0,.25)'}"></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

export interface GeoPoint {
  id: string;
  lat: number;
  lng: number;
}

export function clusterPoints<T extends GeoPoint>(points: T[], zoom: number) {
  const cell = zoom > 14 ? 0.0015 : zoom > 12 ? 0.005 : 0.012;
  const grid = new Map<string, T[]>();
  points.forEach(p => {
    const k = `${Math.floor(p.lng / cell)}:${Math.floor(p.lat / cell)}`;
    grid.set(k, [...(grid.get(k) || []), p]);
  });
  return [...grid.values()].map(items => ({
    lat: items.reduce((s, x) => s + x.lat, 0) / items.length,
    lng: items.reduce((s, x) => s + x.lng, 0) / items.length,
    items,
  }));
}

export function fitToPoints(map: L.Map, pts: GeoPoint[], padding = 40) {
  if (pts.length === 0) return;
  if (pts.length === 1) return void map.setView([pts[0].lat, pts[0].lng], 16);
  map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng] as [number, number])), { padding: [padding, padding] });
}

export function useLeafletResize(map: L.Map | null, el: HTMLElement | null) {
  useEffect(() => {
    if (!map || !el) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const t = [setTimeout(() => map.invalidateSize(), 150), setTimeout(() => map.invalidateSize(), 450)];
    return () => {
      ro.disconnect();
      t.forEach(clearTimeout);
    };
  }, [map, el]);
}

const geoCache = new Map<string, { address: string; district: string } | null>();
let lastGeoCall = 0;
export async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; district: string } | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geoCache.has(key)) return geoCache.get(key)!;
  const wait = Math.max(0, 1100 - (Date.now() - lastGeoCall));
  if (wait) await sleep(wait);
  lastGeoCall = Date.now();
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru,en`);
    if (!r.ok) throw new Error('geo');
    const d = await r.json();
    const a = d.address || {};
    const road = a.road || a.pedestrian || a.street || a.suburb || a.neighbourhood || '';
    const house = a.house_number ? `, ${a.house_number}` : '';
    const area = `${a.city_district || ''} ${a.suburb || ''} ${d.display_name || ''}`.toLowerCase();
    const district = area.includes('есиль') ? 'Есильский район' : area.includes('алмат') ? 'Алматинский район' : area.includes('сарыарк') ? 'Сарыаркинский район' : area.includes('байконур') ? 'Байконурский район' : 'Алматинский район';
    const out = { address: (road ? `${road}${house}` : '') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, district };
    geoCache.set(key, out);
    return out;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

export function useReverseGeocode(pos: { lat: number; lng: number } | null, delay = 600) {
  const p = useDebounced(pos, delay);
  const [res, setRes] = useState<{ address: string; district: string } | null>(null);
  useEffect(() => {
    let alive = true;
    if (p) reverseGeocode(p.lat, p.lng).then(r => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [p?.lat, p?.lng]);
  return res;
}

export function getUserPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Геолокация недоступна в этом браузере'));
    if (!window.isSecureContext) return reject(new Error('Геолокация работает только по https или на localhost'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), accuracy: Math.round(p.coords.accuracy) }),
      e => reject(new Error(e.code === 1 ? 'Доступ к геолокации запрещён в настройках браузера' : 'Не удалось определить местоположение')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

/* =========================================================================
 * 10. Изображения
 * ========================================================================= */

export interface PhotoInfo {
  dataUrl: string;
  w: number;
  h: number;
  bytes: number;
  name?: string;
}

export function compressImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<PhotoInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k);
      const h = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const dataUrl = c.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(url);
      resolve({ dataUrl, w, h, bytes: Math.round((dataUrl.length - 23) * 0.75) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

export async function urlToPhoto(url: string): Promise<PhotoInfo> {
  const blob = await (await fetch(url, { mode: 'cors' })).blob();
  return compressImage(blob);
}

export function makeSamplePhoto(): PhotoInfo {
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
  const ell = (cx: number, cy: number, rx: number, ry: number, rot: number, fill: string) => {
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };
  ell(620, 560, 300, 190, -0.12, '#8a8478');
  ell(615, 570, 250, 150, -0.12, '#2b2a28');
  ell(640, 600, 150, 70, -0.1, '#3d4a52');
  const dataUrl = c.toDataURL('image/jpeg', 0.82);
  return { dataUrl, w: s, h: s, bytes: Math.round((dataUrl.length - 23) * 0.75), name: 'sample.jpg' };
}

/* =========================================================================
 * 11. Экспорт данных
 * ========================================================================= */

export function downloadFile(name: string, content: string | Blob, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<keyof T & string>): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return `\uFEFF${columns.join(',')}\n${rows.map(r => columns.map(c => esc(r[c])).join(',')).join('\n')}`;
}

export function toGeoJson<T extends GeoPoint>(items: T[], props: (x: T) => Record<string, unknown>) {
  return {
    type: 'FeatureCollection' as const,
    features: items.map(x => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [x.lng, x.lat] },
      properties: props(x),
    })),
  };
}

/* =========================================================================
 * 12. i18n и валидаторы
 * ========================================================================= */

export type Dict = Record<string, Record<string, string>>;

export function createT(dict: Dict, lang: string, fallback = 'ru') {
  return (key: string) => dict[lang]?.[key] ?? dict[fallback]?.[key] ?? key;
}

export const validators = {
  email: (v: string) => /^\S+@\S+\.\S+$/.test(v.trim()),
  phone: (v: string) => /^\+?\d[\d\s()-]{9,}$/.test(v.trim()),
  contact: (v: string) => validators.email(v) || validators.phone(v),
  minLen: (v: string, n: number) => v.trim().length >= n,
  imageFile: (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 15 * 1024 * 1024,
  latLng: (lat: number, lng: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180,
};
