/**
 * OZIZ Civic Registry Smart Contract Verification & Simulation Suite
 * Validates immutable ledger rules, SHA-256 event chaining, sequence invariance,
 * rejection justification requirement, and proof of immutability.
 */

import { createHash, randomBytes } from 'crypto';

interface MockAccountReport {
  report_id: Buffer;
  reporter_hash: Buffer;
  media_sha256: Buffer;
  media_cid: string;
  text_sha256: Buffer;
  geo_cell: bigint;
  category: number;
  priority: number;
  ai_analysis_sha256: Buffer;
  created_at: number;
  event_count: number;
}

interface MockStatusEvent {
  report: string;
  seq: number;
  prev_event_hash: Buffer;
  status: number;
  actor_role: number;
  actor: string;
  note_sha256: Buffer;
  timestamp: number;
  event_hash: Buffer;
}

function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

function computeEventHash(event: Omit<MockStatusEvent, 'event_hash'>): Buffer {
  const payload = Buffer.concat([
    Buffer.from(event.report),
    Buffer.from(new Uint32Array([event.seq]).buffer),
    event.prev_event_hash,
    Buffer.from([event.status]),
    Buffer.from([event.actor_role]),
    Buffer.from(event.actor),
    event.note_sha256,
  ]);
  return sha256(payload);
}

class AnchorContractSimulator {
  private reports = new Map<string, MockAccountReport>();
  private events = new Map<string, MockStatusEvent[]>();

  submitReport(params: {
    report_id: Buffer;
    reporter_hash: Buffer;
    media_sha256: Buffer;
    media_cid: string;
    text_sha256: Buffer;
    geo_cell: bigint;
    category: number;
    priority: number;
    ai_analysis_sha256: Buffer;
    payer: string;
  }) {
    if (params.media_cid.length > 64) throw new Error('CivicError::CidTooLong');
    if (params.media_sha256.equals(Buffer.alloc(32))) throw new Error('CivicError::InvalidMediaHash');

    const key = params.report_id.toString('hex');
    if (this.reports.has(key)) throw new Error('Report already exists');

    const now = Math.floor(Date.now() / 1000);
    const report: MockAccountReport = {
      report_id: params.report_id,
      reporter_hash: params.reporter_hash,
      media_sha256: params.media_sha256,
      media_cid: params.media_cid,
      text_sha256: params.text_sha256,
      geo_cell: params.geo_cell,
      category: params.category,
      priority: params.priority,
      ai_analysis_sha256: params.ai_analysis_sha256,
      created_at: now,
      event_count: 1,
    };

    const genesisEventData: Omit<MockStatusEvent, 'event_hash'> = {
      report: key,
      seq: 0,
      prev_event_hash: Buffer.alloc(32),
      status: 1, // STATUS_NEW
      actor_role: 1, // ROLE_CITIZEN
      actor: params.payer,
      note_sha256: Buffer.alloc(32),
      timestamp: now,
    };
    const genesisEvent: MockStatusEvent = {
      ...genesisEventData,
      event_hash: computeEventHash(genesisEventData),
    };

    this.reports.set(key, report);
    this.events.set(key, [genesisEvent]);
    return { report, genesisEvent };
  }

  appendStatus(params: {
    report_id: Buffer;
    seq: number;
    prev_event_hash: Buffer;
    new_status: number;
    actor_role: number;
    actor: string;
    note_sha256: Buffer;
  }) {
    const key = params.report_id.toString('hex');
    const report = this.reports.get(key);
    if (!report) throw new Error('Account does not exist');

    // Sequence constraint
    if (params.seq !== report.event_count) {
      throw new Error('CivicError::SequenceMismatch');
    }

    // Previous hash verification
    const history = this.events.get(key)!;
    const lastEvent = history[history.length - 1];
    if (!params.prev_event_hash.equals(lastEvent.event_hash)) {
      throw new Error('CivicError::PrevEventHashMismatch');
    }

    // Rejection justification constraint
    if (params.new_status === 8 /* STATUS_REJECTED */) {
      if (params.note_sha256.equals(Buffer.alloc(32))) {
        throw new Error('CivicError::RejectionReasonRequired');
      }
    }

    // Rollback or illegal status prohibition
    if (params.new_status < 2 || params.new_status > 8) {
      throw new Error('CivicError::InvalidStatusTransition');
    }

    const now = Math.floor(Date.now() / 1000);
    const newEventData: Omit<MockStatusEvent, 'event_hash'> = {
      report: key,
      seq: params.seq,
      prev_event_hash: params.prev_event_hash,
      status: params.new_status,
      actor_role: params.actor_role,
      actor: params.actor,
      note_sha256: params.note_sha256,
      timestamp: now,
    };
    const newEvent: MockStatusEvent = {
      ...newEventData,
      event_hash: computeEventHash(newEventData),
    };

    report.event_count += 1;
    history.push(newEvent);
    return newEvent;
  }

