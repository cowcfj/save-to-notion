# Notion Cookie 授權研究

**研究分支**: `research/notion-cookie-auth`  
**研究日期**: 2025年10月17日  
**目標**: 實現基於 cookies 的 Notion 登入授權方式

## 🎯 研究目標

實現類似 "Save to Notion" 擴展的授權方式：
- 用戶直接登入自己的 Notion 帳號
- 通過 cookies 獲取授權
- 無需開發者 API 金鑰
- 用戶可以使用自己的工作區和資料庫

## 📋 Cookie 授權原理分析

### 1. 基本流程
```
用戶點擊登入 → 打開 Notion 登入頁面 → 用戶輸入帳密 
→ Notion 設置 cookies → 擴展讀取 cookies → 使用 cookies 調用 API
```

### 2. 技術實現要點

#### Cookie 管理
- 使用 Chrome `cookies` API 讀取 Notion cookies
- 主要 cookies: `token_v2`, `notion_user_id` 等
- 需要 `cookies` 權限和 `https://www.notion.so/*` host 權限

#### API 調用
- 使用 cookies 而非 Bearer token
- 需要設置正確的 headers 和 cookies
- 可能需要 CSRF token 處理

#### 安全考量
- cookies 有效期管理
- 跨域請求處理
- 用戶隱私保護

## 🔍 現有實現分析

從項目文件中發現已有相關實現：

### 已存在的 Cookie 授權文件
- `scripts/notion-cookie-auth.js` - Cookie 授權核心邏輯
- `options/options-cookie-auth.js` - Cookie 授權 UI
- `options/options-cookie-auth.html` - Cookie 授權頁面
- `COOKIE_AUTH_IMPLEMENTATION_COMPLETE.md` - 實現完成報告

### 混合授權系統
- `scripts/hybrid-auth-manager.js` - 混合授權管理器
- 支援 OAuth 和 Cookie 兩種方式

## 📊 實現方案

### 方案 1: 純 Cookie 授權
```javascript
// 1. 打開 Notion 登入頁面
chrome.tabs.create({
    url: 'https://www.notion.so/login'
});

// 2. 監聽登入完成
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url.includes('notion.so') && changeInfo.status === 'complete') {
        // 檢查是否已登入
        checkNotionLogin(tabId);
    }
});

// 3. 讀取 cookies
async function getNotionCookies() {
    const cookies = await chrome.cookies.getAll({
        domain: '.notion.so'
    });
    return cookies;
}

// 4. 使用 cookies 調用 API
async function callNotionAPI(endpoint, options = {}) {
    const cookies = await getNotionCookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    return fetch(`https://www.notion.so/api/v3/${endpoint}`, {
        ...options,
        headers: {
            'Cookie': cookieString,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
}
```

### 方案 2: 混合授權系統
- 優先使用 Cookie 授權
- 回退到手動 API 金鑰
- 提供用戶選擇

## 🛠️ 實現步驟

### 第一步: 分析現有實現
檢查已存在的 cookie 授權代碼，了解當前實現狀態

### 第二步: 完善 Cookie 授權
- 改進登入流程
- 優化 cookie 管理
- 增強錯誤處理

### 第三步: 整合到主系統
- 更新 background.js
- 修改 options 頁面
- 測試完整流程

### 第四步: 用戶體驗優化
- 簡化登入流程
- 添加狀態指示
- 提供故障排除

## 🔧 技術挑戰

### 1. Cookie 有效性檢測
- 如何判斷 cookies 是否有效
- 處理 cookies 過期情況
- 自動重新登入機制

### 2. API 相容性
- Notion 內部 API 可能變化
- 需要處理不同的 API 版本
- 錯誤處理和重試機制

### 3. 安全性
- 保護用戶 cookies
- 防止 CSRF 攻擊
- 安全的 cookie 儲存

## 📝 下一步行動

1. **檢查現有實現**: 分析已有的 cookie 授權代碼
2. **測試登入流程**: 驗證 Notion 登入和 cookie 獲取
3. **API 調用測試**: 使用 cookies 調用 Notion API
4. **整合優化**: 將 cookie 授權整合到主系統
5. **用戶測試**: 進行完整的用戶體驗測試

---

**研究重點**: 基於 cookies 的授權方式更符合用戶需求，讓用戶可以使用自己的 Notion 帳號和工作區。