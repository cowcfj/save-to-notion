# Cookie 授權功能故障排除指南

**問題**: 設定頁面沒有顯示「登入 Notion」按鈕

## 🔍 診斷步驟

### 1. 檢查瀏覽器控制台
1. 打開擴展的選項頁面
2. 按 F12 打開開發者工具
3. 切換到 Console 標籤
4. 查看是否有錯誤信息

**預期看到的日誌**:
```
🔄 開始載入 Cookie 授權模組...
📜 載入腳本: ../scripts/notion-cookie-auth.js
📜 腳本載入完成，檢查 NotionCookieAuth 類...
✅ Cookie 授權模組載入成功
🔍 檢查授權狀態和載入設置...
📋 載入的設置: {authMethod: "cookie", ...}
🎯 設置授權方式為: cookie
🔄 切換授權方式到: cookie
🍪 顯示 Cookie 授權區域
✅ Cookie 授權區域已顯示
```

### 2. 檢查腳本載入錯誤
如果看到以下錯誤:
```
❌ Cookie 授權模組載入失敗: Error: ...
```

**解決方案**:
1. 確保 `scripts/notion-cookie-auth.js` 文件存在
2. 檢查文件路徑是否正確
3. 重新載入擴展

### 3. 檢查 DOM 元素
如果看到以下錯誤:
```
❌ 找不到 Cookie 授權區域元素
```

**解決方案**:
1. 檢查 `options/options.html` 中是否有 `id="cookie-auth-section"` 的元素
2. 確保 HTML 結構完整

### 4. 檢查授權方式設置
如果授權方式沒有正確切換到 Cookie:

**手動設置**:
1. 打開瀏覽器控制台
2. 執行以下命令:
```javascript
chrome.storage.sync.set({authMethod: 'cookie'}, () => {
    console.log('授權方式已設置為 Cookie');
    location.reload();
});
```

## 🛠️ 快速修復

### 方法 1: 重新載入擴展
1. 打開 `chrome://extensions/`
2. 找到 "Save to Notion (Smart Clipper)" 擴展
3. 點擊重新載入按鈕 (🔄)
4. 重新打開選項頁面

### 方法 2: 清除設置並重置
1. 打開瀏覽器控制台
2. 執行以下命令清除設置:
```javascript
chrome.storage.sync.clear(() => {
    console.log('設置已清除');
    location.reload();
});
```

### 方法 3: 使用調試工具
1. 打開 `test-options-debug.html` 文件
2. 執行各項檢查
3. 根據結果進行相應修復

## 🔧 手動啟用 Cookie 授權區域

如果所有方法都失敗，可以手動啟用:

1. 打開選項頁面
2. 按 F12 打開控制台
3. 執行以下代碼:

```javascript
// 手動顯示 Cookie 授權區域
const cookieSection = document.getElementById('cookie-auth-section');
if (cookieSection) {
    cookieSection.style.display = 'block';
    console.log('✅ Cookie 授權區域已手動顯示');
} else {
    console.error('❌ 找不到 Cookie 授權區域');
}

// 隱藏手動授權區域
const manualSection = document.getElementById('manual-auth-section');
if (manualSection) {
    manualSection.style.display = 'none';
}

// 設置單選按鈕
const cookieRadio = document.getElementById('auth-method-cookie');
if (cookieRadio) {
    cookieRadio.checked = true;
}
```

## 📋 常見問題

### Q: 為什麼腳本載入失敗？
A: 可能的原因:
- 文件路徑不正確
- 文件不存在
- 權限問題
- 擴展未正確安裝

### Q: 為什麼 DOM 元素找不到？
A: 可能的原因:
- HTML 文件不完整
- 元素 ID 不匹配
- 頁面載入順序問題

### Q: 如何確認 Cookie 授權功能正常？
A: 檢查步驟:
1. 確保能看到「登入 Notion」按鈕
2. 點擊按鈕能打開 Notion 登入頁面
3. 登入後能檢查到授權狀態
4. 能載入和選擇資料庫

## 🚀 驗證修復

修復後，應該能看到:
1. ✅ 授權方式選擇器顯示兩個選項
2. ✅ 默認選中「登入 Notion（推薦）」
3. ✅ 顯示 Cookie 授權區域
4. ✅ 看到「登入 Notion」按鈕
5. ✅ 控制台沒有錯誤信息

## 📞 獲取幫助

如果問題仍然存在:
1. 收集控制台錯誤信息
2. 檢查擴展版本和瀏覽器版本
3. 嘗試在無痕模式下測試
4. 檢查是否有其他擴展衝突

---

**最後更新**: 2025年10月17日  
**適用版本**: v2.9.5+