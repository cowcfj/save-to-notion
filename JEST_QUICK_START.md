# Jest 快速測試指南

## 🚀 快速開始

### 運行測試
```bash
npm test                 # 運行所有測試
npm run test:watch       # 監視模式(開發時)
npm run test:coverage    # 帶覆蓋率報告
```

### 查看覆蓋率
```bash
open coverage/lcov-report/index.html
```

## 📁 文件結構

```
tests/
├── mocks/
│   └── chrome.js           # Chrome API 模擬
└── unit/
    └── normalizeUrl.test.js # URL 標準化測試(21個用例)
```

## ✅ 當前狀態

- ✅ **Jest 已安裝**: 324 個依賴包,0 個漏洞
- ✅ **配置完成**: `jest.config.js` 已配置
- ✅ **Chrome API Mock**: 完整模擬 storage, runtime, tabs, action
- ✅ **首個測試套件**: 21/21 測試通過 (normalizeUrl)

## 📝 測試示例

### 基本結構
```javascript
describe('功能模組', () => {
  test('應該正確處理輸入', () => {
    expect(函數(輸入)).toBe(期望輸出);
  });
});
```

### 實際例子 (來自 normalizeUrl.test.js)
```javascript
describe('normalizeUrl', () => {
  describe('移除追蹤參數', () => {
    test('應該移除 utm_source', () => {
      const url = 'https://example.com/page?utm_source=google&id=123';
      const expected = 'https://example.com/page?id=123';
      expect(normalizeUrl(url)).toBe(expected);
    });
  });
});
```

## 🎯 下一步

### 立即可做
1. **重構源碼模組化** (解決覆蓋率 0% 問題)
2. **添加更多測試** (cleanImageUrl, isValidImageUrl, etc.)
3. **設置 CI/CD** (GitHub Actions)

### 模組化重構建議
```javascript
// 選項 1: CommonJS (最簡單)
// 在文件末尾添加
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeUrl };
}

// 選項 2: ES Modules (推薦)
export function normalizeUrl(url) { ... }
```

## 🔗 相關文檔
- `internal/reports/JEST_SETUP_COMPLETE.md` - 完整設置報告
- `jest.config.js` - Jest 配置
- [Jest 官方文檔](https://jestjs.io/)

---
**更新時間**: 2024 (v2.7.3)
