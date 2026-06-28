/**
 * @jest-environment jsdom
 */
import {
  getRadioGroupValue,
  setRadioGroupDisabled,
  setRadioGroupValue,
  resolveEnabledHighlightContentStyle,
} from '../../../pages/options/preferenceControls.js';

describe('preferenceControls helpers', () => {
  const groupName = 'testRadioGroup';

  const getRadio = value =>
    document.querySelector(`input[type="radio"][name="${groupName}"][value="${value}"]`);

  beforeEach(() => {
    document.body.innerHTML = `
      <fieldset>
        <label>
          <input type="radio" name="${groupName}" value="alpha" />
          <span>Alpha</span>
        </label>
        <label>
          <input type="radio" name="${groupName}" value="beta" />
          <span>Beta</span>
        </label>
        <label>
          <input type="radio" name="${groupName}" value="gamma" />
          <span>Gamma</span>
        </label>
        <label>
          <input type="radio" name="${groupName}" value="undefined" />
          <span>Undefined literal</span>
        </label>
      </fieldset>
    `;
  });

  test('getRadioGroupValue 應回傳目前選取值，無選取時回傳 null', () => {
    expect(getRadioGroupValue(groupName)).toBeNull();

    getRadio('beta').checked = true;

    expect(getRadioGroupValue(groupName)).toBe('beta');
  });

  test('setRadioGroupValue 應選取存在的值並回傳實際選取值', () => {
    expect(setRadioGroupValue(groupName, 'beta')).toBe('beta');
    expect(getRadio('alpha').checked).toBe(false);
    expect(getRadio('beta').checked).toBe(true);
    expect(getRadio('gamma').checked).toBe(false);
  });

  test('setRadioGroupValue 應在目標值不存在時回退到 defaultValue', () => {
    expect(setRadioGroupValue(groupName, 'missing', 'gamma')).toBe('gamma');
    expect(getRadio('gamma').checked).toBe(true);
  });

  test('setRadioGroupValue 未提供 defaultValue 時不應選取字串 undefined 選項', () => {
    expect(setRadioGroupValue(groupName, 'missing')).toBeNull();
    expect(getRadio('undefined').checked).toBe(false);
  });

  test('setRadioGroupDisabled 應切換整組 radio disabled 狀態', () => {
    setRadioGroupDisabled(groupName, true);

    const radios = Array.from(document.querySelectorAll(`input[name="${groupName}"]`));
    expect(radios).toHaveLength(4);
    radios.forEach(input => {
      expect(input.disabled).toBe(true);
    });

    setRadioGroupDisabled(groupName, false);

    radios.forEach(input => {
      expect(input.disabled).toBe(false);
    });
  });

  test('resolveEnabledHighlightContentStyle 應保留合法值並將非法值回退到 COLOR_SYNC', () => {
    expect(resolveEnabledHighlightContentStyle('COLOR_SYNC')).toBe('COLOR_SYNC');
    expect(resolveEnabledHighlightContentStyle('COLOR_TEXT')).toBe('COLOR_TEXT');
    expect(resolveEnabledHighlightContentStyle('BOLD')).toBe('BOLD');

    expect(resolveEnabledHighlightContentStyle(null)).toBe('COLOR_SYNC');
    expect(resolveEnabledHighlightContentStyle(undefined)).toBe('COLOR_SYNC');
    expect(resolveEnabledHighlightContentStyle('NONE')).toBe('COLOR_SYNC');
    expect(resolveEnabledHighlightContentStyle('unknown')).toBe('COLOR_SYNC');
  });
});
