import { LogBuffer } from '../../../scripts/utils/LogBuffer.js';

function pushSame(buffer, message, action, times) {
  for (let i = 0; i < times; i++) {
    buffer.push({
      level: 'log',
      source: 'background',
      message,
      context: { action },
    });
  }
}

function getAnomalies(logs) {
  return logs.filter(log => log.context?.anomaly === true);
}

describe('LogBuffer', () => {
  let logBuffer = null;
  const DEFAULT_CAPACITY = 5; // A small capacity for easier testing

  beforeEach(() => {
    logBuffer = new LogBuffer(DEFAULT_CAPACITY);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default capacity if not provided', () => {
      const buffer = new LogBuffer();
      // Only verifying that it doesn't crash, internal capacity is private
      expect(buffer).toBeDefined();
    });

    test('should initialize with custom capacity', () => {
      const buffer = new LogBuffer(100);
      expect(buffer).toBeDefined();
    });

    test('should validate capacity is a positive number', () => {
      const buffer = new LogBuffer(-5);
      // Assuming logic will fallback to a safe default, or we can check behavior
      // For now, just ensure it constructs safely
      expect(buffer).toBeDefined();
    });
  });

  describe('push()', () => {
    test('should add entries to the buffer', () => {
      const entry = { level: 'info', message: 'test' };
      logBuffer.push(entry);

      const logs = logBuffer.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject(entry);
    });

    test('should maintain FIFO behavior when capacity is exceeded', () => {
      // Fill buffer
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        logBuffer.push({ id: i });
      }

      // Add one more
      logBuffer.push({ id: DEFAULT_CAPACITY }); // index 5

      const logs = logBuffer.getAll();
      expect(logs).toHaveLength(DEFAULT_CAPACITY);

      // First item (id: 0) should be gone, First item should now be id: 1
      expect(logs[0].id).toBe(1);
      // Last item should be id: 5
      expect(logs[DEFAULT_CAPACITY - 1].id).toBe(DEFAULT_CAPACITY);
    });

    test('should handle circular references safely', () => {
      const circular = { level: 'error', message: 'circular test' };
      circular.self = circular; // Create circular reference

      logBuffer.push(circular);

      const logs = logBuffer.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('circular test');
      expect(logs[0].context.error).toMatch(/serialization_failed/);
      expect(logs[0].self).toBeUndefined();
    });

    test('should truncate entry when size exceeds limit', () => {
      // MAX_ENTRY_SIZE is 25,000 in LogBuffer.js
      const hugeString = 'a'.repeat(30_000);
      const hugeEntry = { level: 'info', message: 'huge payload', data: hugeString };

      logBuffer.push(hugeEntry);

      const logs = logBuffer.getAll();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('huge payload');
      expect(logs[0].data).toBeUndefined();
      expect(logs[0].context).toMatchObject({
        truncated: true,
        reason: 'entry_exceeds_size_limit',
      });
      expect(typeof logs[0].context.originalSize).toBe('number');
    });
  });

  describe('getAll()', () => {
    test('should return a copy of the buffer, not a reference', () => {
      logBuffer.push({ message: 'original' });
      const logs = logBuffer.getAll();
      logs[0].message = 'modified';

      const freshLogs = logBuffer.getAll();
      expect(freshLogs[0].message).toBe('original');
    });

    test('should return empty array for empty buffer', () => {
      expect(logBuffer.getAll()).toEqual([]);
    });
  });

  describe('clear()', () => {
    test('should remove all entries', () => {
      [{ msg: 1 }, { msg: 2 }].forEach(e => logBuffer.push(e));

      logBuffer.clear();
      expect(logBuffer.getAll()).toHaveLength(0);
    });
  });

  describe('getStats()', () => {
    test('should return correct statistics', () => {
      [{ msg: 1 }, { msg: 2 }].forEach(e => logBuffer.push(e));

      const stats = logBuffer.getStats();

      expect(stats.count).toBe(2);
      expect(stats.capacity).toBe(DEFAULT_CAPACITY);
    });

    test('should return zero count for empty buffer', () => {
      const stats = logBuffer.getStats();
      expect(stats.count).toBe(0);
      expect(stats.capacity).toBe(DEFAULT_CAPACITY);
    });
  });

  // Saturation protection (issue #533)
  // Plan thresholds: SUPPRESS_THRESHOLD = 10, ANOMALY_THRESHOLD = 30
  // Fingerprint = `${message}::${context?.action ?? ''}`
  describe('Saturation protection', () => {
    const SAT_CAPACITY = 100;
    let satBuf;

    beforeEach(() => {
      satBuf = new LogBuffer(SAT_CAPACITY);
    });

    describe('Suppression', () => {
      test('suppresses pushes past SUPPRESS_THRESHOLD by mutating last entry repeatCount', () => {
        pushSame(satBuf, 'phase-3', 'CLEAR_HIGHLIGHTS', 11);

        const logs = satBuf.getAll();
        const matches = logs.filter(
          l => l.message === 'phase-3' && l.context?.action === 'CLEAR_HIGHLIGHTS'
        );

        expect(matches).toHaveLength(10);

        for (let i = 0; i < 9; i++) {
          expect(matches[i].context.repeatCount).toBeUndefined();
        }

        expect(matches[9].context.repeatCount).toBe(11);
      });

      test('caps both A and B at 10 normal entries under A/B alternating loop', () => {
        const aMsg = '[Injection] Script executed successfully';
        const bMsg = 'Phase 3: CLEAR_HIGHLIGHTS 成功';

        /* eslint-disable unicorn/prefer-single-call -- LogBuffer.push is not Array.push */
        for (let i = 0; i < 25; i++) {
          satBuf.push({ level: 'info', source: 'background', message: aMsg, context: {} });
          satBuf.push({
            level: 'info',
            source: 'background',
            message: bMsg,
            context: { action: 'CLEAR_HIGHLIGHTS' },
          });
        }
        /* eslint-enable unicorn/prefer-single-call */

        const logs = satBuf.getAll();
        const aMatches = logs.filter(l => l.message === aMsg);
        const bMatches = logs.filter(l => l.message === bMsg);

        expect(aMatches).toHaveLength(10);
        expect(bMatches).toHaveLength(10);

        expect(aMatches.at(-1).context.repeatCount).toBe(25);
        expect(bMatches.at(-1).context.repeatCount).toBe(25);
      });

      test('non-repeating entry between suppressed pushes does not reset fingerprint count', () => {
        pushSame(satBuf, 'msg-A', 'action-A', 11);

        /* eslint-disable unicorn/prefer-single-call -- LogBuffer.push is not Array.push */
        satBuf.push({
          level: 'log',
          source: 'background',
          message: 'msg-C',
          context: { action: 'action-C' },
        });
        satBuf.push({
          level: 'log',
          source: 'background',
          message: 'msg-A',
          context: { action: 'action-A' },
        });
        /* eslint-enable unicorn/prefer-single-call */

        const logs = satBuf.getAll();
        const aMatches = logs.filter(
          l => l.message === 'msg-A' && l.context?.action === 'action-A'
        );
        const cMatches = logs.filter(
          l => l.message === 'msg-C' && l.context?.action === 'action-C'
        );

        expect(aMatches).toHaveLength(10);
        expect(cMatches).toHaveLength(1);
        expect(aMatches.at(-1).context.repeatCount).toBe(12);
      });

      test('different actions for the same message are tracked as separate fingerprints', () => {
        /* eslint-disable unicorn/prefer-single-call -- LogBuffer.push is not Array.push */
        for (let i = 0; i < 11; i++) {
          satBuf.push({
            level: 'log',
            source: 'background',
            message: 'shared-msg',
            context: { action: 'action-A' },
          });
          satBuf.push({
            level: 'log',
            source: 'background',
            message: 'shared-msg',
            context: { action: 'action-B' },
          });
        }
        /* eslint-enable unicorn/prefer-single-call */

        const logs = satBuf.getAll();
        const aMatches = logs.filter(
          l => l.message === 'shared-msg' && l.context?.action === 'action-A'
        );
        const bMatches = logs.filter(
          l => l.message === 'shared-msg' && l.context?.action === 'action-B'
        );

        expect(aMatches).toHaveLength(10);
        expect(bMatches).toHaveLength(10);
      });

      test('same action with different unrelated context fields shares fingerprint', () => {
        for (let i = 0; i < 11; i++) {
          satBuf.push({
            level: 'log',
            source: 'background',
            message: 'msg',
            context: { action: 'do-thing', url: `https://example.com/${i}` },
          });
        }

        const logs = satBuf.getAll();
        const matches = logs.filter(l => l.message === 'msg' && l.context?.action === 'do-thing');

        expect(matches).toHaveLength(10);
        expect(matches.at(-1).context.repeatCount).toBe(11);
      });
    });

    describe('Anomaly emission', () => {
      test('emits exactly one [ANOMALY] entry when count first hits ANOMALY_THRESHOLD', () => {
        pushSame(satBuf, 'msg-A', 'action-A', 30);

        const logs = satBuf.getAll();
        const anomalies = getAnomalies(logs);

        expect(anomalies).toHaveLength(1);

        const anomaly = anomalies[0];
        expect(anomaly.level).toBe('warn');
        expect(anomaly.context.anomaly).toBe(true);
        expect(anomaly.context.repeatCount).toBe(30);
        expect(anomaly.context.repeatedMessage).toBe('msg-A');
        expect(anomaly.context.repeatedAction).toBe('action-A');
        expect(anomaly.message).toMatch(/^\[ANOMALY\] message looped 30× in buffer:/);
      });

      test('does not re-emit anomaly within the same episode (60 pushes -> 1 ANOMALY)', () => {
        pushSame(satBuf, 'msg-A', 'action-A', 60);

        const anomalies = getAnomalies(satBuf.getAll());
        expect(anomalies).toHaveLength(1);
      });

      test('does not emit anomaly below threshold (29 pushes -> 0 ANOMALY)', () => {
        pushSame(satBuf, 'msg-A', 'action-A', 29);

        const logs = satBuf.getAll();
        const anomalies = getAnomalies(logs);

        expect(anomalies).toHaveLength(0);

        const aMatches = logs.filter(
          l => l.message === 'msg-A' && l.context?.action === 'action-A'
        );
        expect(aMatches).toHaveLength(10);
        expect(aMatches.at(-1).context.repeatCount).toBe(29);
      });

      test('re-emits anomaly after fingerprint state is reset via FIFO eviction', () => {
        const smallBuf = new LogBuffer(40);

        pushSame(smallBuf, 'msg-A', 'action-A', 30);
        expect(getAnomalies(smallBuf.getAll())).toHaveLength(1);

        // Push 40 unique entries to evict all A entries AND the ANOMALY entry
        for (let i = 0; i < 40; i++) {
          smallBuf.push({
            level: 'log',
            source: 'background',
            message: `unique-${i}`,
            context: { action: `unique-${i}` },
          });
        }

        const afterEviction = smallBuf.getAll();
        expect(afterEviction.filter(l => l.message === 'msg-A')).toHaveLength(0);
        expect(getAnomalies(afterEviction)).toHaveLength(0);

        pushSame(smallBuf, 'msg-A', 'action-A', 30);

        const final = smallBuf.getAll();
        expect(getAnomalies(final)).toHaveLength(1);
        expect(
          final.filter(l => l.message === 'msg-A' && l.context?.action === 'action-A')
        ).toHaveLength(10);
      });

      // Memory safety: anomaly entry must respect MAX_ENTRY_SIZE even when the
      // triggering message is large. _emitAnomaly bypasses push()'s size check
      // via _writeRawEntry, so repeatedMessage MUST be truncated at the source.
      test('caps anomaly entry size when triggering message is large', () => {
        // MAX_ENTRY_SIZE in LogBuffer.js is 25_000.
        // Pick a length that keeps original entry under the limit (so suppression
        // path engages normally) but pushes the anomaly entry over the limit if
        // repeatedMessage is echoed verbatim.
        const MAX_ENTRY_SIZE = 25_000;
        const bigMsg = 'a'.repeat(24_800);

        for (let i = 0; i < 30; i++) {
          satBuf.push({
            level: 'info',
            source: 'background',
            message: bigMsg,
            context: { action: 'spam' },
          });
        }

        const anomalies = getAnomalies(satBuf.getAll());
        expect(anomalies).toHaveLength(1);

        const anomaly = anomalies[0];

        // Memory safety invariant: serialized anomaly entry must fit MAX_ENTRY_SIZE.
        expect(JSON.stringify(anomaly).length).toBeLessThanOrEqual(MAX_ENTRY_SIZE);

        // Structural anomaly markers must survive (not lost to a generic
        // fallback path that overwrites context).
        expect(anomaly.level).toBe('warn');
        expect(anomaly.message).toMatch(/^\[ANOMALY\] message looped 30× in buffer:/);
        expect(anomaly.context.anomaly).toBe(true);
        expect(anomaly.context.repeatCount).toBe(30);
        expect(anomaly.context.repeatedAction).toBe('spam');

        // repeatedMessage must be bounded; ANOMALY_MESSAGE_TRUNCATE = 200,
        // truncateMessage may append "... [截斷]" so allow a small buffer.
        expect(anomaly.context.repeatedMessage.length).toBeLessThanOrEqual(210);
      });
    });

    describe('Issue #533 end-to-end scenario', () => {
      test('preserves real user events when A/B loop runs 250 alternating pairs', () => {
        for (let i = 0; i < 30; i++) {
          satBuf.push({
            level: 'info',
            source: 'background',
            message: `user-event-${i}`,
            context: { action: `event-${i}` },
          });
        }

        const aMsg = '[Injection] Script executed successfully';
        const bMsg = 'Phase 3: CLEAR_HIGHLIGHTS 成功';

        /* eslint-disable unicorn/prefer-single-call -- LogBuffer.push is not Array.push */
        for (let i = 0; i < 250; i++) {
          satBuf.push({ level: 'info', source: 'background', message: aMsg, context: {} });
          satBuf.push({
            level: 'info',
            source: 'background',
            message: bMsg,
            context: { action: 'CLEAR_HIGHLIGHTS' },
          });
        }
        /* eslint-enable unicorn/prefer-single-call */

        const logs = satBuf.getAll();

        const userEvents = logs.filter(l => l.message?.startsWith('user-event-'));
        expect(userEvents.length).toBeGreaterThanOrEqual(25);

        const aMatches = logs.filter(l => l.message === aMsg);
        const bMatches = logs.filter(l => l.message === bMsg);

        expect(aMatches).toHaveLength(10);
        expect(bMatches).toHaveLength(10);

        expect(aMatches.at(-1).context.repeatCount).toBe(250);
        expect(bMatches.at(-1).context.repeatCount).toBe(250);

        const anomalies = getAnomalies(logs);
        expect(anomalies).toHaveLength(2);
      });
    });
  });
});
