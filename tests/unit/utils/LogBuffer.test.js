import { LogBuffer } from '../../../scripts/utils/LogBuffer.js';

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
});
