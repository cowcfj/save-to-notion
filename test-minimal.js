// 最小化測試用例
global.window = {
  __LOGGER_ENABLED__: 'false',
  __manifestDevCache: { cachedResult: null, cacheEnabled: false },
  location: { href: 'test' }
};

global.chrome = {
  runtime: {
    sendMessage: () => { console.log('sendMessage called!'); },
    getManifest: () => ({ version: '2.10.0' })
  },
  storage: { sync: { get: () => {}, onChanged: { addListener: () => {} } } }
};

// 第一次加載
console.log('1. 第一次加載模組');
let utils = require('./tests/helpers/utils.testable');
console.log('   緩存狀態:', global.window.__manifestDevCache);

// 禁用緩存
console.log('2. 禁用緩存');
utils.__disableManifestCache();
utils.__resetManifestCache();
console.log('   緩存狀態:', global.window.__manifestDevCache);

// 刪除 Logger
console.log('3. 刪除 Logger');
delete global.window.Logger;

// 清除模組緩存
console.log('4. 清除模組緩存');
Object.keys(require.cache).forEach(key => {
  if (key.includes('utils.testable')) {
    delete require.cache[key];
  }
});

// 重新加載
console.log('5. 重新加載模組');
utils = require('./tests/helpers/utils.testable');
console.log('   緩存狀態:', global.window.__manifestDevCache);

// 再次禁用緩存
console.log('6. 再次禁用緩存');
utils.__disableManifestCache();
utils.__resetManifestCache();
console.log('   緩存狀態:', global.window.__manifestDevCache);

// 測試 Logger
console.log('7. 調用 Logger.debug');
let called = false;
global.chrome.runtime.sendMessage = () => { called = true; };
utils.Logger.debug('test');
console.log('   sendMessage 被調用:', called);
console.log(called ? '❌ 測試失敗' : '✅ 測試通過');
