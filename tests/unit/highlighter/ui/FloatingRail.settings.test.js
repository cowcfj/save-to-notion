/**
 * @jest-environment jsdom
 *
 * FloatingRail settings unit tests.
 */

import {
  FloatingRail,
  Logger,
  setupFloatingRailTestEnvironment,
  teardownFloatingRailTestEnvironment,
} from './FloatingRail.shared.js';

describe('FloatingRail settings', () => {
  let manager;

  beforeEach(() => {
    manager = setupFloatingRailTestEnvironment();
  });

  afterEach(() => {
    teardownFloatingRailTestEnvironment();
  });

  describe('_applyDisplaySettings', () => {
    test('applies position=top size=small to host CSS variables', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'top', size: 'small' });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('25%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('28px');
      expect(rail.host.style.getPropertyValue('--rail-trigger-icon-size')).toBe('18px');
      expect(rail.host.style.getPropertyValue('--rail-action-icon-size')).toBe('14px');
    });

    test('applies position=bottom size=large', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'bottom', size: 'large' });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('75%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
      expect(rail.host.style.getPropertyValue('--rail-trigger-icon-size')).toBe('22px');
      expect(rail.host.style.getPropertyValue('--rail-action-icon-size')).toBe('18px');
    });

    test('unknown position falls back to middle (50%)', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'invalid', size: 'large' });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
    });

    test('unknown size falls back to large (34px main button)', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'middle', size: 'invalid' });
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });

    test('undefined position/size falls back to middle/large', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: undefined, size: undefined });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });
  });

  describe('initialize() reads display settings from storage', () => {
    test('reads floatingRailPosition and floatingRailSize then applies them', async () => {
      chrome.storage.sync.get = jest.fn().mockResolvedValue({
        floatingRailPosition: 'bottom',
        floatingRailSize: 'small',
      });
      const rail = new FloatingRail(manager);

      await rail.initialize();

      expect(chrome.storage.sync.get).toHaveBeenCalledWith([
        'floatingRailPosition',
        'floatingRailSize',
      ]);
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('75%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('28px');
    });

    test('initialize falls back to defaults when storage is empty', async () => {
      chrome.storage.sync.get = jest.fn().mockResolvedValue({});
      const rail = new FloatingRail(manager);

      await rail.initialize();

      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });

    test('storage 讀取失敗時應記錄警告並套用預設顯示設定', async () => {
      chrome.storage.sync.get = jest.fn().mockRejectedValueOnce(new Error('storage unavailable'));
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      const rail = new FloatingRail(manager);

      await rail.initialize();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 無法讀取顯示設定',
        expect.objectContaining({
          action: 'initialize',
          operation: 'loadDisplaySettings',
        })
      );
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });
  });

  describe('storage onChanged listener', () => {
    let addedListener;

    beforeEach(() => {
      addedListener = null;
      chrome.storage.onChanged.addListener = jest.fn(fn => {
        addedListener = fn;
      });
      chrome.storage.onChanged.removeListener = jest.fn();
      chrome.storage.sync.get = jest.fn().mockResolvedValue({});
    });

    test('initialize() registers a chrome.storage.onChanged listener', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
      expect(typeof addedListener).toBe('function');
    });

    test('listener re-applies CSS variables when sync changes include rail keys', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      chrome.storage.sync.get = jest.fn().mockResolvedValue({
        floatingRailPosition: 'top',
        floatingRailSize: 'small',
      });
      await addedListener(
        {
          floatingRailPosition: { newValue: 'top' },
          floatingRailSize: { newValue: 'small' },
        },
        'sync'
      );
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('25%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('28px');
    });

    test('_isDisplaySettingChange 對空值 changes 應回傳 false', () => {
      const rail = new FloatingRail(manager);

      expect(rail._isDisplaySettingChange(null, 'sync')).toBe(false);
      expect(rail._isDisplaySettingChange(undefined, 'sync')).toBe(false);
    });

    test('listener ignores changes from non-sync areas', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const before = rail.host.style.getPropertyValue('--rail-top');
      await addedListener({ floatingRailPosition: { newValue: 'top' } }, 'local');
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe(before);
    });

    test('listener ignores irrelevant sync key changes', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const before = rail.host.style.getPropertyValue('--rail-top');
      await addedListener({ unrelatedKey: { newValue: 'foo' } }, 'sync');
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe(before);
    });

    test('destroy() removes the onChanged listener', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.destroy();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(addedListener);
    });

    test('listener storage 重新讀取失敗時應記錄警告', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      chrome.storage.sync.get = jest.fn().mockRejectedValueOnce(new Error('reload failed'));

      await addedListener({ floatingRailPosition: { newValue: 'top' } }, 'sync');

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 無法重新載入顯示設定',
        expect.objectContaining({
          action: '_listenToDisplaySettingsChanges',
          operation: 'reloadDisplaySettings',
        })
      );
    });
  });
});
