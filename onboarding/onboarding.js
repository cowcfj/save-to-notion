/**
 * Onboarding entry script
 *
 * 首次安裝後由 background.handleExtensionInstall() 開啟的 onboarding tab 載入。
 * 接線 DOM 事件、初始化第一步、進入完成頁時寫入 onboardingCompleted 旗標。
 *
 * 純邏輯位於 onboardingController.js 便於 jest 單元測試。
 */

/* global chrome */

import Logger from '../scripts/utils/Logger.js';
import {
  TOTAL_STEPS,
  showStep,
  nextStep,
  skipToEnd,
  markCompleted,
  isNotionConnected,
  runNotionOAuthFlow,
} from './onboardingController.js';

const root = document.querySelector('#onboarding-root');
const ERROR_SCOPE_CONNECT_NOTION = 'connect-notion';

function setError(scope, message) {
  const errorEl = root.querySelector(`[data-error="${scope}"]`);
  if (!errorEl) {
    return;
  }
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

async function handleStepEntered(step) {
  if (step === 2) {
    setError(ERROR_SCOPE_CONNECT_NOTION, '');
    try {
      if (await isNotionConnected(chrome.storage.local)) {
        const advanced = nextStep(root);
        await handleStepEntered(advanced);
      }
    } catch (error) {
      Logger.warn('[Onboarding] 偵測 Notion 授權狀態失敗', {
        action: 'isNotionConnected',
        error: error?.message ?? String(error),
      });
    }
    return;
  }
  if (step === TOTAL_STEPS) {
    try {
      await markCompleted(chrome.storage.local);
    } catch (error) {
      Logger.warn('[Onboarding] 寫入完成旗標失敗', {
        action: 'markCompleted',
        error: error?.message ?? String(error),
      });
    }
  }
}

async function handleConnectNotion(button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '連接中...';
  setError(ERROR_SCOPE_CONNECT_NOTION, '');
  try {
    await runNotionOAuthFlow();
    const step = nextStep(root);
    await handleStepEntered(step);
  } catch (error) {
    Logger.warn('[Onboarding] Notion OAuth 連接失敗', {
      action: 'runNotionOAuthFlow',
      error: error?.message ?? String(error),
    });
    setError(
      ERROR_SCOPE_CONNECT_NOTION,
      `連接失敗：${error?.message ?? '未知錯誤'}，請重試或稍後再說`
    );
    button.disabled = false;
    button.textContent = originalText;
  }
}

function bindActions() {
  root.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) {
      return;
    }
    const action = trigger.dataset.action;
    switch (action) {
      case 'next': {
        const step = nextStep(root);
        await handleStepEntered(step);
        break;
      }
      case 'skip': {
        const step = skipToEnd(root);
        await handleStepEntered(step);
        break;
      }
      case 'connect-notion': {
        await handleConnectNotion(trigger);
        break;
      }
      case 'finish': {
        window.close();
        break;
      }
      default: {
        break;
      }
    }
  });
}

showStep(root, 1);
bindActions();
Logger.ready('[Onboarding] entry loaded', { action: 'onboarding_init' });
