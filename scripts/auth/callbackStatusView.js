/**
 * callbackStatusView.js
 *
 * 提供 callback bridge 頁面共用的狀態 UI helpers。
 */

const DOM_IDS = {
  STATUS_AREA: '#status-area',
  SPINNER: '#spinner',
  STATUS_TEXT: '#status-text',
  CLOSE_HINT: '#close-hint',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const ATTR_ARIA_HIDDEN = 'aria-hidden';
const CLASS_STATUS_TEXT = 'status-text';

/**
 * 顯示 loading 狀態
 *
 * @param {string} message
 */
export function showLoading(message) {
  const statusArea = document.querySelector(DOM_IDS.STATUS_AREA);
  const closeHint = document.querySelector(DOM_IDS.CLOSE_HINT);

  if (statusArea) {
    const spinner = document.createElement('div');
    spinner.id = DOM_IDS.SPINNER.slice(1);
    spinner.className = 'spinner';
    spinner.setAttribute(ATTR_ARIA_HIDDEN, 'true');
    spinner.style.display = '';

    const statusText = document.createElement('p');
    statusText.id = DOM_IDS.STATUS_TEXT.slice(1);
    statusText.className = CLASS_STATUS_TEXT;
    statusText.textContent = message;

    statusArea.className = 'status-area';
    statusArea.replaceChildren(spinner, statusText);
  }
  if (closeHint) {
    closeHint.style.display = 'none';
  }
}

/**
 * 顯示成功狀態
 *
 * @param {string} message
 */
export function showSuccess(message) {
  const statusArea = document.querySelector(DOM_IDS.STATUS_AREA);
  const closeHint = document.querySelector(DOM_IDS.CLOSE_HINT);

  if (statusArea) {
    statusArea.className = 'status-area status-success';

    const iconCircle = document.createElement('div');
    iconCircle.className = 'icon-circle';
    iconCircle.setAttribute(ATTR_ARIA_HIDDEN, 'true');

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute(ATTR_ARIA_HIDDEN, 'true');

    const polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', '20 6 9 17 4 12');
    svg.append(polyline);
    iconCircle.append(svg);

    const statusText = document.createElement('p');
    statusText.className = CLASS_STATUS_TEXT;
    statusText.textContent = message;

    statusArea.replaceChildren(iconCircle, statusText);
  }
  if (closeHint) {
    closeHint.style.display = '';
  }
}

/**
 * 顯示錯誤狀態
 *
 * @param {string} message
 * @param {string} [detail]
 */
export function showError(message, detail) {
  const statusArea = document.querySelector(DOM_IDS.STATUS_AREA);
  const closeHint = document.querySelector(DOM_IDS.CLOSE_HINT);

  if (statusArea) {
    statusArea.className = 'status-area status-error';

    const iconCircle = document.createElement('div');
    iconCircle.className = 'icon-circle';
    iconCircle.setAttribute(ATTR_ARIA_HIDDEN, 'true');

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute(ATTR_ARIA_HIDDEN, 'true');

    const line1 = document.createElementNS(SVG_NS, 'line');
    line1.setAttribute('x1', '18');
    line1.setAttribute('y1', '6');
    line1.setAttribute('x2', '6');
    line1.setAttribute('y2', '18');

    const line2 = document.createElementNS(SVG_NS, 'line');
    line2.setAttribute('x1', '6');
    line2.setAttribute('y1', '6');
    line2.setAttribute('x2', '18');
    line2.setAttribute('y2', '18');

    svg.append(line1, line2);
    iconCircle.append(svg);

    const statusText = document.createElement('p');
    statusText.className = CLASS_STATUS_TEXT;
    statusText.textContent = message;

    const children = [iconCircle, statusText];
    if (detail) {
      const detailEl = document.createElement('p');
      detailEl.className = 'error-detail';
      detailEl.textContent = detail;
      children.push(detailEl);
    }

    statusArea.replaceChildren(...children);
  }
  if (closeHint) {
    closeHint.style.display = 'none';
  }
}
