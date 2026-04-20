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

  it('showSuccess 應標記 status-success className 並顯示 success icon 與關閉提示', () => {
    showSuccess('成功');

    const statusArea = document.querySelector('#status-area');
    expect(statusArea.className).toContain('status-success');

    const successIcon = document.querySelector('.icon-circle svg polyline');
    expect(successIcon).not.toBeNull();

    const closeHint = document.querySelector('#close-hint');
    expect(closeHint.style.display).toBe('');
  });

  it('showError 應標記 status-error className、插入 error-detail 並隱藏關閉提示', () => {
    showError('失敗', '詳細錯誤訊息');

    const statusArea = document.querySelector('#status-area');
    expect(statusArea.className).toContain('status-error');

    const errorDetail = document.querySelector('.error-detail');
    expect(errorDetail).not.toBeNull();
    expect(errorDetail.textContent).toBe('詳細錯誤訊息');

    const closeHint = document.querySelector('#close-hint');
    expect(closeHint.style.display).toBe('none');
  });
});
