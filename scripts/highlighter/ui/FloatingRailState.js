/**
 * Floating Rail 狀態管理器
 *
 * 管理 Rail 的 UI 狀態：collapsed / expanded / highlighting。
 * 狀態存於 sessionStorage（tab-scoped），不寫入 background 全域。
 */

import Logger from '../../utils/Logger.js';
import { COLORS } from '../utils/color.js';
import { RAIL_INSTANCE_ID } from './floatingRailInstance.js';

const STORAGE_KEY = `notion-floating-rail-state-${RAIL_INSTANCE_ID}`;
const DISMISSED_KEY = `notion-floating-rail-dismissed-${RAIL_INSTANCE_ID}`;
const VALID_COLORS = new Set(Object.keys(COLORS));

export const RailStates = Object.freeze({
  COLLAPSED: 'collapsed',
  EXPANDED: 'expanded',
  HIGHLIGHTING: 'highlighting',
});

export class FloatingRailStateManager {
  constructor() {
    this.listeners = new Set();
    this._currentState = RailStates.COLLAPSED;
    this._selectedColor = 'yellow';
    this._dismissed = false;
    this._initialized = false;
  }

  initialize() {
    if (this._initialized) {
      return;
    }

    try {
      if (globalThis.sessionStorage) {
        const saved = globalThis.sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Object.values(RailStates).includes(parsed.state)) {
            this._currentState = parsed.state;
          }
          if (typeof parsed.color === 'string' && VALID_COLORS.has(parsed.color)) {
            this._selectedColor = parsed.color;
          }
        }
        this._dismissed = globalThis.sessionStorage.getItem(DISMISSED_KEY) === 'true';
      }
    } catch (error) {
      Logger.warn('[FloatingRailState] 無法從 storage 讀取狀態', { error });
    }

    this._initialized = true;
  }

  get currentState() {
    return this._currentState;
  }

  set currentState(newState) {
    if (!Object.values(RailStates).includes(newState)) {
      Logger.warn('[FloatingRailState] 無效的狀態', { state: newState });
      return;
    }

    if (this._currentState !== newState) {
      this._currentState = newState;
      this._persist();
      this._notifyListeners();
    }
  }

  get selectedColor() {
    return this._selectedColor;
  }

  set selectedColor(color) {
    if (!VALID_COLORS.has(color)) {
      Logger.warn('[FloatingRailState] 無效的顏色值', { color });
      return;
    }
    if (this._selectedColor !== color) {
      this._selectedColor = color;
      this._persist();
      this._notifyListeners();
    }
  }

  get isHighlighting() {
    return this._currentState === RailStates.HIGHLIGHTING;
  }

  get isDismissed() {
    return this._dismissed;
  }

  dismiss() {
    this._dismissed = true;
    try {
      globalThis.sessionStorage?.setItem(DISMISSED_KEY, 'true');
    } catch (error) {
      Logger.warn('[FloatingRailState] 無法保存 dismissed 狀態', { error });
    }
  }

  undismiss() {
    this._dismissed = false;
    try {
      globalThis.sessionStorage?.removeItem(DISMISSED_KEY);
    } catch (error) {
      Logger.warn('[FloatingRailState] 無法清除 dismissed 狀態', { error });
    }
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  _notifyListeners() {
    const snapshot = { state: this._currentState, color: this._selectedColor };
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        Logger.error('[FloatingRailState] 監聽器執行錯誤', { error });
      }
    }
  }

  _persist() {
    try {
      if (globalThis.sessionStorage) {
        globalThis.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ state: this._currentState, color: this._selectedColor })
        );
      }
    } catch (error) {
      Logger.warn('[FloatingRailState] 無法保存狀態', { error });
    }
  }
}
