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

    mockStatus = document.getElementById('status');
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
});
