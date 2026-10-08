/**
 * OZIZ Full-Stack Server
 * Express API + Vite Middleware Integration on Port 3000
 */

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { randomBytes, randomUUID } from 'crypto';
import dotenv from 'dotenv';
import {
  appealsStore,
  civicEventBus,
  findServiceForCategory,
  getReportById,
  getReports,
  incrementConfirmationInDb,
  castResolutionVoteInDb,
  MUNICIPAL_SERVICES,
  updateReportStatusInDb,
  addReport,
  getDbStats,
  persistAppealsToDisk,
} from './src/server/db.ts';
import { analyzeCivicReport } from './src/server/geminiService.ts';
import { getWeatherForLocation } from './src/server/weatherService.ts';
import { calculatePriority } from './src/server/priorityEngine.ts';
import { registerReportOnChain, verifyReportIntegrity, checkSolanaHealth } from './src/server/solanaRelayer.ts';
import { saveMediaAsset, UPLOAD_DIR, getUploadsStats } from './src/server/mediaStore.ts';
import { CivicAppeal, CreateReportPayload } from './src/shared/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const app = express();

// Increase JSON payload limit to accept client-compressed base64 images (~1600px)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Solana Actions CORS headers (required by Dialect and Blinks spec)
const ACTIONS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding',
};

app.use((req, res, next) => {
  if (req.path.startsWith('/api/actions') || req.path === '/actions.json') {
    res.set(ACTIONS_CORS_HEADERS);
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  }
  next();
});

// Dialect Actions Discovery
app.get('/actions.json', (_req: Request, res: Response) => {
  return res.json({
    rules: [
      {
        pathPattern: '/api/actions/**',
        apiPath: '/api/actions/**',
      },
    ],
  });
});

// Solana Action / Blink API
app.get('/api/actions/confirm/:id', (req: Request, res: Response) => {
  const report = getReportById(req.params.id);
  const title = report ? report.title : 'Городская проблема OZIZ';
  const description = report
    ? `${report.context.location.address} · ${report.context.location.district}. Подтвердите проблему для пересчета приоритета службы.`
    : 'Подтвердите инцидент на блокчейне Solana для начисления +10 очков CitizenReputation.';

  return res.json({
    type: 'action',
    icon: 'https://raw.githubusercontent.com/solana-developers/brand-assets/main/assets/solanaLogoMark.png',
    title: `OZIZ: ${title}`,
    description,
    label: 'Подтвердить (+10 Rep)',
    links: {
      actions: [
        {
          label: 'Подтвердить (+10 Rep)',
          href: `/api/actions/confirm/${req.params.id}`,
        },
      ],
    },
  });
});

app.post('/api/actions/confirm/:id', (req: Request, res: Response) => {
  const updated = incrementConfirmationInDb(req.params.id);
  return res.json({
    message: updated
      ? `Подтверждение для заявки ${updated.short_code} зарегистрировано в Solana!`
      : 'Подтверждение успешно зарегистрировано в сети Solana',
  });
});

// Static serving of uploaded defect and resolution photos
app.use('/uploads', express.static(UPLOAD_DIR));

// 0. System Health & Diagnostic Endpoint (Solana Devnet, Gemini, DB, Uploads)
app.get('/api/health', async (_req: Request, res: Response) => {
  const solanaHealth = await checkSolanaHealth();
  const dbStats = getDbStats();
  const uploadsStats = getUploadsStats();

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    database: dbStats,
    uploads: uploadsStats,
    solana: solanaHealth,
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      model: 'gemini-3.8-flash',
    },
    environment: process.env.NODE_ENV || 'development',
  });
});

// 1. Multimodal AI Analysis Endpoint
app.post('/api/reports/analyze', async (req: Request, res: Response) => {
  try {
    const { image_base64, user_text, lat, lng } = req.body;
    if (!image_base64) {
      return res.status(400).json({ error: 'Изображение обязательно для анализа' });
    }

    const aiResult = await analyzeCivicReport(
      image_base64,
      user_text,
      lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined
    );

    return res.json({ success: true, ai_analysis: aiResult });
  } catch (err: any) {
    console.error('Error in /api/reports/analyze:', err);
    return res.status(500).json({ error: 'Ошибка анализа ИИ: ' + (err.message || String(err)) });
  }
});

