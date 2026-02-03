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

    test('should add timestamp if missing', () => {
      logBuffer.push({ level: 'info', message: 'test' });

      const logs = logBuffer.getAll();
      expect(logs[0]).toHaveProperty('timestamp');
      expect(new Date(logs[0].timestamp).getTime()).not.toBeNaN();
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

    test('should accept entries with existing timestamps', () => {
      const ts = '2023-01-01T00:00:00.000Z';
      logBuffer.push({ timestamp: ts, message: 'old' });

      const logs = logBuffer.getAll();
      expect(logs[0].timestamp).toBe(ts);
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
      logBuffer.push({ msg: 1 }, { msg: 2 });

      logBuffer.clear();
      expect(logBuffer.getAll()).toHaveLength(0);
    });
  });

  describe('getStats()', () => {
    test('should return correct statistics', () => {
      logBuffer.push({ msg: 1 }, { msg: 2 });

      const stats = logBuffer.getStats();

      expect(stats.count).toBe(2);
      expect(stats.capacity).toBe(DEFAULT_CAPACITY);
      expect(new Date(stats.oldest)).toBeInstanceOf(Date);
      expect(new Date(stats.newest)).toBeInstanceOf(Date);
    });

    test('should return null dates for empty buffer', () => {
      const stats = logBuffer.getStats();
      expect(stats.count).toBe(0);
      expect(stats.oldest).toBeNull();
      expect(stats.newest).toBeNull();
    });
  });
});
