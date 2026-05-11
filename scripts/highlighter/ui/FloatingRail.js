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

export class FloatingRail {
  constructor(manager) {
    if (!manager) {
      throw new Error('HighlightManager is required');
    }

    this.manager = manager;
    this.stateManager = new FloatingRailStateManager();
    this._initialized = false;
    this._eventsBound = false;
    this._pageStatus = null;

    const existingHost = document.querySelector(RAIL_OWNED_HOST_SELECTOR);
    if (existingHost) {
      this.host = existingHost;
      this.shadowRoot = this.host.shadowRoot || this.host.attachShadow({ mode: 'open' });
    } else {
      this.host = document.createElement('div');
      this.host.id = RAIL_HOST_ID;
      this.host.setAttribute(RAIL_HOST_OWNER_ATTR, RAIL_HOST_OWNER_VALUE);
      this.shadowRoot = this.host.attachShadow({ mode: 'open' });
      document.body.append(this.host);
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
  }

  initialize() {
    if (this._initialized) {
      return;
    }

    this.stateManager.initialize();
    applyRailState(this.container, this.stateManager.currentState);
    applySelectedColor(this.container, this.stateManager.selectedColor);

    this._bindEvents();
    this._refreshPageStatus();
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

  activateHighlighting() {
    this.stateManager.currentState = RailStates.HIGHLIGHTING;
    applyRailState(this.container, RailStates.HIGHLIGHTING);
    applyHighlightActive(this.elements.highlightBtn, true);

    if (this.manager.startHighlighting) {
      this.manager.startHighlighting(this.stateManager.selectedColor);
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
      this._pageStatus = await checkPageStatus();
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

    const { trigger, saveBtn, highlightBtn, manageBtn, colorPalette } = this.elements;

    // Trigger: expand/collapse
    if (trigger) {
      trigger.addEventListener('click', () => {
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
      if (this.stateManager.currentState === RailStates.EXPANDED) {
        this.collapse();
      }
      hideColorPalette(colorPalette);
    });

    // Focus expand
    this.container.addEventListener('focusin', () => {
      if (this.stateManager.currentState === RailStates.COLLAPSED) {
        this.expand();
      }
    });

    // Save/Sync action
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._handleSaveSync());
    }

    // Highlight toggle
    if (highlightBtn) {
      highlightBtn.addEventListener('click', () => {
        if (this.stateManager.isHighlighting) {
          this.deactivateHighlighting();
        } else {
          this.activateHighlighting();
        }
      });

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

    this._eventsBound = true;
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
    if (this.host?.parentNode) {
      this.host.remove();
    }
    this._initialized = false;
    this._eventsBound = false;
  }
}