// 2. Submit New Civic Appeal
app.post('/api/reports', async (req: Request, res: Response) => {
  try {
    const payload: CreateReportPayload = req.body;
    const { image_base64, user_text, lat, lng, address, district, accuracy_m } = payload;

    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'Фотография дефекта обязательна' });
    }
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (lat === undefined || lng === undefined || isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
      return res.status(400).json({ error: 'Некорректные GPS-координаты. lat: [-90..90], lng: [-180..180]' });
    }

    const reportId = randomUUID();
    const shortNumber = Math.floor(100 + Math.random() * 900);
    const shortCode = `OZIZ-2026-${shortNumber}`;

    // 1. Run AI Analysis
    const aiAnalysis = await analyzeCivicReport(image_base64, user_text, { lat: numLat, lng: numLng });

    // 2. Fetch Open-Meteo Weather
    const weather = await getWeatherForLocation(numLat, numLng);

    // 3. Assemble Geographic & Environmental Context
    const nowIso = new Date().toISOString();
    const hour = new Date().getHours();
    const isNight = hour >= 22 || hour <= 6;
    const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 18 && hour <= 20);

    const context = {
      location: {
        lat: numLat,
        lng: numLng,
        accuracy_m: accuracy_m || 9.2,
        address: address || 'пр. Республики, корп. 12',
        district: district || 'Центральный район',
        road_type: 'arterial' as const,
        near: ['school', 'bus_stop'] as any,
      },
      weather,
      time: {
        reported_at: nowIso,
        photo_taken_at: nowIso,
        is_night: isNight,
        is_rush_hour: isRushHour,
      },
      traffic: {
        level: (isRushHour ? 'high' : 'medium') as any,
        source: 'Live traffic estimation',
      },
      history: {
        similar_reports_100m: 1,
        unresolved_days_nearest: 0,
        reporter_trust_score: 0.95,
      },
    };

    // 4. Calculate Explainable Priority Score
    const priority = calculatePriority(aiAnalysis, context, 0, 0);

    // 5. Match Municipal Service
    const service = findServiceForCategory(aiAnalysis.category, aiAnalysis.is_emergency);
    const deadlineHours = service.sla_hours[priority.level];
    const slaDeadline = new Date(Date.now() + deadlineHours * 3600 * 1000).toISOString();

    // 6. Save media file directly to disk (uploads/)
    const savedMedia = saveMediaAsset(image_base64);

    // 7. Register Genesis Record on Solana Blockchain with cryptographic ed25519 signature
    const { onchain, genesisEvent } = registerReportOnChain(
      reportId,
      image_base64,
      user_text || '',
      JSON.stringify(aiAnalysis),
      { lat: numLat, lng: numLng }
    );

    const newAppeal: CivicAppeal = {
      id: reportId,
      short_code: shortCode,
      title: `${aiAnalysis.subcategory} (${context.location.address})`,
      user_description: user_text || undefined,
      media_url: savedMedia.url,
      media_thumbnail_url: savedMedia.url,
      media_sha256: onchain.media_sha256,
      media_cid: onchain.media_cid,
      category: aiAnalysis.category,
      subcategory: aiAnalysis.subcategory,
      status: 'NEW',
      ai_analysis: aiAnalysis,
      context,
      priority,
      assigned_service_id: service.id,
      assigned_service_name: service.name,
      confirmations_count: 1,
      citizen_votes: { repaired: 0, not_repaired: 0 },
      created_at: nowIso,
      updated_at: nowIso,
      sla_deadline: slaDeadline,
      sla_violated: false,
      events: [genesisEvent],
      onchain,
    };

    addReport(newAppeal);

    return res.status(201).json({
      success: true,
      report: newAppeal,
      message: 'Заявка зарегистрирована в системе и закреплена в блокчейне Solana',
    });
  } catch (err: any) {
    console.error('Error creating report:', err);
    return res.status(500).json({ error: 'Ошибка сохранения заявки: ' + (err.message || String(err)) });
  }
});

