/**
 * utils.js 測試包裝器
 * 使 utils.js 可以在 Node.js/Jest 環境中被導入並正確追蹤覆蓋率
 */

// 設置必要的全局變量
if (typeof window === 'undefined') {
  global.window = {
    StorageUtil: undefined,
    location: {
      href: 'https://example.com'
    }
  };
}

// 讀取並執行 utils.js
const fs = require('fs');
const path = require('path');
const utilsPath = path.join(__dirname, '../../scripts/utils.js');

// 使用 vm 模塊在受控環境中執行代碼，這樣可以被覆蓋率工具追蹤
const vm = require('vm');
const utilsCode = fs.readFileSync(utilsPath, 'utf8');

// 創建沙箱環境
const sandbox = {
  console,
  window: global.window,
  chrome: global.chrome,
  localStorage: global.localStorage,
  URL: global.URL || require('url').URL,
  // 導出這些函數供測試使用
  normalizeUrl: undefined,
  StorageUtil: undefined
};

// 在沙箱中執行代碼
vm.createContext(sandbox);

// 修改 utils.js 代碼，在結尾添加導出
const modifiedCode = utilsCode + `
// 測試環境導出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeUrl: typeof normalizeUrl !== 'undefined' ? normalizeUrl : null,
    StorageUtil: typeof window !== 'undefined' && window.StorageUtil ? window.StorageUtil : null
  };
}
`;

try {
  vm.runInContext(modifiedCode, sandbox, {
    filename: 'utils.js',
    displayErrors: true
  });
} catch (error) {
  console.error('Failed to execute utils.js:', error);
}

// 導出函數
module.exports = {
  normalizeUrl: sandbox.normalizeUrl || global.normalizeUrl,
  StorageUtil: sandbox.window.StorageUtil || global.window.StorageUtil
};
