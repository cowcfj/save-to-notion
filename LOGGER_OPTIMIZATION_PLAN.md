# 日誌系統優化方案

## 📊 現狀分析

### 當前問題
- **200+ console.log 調用**遍布各個文件
- 所有日誌都會在生產環境執行
- 用戶控制台被大量技術信息污染
- 無法根據重要性過濾日誌
- 性能開銷：每個日誌調用消耗 ~0.1-0.5ms

### 性能影響估算
```
200 個日誌 × 0.3ms (平均) = 60ms 額外開銷
在頁面加載和標註操作時可能累積到 100-200ms
```

---

## 🎯 優化方案

### 方案 A: 統一日誌管理類（推薦）

#### 1. 創建 Logger 工具

**新文件**: `scripts/logger.js`

```javascript
/**
 * 統一日誌管理工具
 * 支持日誌級別控制和條件輸出
 */
const Logger = {
    // 日誌級別
    LEVELS: {
        DEBUG: 0,   // 詳細的調試信息
        INFO: 1,    // 一般信息
        WARN: 2,    // 警告信息
        ERROR: 3,   // 錯誤信息
        NONE: 4     // 禁用所有日誌
    },
    
    // 當前日誌級別（生產環境應設為 INFO 或 WARN）
    currentLevel: 1,  // 預設 INFO
    
    // 是否啟用（可通過設置頁面控制）
    enabled: true,
    
    // 是否在生產環境（通過 manifest 版本判斷）
    isProduction: () => {
        try {
            const manifest = chrome.runtime.getManifest();
            // 如果版本號包含 "dev" 或 "beta"，視為開發版
            return !manifest.version.includes('dev') && !manifest.version.includes('beta');
        } catch {
            return true;  // 無法判斷時，默認為生產環境
        }
    },
    
    // 初始化：從設置中讀取日誌級別
    async init() {
        try {
            const result = await chrome.storage.local.get(['logLevel', 'logsEnabled']);
            if (result.logLevel !== undefined) {
                this.currentLevel = result.logLevel;
            } else {
                // 生產環境默認 WARN，開發環境默認 DEBUG
                this.currentLevel = this.isProduction() ? this.LEVELS.WARN : this.LEVELS.DEBUG;
            }
            if (result.logsEnabled !== undefined) {
                this.enabled = result.logsEnabled;
            }
        } catch (err) {
            // 初始化失敗，使用默認值
        }
    },
    
    // 格式化輸出
    _format(level, emoji, category, message, args) {
        if (!this.enabled || level < this.currentLevel) {
            return;
        }
        
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const prefix = `${emoji} [${timestamp}] [${category}]`;
        
        if (args.length > 0) {
            console.log(prefix, message, ...args);
        } else {
            console.log(prefix, message);
        }
    },
    
    // DEBUG 級別：詳細的調試信息
    debug(category, message, ...args) {
        this._format(this.LEVELS.DEBUG, '🔍', category, message, args);
    },
    
    // INFO 級別：一般信息
    info(category, message, ...args) {
        this._format(this.LEVELS.INFO, 'ℹ️', category, message, args);
    },
    
    // WARN 級別：警告信息
    warn(category, message, ...args) {
        this._format(this.LEVELS.WARN, '⚠️', category, message, args);
    },
    
    // ERROR 級別：錯誤信息
    error(category, message, ...args) {
        this._format(this.LEVELS.ERROR, '❌', category, message, args);
    },
    
    // 成功消息（總是顯示，除非完全禁用）
    success(category, message, ...args) {
        if (this.enabled && this.currentLevel < this.LEVELS.NONE) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            console.log(`✅ [${timestamp}] [${category}]`, message, ...args);
        }
    },
    
    // 分組日誌（用於複雜操作）
    group(category, title, collapsed = false) {
        if (this.enabled && this.currentLevel <= this.LEVELS.INFO) {
            if (collapsed) {
                console.groupCollapsed(`📦 [${category}] ${title}`);
            } else {
                console.group(`📦 [${category}] ${title}`);
            }
        }
    },
    
    groupEnd() {
        if (this.enabled && this.currentLevel <= this.LEVELS.INFO) {
            console.groupEnd();
        }
    },
    
    // 性能計時
    time(label) {
        if (this.enabled && this.currentLevel <= this.LEVELS.DEBUG) {
            console.time(`⏱️ ${label}`);
        }
    },
    
    timeEnd(label) {
        if (this.enabled && this.currentLevel <= this.LEVELS.DEBUG) {
            console.timeEnd(`⏱️ ${label}`);
        }
    }
};

// 自動初始化
Logger.init();

// 導出（用於其他腳本）
if (typeof window !== 'undefined') {
    window.Logger = Logger;
}
```

