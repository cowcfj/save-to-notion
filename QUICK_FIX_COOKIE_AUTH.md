# 快速修復：強制顯示 Cookie 授權區域

## 🚀 立即解決方案

如果設定頁面仍然沒有顯示「登入 Notion」按鈕，請按照以下步驟操作：

### 步驟 1: 打開瀏覽器控制台
1. 在擴展的選項頁面按 **F12**
2. 切換到 **Console** 標籤

### 步驟 2: 執行修復腳本
複製並貼上以下代碼到控制台，然後按 Enter：

```javascript
// 強制修復 Cookie 授權顯示
(function() {
    console.log('🔧 開始強制修復 Cookie 授權顯示...');
    
    // 1. 檢查並顯示 Cookie 授權區域
    const cookieSection = document.getElementById('cookie-auth-section');
    const manualSection = document.getElementById('manual-auth-section');
    
    if (cookieSection) {
        cookieSection.style.display = 'block';
        console.log('✅ Cookie 授權區域已強制顯示');
    } else {
        console.error('❌ 找不到 Cookie 授權區域');
        return;
    }
    
    if (manualSection) {
        manualSection.style.display = 'none';
        console.log('✅ 手動授權區域已隱藏');
    }
    
    // 2. 設置單選按鈕
    const cookieRadio = document.getElementById('auth-method-cookie');
    const manualRadio = document.getElementById('auth-method-manual');
    
    if (cookieRadio) {
        cookieRadio.checked = true;
        console.log('✅ Cookie 單選按鈕已選中');
    }
    
    if (manualRadio) {
        manualRadio.checked = false;
    }
    
    // 3. 保存設置
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.set({authMethod: 'cookie'}, () => {
            console.log('✅ 授權方式已保存為 Cookie');
        });
    }
    
    // 4. 檢查按鈕是否存在
    const loginButton = document.getElementById('cookie-login-button');
    const checkButton = document.getElementById('cookie-check-button');
    
    if (loginButton) {
        console.log('✅ 找到登入按鈕');
        loginButton.style.display = 'inline-flex';
    } else {
        console.error('❌ 找不到登入按鈕');
    }
    
    if (checkButton) {
        console.log('✅ 找到檢查狀態按鈕');
        checkButton.style.display = 'inline-flex';
    } else {
        console.error('❌ 找不到檢查狀態按鈕');
    }
    
    console.log('🎉 修復完成！您現在應該能看到 Cookie 授權區域和登入按鈕');
})();
```

### 步驟 3: 驗證修復結果
執行腳本後，您應該能看到：
- ✅ 「登入 Notion（推薦）」選項被選中
- ✅ Cookie 授權區域顯示
- ✅ 「登入 Notion」按鈕可見
- ✅ 「檢查授權狀態」按鈕可見

## 🔄 永久修復

如果快速修復有效，請重新載入擴展以應用代碼修復：

1. 打開 `chrome://extensions/`
2. 找到 "Save to Notion (Smart Clipper)" 擴展
3. 點擊重新載入按鈕 (🔄)
4. 重新打開選項頁面

## 🧪 測試功能

修復後，測試以下功能：

1. **點擊「登入 Notion」按鈕**
   - 應該打開新標籤頁到 Notion 登入頁面
   
2. **完成 Notion 登入後**
   - 返回選項頁面
   - 點擊「檢查授權狀態」
   - 應該顯示登入成功狀態

3. **切換授權方式**
   - 點擊「手動 API 金鑰」選項
   - 應該顯示手動設置區域
   - 點擊「登入 Notion（推薦）」選項
   - 應該重新顯示 Cookie 授權區域

## 📋 如果仍然有問題

如果快速修復無效，請檢查：

1. **控制台錯誤信息**
   - 查看是否有 JavaScript 錯誤
   - 特別注意腳本載入錯誤

2. **HTML 結構**
   - 確認 `options/options.html` 文件完整
   - 檢查是否有 `id="cookie-auth-section"` 的元素

3. **擴展權限**
   - 確認擴展有正確的權限
   - 檢查 `manifest.json` 中的權限設置

## 🆘 緊急備用方案

如果所有方法都失敗，您可以：

1. **使用手動 API 設置**
   - 選擇「手動 API 金鑰」方式
   - 按照原有流程設置 API 金鑰

2. **重新安裝擴展**
   - 備份您的設置和標註數據
   - 重新安裝擴展
   - 恢復數據

---

**最後更新**: 2025年10月17日  
**適用版本**: v2.9.5+