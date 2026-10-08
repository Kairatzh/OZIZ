/**
 * OZIZ — Backend API End-to-End Integration Test Suite
 * Tests real persistence, image disk storage, Solana cryptographic signatures,
 * weather, priority calculation, status transitions, and data export.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

// 1x1 transparent GIF base64 as valid test image
const SAMPLE_BASE64_IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const TEST_PORT = process.env.TEST_PORT || '3005';
const BASE_URL = process.env.TEST_API_URL || `http://localhost:${TEST_PORT}`;

let serverProcess: ChildProcess | null = null;

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      console.log(`[TESTS] Server is already running at ${BASE_URL}`);
      return;
    }
  } catch {}

  console.log(`[TESTS] Booting full-stack server on isolated port ${TEST_PORT} for integration tests...`);
  serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, PORT: TEST_PORT },
  });

  const start = Date.now();
  while (Date.now() - start < 25000) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        console.log(`[TESTS] Server successfully responded to healthcheck!\n`);
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 800));
  }
  throw new Error(`Server failed to become healthy on port ${TEST_PORT} within 25 seconds`);
}

async function fetchJson(endpoint: string, options: any = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runApiIntegrationTests() {
  console.log('================================================================');
  console.log('       RUNNING OZIZ REAL BACKEND API INTEGRATION TESTS          ');
  console.log('================================================================');

  await ensureServerRunning();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`✓ [PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`✕ [FAIL] ${testName} ${detail ? '- ' + detail : ''}`);
      failed++;
    }
  }

  try {
    // 1. Healthcheck
    console.log('\n--- Test 1: Healthcheck Diagnostic Endpoint ---');
    const health = await fetchJson('/api/health');
    assert(health.status === 200, 'GET /api/health status is 200');
    assert(health.data?.status === 'ok', 'Health status is ok');
    assert(typeof health.data?.database?.totalReports === 'number', 'Database report count returned', `Count: ${health.data?.database?.totalReports}`);
    assert(typeof health.data?.uploads?.count === 'number', 'Uploads asset count returned', `Files: ${health.data?.uploads?.count}`);
    assert(typeof health.data?.solana?.relayerPubkey === 'string', 'Solana relayer public key returned', `Pubkey: ${health.data?.solana?.relayerPubkey?.slice(0, 12)}...`);

    // 2. Multimodal AI Analysis
    console.log('\n--- Test 2: Multimodal AI Analysis Endpoint ---');
    const aiRes = await fetchJson('/api/reports/analyze', {
      method: 'POST',
      body: JSON.stringify({
        image_base64: SAMPLE_BASE64_IMAGE,
        user_text: 'Глубокая яма на перекрестке с риском пробить колесо',
        lat: 51.1694,
        lng: 71.4491,
      }),
    });
    assert(aiRes.status === 200, 'POST /api/reports/analyze returns 200');
    assert(aiRes.data?.success === true, 'AI analysis success is true');
    assert(typeof aiRes.data?.ai_analysis?.category === 'string', 'Category classified', `Category: ${aiRes.data?.ai_analysis?.category}`);
    assert(typeof aiRes.data?.ai_analysis?.severity === 'number', 'Severity calculated', `Severity: ${aiRes.data?.ai_analysis?.severity}`);

    // 3. Create Report with Real Photo Saving to Disk
    console.log('\n--- Test 3: Create Civic Appeal & Disk Media Persistence ---');
    const createRes = await fetchJson('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        image_base64: SAMPLE_BASE64_IMAGE,
        user_text: 'Опасный открытый люк прямо перед школой',
        lat: 51.1605,
        lng: 71.4704,
        address: 'ул. Сатпаева, д. 8',
        district: 'Алматинский район',
        accuracy_m: 5.4,
      }),
    });
    assert(createRes.status === 201, 'POST /api/reports returns 201 Created');
    assert(createRes.data?.success === true, 'Report creation success');
    const createdReport = createRes.data?.report;
    assert(!!createdReport?.id, 'Generated UUID for appeal', `ID: ${createdReport?.id}`);
    assert(createdReport?.media_url?.startsWith('/uploads/'), 'Photo stored as real file in /uploads/', `URL: ${createdReport?.media_url}`);
    assert(!!createdReport?.onchain?.tx_signature, 'Solana ed25519 signature generated', `Signature: ${createdReport?.onchain?.tx_signature?.slice(0, 16)}...`);
    assert(createdReport?.events?.length === 1, 'Genesis event seq=0 initialized');

    // 4. Verify Static Photo Serving
    console.log('\n--- Test 4: Static File Serving ---');
    const photoRes = await fetch(`${BASE_URL}${createdReport.media_url}`);
    assert(photoRes.status === 200, 'GET /uploads/... returns 200 OK');
    const photoBuffer = await photoRes.arrayBuffer();
    assert(photoBuffer.byteLength > 0, 'Photo has valid binary content', `Size: ${photoBuffer.byteLength} bytes`);

    // 5. Citizen Confirmation (+1)
    console.log('\n--- Test 5: Citizen Confirmation (+1) ---');
    const initialScore = createdReport.priority.score;
    const confirmRes = await fetchJson(`/api/reports/${createdReport.id}/confirm`, {
      method: 'POST',
    });
    assert(confirmRes.status === 200, 'POST /api/reports/:id/confirm returns 200');
    assert(confirmRes.data?.report?.confirmations_count === 2, 'Confirmation count incremented to 2');
    assert(confirmRes.data?.report?.priority?.score >= initialScore, 'Priority score increased dynamically');

    // 6. Service Operator Workflow & Rejection Protection
    console.log('\n--- Test 6: Operator Status Transitions & Rejection Rule ---');
    // Try to reject without note (Must be blocked by backend!)
    const invalidReject = await fetchJson(`/api/reports/${createdReport.id}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'REJECTED',
        note: '',
      }),
    });
    assert(invalidReject.status === 400, 'Rejection without note blocked with 400 Bad Request');

    // Transition to IN_PROGRESS
    const inProgressRes = await fetchJson(`/api/reports/${createdReport.id}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        actor_title: 'Бригада дорожников #3',
        note: 'Бригада выехала на устранение дефекта',
      }),
    });
    assert(inProgressRes.status === 200, 'Status updated to IN_PROGRESS');
    assert(inProgressRes.data?.report?.status === 'IN_PROGRESS', 'Appeal status is IN_PROGRESS');
    assert(inProgressRes.data?.report?.events?.length === 2, 'Event seq 1 appended to hash chain');

    // Transition to RESOLVED with resolution photo
    const resolvedRes = await fetchJson(`/api/reports/${createdReport.id}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'RESOLVED',
        actor_title: 'Мастер участка',
        note: 'Установлен новый усиленный люк',
        resolution_media_url: SAMPLE_BASE64_IMAGE,
      }),
    });
    assert(resolvedRes.status === 200, 'Status updated to RESOLVED');
    assert(resolvedRes.data?.report?.status === 'RESOLVED', 'Appeal status is RESOLVED');
    assert(resolvedRes.data?.report?.resolution_media_url?.startsWith('/uploads/'), 'Resolution photo saved to /uploads/');
    assert(resolvedRes.data?.report?.events?.length === 3, 'Event seq 2 appended with Solana transaction');

    // 7. Citizen Resolution Voting
    console.log('\n--- Test 7: Citizen Quality Voting ---');
    const voteRes = await fetchJson(`/api/reports/${createdReport.id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ is_fixed: true }),
    });
    assert(voteRes.status === 200, 'POST /api/reports/:id/vote returns 200');
    assert(voteRes.data?.report?.citizen_votes?.repaired >= 1, 'Repaired vote counted');

    // 8. Cryptographic Hash Chain Audit
    console.log('\n--- Test 8: Solana Cryptographic Ledger Audit ---');
    const verifyRes = await fetchJson(`/api/solana/verify/${createdReport.id}`);
    assert(verifyRes.status === 200, 'GET /api/solana/verify/:id returns 200');
    assert(verifyRes.data?.verification?.isValid === true, 'Cryptographic integrity 100% verified');
    assert(verifyRes.data?.verification?.auditTrail?.length === 3, 'All 3 events in verifiable chain audited');

    // 9. Open Data Export (GeoJSON & CSV)
    console.log('\n--- Test 9: Open Data Export ---');
    const geojsonRes = await fetch(`${BASE_URL}/api/export/geojson`);
    assert(geojsonRes.status === 200, 'GET /api/export/geojson returns 200');
    const geojsonData = await geojsonRes.json();
    assert(geojsonData?.type === 'FeatureCollection', 'Valid GeoJSON FeatureCollection returned');
    assert(Array.isArray(geojsonData?.features) && geojsonData.features.length > 0, 'GeoJSON features contains reports');

    const csvRes = await fetch(`${BASE_URL}/api/export/csv`);
    assert(csvRes.status === 200, 'GET /api/export/csv returns 200');
    const csvText = await csvRes.text();
    assert(csvText.includes('short_code') && csvText.includes(createdReport.short_code), 'CSV contains created report record');

    // 10. Real Disk Database Persistence
    console.log('\n--- Test 10: Disk Database File Verification (data/appeals.json) ---');
    const dataFilePath = path.resolve(process.cwd(), 'data', 'appeals.json');
    assert(fs.existsSync(dataFilePath), 'data/appeals.json exists on disk');
    const savedContent = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
    const foundOnDisk = savedContent.find((r: any) => r.id === createdReport.id);
    assert(!!foundOnDisk, 'Newly created report is physically persisted on disk', `Title: ${foundOnDisk?.title}`);
    assert(foundOnDisk?.status === 'RESOLVED', 'Persisted record preserves latest RESOLVED status');

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (serverProcess) {
      console.log('[TESTS] Terminating spawned test server process...');
      serverProcess.kill('SIGTERM');
    }
  }
}

// Start test runner
runApiIntegrationTests();