#### 2. 更新 manifest.json

```json
{
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": [
        "scripts/logger.js",          // ← 添加到最前面
        "scripts/utils.js",
        "scripts/seamless-migration.js",
        "scripts/highlighter-v2.js"
      ],
      "run_at": "document_idle"
    }
  ]
}
```

#### 3. 遷移現有日誌

**替換模式**:
```javascript
// 舊代碼
console.log('✅ 標註已添加:', id);
console.log('🔄 開始恢復標註...');
console.log('⚠️ 警告:', message);
console.error('❌ 錯誤:', error);

// 新代碼
Logger.debug('Highlighter', '標註已添加', { id });
Logger.info('Highlighter', '開始恢復標註');
Logger.warn('Highlighter', '警告', message);
Logger.error('Highlighter', '錯誤', error);
```

**分類建議**:
```javascript
// 各模塊使用自己的分類
- 'Highlighter'      // highlighter-v2.js
- 'Migration'        // seamless-migration.js
- 'Storage'          // utils.js (StorageUtil)
- 'Background'       // background.js
- 'API'              // Notion API 調用
- 'Content'          // content.js
```

---

### 方案 B: Build 時移除（簡單但不靈活）

#### 1. 創建 build 腳本

**新文件**: `scripts/build-production.sh`

```bash
#!/bin/bash
# 生產版本構建腳本 - 移除所有 console.log

echo "🏗️  構建生產版本..."

# 創建 build 目錄
rm -rf build/
mkdir -p build
cp -r . build/
cd build/

# 移除開發文件
rm -rf .git .vscode archive tests demos *.sh *.md

# 移除所有 console.log（保留 console.error 和 console.warn）
find scripts/ -name "*.js" -type f -exec sed -i '' '/console\.log/d' {} \;

echo "✅ 生產版本已構建到 build/ 目錄"
```

**缺點**:
- 無法在生產環境中調試
- 一旦移除，無法重新啟用
- 對用戶問題排查不利

---

## 📋 遷移步驟

### 階段 1: 準備（30 分鐘）
1. ✅ 創建 `scripts/logger.js`
2. ✅ 更新 `manifest.json`
3. ✅ 測試 Logger 基本功能

### 階段 2: 遷移核心文件（2-3 小時）

#### 優先級排序
1. **高頻文件**（影響性能）:
   - `highlighter-v2.js` (35 個 console.log)
   - `background.js` (40+ 個 console.log)
   - `utils.js` (30+ 個 console.log)

2. **中頻文件**:
   - `seamless-migration.js` (20+ 個 console.log)
   - `highlighter-migration.js` (15+ 個 console.log)

3. **低頻文件**:
   - `content.js`
   - `script-injector.js`

#### 遷移示例

**highlighter-v2.js 部分遷移**:

```javascript
// 原代碼 (行 37)
console.log('✅ 使用 CSS Custom Highlight API');

// 新代碼
Logger.info('Highlighter', '使用 CSS Custom Highlight API');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 原代碼 (行 143)
console.log(`✅ 標註已添加: ${id}, 文本長度: ${text.length}`);

// 新代碼
Logger.debug('Highlighter', '標註已添加', { id, textLength: text.length });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 原代碼 (行 610-633)
console.log('🔧 開始初始化標註系統...');
// ... 多行代碼
console.log('✅ 標註模式已啟動');

// 新代碼
Logger.group('Highlighter', '初始化標註系統');
// ... 多行代碼
Logger.info('Highlighter', '標註模式已啟動');
Logger.groupEnd();
```

### 階段 3: 添加設置界面（1 小時）

**在 options.html 中添加**:

