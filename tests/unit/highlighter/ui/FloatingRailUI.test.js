/**
 * FloatingRailUI.js 單元測試
 */

import {
  getRailElements,
  applyRailState,
  applySaveActionVisibility,
  applySelectedColor,
  applyHighlightActive,
  showColorPalette,
  hideColorPalette,
} from '../../../../scripts/highlighter/ui/FloatingRailUI.js';

function createMockContainer() {
  const container = document.createElement('div');
  container.className = 'rail-container collapsed';

  const trigger = document.createElement('button');
  trigger.className = 'rail-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  container.append(trigger);

  const actions = document.createElement('div');
  actions.className = 'rail-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'rail-action-btn';
  saveBtn.dataset.action = 'save';
  saveBtn.setAttribute('aria-label', '保存網頁');
  actions.append(saveBtn);

  const highlightGroup = document.createElement('div');
  highlightGroup.className = 'rail-highlight-group';

  const highlightToggle = document.createElement('button');
  highlightToggle.className = 'rail-action-btn rail-highlight-toggle';
  highlightToggle.dataset.action = 'highlight';
  highlightToggle.setAttribute('aria-label', '開始標註');

  const colorIndicator = document.createElement('span');
  colorIndicator.className = 'color-indicator';
  colorIndicator.style.backgroundColor = '#fff3cd';
  highlightToggle.append(colorIndicator);
  highlightGroup.append(highlightToggle);

  const palette = document.createElement('div');
  palette.className = 'color-palette';

  const colors = [
    { name: 'yellow', hex: '#fff3cd', selected: true },
    { name: 'green', hex: '#d4edda', selected: false },
    { name: 'blue', hex: '#cce7ff', selected: false },
    { name: 'red', hex: '#f8d7da', selected: false },
  ];

  for (const c of colors) {
    const swatch = document.createElement('button');
    swatch.className = `color-swatch${c.selected ? ' selected' : ''}`;
    swatch.dataset.color = c.name;
    swatch.setAttribute('aria-checked', c.selected ? 'true' : 'false');
    swatch.style.backgroundColor = c.hex;
    palette.append(swatch);
  }

  highlightGroup.append(palette);
  actions.append(highlightGroup);

  const manageBtn = document.createElement('button');
  manageBtn.className = 'rail-action-btn';
  manageBtn.dataset.action = 'manage';
  manageBtn.setAttribute('aria-label', '管理標註');
  actions.append(manageBtn);

  container.append(actions);
  return container;
}

describe('getRailElements', () => {
  test('應該回傳所有必要元素', () => {
    const container = createMockContainer();
    const elements = getRailElements(container);

    expect(elements.trigger).not.toBeNull();
    expect(elements.saveBtn).not.toBeNull();
    expect(elements.highlightBtn).not.toBeNull();
    expect(elements.manageBtn).not.toBeNull();
    expect(elements.colorIndicator).not.toBeNull();
    expect(elements.colorPalette).not.toBeNull();
  });

  test('[REGRESSION] highlight button 應直接承載 aria-label 供 tooltip 使用', () => {
    const container = createMockContainer();
    const elements = getRailElements(container);

    expect(elements.highlightBtn.getAttribute('aria-label')).toBe('開始標註');
  });
});

