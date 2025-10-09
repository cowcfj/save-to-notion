# 📦 Notion Smart Clipper v2.8.3 發布說明

> 發布日期：2025-01-09  
> 版本類型：功能增強 + 代碼質量改進

## ✨ 版本亮點

### 🔧 代碼質量全面提升
- **可選鏈結優化**：使用現代 JavaScript 語法 `?.`、`?.()`、`?.[]` 替代傳統 `&&` 判斷
- **錯誤處理改善**：替換空 catch 塊為有意義的錯誤日誌，提升調試體驗
- **代碼可讀性**：統一代碼風格，提升維護性

### 🖼️ 圖片擷取能力大幅增強
- **智能 srcset 解析**：優先選擇最大寬度（w 描述符）的響應式圖片
- **擴展懶加載支持**：新增支持 `data-actualsrc`、`data-src-original`、`data-echo`、`data-href`、`data-large`、`data-bigsrc` 等屬性
- **背景圖回退機制**：當無 img 標籤時，自動提取 CSS 背景圖（包括父節點）
- **noscript 回退機制**：從 `<noscript>` 標籤中提取圖片 URL 作為最後回退

### 🛡️ 工具欄穩定性增強
- **MutationObserver 自動恢復**：工具欄被移除時自動重新掛載
- **樣式保護機制**：維持關鍵樣式與 z-index，避免被頁面覆蓋
- **長頁面優化**：解決長頁面滾動時工具欄失聯問題

## 🔍 詳細改進

### 代碼現代化
```javascript
// 舊寫法
if (imgNode.parentElement && imgNode.parentElement.nodeName === 'PICTURE') {

// 新寫法
if (imgNode.parentElement?.nodeName === 'PICTURE') {
```

### 圖片擷取增強
- **srcset 智能解析**：從 `srcset="image-400w.jpg 400w, image-800w.jpg 800w, image-1200w.jpg 1200w"` 中自動選擇 `image-1200w.jpg`
- **懶加載屬性擴展**：支持更多網站的懶加載實現方案
- **多層回退機制**：img src → data-* 屬性 → srcset → 背景圖 → noscript

### 錯誤處理改善
```javascript
// 舊寫法
try {
    // 代碼
} catch (e) { /* empty */ }

// 新寫法
try {
    // 代碼
} catch (e) {
    console.debug('Background image extraction failed:', e.message);
}
```

## 🧪 測試覆蓋

- ✅ **796 個單元測試**全部通過
- ✅ **CI/CD 流水線**通過（Node.js 18.x & 20.x）
- ✅ **代碼覆蓋率**維持在 24%+ 水平
- ✅ **瀏覽器兼容性**測試通過

## 🌐 支持的網站類型

### 新增支持
- **響應式圖片網站**：自動選擇最高解析度版本
- **懶加載網站**：Medium、知乎、微信公眾號等
- **CSS 背景圖網站**：卡片式佈局、Hero 區塊等
- **noscript 回退網站**：SEO 優化的圖片展示

### 持續支持
- 所有主流新聞網站
- 部落格平台
- 電商網站
- 社交媒體平台

## 🔄 升級指南

### 自動更新
- Chrome 擴展會在 24-48 小時內自動更新
- 無需手動操作，所有設定保持不變

### 手動更新
1. 前往 [Chrome Web Store](https://chrome.google.com/webstore)
2. 搜尋 "Notion Smart Clipper"
3. 點擊「更新」按鈕

## 🐛 已知問題修復

- 修復某些網站圖片無法正確擷取的問題
- 修復工具欄在長頁面中可能失聯的問題
- 修復代碼中的潛在空指針異常
- 改善錯誤日誌的可讀性

## 🔮 下一版本預告

- 更多圖片格式支持（WebP、AVIF）
- 批量標註功能
- 自定義標註樣式
- 離線模式支持

## 📞 技術支持

- **GitHub Issues**：[提交問題](https://github.com/cowcfj/save-to-notion/issues)
- **功能建議**：歡迎在 GitHub 討論區分享想法
- **使用教學**：查看 [README.md](https://github.com/cowcfj/save-to-notion/blob/main/README.md)

---

**感謝所有用戶的支持與反饋！** 🙏

這個版本整合了社群的建議，大幅提升了代碼質量和功能穩定性。我們會持續改進，為大家提供更好的 Notion 整合體驗。