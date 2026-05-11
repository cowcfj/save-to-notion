/**
 * Floating Rail 主控制器
 *
 * 整合 state、UI、runtime，管理 Shadow DOM lifecycle 與事件綁定。
 * 作為 content script UI adapter，不自行推論 business state。
 */

import { FloatingRailStateManager, RailStates } from './FloatingRailState.js';
import { injectRailStylesIntoShadowRoot } from './styles/floatingRailStyles.js';
import { createFloatingRailContainer } from './components/FloatingRailContainer.js';
import {
  getRailElements,
  applyRailState,
  applySaveActionVisibility,
  applySelectedColor,
  applyHighlightActive,
  showColorPalette,
  hideColorPalette,
} from './FloatingRailUI.js';
import {
  checkPageStatus,
  savePageFromRail,
  syncHighlights,
  openSidePanel,
} from './FloatingRailRuntime.js';
import { sanitizeApiError } from '../../utils/securityUtils.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import Logger from '../../utils/Logger.js';

const RAIL_HOST_ID = 'notion-floating-rail-host';
const RAIL_HOST_OWNER_ATTR = 'data-rail-owner';
const RAIL_HOST_OWNER_VALUE = 'true';
const RAIL_OWNED_HOST_SELECTOR = `#${RAIL_HOST_ID}[${RAIL_HOST_OWNER_ATTR}="${RAIL_HOST_OWNER_VALUE}"]`;
const RAIL_POSITION_STORAGE_KEY = 'notion-floating-rail-position';
const RAIL_EDGE_MARGIN_PX = 8;
const RAIL_DRAG_LONG_PRESS_MS = 280;
const RAIL_DRAG_MOVE_THRESHOLD_PX = 2;

export class FloatingRail {
  constructor(manager) {
    if (!manager) {
      throw new Error('HighlightManager is required');
    }

    this.manager = manager;
    this.stateManager = new FloatingRailStateManager();
    this._initialized = false;
    this._eventsBound = false;
    this._destroyed = false;
    this._pageStatus = null;
    this._dragState = null;
    this._deleteShortcutHandler = null;
    this._dragActivationTimer = null;
    this._dragCleanup = null;
    this._appendHostListener = null;

    const existingHost = document.querySelector(RAIL_OWNED_HOST_SELECTOR);
    if (existingHost) {
      this.host = existingHost;
      this.shadowRoot = this.host.shadowRoot || this.host.attachShadow({ mode: 'open' });
    } else {
      this.host = document.createElement('div');
      this.host.id = RAIL_HOST_ID;
      this.host.setAttribute(RAIL_HOST_OWNER_ATTR, RAIL_HOST_OWNER_VALUE);
      this.shadowRoot = this.host.attachShadow({ mode: 'open' });
      const appendHost = () => {
        this._appendHostListener = null;
        if (this._destroyed || !document.body) {
          return;
        }
        document.body.append(this.host);
      };
      if (document.body) {
        appendHost();
      } else {
        this._appendHostListener = appendHost;
        document.addEventListener('DOMContentLoaded', this._appendHostListener, { once: true });
      }
    }

    if (this.host.dataset.railStylesInjected !== 'true') {
      injectRailStylesIntoShadowRoot(this.shadowRoot);
      this.host.dataset.railStylesInjected = 'true';
    }

    this.container = createFloatingRailContainer({
      selectedColor: this.stateManager.selectedColor,
    });
    this.shadowRoot.append(this.container);
    this.elements = getRailElements(this.container);
    this._restorePosition();
  }

  async initialize() {
    if (this._destroyed || this._initialized) {
      return;
    }

    this.stateManager.initialize();
    applyRailState(this.container, this.stateManager.currentState);
    applySelectedColor(this.container, this.stateManager.selectedColor);
    applyHighlightActive(
      this.elements.highlightBtn,
      this.stateManager.currentState === RailStates.HIGHLIGHTING
    );

    if (
      this.stateManager.currentState === RailStates.HIGHLIGHTING &&
      this.manager.startHighlighting
    ) {
      this.manager.startHighlighting(this.stateManager.selectedColor);
    }

    await this._refreshPageStatus();
    if (this._destroyed) {
      return;
    }
    this._bindEvents();
    this._initialized = true;
  }

  show() {
    this.host.style.display = 'block';
    if (this.stateManager.currentState === RailStates.COLLAPSED) {
      this.expand();
    }
  }

  hide() {
    this.host.style.display = 'none';
  }

  collapse() {
    this.stateManager.currentState = RailStates.COLLAPSED;
    applyRailState(this.container, RailStates.COLLAPSED);
    hideColorPalette(this.elements.colorPalette);
  }

  expand() {
    this.stateManager.currentState = RailStates.EXPANDED;
    applyRailState(this.container, RailStates.EXPANDED);
  }