describe('applyRailState', () => {
  test('應該切換到 expanded 狀態', () => {
    const container = createMockContainer();
    applyRailState(container, 'expanded');

    expect(container.classList.contains('expanded')).toBe(true);
    expect(container.classList.contains('collapsed')).toBe(false);
    expect(container.querySelector('.rail-trigger').getAttribute('aria-expanded')).toBe('true');
  });

  test('應該切換到 collapsed 狀態', () => {
    const container = createMockContainer();
    applyRailState(container, 'expanded');
    applyRailState(container, 'collapsed');

    expect(container.classList.contains('collapsed')).toBe(true);
    expect(container.classList.contains('expanded')).toBe(false);
    expect(container.querySelector('.rail-trigger').getAttribute('aria-expanded')).toBe('false');
  });

  test('應該切換到 highlighting 狀態', () => {
    const container = createMockContainer();
    applyRailState(container, 'highlighting');

    expect(container.classList.contains('highlighting')).toBe(true);
    expect(container.classList.contains('collapsed')).toBe(false);
    expect(container.querySelector('.rail-trigger').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('applySaveActionVisibility', () => {
  test('未保存頁面應顯示保存 label', () => {
    const container = createMockContainer();
    const saveBtn = container.querySelector('[data-action="save"]');

    applySaveActionVisibility(saveBtn, { canSave: true, isSaved: false });

    expect(saveBtn.getAttribute('aria-label')).toBe('保存網頁');
    expect(saveBtn.dataset.action).toBe('save');
  });

  test('已保存頁面應顯示同步 label', () => {
    const container = createMockContainer();
    const saveBtn = container.querySelector('[data-action="save"]');

    applySaveActionVisibility(saveBtn, { canSave: false, isSaved: true });

    expect(saveBtn.getAttribute('aria-label')).toBe('同步標註');
    expect(saveBtn.dataset.action).toBe('sync');
  });

  test('null saveBtn 不應拋錯', () => {
    expect(() => applySaveActionVisibility(null, {})).not.toThrow();
  });
});

describe('applySelectedColor', () => {
  test('應該更新 color indicator 背景色', () => {
    const container = createMockContainer();
    applySelectedColor(container, 'blue');

    const indicator = container.querySelector('.color-indicator');
    expect(indicator.style.backgroundColor).toBe('rgb(204, 231, 255)');
  });

  test('應該更新 swatch 的 selected 狀態', () => {
    const container = createMockContainer();
    applySelectedColor(container, 'green');

    const greenSwatch = container.querySelector('[data-color="green"]');
    const yellowSwatch = container.querySelector('[data-color="yellow"]');

    expect(greenSwatch.classList.contains('selected')).toBe(true);
    expect(greenSwatch.getAttribute('aria-checked')).toBe('true');
    expect(yellowSwatch.classList.contains('selected')).toBe(false);
    expect(yellowSwatch.getAttribute('aria-checked')).toBe('false');
  });
});

describe('applyHighlightActive', () => {
  test('active 時應加上 active class 並更新 label', () => {
    const container = createMockContainer();
    const btn = container.querySelector('[data-action="highlight"]');

    applyHighlightActive(btn, true);

    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('停止標註');
  });

  test('[REGRESSION] active / inactive 應同步更新可供樣式辨識的 data state', () => {
    const container = createMockContainer();
    const btn = container.querySelector('[data-action="highlight"]');

    applyHighlightActive(btn, true);
    expect(btn.dataset.highlightState).toBe('active');

    applyHighlightActive(btn, false);
    expect(btn.dataset.highlightState).toBe('inactive');
  });

  test('inactive 時應移除 active class 並更新 label', () => {
    const container = createMockContainer();
    const btn = container.querySelector('[data-action="highlight"]');

    applyHighlightActive(btn, true);
    applyHighlightActive(btn, false);

    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe('開始標註');
  });

  test('null btn 不應拋錯', () => {
    expect(() => applyHighlightActive(null, true)).not.toThrow();
  });
});

describe('showColorPalette / hideColorPalette', () => {
  test('showColorPalette 應加上 visible class', () => {
    const container = createMockContainer();
    const palette = container.querySelector('.color-palette');

    showColorPalette(palette);
    expect(palette.classList.contains('visible')).toBe(true);
  });

  test('hideColorPalette 應移除 visible class', () => {
    const container = createMockContainer();
    const palette = container.querySelector('.color-palette');

    showColorPalette(palette);
    hideColorPalette(palette);
    expect(palette.classList.contains('visible')).toBe(false);
  });

  test('null palette 不應拋錯', () => {
    expect(() => showColorPalette(null)).not.toThrow();
    expect(() => hideColorPalette(null)).not.toThrow();
  });
});
