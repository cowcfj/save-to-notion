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
} from './onboardingController.js';

const root = document.querySelector('#onboarding-root');

async function handleStepEntered(step) {
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
