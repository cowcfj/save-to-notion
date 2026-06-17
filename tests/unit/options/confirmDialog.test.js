// @jest-environment jsdom
/* global document, HTMLDialogElement */
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
});