  activateHighlighting(sessionOverride) {
    this.stateManager.currentState = RailStates.HIGHLIGHTING;
    applyRailState(this.container, RailStates.HIGHLIGHTING);
    applyHighlightActive(this.elements.highlightBtn, true);

    if (this.manager.startHighlighting) {
      this.manager.startHighlighting(this.stateManager.selectedColor, { sessionOverride });
    }
  }

  deactivateHighlighting() {
    this.stateManager.currentState = RailStates.EXPANDED;
    applyRailState(this.container, RailStates.EXPANDED);
    applyHighlightActive(this.elements.highlightBtn, false);

    if (this.manager.stopHighlighting) {
      this.manager.stopHighlighting();
    }
  }

  setColor(colorName) {
    this.stateManager.selectedColor = colorName;
    applySelectedColor(this.container, colorName);

    if (this.stateManager.isHighlighting && this.manager.setHighlightColor) {
      this.manager.setHighlightColor(colorName);
    }
  }

  async _refreshPageStatus() {
    try {
      const pageStatus = await checkPageStatus();
      if (this._destroyed) {
        return;
      }
      this._pageStatus = pageStatus;
      if (this._pageStatus) {
        applySaveActionVisibility(this.elements.saveBtn, this._pageStatus);
      }
    } catch (error) {
      Logger.warn('[FloatingRail] 無法取得頁面狀態', { error });
    }
  }

