# 統一常量配置系統

## 📋 概述

本目錄包含項目的所有常量配置，集中管理以提高可維護性和一致性。

## 🎯 設計目標

1. **集中管理**：所有常量集中在一個位置，便於查找和修改
2. **環境安全**：純 ES6 模組，不依賴 `window` 或 `document`
3. **多環境支持**：支持 Content Script、Background Script 和測試環境
4. **功能開關**：支持漸進式發布和快速功能切換

## 📁 檔案結構

```
scripts/config/
├── index.js           # 統一導出入口
├── constants.js       # 通用靜態常量
├── selectors.js       # DOM 選擇器配置
├── patterns.js        # 正則表達式模式
├── features.js        # 功能開關
├── env.js             # 環境檢測
└── README.md          # 本文件
```

## 📦 模組說明

### constants.js

包含所有通用靜態常量：

- 圖片驗證相關（URL 長度、協議、擴展名等）
- 內容質量評估（最小長度、鏈接密度）
- Notion API 配置（版本、速率限制、批次大小）
- 日誌系統級別

### selectors.js

集中管理 DOM 選擇器：

- 封面圖選擇器
- 文章區域選擇器
- 排除選擇器（廣告、導航等）
- CMS 特定選擇器（WordPress、Drupal 等）

### patterns.js

正則表達式和模式配置：

- 列表處理模式
- 圖片屬性列表
- 佔位符關鍵字

### features.js

功能開關配置：

- 核心功能開關（標註系統、批量處理等）
- 性能優化開關
- 實驗性功能開關

### env.js

環境檢測工具：

- 運行環境檢測（Background/Content/Node）
- 開發/生產模式檢測
- 環境選擇器工具函數

## 🚀 使用方式

### 在 ES6 模組中使用

```javascript
// 導入所有配置
import * as Config from './config/index.js';

// 或導入特定配置
import {
  IMAGE_VALIDATION_CONSTANTS,
  FEATURED_IMAGE_SELECTORS,
  FEATURE_FLAGS,
} from './config/index.js';

// 使用配置
if (url.length > Config.IMAGE_VALIDATION_CONSTANTS.MAX_URL_LENGTH) {
  // 處理URL過長
}
```

### 在傳統腳本中使用

**注意**：當前項目的 `content.js` 和 `background.js` 使用傳統腳本模式（非 ES6 模組）。為了在這些文件中使用配置，有兩種方案：

#### 方案 A：暫時保留重複定義

在過渡期間，在傳統腳本中保留常量定義，並添加註釋指向配置模組：

```javascript
// ⚠️ 注意：此常量定義與 scripts/config/constants.js 保持同步
// 未來遷移到 ES6 模組時，應從配置模組導入
const IMAGE_VALIDATION_CONSTANTS = {
  MAX_URL_LENGTH: 1500,
  // ...
};
```

#### 方案 B：創建 UMD 橋接文件

創建一個 UMD 格式的橋接文件，同時支持 ES6 模組和全局變數：

```javascript
// scripts/config/config.umd.js
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NotionConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // 從 ES6 模組導入所有配置
  // ...
});
```

## 🔄 遷移計畫

### 階段 1：建立配置模組 ✅

- [x] 創建 `scripts/config/` 目錄
- [x] 實現所有配置模組
- [x] 編寫文檔

### 階段 2：測試環境遷移 ✅

- [x] 更新測試文件使用配置模組
- [x] 確保所有測試通過

### 階段 3：工具模組遷移 ✅

- [x] 遷移獨立的工具模組（如 Logger.js）
- [x] 驗證功能正常

### 階段 4：主腳本遷移 ✅

- [x] 重構 `content.js` 為 ES6 模組 (已歸檔 legacy，啟用 modular scripts)
- [x] 重構 `background.js` 為 ES6 模組
- [x] 更新 manifest.json 配置

### 階段 5：清理 ✅

- [x] 移除所有重複的常量定義
- [x] 更新文檔
- [x] 性能驗證

## ⚠️ 重要約束

### 1. 純 ES6 模組

`scripts/config/` 下的所有文件必須為純 ES6 模組：

- ✅ 可以：使用 `export` 和 `import`
- ❌ 禁止：訪問 `window`、`document` 等全局對象
- ❌ 禁止：導入其他項目模組（避免循環依賴）

### 2. 環境檢測

需要環境檢測時使用 `env.js` 中的安全檢測函數：

```javascript
// ✅ 正確
import { isExtensionContext } from './config/env.js';
if (isExtensionContext()) {
  // ...
}

// ❌ 錯誤
if (typeof chrome !== 'undefined') {
  // 不要在模組頂層直接檢測
  // ...
}
```

### 3. 循環依賴預防

`scripts/config/` 必須作為依賴圖的葉子節點：

- ✅ 可以：其他模組導入配置
- ❌ 禁止：配置模組導入項目的其他模組

## 📝 添加新配置

1. 確定配置類型（常量/選擇器/模式/功能開關）
2. 在對應文件中添加配置
3. 添加 JSDoc 註釋說明用途
4. 更新 `index.js` 導出（如果是新文件）
5. 更新本 README 文檔

## 🧪 測試

配置模組的測試應該驗證：

1. 所有導出的常量值正確
2. 環境檢測函數在不同環境下工作正常
3. 功能開關可以正確切換

## 🔗 相關文檔

- [配置管理計畫](../../internal/specs/CONFIGURATION_MANAGEMENT_PLAN.md)
- [實施計畫](~/.gemini/antigravity/brain/implementation_plan.md)
- [AGENTS.md](../../AGENTS.md)

## 💡 最佳實踐

1. **保持同步**：如果暫時在多處維護相同常量，使用註釋標記並定期同步
2. **語義化命名**：使用清晰、描述性的常量名稱
3. **分組組織**：相關常量放在一起，使用註釋分隔不同組
4. **文檔註釋**：為每個常量添加清晰的註釋說明用途和單位
5. **版本控制**：修改配置時在 CHANGELOG 中記錄