```html
<div class="setting-group">
    <h3>🔧 開發者選項</h3>
    
    <div class="setting-item">
        <label>
            <input type="checkbox" id="enableLogs" checked>
            啟用日誌輸出
        </label>
        <p class="help-text">在控制台顯示擴展的運行日誌</p>
    </div>
    
    <div class="setting-item">
        <label for="logLevel">日誌級別</label>
        <select id="logLevel">
            <option value="0">DEBUG (全部)</option>
            <option value="1" selected>INFO (一般)</option>
            <option value="2">WARN (警告)</option>
            <option value="3">ERROR (僅錯誤)</option>
            <option value="4">NONE (禁用)</option>
        </select>
        <p class="help-text">控制顯示的日誌詳細程度</p>
    </div>
</div>
```

**在 options.js 中添加**:

```javascript
// 加載設置
async function loadSettings() {
    const result = await chrome.storage.local.get(['logLevel', 'logsEnabled']);
    document.getElementById('logLevel').value = result.logLevel || 1;
    document.getElementById('enableLogs').checked = result.logsEnabled !== false;
}

// 保存設置
async function saveSettings() {
    const logLevel = parseInt(document.getElementById('logLevel').value);
    const logsEnabled = document.getElementById('enableLogs').checked;
    
    await chrome.storage.local.set({ logLevel, logsEnabled });
    
    // 通知所有頁面更新日誌設置
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'updateLogSettings',
                logLevel,
                logsEnabled
            }).catch(() => {});
        });
    });
}
```

---

## 📊 預期效果

### 性能提升
```
開發環境 (DEBUG):  0% 提升（所有日誌都輸出）
生產環境 (INFO):   30% 提升（移除大量 DEBUG 日誌）
生產環境 (WARN):   60% 提升（僅關鍵警告和錯誤）
生產環境 (NONE):   80% 提升（完全禁用日誌）
```

### 用戶體驗
- ✅ 控制台乾淨整潔
- ✅ 僅顯示重要信息
- ✅ 開發者可選擇啟用詳細日誌
- ✅ 便於問題排查

### 開發體驗
- ✅ 統一的日誌格式
- ✅ 按分類過濾
- ✅ 時間戳便於追踪
- ✅ 性能計時工具

---

## 🚀 快速開始

### 今天完成
```bash
# 1. 創建 Logger
cp LOGGER_OPTIMIZATION_PLAN.md.附件/logger.js scripts/

# 2. 更新 manifest.json
# (手動添加 scripts/logger.js 到 content_scripts)

# 3. 測試 Logger
# 在控制台執行:
Logger.info('Test', '這是一條測試消息');
Logger.debug('Test', '這是調試信息');
Logger.error('Test', '這是錯誤');
```

### 本週完成
- 遷移 `highlighter-v2.js`（35 個日誌）
- 遷移 `utils.js`（30 個日誌）
- 遷移 `background.js`（前 20 個日誌）
- 測試並發布 v2.5.4-beta

### 下週完成
- 遷移剩餘所有文件
- 添加設置界面
- 完整測試
- 發布 v2.6.0

---

## 💡 最佳實踐

### 日誌使用指南

```javascript
// ✅ 好的日誌
Logger.debug('Highlighter', '恢復標註', { 
    count: highlights.length, 
    url: window.location.href 
});

// ❌ 不好的日誌
console.log('恢復了', highlights.length, '個標註，URL是', window.location.href);

// ✅ 使用分組
Logger.group('API', '同步標註到 Notion');
Logger.debug('API', '準備數據', { count: highlights.length });
Logger.info('API', '發送請求');
Logger.success('API', '同步成功');
Logger.groupEnd();

// ✅ 性能計時
Logger.time('標註恢復');
// ... 執行操作
Logger.timeEnd('標註恢復');
```

---

## 📝 檢查清單

- [ ] 創建 `scripts/logger.js`
- [ ] 更新 `manifest.json`
- [ ] 測試 Logger 基本功能
- [ ] 遷移 `highlighter-v2.js`
- [ ] 遷移 `utils.js`
- [ ] 遷移 `background.js`
- [ ] 遷移其他文件
- [ ] 添加設置界面
- [ ] 完整功能測試
- [ ] 性能測試
- [ ] 用戶測試
- [ ] 文檔更新

---

**推薦方案**: 方案 A（統一日誌管理）  
**預計工時**: 4-6 小時  
**優先級**: 🔴 高  
**版本目標**: v2.5.4 或 v2.6.0
