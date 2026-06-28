import { UI_TOKENS, hexToRgba } from '../../../../styles/ui-token-constants.js';

export function registerUiTokenConstantsMock(jestInstance, modulePath) {
  if (typeof jestInstance.unstable_mockModule === 'function') {
    jestInstance.unstable_mockModule(modulePath, () => ({
      UI_TOKENS,
      hexToRgba,
    }));
  }
}
