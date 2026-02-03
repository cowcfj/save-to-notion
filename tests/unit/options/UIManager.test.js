/**
 * @jest-environment jsdom
 */
/* global document */
import { UIManager } from '../../../scripts/options/UIManager.js';

describe('UIManager', () => {
  let uiManager = null;
  let mockManualSection = null;
  let mockStatus = null;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
            <div id="status"></div>
            <div class="manual-section"></div>
            <button id="test-api-button"></button>
        `;

    mockStatus = document.querySelector('#status');
    mockManualSection = document.querySelector('.manual-section');

    uiManager = new UIManager();
    uiManager.init();

    // Mock setTimeout
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('showStatus displays message and sets class', () => {
    uiManager.showStatus('Test Message', 'success');

    expect(mockStatus.textContent).toBe('Test Message');
    expect(mockStatus.className).toBe('status-message success');
  });

  test('showStatus (success) clears message after timeout', () => {
    uiManager.showStatus('Success', 'success');

    expect(mockStatus.textContent).toBe('Success');

    jest.advanceTimersByTime(3000);

    expect(mockStatus.textContent).toBe('');
    expect(mockStatus.className).toBe('');
  });

  test('showSetupGuide inserts guide into manual section', () => {
    uiManager.showSetupGuide();

    const guide = document.querySelector('.setup-guide');
    expect(guide).toBeTruthy();
    expect(mockManualSection.firstChild).toBe(guide);
  });

  test('showDataSourceUpgradeNotice creates banner', () => {
    uiManager.showDataSourceUpgradeNotice('old-db-id');

    const banner = document.querySelector('.upgrade-notice');
    expect(banner).toBeTruthy();
    expect(banner.innerHTML).toContain('old-db-id');
  });

  test('hideDataSourceUpgradeNotice removes banner', () => {
    uiManager.showDataSourceUpgradeNotice('old-db-id');
    let banner = document.querySelector('.upgrade-notice');
    expect(banner).toBeTruthy();

    uiManager.hideDataSourceUpgradeNotice();
    banner = document.querySelector('.upgrade-notice');
    expect(banner).toBeFalsy();
  });

  describe('SVG Security Validation', () => {
    test('should accept safe SVG content', () => {
      const safeSvg = '<svg width="16" height="16"><circle cx="8" cy="8" r="8"/></svg>';
      uiManager.showStatus(`${safeSvg}安全的 SVG 圖標`, 'info');

      const iconSpan = mockStatus.querySelector('.status-icon');
      const textSpan = mockStatus.querySelector('.status-text');

      expect(iconSpan).toBeTruthy();
      expect(iconSpan.innerHTML).toContain('<svg');
      expect(textSpan.textContent).toBe('安全的 SVG 圖標');
    });

    test('should reject SVG with script tags', () => {
      const maliciousSvg = '<svg><script>alert("XSS")</script><circle cx="8" cy="8" r="8"/></svg>';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      uiManager.showStatus(`${maliciousSvg}惡意 SVG`, 'info');

      const iconSpan = mockStatus.querySelector('.status-icon');
      const textSpan = mockStatus.querySelector('.status-text');

      // 圖標應該被拒絕（不存在或為空）
      expect(iconSpan).toBeFalsy();
      expect(textSpan.textContent).toBe('惡意 SVG');
      // Logger.warn 會添加時間戳前綴，檢查第二個參數包含 [Security]
      expect(consoleWarnSpy).toHaveBeenCalled();
      const warnCall = consoleWarnSpy.mock.calls[0];
      expect(warnCall[1]).toContain('[Security]');

      consoleWarnSpy.mockRestore();
    });

    test('should reject SVG with javascript: protocol', () => {
      const maliciousSvg = '<svg><a href="javascript:alert(1)"><circle/></a></svg>';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      uiManager.showStatus(`${maliciousSvg}惡意連結`, 'info');

      const iconSpan = mockStatus.querySelector('.status-icon');
      expect(iconSpan).toBeFalsy();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should reject SVG with event handlers', () => {
      const maliciousSvg = '<svg><circle onload="alert(1)" cx="8" cy="8" r="8"/></svg>';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      uiManager.showStatus(`${maliciousSvg}惡意事件`, 'info');

      const iconSpan = mockStatus.querySelector('.status-icon');
      expect(iconSpan).toBeFalsy();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should handle object format with icon and text', () => {
      const safeSvg = '<svg width="16" height="16"><path d="M5 13l4 4L19 7"/></svg>';
      uiManager.showStatus(
        {
          icon: safeSvg,
          text: '使用對象格式',
        },
        'success'
      );

      const iconSpan = mockStatus.querySelector('.status-icon');
      const textSpan = mockStatus.querySelector('.status-text');

      expect(iconSpan).toBeTruthy();
      expect(iconSpan.innerHTML).toContain('<svg');
      expect(textSpan.textContent).toBe('使用對象格式');
    });
  });
});
