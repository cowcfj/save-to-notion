# 📋 GOALS.md 與 internal/specs/ 聯動規範

**文檔性質：** 內部指南（不同步到 GitHub）  
**創建日期：** 2025-10-07  
**最後更新：** 2025-10-07

---

## 🎯 目的

建立 `internal/guides/GOALS.md` 和 `internal/specs/` 之間的明確聯動機制，確保戰略目標和技術規範保持同步。

---

## 📊 三層文檔體系

### 層級關係

```
internal/guides/GOALS.md (戰略層)
    ↓ 分解為
internal/specs/ (戰術層)
    ↓ 轉化為
.kiro/specs/ (執行層)
```

### 各層定位

| 文檔 | 層級 | 內容 | 更新頻率 |
|------|------|------|----------|
| **GOALS.md** | 戰略 | 項目目標、優先級、路線圖 | 低（每季度/大版本） |
| **internal/specs/** | 戰術 | 技術規範、實施方案 | 中（功能規劃時） |
| **.kiro/specs/** | 執行 | 可執行的開發任務 | 高（開發過程中） |

---

## 🔗 聯動規則

### 規則 1：GOALS.md → internal/specs/ 引用

**何時添加引用：**
- ✅ 當 GOALS.md 中的功能有詳細技術規範時
- ✅ 當功能需要複雜的技術方案時
- ❌ 簡單的 bug 修復或小功能不需要

**引用格式：**
```markdown
#### **功能名稱**
- 功能描述...
- 技術細節...
- 📋 **技術規範**：[SPEC_NAME.md](../specs/SPEC_NAME.md)
```

**範例：**
```markdown
#### **Google Drive 雲端備份** ⭐
- 整合 Google Drive API v3
- OAuth 授權使用用戶的 Google 帳號
- 📋 **技術規範**：[GOOGLE_DRIVE_BACKUP_SPEC.md](../specs/GOOGLE_DRIVE_BACKUP_SPEC.md)
```

---

### 規則 2：internal/specs/ → GOALS.md 反向引用

**何時添加引用：**
- ✅ 每個技術規範文檔都應該說明它對應的目標

**引用格式：**
```markdown
# 技術規範標題

**對應目標：** [GOALS.md](../guides/GOALS.md) - [優先級] - [功能名稱]
```

**範例：**
```markdown
# 📁 Google Drive 雲端備份技術方案

**對應目標：** [GOALS.md](../guides/GOALS.md) - 中優先級 - Google Drive 雲端備份
```

---

### 規則 3：狀態同步

**GOALS.md 狀態變更時：**

| GOALS.md 狀態 | 應執行的操作 |
|--------------|-------------|
| 📋 規劃中 | 考慮是否需要創建 internal/specs/ |
| 🔜 計劃中 | 應該有對應的 internal/specs/ |
| 🚧 開發中 | 應該有 internal/specs/ 和 .kiro/specs/ |
| ✅ 已完成 | 更新 internal/specs/ 狀態為"已完成" |

**internal/specs/ 狀態變更時：**

| internal/specs/ 狀態 | 應執行的操作 |
|---------------------|-------------|
| 創建新規範 | 檢查 GOALS.md 是否有對應目標 |
| 規範完成 | 可以創建 .kiro/specs/ 開始執行 |
| 實施完成 | 更新 GOALS.md 狀態為"已完成" |

---

## 📝 工作流程

### 流程 A：從目標到實施

```
1. 在 GOALS.md 中規劃新功能
   ↓
2. 評估是否需要技術規範
   ├─ 是 → 創建 internal/specs/
   └─ 否 → 直接開發或創建 .kiro/specs/
   ↓
3. 在 GOALS.md 中添加技術規範引用
   ↓
4. 在 internal/specs/ 中添加反向引用
   ↓
5. 開始實施（可選：創建 .kiro/specs/）
   ↓
6. 完成後同步更新兩處狀態
```

### 流程 B：從技術規範到目標

```
1. 創建 internal/specs/ 技術規範
   ↓
2. 檢查 GOALS.md 是否有對應目標
   ├─ 有 → 添加雙向引用
   └─ 無 → 考慮是否應該添加到 GOALS.md
   ↓
3. 添加反向引用到 internal/specs/
   ↓
4. 開始實施
```

---

## 🎯 當前聯動狀態

### 已建立聯動的功能

| GOALS.md 功能 | internal/specs/ 文檔 | 狀態 |
|--------------|---------------------|------|
| Google Drive 雲端備份 | GOOGLE_DRIVE_BACKUP_SPEC.md | ✅ 已聯動 |
| CSS Custom Highlight API | HIGHLIGHTER_UPGRADE_PLAN.md | ✅ 已聯動 |
| 無縫遷移 | SEAMLESS_MIGRATION.md | ✅ 已聯動 |
| 日誌系統 | LOGGER_OPTIMIZATION_PLAN.md | ✅ 已聯動 |

### 需要檢查的功能

定期檢查 GOALS.md 中的新功能是否需要創建技術規範。

---

## ⚠️ 注意事項

### 何時不需要 internal/specs/

**不需要創建技術規範的情況：**
- ❌ 簡單的 bug 修復
- ❌ UI 文案調整
- ❌ 配置參數調整
- ❌ 依賴版本更新
- ❌ 文檔更新

**需要創建技術規範的情況：**
- ✅ 新的核心功能
- ✅ 架構變更
- ✅ 複雜的技術方案
- ✅ 需要多個模塊協作
- ✅ 涉及外部 API 集成

### 何時可以跳過 internal/specs/

**可以直接從 GOALS.md 到 .kiro/specs/：**
- 功能邏輯簡單明確
- 不需要複雜的技術設計
- 實施方案直接明了

**範例：**
```
GOALS.md: "添加設定導出導入功能"
    ↓
直接創建 .kiro/specs/settings-export-import/
（不需要 internal/specs/）
```

---

## 🔄 維護流程

### 每次更新 GOALS.md 時

1. **檢查新增功能**
   - 是否需要創建 internal/specs/？
   - 如果已有 internal/specs/，是否已添加引用？

2. **檢查狀態變更**
   - 功能狀態變更時，是否需要更新 internal/specs/？
   - 是否需要創建或刪除 .kiro/specs/？

3. **檢查已完成功能**
   - 是否已更新 internal/specs/ 狀態？
   - 是否已創建完成報告到 internal/reports/？

### 每次創建 internal/specs/ 時

1. **添加反向引用**
   - 在文檔開頭添加對 GOALS.md 的引用

2. **檢查 GOALS.md**
   - 是否有對應的目標？
   - 如果有，是否已添加引用？

3. **考慮執行計劃**
   - 是否需要立即創建 .kiro/specs/？
   - 還是先完善技術規範？

---

## 📊 檢查清單

### 創建新功能時

- [ ] 在 GOALS.md 中添加功能描述
- [ ] 評估是否需要 internal/specs/
- [ ] 如需要，創建 internal/specs/ 文檔
- [ ] 在 GOALS.md 中添加技術規範引用
- [ ] 在 internal/specs/ 中添加反向引用
- [ ] 考慮是否需要創建 .kiro/specs/

### 完成功能時

- [ ] 更新 GOALS.md 狀態為"已完成"
- [ ] 更新 internal/specs/ 狀態為"已完成"
- [ ] 刪除 .kiro/specs/（如有）
- [ ] 創建完成報告到 internal/reports/
- [ ] 更新 CHANGELOG.md

---

## 🔗 相關文檔

- [GOALS.md](./GOALS.md) - 項目目標和路線圖
- [internal/specs/](../specs/) - 技術規範目錄
- [DOCUMENTATION_STRATEGY.md](./DOCUMENTATION_STRATEGY.md) - 文檔管理策略
- [PROJECT_STANDARDS.md](./PROJECT_STANDARDS.md) - 項目開發規範

---

**最後更新：** 2025-10-07  
**維護者：** 項目團隊  
**狀態：** ✅ 已發布
