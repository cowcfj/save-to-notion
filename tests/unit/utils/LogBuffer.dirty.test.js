import { LogBuffer } from '../../../scripts/utils/LogBuffer.js';

describe('LogBuffer - dirty flag', () => {
  let buffer;

  beforeEach(() => {
    buffer = new LogBuffer(5);
  });

  test('starts clean', () => {
    expect(buffer.isDirty()).toBe(false);
  });

  test('becomes dirty after push', () => {
    buffer.push({ level: 'info', source: 'bg', message: 'test', context: {} });
    expect(buffer.isDirty()).toBe(true);
  });

  test('markClean resets dirty flag', () => {
    buffer.push({ level: 'info', source: 'bg', message: 'test', context: {} });
    buffer.markClean();
    expect(buffer.isDirty()).toBe(false);
  });

  test('becomes dirty on suppressed push (repeatCount update)', () => {
    for (let i = 0; i < 12; i++) {
      buffer.push({ level: 'info', source: 'bg', message: 'same', context: { action: 'a' } });
    }
    buffer.markClean();
    buffer.push({ level: 'info', source: 'bg', message: 'same', context: { action: 'a' } });
    expect(buffer.isDirty()).toBe(true);
  });
});

describe('LogBuffer - restoreFrom', () => {
  test('restores entries from snapshot', () => {
    const buffer = new LogBuffer(10);
    const entries = [
      { level: 'info', source: 'bg', message: 'msg1', context: {} },
      { level: 'warn', source: 'bg', message: 'msg2', context: { action: 'x' } },
    ];
    buffer.restoreFrom(entries);

    const all = buffer.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].message).toBe('msg1');
    expect(all[1].message).toBe('msg2');
  });

  test('is not dirty after restoreFrom', () => {
    const buffer = new LogBuffer(10);
    buffer.restoreFrom([{ level: 'info', source: 'bg', message: 'x', context: {} }]);
    expect(buffer.isDirty()).toBe(false);
  });

  test('handles non-array input gracefully', () => {
    const buffer = new LogBuffer(5);
    buffer.restoreFrom(null);
    buffer.restoreFrom(undefined);
    buffer.restoreFrom('bad');
    expect(buffer.getAll()).toHaveLength(0);
  });

  test('respects capacity during restore', () => {
    const buffer = new LogBuffer(3);
    const entries = Array.from({ length: 5 }, (_, i) => ({
      level: 'info',
      source: 'bg',
      message: `msg${i}`,
      context: {},
    }));
    buffer.restoreFrom(entries);

    const all = buffer.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].message).toBe('msg2');
    expect(all[2].message).toBe('msg4');
  });
});
