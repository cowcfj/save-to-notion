import { createToastContainer } from '../../../../../scripts/highlighter/ui/components/ToastContainer.js';

describe('ToastContainer', () => {
  test('error level 應使用 role="alert" 與 aria-live="assertive"', () => {
    const el = createToastContainer({ level: 'error', message: '標註失敗，請重試' });

    expect(el.getAttribute('role')).toBe('alert');
    expect(el.getAttribute('aria-live')).toBe('assertive');
    expect(el.getAttribute('aria-atomic')).toBe('true');
    expect(el.classList.contains('toast--error')).toBe(true);
  });

  test('success level 應使用 role="status" 與 aria-live="polite"', () => {
    const el = createToastContainer({ level: 'success', message: '標註已刪除' });

    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('aria-atomic')).toBe('true');
    expect(el.classList.contains('toast--success')).toBe(true);
  });

  test('warning level 應使用 role="status" 與 aria-live="polite"', () => {
    const el = createToastContainer({ level: 'warning', message: '此文字已標註' });

    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.classList.contains('toast--warning')).toBe(true);
  });

  test('container 應有 toast-container class', () => {
    const el = createToastContainer({ level: 'success', message: 'OK' });
    expect(el.classList.contains('toast-container')).toBe(true);
  });

  test('應透過 textContent 注入訊息以避免 XSS', () => {
    const malicious = '<script>alert(1)</script>';
    const el = createToastContainer({ level: 'success', message: malicious });

    const messageEl = el.querySelector('.toast-message');
    expect(messageEl).not.toBeNull();
    expect(messageEl.textContent).toBe(malicious);
    expect(messageEl.querySelector('script')).toBeNull();
  });

  test('應包含 SVG icon 元素', () => {
    const el = createToastContainer({ level: 'success', message: 'OK' });
    const iconEl = el.querySelector('.toast-icon');

    expect(iconEl).not.toBeNull();
    expect(iconEl.querySelector('svg')).not.toBeNull();
  });

  test('建立 icon 時不應使用 innerHTML sink', () => {
    const innerHtmlSetter = jest.fn();
    const innerHtmlSpy = jest
      .spyOn(Element.prototype, 'innerHTML', 'set')
      .mockImplementation(innerHtmlSetter);

    try {
      const el = createToastContainer({ level: 'success', message: 'OK' });

      expect(el.querySelector('.toast-icon svg')).not.toBeNull();
      expect(innerHtmlSetter).not.toHaveBeenCalled();
    } finally {
      innerHtmlSpy.mockRestore();
    }
  });

  test('SVG parsererror 不應被插入 toast icon', () => {
    const parserErrorDoc = document.implementation.createDocument(
      'https://www.mozilla.org/newlayout/xml/parsererror.xml',
      'parsererror'
    );
    const parseSpy = jest
      .spyOn(DOMParser.prototype, 'parseFromString')
      .mockReturnValue(parserErrorDoc);

    try {
      const el = createToastContainer({ level: 'success', message: '完成' });
      const iconEl = el.querySelector('.toast-icon');

      expect(iconEl).not.toBeNull();
      expect(iconEl.querySelector('parsererror')).toBeNull();
      expect(iconEl.childElementCount).toBe(0);
      expect(el.querySelector('.toast-message').textContent).toBe('完成');
    } finally {
      parseSpy.mockRestore();
    }
  });

  test('不同 level 應使用不同 SVG icon（success / warning / error）', () => {
    const successEl = createToastContainer({ level: 'success', message: 'OK' });
    const warningEl = createToastContainer({ level: 'warning', message: 'OK' });
    const errorEl = createToastContainer({ level: 'error', message: 'OK' });

    const successSvg = successEl.querySelector('.toast-icon svg').outerHTML;
    const warningSvg = warningEl.querySelector('.toast-icon svg').outerHTML;
    const errorSvg = errorEl.querySelector('.toast-icon svg').outerHTML;

    expect(successSvg).not.toBe(warningSvg);
    expect(warningSvg).not.toBe(errorSvg);
    expect(successSvg).not.toBe(errorSvg);
  });
});
