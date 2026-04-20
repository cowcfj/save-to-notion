/**
 * @jest-environment jsdom
 */

import { showError, showLoading, showSuccess } from '../../../scripts/auth/callbackStatusView.js';

function buildDom() {
  document.body.innerHTML = `
    <main>
      <output id="status-area" class="status-area">
        <div class="spinner" id="spinner" aria-hidden="true"></div>
        <p class="status-text" id="status-text">初始訊息</p>
      </output>
      <p id="close-hint" style="display: none">此頁面將自動關閉</p>
    </main>
  `;
}

describe('callbackStatusView', () => {
  beforeEach(() => {
    buildDom();
  });

  it('showLoading 在 success 後應重建 spinner 與 status text', () => {
    showSuccess('完成');
    showLoading('重新載入中');

    const statusArea = document.querySelector('#status-area');
    const spinner = document.querySelector('#spinner');
    const statusText = document.querySelector('#status-text');
    const closeHint = document.querySelector('#close-hint');

    expect(statusArea.className).toBe('status-area');
    expect(spinner).not.toBeNull();
    expect(spinner.className).toBe('spinner');
    expect(statusText).not.toBeNull();
    expect(statusText.textContent).toBe('重新載入中');
    expect(closeHint.style.display).toBe('none');
  });

  it('showLoading 在 error 後應重建 loading UI', () => {
    showError('失敗', 'detail');
    showLoading('再試一次');

    expect(document.querySelector('#spinner')).not.toBeNull();
    expect(document.querySelector('#status-text').textContent).toBe('再試一次');
    expect(document.querySelector('.error-detail')).toBeNull();
  });
});
