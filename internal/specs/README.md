# internal/specs/ - 技術規格與文檔

**用途**: 存放所有技術規格、計劃、方案和說明文檔

---

## 📋 目錄說明

這個目錄包含項目的技術文檔，無論功能是否已實現。

### 為什麼不分開 specs 和 docs？

**原因**: 避免不必要的文件遷移
- ✅ 功能規格在實現前後都保留在同一位置
- ✅ 不需要在實現後移動文件
- ✅ 更簡單、更直觀的文檔管理

---

## 📁 文檔類型

### 1. **功能規格** (Specifications)
**特徵**:
- 描述計劃實現的功能
- 包含需求、設計、實施計劃
- 可能尚未實現

**範例**:
- `GOOGLE_DRIVE_BACKUP_SPEC.md` - Google Drive 備份功能規格
- `HIGHLIGHTER_UPGRADE_PLAN.md` - 標註系統升級計劃

### 2. **技術方案** (Solutions)
**特徵**:
- 解決特定技術問題的方案
- 包含問題分析、方案比較、實施步驟
- 可能已實現或部分實現

**範例**:
- `MCP_SYNC_SOLUTION.md` - MCP 配置同步方案
- `SEAMLESS_MIGRATION.md` - 無縫遷移方案

### 3. **技術說明** (Documentation)
**特徵**:
- 解釋技術原理或架構
- 提供技術背景知識
- 長期參考文檔

**範例**:
- `UPGRADE_DATA_SAFETY.md` - 數據安全性說明
- `MIGRATION_GUIDE.md` - 遷移指南

### 4. **實施計劃** (Plans)
**特徵**:
- 具體的實施步驟和時間表
- 可能包含多個階段
- 追蹤實施進度

**範例**:
- `IMMEDIATE_ACTION_PLAN.md` - 立即行動計劃
- `LOGGER_OPTIMIZATION_PLAN.md` - 日誌優化計劃

---

## 🎯 文檔狀態標記

建議在文檔開頭標記狀態：

### 未實現的功能
```markdown
**狀態**: 📋 規劃中  
**版本**: 計劃在 v2.9.0 實現
```

### 已實現的功能
```markdown
**狀態**: ✅ 已實現  
**版本**: v2.8.0 實現
```

### 部分實現的功能
```markdown
**狀態**: 🔄 部分實現  
**版本**: v2.8.0 實現基礎功能，v2.9.0 計劃完整實現
```

---

## 📊 與其他目錄的區別

### `internal/specs/` vs `internal/guides/`

| 特徵 | internal/specs/ | internal/guides/ |
|------|----------------|------------------|
| **內容** | 技術規格、方案、說明 | 使用指南、流程文檔 |
| **目的** | 描述"是什麼"和"怎麼做" | 教導"如何使用" |
| **讀者** | 開發者、技術人員 | 用戶、開發者 |
| **時效** | 可能過時（實現後） | 長期有效 |
| **範例** | 功能規格、技術方案 | MCP 使用指南、發布流程 |

### `internal/specs/` vs `.kiro/specs/`

| 特徵 | internal/specs/ | .kiro/specs/ |
|------|----------------|--------------|
| **用途** | 通用技術文檔 | Kiro IDE 專用規格 |
| **格式** | 自由格式 | 結構化（requirements/design/tasks） |
| **工具** | 任何編輯器 | Kiro IDE |
| **範例** | 功能規格、技術方案 | test-coverage-improvement/ |

### `internal/specs/` vs `internal/reports/`

| 特徵 | internal/specs/ | internal/reports/ |
|------|----------------|-------------------|
| **時間** | 面向未來或當前 | 記錄過去 |
| **內容** | 規格、方案、說明 | 工作報告、完成記錄 |
| **更新** | 可能持續更新 | 通常不更新 |
| **命名** | 描述性名稱 | 日期前綴 (YYYYMMDD_) |

---

## 🔄 文檔生命週期

### 1. 規劃階段
```
創建規格文檔 → internal/specs/FEATURE_SPEC.md
狀態: 📋 規劃中
```

### 2. 實施階段
```
更新規格文檔 → 添加實施細節
狀態: 🔄 實施中
```

### 3. 完成階段
```
更新規格文檔 → 標記為已實現
狀態: ✅ 已實現
文件位置: 保持在 internal/specs/ (不需要移動)
```

### 4. 過時階段
```
如果功能被移除或完全重寫：
移動到 archive/specs/
```

---

## 📝 創建新文檔的指南

### 1. 選擇合適的文件名
- 使用描述性名稱
- 使用大寫字母和下劃線
- 添加類型後綴（_SPEC, _PLAN, _GUIDE）

**範例**:
- `FEATURE_NAME_SPEC.md` - 功能規格
- `PROBLEM_SOLUTION.md` - 技術方案
- `TOPIC_GUIDE.md` - 技術指南

### 2. 包含必要的元數據
```markdown
# 文檔標題

**狀態**: 📋 規劃中 / 🔄 實施中 / ✅ 已實現  
**創建日期**: YYYY-MM-DD  
**最後更新**: YYYY-MM-DD  
**相關版本**: vX.X.X  
**作者**: [Your Name]
```

### 3. 使用清晰的結構
- 問題/背景
- 目標/需求
- 方案/設計
- 實施步驟
- 測試計劃
- 參考資料

---

## 🔍 查找文檔

### 按狀態查找
```bash
# 查找規劃中的功能
grep -l "📋 規劃中" internal/specs/*.md

# 查找已實現的功能
grep -l "✅ 已實現" internal/specs/*.md
```

### 按類型查找
```bash
# 查找規格文檔
ls internal/specs/*_SPEC.md

# 查找計劃文檔
ls internal/specs/*_PLAN.md

# 查找方案文檔
ls internal/specs/*_SOLUTION.md
```

---

## 📚 相關目錄

- **internal/guides/** - 使用指南和流程文檔
- **internal/reports/** - 工作報告和歷史記錄
- **.kiro/specs/** - Kiro IDE 專用規格
- **archive/specs/** - 過時的規格文檔

---

**最後更新**: 2025-10-07  
**維護者**: 項目團隊