  _bindEvents() {
    if (this._eventsBound) {
      return;
    }

    const { trigger, saveBtn, highlightBtn, highlightToggle, manageBtn, colorPalette } =
      this.elements;

    // Trigger: expand/collapse
    if (trigger) {
      this._bindDragEvents(trigger);
      trigger.addEventListener('click', () => {
        if (this._suppressNextTriggerClick) {
          this._suppressNextTriggerClick = false;
          return;
        }
        if (this.stateManager.currentState === RailStates.COLLAPSED) {
          this.expand();
        } else {
          this.collapse();
        }
      });
    }

    // Hover expand/collapse
    this.container.addEventListener('mouseenter', () => {
      if (this.stateManager.currentState === RailStates.COLLAPSED) {
        this.expand();
      }
    });

    this.container.addEventListener('mouseleave', () => {
      if (this._dragState) {
        return;
      }
      if (this.stateManager.currentState === RailStates.EXPANDED) {
        this.collapse();
      }
      hideColorPalette(colorPalette);
    });

    // Focus expand/collapse
    this.container.addEventListener('focusin', () => {
      if (this.stateManager.currentState === RailStates.COLLAPSED) {
        this.expand();
      }
    });

    this.container.addEventListener('focusout', event => {
      if (
        !this.container.contains(event.relatedTarget) &&
        this.stateManager.currentState === RailStates.EXPANDED
      ) {
        this.collapse();
      }
    });

    // Save/Sync action
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._handleSaveSync());
    }

    // Highlight toggle
    if (highlightToggle) {
      highlightToggle.addEventListener('click', () => {
        if (this.stateManager.isHighlighting) {
          this.deactivateHighlighting();
        } else {
          this.activateHighlighting();
        }
      });
    }

    if (highlightBtn) {
      highlightBtn.addEventListener('mouseenter', () => showColorPalette(colorPalette));
      highlightBtn.addEventListener('focusin', () => showColorPalette(colorPalette));
    }

    // Color palette
    if (colorPalette) {
      colorPalette.addEventListener('click', event => {
        event.stopPropagation();
        const swatch = event.target.closest('.color-swatch');
        if (swatch?.dataset.color) {
          this.setColor(swatch.dataset.color);
        }
      });
    }

    // Manage action
    if (manageBtn) {
      manageBtn.addEventListener('click', () => this._handleManage());
    }

    if (!this._deleteShortcutHandler && this.manager.handleDocumentClick) {
      this._deleteShortcutHandler = event => {
        this.manager.handleDocumentClick(event);
      };
      document.addEventListener('click', this._deleteShortcutHandler);
    }

    this._eventsBound = true;
  }

  _bindDragEvents(trigger) {
    trigger.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      this._clearDragArtifacts();

      const currentPosition = this._readCurrentPosition(event);
      this._dragState = {
        startX: event.clientX,
        startY: event.clientY,
        top: currentPosition.top,
        right: currentPosition.right,
        moved: false,
        active: false,
      };
      this._dragActivationTimer = globalThis.setTimeout(() => {
        if (!this._dragState) {
          return;
        }
        this._dragState.active = true;
        this.host.dataset.dragging = 'true';
        trigger.setAttribute('aria-pressed', 'true');
      }, RAIL_DRAG_LONG_PRESS_MS);

      const onMove = moveEvent => {
        if (!this._dragState?.active) {
          return;
        }

        const deltaX = moveEvent.clientX - this._dragState.startX;
        const deltaY = moveEvent.clientY - this._dragState.startY;
        if (
          Math.abs(deltaX) > RAIL_DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(deltaY) > RAIL_DRAG_MOVE_THRESHOLD_PX
        ) {
          this._dragState.moved = true;
        }

        if (moveEvent.cancelable) {
          moveEvent.preventDefault();
        }

        this._applyPosition({
          top: this._dragState.top + deltaY,
          right: this._dragState.right - deltaX,
        });
      };

      const onEnd = () => {
        const wasDragging = this._dragState?.active;
        const moved = this._dragState?.moved;
        if (wasDragging) {
          this._suppressNextTriggerClick = true;
        }
        if (moved) {
          this._persistPosition();
        }
        this._clearDragArtifacts();
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
      this._dragCleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);
      };
    });
  }

  _clearDragArtifacts() {
    if (this._dragActivationTimer !== null) {
      globalThis.clearTimeout(this._dragActivationTimer);
      this._dragActivationTimer = null;
    }
    if (this._dragCleanup) {
      this._dragCleanup();
      this._dragCleanup = null;
    }
    const trigger = this.elements?.trigger;
    if (trigger) {
      trigger.setAttribute('aria-pressed', 'false');
    }
    if (this.host) {
      delete this.host.dataset.dragging;
    }
    this._dragState = null;
  }

  _readCurrentPosition(event) {
    const storedTop = Number.parseFloat(this.host.style.top);
    const storedRight = Number.parseFloat(this.host.style.right);
    if (Number.isFinite(storedTop) && Number.isFinite(storedRight)) {
      return { top: storedTop, right: storedRight };
    }

    const rect = this.host.getBoundingClientRect?.();
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth || 0;
    if (rect && (rect.width > 0 || rect.height > 0)) {
      return {
        top: rect.top,
        right: Math.max(RAIL_EDGE_MARGIN_PX, viewportWidth - rect.right),
      };
    }

    return {
      top: event.clientY,
      right: Math.max(RAIL_EDGE_MARGIN_PX, viewportWidth - event.clientX),
    };
  }

  _restorePosition() {
    try {
      const rawPosition = globalThis.sessionStorage?.getItem(RAIL_POSITION_STORAGE_KEY);
      if (!rawPosition) {
        return;
      }
      const position = JSON.parse(rawPosition);
      this._applyPosition(position);
    } catch (error) {
      Logger.warn('[FloatingRail] 無法讀取位置狀態', { error });
    }
  }

  _applyPosition(position) {
    const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth || 0;
    const maxTop = Math.max(RAIL_EDGE_MARGIN_PX, viewportHeight - RAIL_EDGE_MARGIN_PX);
    const maxRight = Math.max(RAIL_EDGE_MARGIN_PX, viewportWidth - RAIL_EDGE_MARGIN_PX);
    const top = FloatingRail._clampNumber(position?.top, RAIL_EDGE_MARGIN_PX, maxTop);
    const right = FloatingRail._clampNumber(position?.right, RAIL_EDGE_MARGIN_PX, maxRight);

    this.host.style.top = `${top}px`;
    this.host.style.right = `${right}px`;
    this.host.style.transform = 'none';
  }

  _persistPosition() {
    try {
      globalThis.sessionStorage?.setItem(
        RAIL_POSITION_STORAGE_KEY,
        JSON.stringify({
          top: Number.parseFloat(this.host.style.top),
          right: Number.parseFloat(this.host.style.right),
        })
      );
    } catch (error) {
      Logger.warn('[FloatingRail] 無法保存位置狀態', { error });
    }
  }

  static _clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.min(Math.max(number, min), max);
  }

  async _handleSaveSync() {
    try {
      if (this._pageStatus?.isSaved) {
        const highlights = this.manager.collectHighlightsForNotion?.() || [];
        await syncHighlights(highlights);
      } else {
        await savePageFromRail();
      }
      await this._refreshPageStatus();
    } catch (error) {
      const safeMessage = sanitizeApiError(error, 'rail_save_sync');
      Logger.warn('[FloatingRail] 保存/同步失敗', {
        error: ErrorHandler.formatUserMessage(safeMessage),
      });
    }
  }

  async _handleManage() {
    try {
      await openSidePanel();
    } catch (error) {
      Logger.warn('[FloatingRail] 開啟 Side Panel 失敗', { error });
    }
  }

  destroy() {
    this._destroyed = true;
    this._clearDragArtifacts();
    if (this._appendHostListener) {
      document.removeEventListener('DOMContentLoaded', this._appendHostListener);
      this._appendHostListener = null;
    }
    if (this._deleteShortcutHandler) {
      document.removeEventListener('click', this._deleteShortcutHandler);
      this._deleteShortcutHandler = null;
    }
    // 所有 listeners 綁定在 shadow DOM 內部元素，host 移除後隨 GC 回收
    if (this.host?.parentNode) {
      this.host.remove();
    }
    this._initialized = false;
    this._eventsBound = false;
  }
}
