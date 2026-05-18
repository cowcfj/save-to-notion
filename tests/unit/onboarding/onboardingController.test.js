/**
 * @jest-environment jsdom
 */

import {
  TOTAL_STEPS,
  ONBOARDING_COMPLETED_KEY,
  showStep,
  getCurrentStep,
  nextStep,
  skipToEnd,
  markCompleted,
} from '../../../onboarding/onboardingController.js';

function buildRoot() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="onboarding-progress">
      ${Array.from({ length: TOTAL_STEPS }, (_, i) => `<span class="progress-dot" data-dot="${i + 1}"></span>`).join('')}
    </div>
    ${Array.from({ length: TOTAL_STEPS }, (_, i) => `<section data-step="${i + 1}" hidden></section>`).join('')}
  `;
  return root;
}

describe('onboardingController', () => {
  describe('TOTAL_STEPS', () => {
    it('應為 6 步驟', () => {
      expect(TOTAL_STEPS).toBe(6);
    });
  });

  describe('showStep', () => {
    it('應僅顯示對應 data-step 的 section、隱藏其他', () => {
      const root = buildRoot();
      showStep(root, 3);
      const sections = root.querySelectorAll('section[data-step]');
      sections.forEach(section => {
        const step = Number(section.dataset.step);
        if (step === 3) {
          expect(section.hidden).toBe(false);
        } else {
          expect(section.hidden).toBe(true);
        }
      });
    });

    it('應同步將進度圓點的 active 狀態設在當前 step', () => {
      const root = buildRoot();
      showStep(root, 4);
      const dots = root.querySelectorAll('.progress-dot');
      dots.forEach(dot => {
        const dotIndex = Number(dot.dataset.dot);
        expect(dot.classList.contains('active')).toBe(dotIndex === 4);
      });
    });

    it('應 clamp 到 1..TOTAL_STEPS 範圍內', () => {
      const root = buildRoot();
      expect(showStep(root, 0)).toBe(1);
      expect(showStep(root, 99)).toBe(TOTAL_STEPS);
      expect(showStep(root, -5)).toBe(1);
    });

    it('回傳實際套用的 step 數值', () => {
      const root = buildRoot();
      expect(showStep(root, 2)).toBe(2);
    });
  });

  describe('getCurrentStep', () => {
    it('應回傳當前可見 section 的 data-step', () => {
      const root = buildRoot();
      showStep(root, 5);
      expect(getCurrentStep(root)).toBe(5);
    });

    it('沒有任何可見 section 時回傳 1', () => {
      const root = buildRoot();
      expect(getCurrentStep(root)).toBe(1);
    });
  });

  describe('nextStep', () => {
    it('應前進一步', () => {
      const root = buildRoot();
      showStep(root, 2);
      nextStep(root);
      expect(getCurrentStep(root)).toBe(3);
    });

    it('已在最後一步時不會超出 TOTAL_STEPS', () => {
      const root = buildRoot();
      showStep(root, TOTAL_STEPS);
      nextStep(root);
      expect(getCurrentStep(root)).toBe(TOTAL_STEPS);
    });
  });

  describe('skipToEnd', () => {
    it('應直接跳到最後一步', () => {
      const root = buildRoot();
      showStep(root, 2);
      skipToEnd(root);
      expect(getCurrentStep(root)).toBe(TOTAL_STEPS);
    });
  });

  describe('markCompleted', () => {
    it('應將 onboardingCompleted 寫入 storage 為 true', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined);
      const storage = { set: setMock };
      await markCompleted(storage);
      expect(setMock).toHaveBeenCalledWith({ [ONBOARDING_COMPLETED_KEY]: true });
    });

    it('storage.set 失敗時應 reject 並保留 error', async () => {
      const setMock = jest.fn().mockRejectedValue(new Error('storage_unavailable'));
      const storage = { set: setMock };
      await expect(markCompleted(storage)).rejects.toThrow('storage_unavailable');
    });
  });

  describe('ONBOARDING_COMPLETED_KEY', () => {
    it('應為 onboardingCompleted', () => {
      expect(ONBOARDING_COMPLETED_KEY).toBe('onboardingCompleted');
    });
  });
});