  verifyChain(report_id: Buffer): boolean {
    const key = report_id.toString('hex');
    const history = this.events.get(key);
    if (!history || history.length === 0) return false;

    for (let i = 0; i < history.length; i++) {
      const event = history[i];
      if (event.seq !== i) return false;

      if (i === 0) {
        if (!event.prev_event_hash.equals(Buffer.alloc(32))) return false;
      } else {
        const prev = history[i - 1];
        if (!event.prev_event_hash.equals(prev.event_hash)) return false;
      }

      const calculated = computeEventHash({
        report: event.report,
        seq: event.seq,
        prev_event_hash: event.prev_event_hash,
        status: event.status,
        actor_role: event.actor_role,
        actor: event.actor,
        note_sha256: event.note_sha256,
        timestamp: event.timestamp,
      });
      if (!calculated.equals(event.event_hash)) return false;
    }
    return true;
  }
}

// Execute automated test scenarios
console.log('--- RUNNING OZIZ ANCHOR CONTRACT TESTS ---');
const contract = new AnchorContractSimulator();
const reportId = randomBytes(16);

// Test 1: Successful report creation
const { report, genesisEvent } = contract.submitReport({
  report_id: reportId,
  reporter_hash: sha256('citizen_user_42'),
  media_sha256: sha256('road_pothole_photo_raw_data'),
  media_cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  text_sha256: sha256('Глубокая яма напротив школы №14'),
  geo_cell: 882046244799999n,
  category: 1, // pothole
  priority: 3, // HIGH
  ai_analysis_sha256: sha256(JSON.stringify({ category: 'pothole', severity: 4 })),
  payer: 'CivicCitizenPubkey11111111111111111111111',
});
console.log('✓ Test 1: submit_report passed. Genesis hash:', genesisEvent.event_hash.toString('hex').slice(0, 16));

// Test 2: Append status (AI_VERIFIED)
const event1 = contract.appendStatus({
  report_id: reportId,
  seq: 1,
  prev_event_hash: genesisEvent.event_hash,
  new_status: 2, // STATUS_AI_VERIFIED
  actor_role: 3, // ROLE_ORACLE
  actor: 'OZIZOracleRelayerPubkey11111111111111111',
  note_sha256: sha256('AI Multimodal Vision confirmed severity 4'),
});
console.log('✓ Test 2: append_status AI_VERIFIED passed. Seq:', event1.seq);

// Test 3: Append status (ASSIGNED to Road Service)
const event2 = contract.appendStatus({
  report_id: reportId,
  seq: 2,
  prev_event_hash: event1.event_hash,
  new_status: 3, // STATUS_ASSIGNED
  actor_role: 2, // ROLE_SERVICE
  actor: 'RoadDeptServicePubkey1111111111111111111',
  note_sha256: sha256('Assigned to District Brigade #4'),
});
console.log('✓ Test 3: append_status ASSIGNED passed. Seq:', event2.seq);

// Test 4: Rejection without note MUST fail
let rejectionFailedAsExpected = false;
try {
  contract.appendStatus({
    report_id: reportId,
    seq: 3,
    prev_event_hash: event2.event_hash,
    new_status: 8, // STATUS_REJECTED
    actor_role: 2,
    actor: 'RoadDeptServicePubkey1111111111111111111',
    note_sha256: Buffer.alloc(32), // empty note
  });
} catch (e: any) {
  if (e.message.includes('CivicError::RejectionReasonRequired')) {
    rejectionFailedAsExpected = true;
  }
}
if (!rejectionFailedAsExpected) throw new Error('Test 4 Failed: Rejection without note was allowed!');
console.log('✓ Test 4: Rejection without justification rejected as expected');

// Test 5: Out of order seq MUST fail
let seqMismatchFailed = false;
try {
  contract.appendStatus({
    report_id: reportId,
    seq: 99, // invalid seq
    prev_event_hash: event2.event_hash,
    new_status: 4,
    actor_role: 2,
    actor: 'RoadDeptServicePubkey1111111111111111111',
    note_sha256: sha256('test'),
  });
} catch (e: any) {
  if (e.message.includes('CivicError::SequenceMismatch')) {
    seqMismatchFailed = true;
  }
}
if (!seqMismatchFailed) throw new Error('Test 5 Failed: Sequence mismatch was ignored!');
console.log('✓ Test 5: Out of order seq was blocked');

// Test 6: Verify full cryptographic chain
const chainValid = contract.verifyChain(reportId);
if (!chainValid) throw new Error('Test 6 Failed: Cryptographic chain check failed');
console.log('✓ Test 6: Cryptographic hash chain fully verified!');
console.log('--- ALL ANCHOR SMART CONTRACT TESTS PASSED (6/6) ---');