// 3. Get Civic Appeals (with Filters)
app.get('/api/reports', (req: Request, res: Response) => {
  const { category, status, priority, district, search } = req.query;
  const reports = getReports({
    category: category as string,
    status: status as string,
    priority: priority as string,
    district: district as string,
    search: search as string,
  });
  return res.json({ success: true, count: reports.length, reports });
});

// 4. Get Appeal By ID
app.get('/api/reports/:id', (req: Request, res: Response) => {
  const report = getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  return res.json({ success: true, report });
});

// 5. Citizen Confirmation ("Я тоже вижу")
app.post('/api/reports/:id/confirm', (req: Request, res: Response) => {
  const updated = incrementConfirmationInDb(req.params.id);
  if (!updated) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  return res.json({ success: true, report: updated });
});

// 6. Citizen Voting ("Починено / Не починено")
app.post('/api/reports/:id/vote', (req: Request, res: Response) => {
  const { is_fixed } = req.body;
  if (is_fixed === undefined) {
    return res.status(400).json({ error: 'Поле is_fixed обязательно' });
  }
  const updated = castResolutionVoteInDb(req.params.id, Boolean(is_fixed));
  if (!updated) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  return res.json({ success: true, report: updated });
});

// 7. Update Status by Service Operator
app.post('/api/reports/:id/status', (req: Request, res: Response) => {
  const { status, actor_title, note, resolution_media_url } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Статус обязателен' });
  }
  if (status === 'REJECTED' && !note) {
    return res.status(400).json({ error: 'Отклонение заявки требует обязательного публичного обоснования!' });
  }

  let finalMediaUrl = resolution_media_url;
  if (resolution_media_url && typeof resolution_media_url === 'string' && resolution_media_url.trim().length > 0) {
    const saved = saveMediaAsset(resolution_media_url);
    finalMediaUrl = saved.url;
  }

  const updated = updateReportStatusInDb(
    req.params.id,
    status,
    actor_title || 'Оператор диспетчерской службы',
    note || '',
    finalMediaUrl
  );

  if (!updated) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  return res.json({ success: true, report: updated });
});

// 8. Municipal Services Directory
app.get('/api/services', (_req: Request, res: Response) => {
  return res.json({ success: true, services: MUNICIPAL_SERVICES });
});

// 9. Transparency Stats & Public Leaderboard
app.get('/api/stats/transparency', (_req: Request, res: Response) => {
  const total = appealsStore.length;
  const resolved = appealsStore.filter(r => r.status === 'RESOLVED' || r.status === 'CONFIRMED_BY_CITIZEN').length;
  const critical = appealsStore.filter(r => r.priority.level === 'CRITICAL').length;
  const slaViolations = appealsStore.filter(r => r.sla_violated).length;
  const reopened = appealsStore.filter(r => r.status === 'REOPENED').length;

  const districtCounts: Record<string, number> = {};
  appealsStore.forEach(r => {
    const d = r.context.location.district || 'Прочие';
    districtCounts[d] = (districtCounts[d] || 0) + 1;
  });

  return res.json({
    success: true,
    stats: {
      total_reports: total,
      resolved_reports: resolved,
      resolution_rate_percent: total > 0 ? Math.round((resolved / total) * 100) : 0,
      critical_active: critical,
      sla_violations_total: slaViolations,
      reopened_by_citizens: reopened,
      districts: districtCounts,
      services: MUNICIPAL_SERVICES.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        resolved_rate: Math.round((s.stats.resolved / (s.stats.total_assigned || 1)) * 100),
        avg_response_hours: s.stats.avg_response_hours,
        violations: s.stats.sla_violations,
        reopened: s.stats.reopened_count,
        rank_score: Math.max(0, 100 - s.stats.sla_violations * 10 - s.stats.reopened_count * 8),
      })).sort((a, b) => b.rank_score - a.rank_score),
    },
  });
});

