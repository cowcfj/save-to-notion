/**
 * Onboarding entry script
 *
 * 首次安裝後由 background.handleExtensionInstall() 開啟的 onboarding tab 載入。
 * 此檔目前僅作為骨架，實際 wizard 流程從 Step 5 起逐步補上。
 */

import Logger from '../scripts/utils/Logger.js';

Logger.ready('[Onboarding] entry loaded', { action: 'onboarding_init' });
