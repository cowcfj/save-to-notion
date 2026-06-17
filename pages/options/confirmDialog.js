/**
 * 可重用的確認對話框（原生 <dialog>）。
 *
 * 回傳 Promise<boolean>：確認 resolve(true)，取消／Esc／關閉 resolve(false)。
 * 焦點鎖定、Esc 關閉、::backdrop 全由瀏覽器原生提供。
 *
 * @param {object} opts
 * @param {string} opts.title - 標題
 * @param {string} opts.message - 內文
 * @param {string} [opts.confirmLabel='確定'] - 確認按鈕文字
 * @param {string} [opts.cancelLabel='取消'] - 取消按鈕文字
 * @param {boolean} [opts.danger=false] - 確認按鈕是否為危險動作樣式
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = '確定',
  cancelLabel = '取消',
  danger = false,
} = {}) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';

    const titleEl = document.createElement('h2');
    titleEl.className = 'confirm-dialog-title';
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.className = 'confirm-dialog-message';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.dataset.action = 'cancel';
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = danger ? 'btn-danger' : 'btn-primary';
    confirmBtn.dataset.action = 'confirm';
    confirmBtn.textContent = confirmLabel;

    actions.append(cancelBtn, confirmBtn);
    dialog.append(titleEl, messageEl, actions);
    document.body.append(dialog);

    let result = false;
    let settled = false;
    const cleanup = res => {
      if (settled) {
        return;
      }
      settled = true;
      dialog.remove();
      resolve(res);
    };

    confirmBtn.addEventListener('click', () => {
      result = true;
      dialog.close();
    });
    cancelBtn.addEventListener('click', () => {
      result = false;
      dialog.close();
    });
    // Esc 或其他原因關閉 → 視為取消
    dialog.addEventListener('close', () => cleanup(result));

    dialog.showModal();
  });
}