// 10. Verify On-Chain Integrity
app.get('/api/solana/verify/:id', (req: Request, res: Response) => {
  const report = getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }

  const verification = verifyReportIntegrity(report.onchain, report.events);
  return res.json({
    success: true,
    report_id: report.id,
    report_pda: report.onchain.report_pda,
    explorer_url: report.onchain.explorer_url,
    tx_signature: report.onchain.tx_signature,
    verification,
  });
});

// 11. Open Data Export (GeoJSON & CSV)
app.get('/api/export/geojson', (_req: Request, res: Response) => {
  const geojson = {
    type: 'FeatureCollection',
    features: appealsStore.map(r => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.context.location.lng, r.context.location.lat],
      },
      properties: {
        id: r.id,
        code: r.short_code,
        category: r.category,
        title: r.title,
        status: r.status,
        priority: r.priority.level,
        priority_score: r.priority.score,
        district: r.context.location.district,
        address: r.context.location.address,
        created_at: r.created_at,
        sla_violated: r.sla_violated,
        onchain_pda: r.onchain.report_pda,
        tx_signature: r.onchain.tx_signature,
      },
    })),
  };

  res.setHeader('Content-Type', 'application/geo+json');
  res.setHeader('Content-Disposition', 'attachment; filename="oziz_civic_reports.geojson"');
  return res.send(JSON.stringify(geojson, null, 2));
});

app.get('/api/export/csv', (_req: Request, res: Response) => {
  const header = 'id,short_code,category,status,priority,score,lat,lng,district,address,created_at,sla_violated,pda,tx_signature\n';
  const rows = appealsStore.map(r =>
    `"${r.id}","${r.short_code}","${r.category}","${r.status}","${r.priority.level}",${r.priority.score},${r.context.location.lat},${r.context.location.lng},"${r.context.location.district}","${r.context.location.address}","${r.created_at}",${r.sla_violated},"${r.onchain.report_pda}","${r.onchain.tx_signature}"`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="oziz_civic_reports.csv"');
  return res.send(header + rows);
});

// 12. Real-Time SSE Stream for Operator Dispatch
app.get('/api/events/live', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('connected', { timestamp: Date.now() });

  const onCreated = (report: CivicAppeal) => sendEvent('report_created', report);
  const onUpdated = (report: CivicAppeal) => sendEvent('report_updated', report);
  const onConfirmed = (report: CivicAppeal) => sendEvent('report_confirmed', report);
  const onSlaViolated = (report: CivicAppeal) => sendEvent('sla_violated', report);

  civicEventBus.on('report:created', onCreated);
  civicEventBus.on('report:updated', onUpdated);
  civicEventBus.on('report:confirmed', onConfirmed);
  civicEventBus.on('sla:violated', onSlaViolated);

  // Heartbeat ping every 25 seconds
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    civicEventBus.off('report:created', onCreated);
    civicEventBus.off('report:updated', onUpdated);
    civicEventBus.off('report:confirmed', onConfirmed);
    civicEventBus.off('sla:violated', onSlaViolated);
    res.end();
  });
});

// 13. SLA Monitoring Background Worker (Runs every 30s)
const slaMonitorInterval = setInterval(() => {
  const now = Date.now();
  let updatedCount = 0;
  for (const report of appealsStore) {
    if (['RESOLVED', 'CONFIRMED_BY_CITIZEN', 'REJECTED'].includes(report.status)) {
      continue;
    }
    const deadlineTime = new Date(report.sla_deadline).getTime();
    if (now > deadlineTime && !report.sla_violated) {
      report.sla_violated = true;
      const service = MUNICIPAL_SERVICES.find(s => s.id === report.assigned_service_id);
      if (service) {
        service.stats.sla_violations += 1;
      }
      updatedCount += 1;
      civicEventBus.emit('report:updated', report);
      civicEventBus.emit('sla:violated', report);
      console.warn(`[SLA ESCALATION] Appeal ${report.short_code} violated SLA deadline!`);
    }
  }
  if (updatedCount > 0) {
    persistAppealsToDisk();
  }
}, 30000);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Mount Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve dist folder
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OZIZ] Server operational at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
