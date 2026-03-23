// 測試更新通知功能
// 在 Background Service Worker 的 DevTools Console 中運行此腳本

(function () {
  'use strict';

  console.log('🧪 測試更新通知功能');

  // 模擬擴展更新事件（觸發完整流程）
  function testUpdateNotification() {
    if (typeof handleExtensionUpdate === 'function') {
      console.log("▶ 觸發 handleExtensionUpdate('2.47.0')...");
      handleExtensionUpdate('2.47.0');
    } else {
      console.warn('handleExtensionUpdate 函數未找到（需在 Background DevTools 中執行）');
    }
  }

  // 測試版本比較邏輯
  function testVersionComparison() {
    console.log('🔍 測試版本比較邏輯（只有 Major/Minor 才通知）');

    const testCases = [
      { prev: '2.47.0', curr: '2.48.0', expected: true, desc: 'Minor 升版' },
      { prev: '2.0.0', curr: '3.0.0', expected: true, desc: 'Major 升版' },
      { prev: '2.47.0', curr: '2.47.1', expected: false, desc: 'Patch 升版，不通知' },
      { prev: '2.7.2', curr: '2.7.3', expected: false, desc: 'Patch 升版，不通知' },
      { prev: '2.48.0', curr: '2.47.0', expected: false, desc: '降級，不通知' },
    ];

    testCases.forEach(test => {
      const result = shouldShowUpdateNotification(test.prev, test.curr);
      const status = result === test.expected ? '✅' : '❌';
      console.log(
        `${status} ${test.prev} → ${test.curr}: ${result} (期望: ${test.expected}) - ${test.desc}`
      );
    });
  }

  // 直接開啟更新通知小視窗（驗證 UI）
  function openUpdateNotification(prev = '2.47.0', curr = '2.48.0') {
    const url = new URL(chrome.runtime.getURL('update-notification/update-notification.html'));
    url.searchParams.set('prev', prev);
    url.searchParams.set('curr', curr);
    chrome.windows.create({ url: url.toString(), type: 'popup', width: 480, height: 560 });
    console.log(`▶ 已開啟更新通知小視窗（${prev} → ${curr}）`);
  }

  // 暴露測試函數到全局
  globalThis.testUpdateNotification = testUpdateNotification;
  globalThis.testVersionComparison = testVersionComparison;
  globalThis.openUpdateNotification = openUpdateNotification;

  console.log('✅ 測試函數已準備就緒');
  console.log('可用函數:');
  console.log('- testUpdateNotification()           測試完整更新觸發流程');
  console.log('- testVersionComparison()            測試版本比較邏輯');
  console.log('- openUpdateNotification(prev, curr) 直接開啟通知小視窗');
})();
