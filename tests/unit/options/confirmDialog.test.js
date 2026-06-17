// @jest-environment jsdom
/* global document, HTMLDialogElement, MouseEvent */
import { confirmDialog } from '../../../pages/options/confirmDialog.js';

// jsdom 28 未實作 showModal/close — polyfill 成可觀測的 open 屬性切換
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new globalThis.Event('close'));
  };
});

afterEach(() => {
  document.body.innerHTML = '';
});

function getDialogButtons() {
  const dialog = document.querySelector('dialog');
  return {
    dialog,
    confirmBtn: dialog.querySelector('[data-action="confirm"]'),
    cancelBtn: dialog.querySelector('[data-action="cancel"]'),
  };
}

describe('confirmDialog', () => {
  test('開啟後點擊確認 → resolve(true) 並移除 dialog', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    const { dialog, confirmBtn } = getDialogButtons();
    expect(dialog.open).toBe(true);

    confirmBtn.click();
    const result = await promise;

    expect(result).toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('點擊取消 → resolve(false)', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    const { cancelBtn } = getDialogButtons();

    cancelBtn.click();
    const result = await promise;

    expect(result).toBe(false);
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('dialog close 事件（Esc）→ resolve(false)', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    const { dialog } = getDialogButtons();

    dialog.close();
    const result = await promise;

    expect(result).toBe(false);
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('danger=true 時確認按鈕帶 btn-danger class', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M', danger: true });
    const { confirmBtn } = getDialogButtons();

    expect(confirmBtn.classList.contains('btn-danger')).toBe(true);

    confirmBtn.click();
    await promise;
  });

  test('自訂按鈕文字', async () => {
    const promise = confirmDialog({
      title: 'T',
      message: 'M',
      confirmLabel: '刪除',
      cancelLabel: '保留',
    });
    const { confirmBtn, cancelBtn } = getDialogButtons();

    expect(confirmBtn.textContent).toBe('刪除');
    expect(cancelBtn.textContent).toBe('保留');

    cancelBtn.click();
    await promise;
  });

  test('點擊對話框內部 padding（座標落在範圍內）不應關閉', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    const { dialog } = getDialogButtons();
    // 模擬實際 layout：dialog 佔據 (100,100)–(300,250)
    dialog.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      right: 300,
      bottom: 250,
      width: 200,
      height: 150,
    });

    // 點擊 padding 區域：event.target === dialog，但座標在 rect 內
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 110, clientY: 110 }));

    expect(dialog.open).toBe(true);
    expect(document.querySelector('dialog')).not.toBeNull();

    // 收尾，避免 pending promise
    dialog.close();
    await promise;
  });

  test('點擊遮罩層（座標落在範圍外）應 resolve(false) 並關閉', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    const { dialog } = getDialogButtons();
    dialog.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      right: 300,
      bottom: 250,
      width: 200,
      height: 150,
    });

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));

    const result = await promise;
    expect(result).toBe(false);
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('jsdom 零尺寸 rect 下點擊 dialog 仍關閉（測試環境相容）', async () => {
    const promise = confirmDialog({ title: 'T', message: 'M' });
    const { dialog } = getDialogButtons();
    // jsdom 預設 getBoundingClientRect 全為 0，沒有 layout
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));

    const result = await promise;
    expect(result).toBe(false);
    expect(document.querySelector('dialog')).toBeNull();
  });
});
