# internal/guides/ 目錄最終清理報告

**日期**: 2025-10-07  
**狀態**: ✅ 完成

---

## 🎯 清理目標

將 `internal/guides/` 目錄整理為只包含真正的"指南"文檔，其他類型的文檔移到適當位置。

---

## 📋 清理過程

### 第一輪：移除過期指南（已完成）
移動到 `archive/guides/`:
- ✅ `IMAGE_EXTRACTION_GUIDE.md` (v2.5.4 過期)
- ✅ `UI_IMPROVEMENT_v2.7.2.md` (v2.7.2 過期)
- ✅ `USER_GUIDE_v2.7.0.md` (v2.7.0 過期)

### 第二輪：移除非指南文件（今天完成）

#### 移動到 `internal/reports/`
- ✅ `INTERNAL_DOCS_AUDIT.md` - 審查報告

#### 移動到 `internal/docs/`
- ✅ `UPGRADE_DATA_SAFETY.md` - 技術文檔
- ✅ `MCP_SYNC_SOLUTION.md` - 技術方案文檔
- ✅ `MCP_SYNC_QUICK_START.md` - 技術方案文檔

---

## 📁 最終目錄結構

### `internal/guides/` (14 個文件)

#### 項目管理指南 (5 個)
```
├── GOALS.md                            # 項目目標
├── GOALS_SPECS_LINKAGE.md              # 目標規格關聯
├── PROJECT_STANDARDS.md                # 項目標準
├── DOCUMENTATION_STRATEGY.md           # 文檔策略
└── REPORT_WRITING_STANDARDS.md         # 報告標準
```

#### 發布相關指南 (3 個)
```
├── PUBLISH_CHECKLIST.md                # 發布檢查清單
├── GITHUB_SYNC_POLICY.md               # GitHub 同步策略
└── GITHUB_RELEASE_TEMPLATE.md          # Release 模板
```

#### MCP 相關指南 (5 個)
```
├── MCP_USAGE_GUIDELINES.md             # MCP 使用總覽 ⭐
├── FETCH_MCP_GUIDE.md                  # Fetch MCP 指南
├── SEQUENTIAL_THINKING_MCP_GUIDE.md    # Sequential Thinking 指南
├── TEST_E2E_MCP_GUIDE.md               # E2E 測試指南
└── diagnose-mcp.md                     # MCP 診斷
```

#### 其他 (1 個)
```
└── README.md                           # 目錄說明
```

---

## 📊 清理統計

### 清理前
- **總文件數**: 21 個 .md 文件
- **問題**: 包含過期指南、報告、技術文檔

### 清理後
- **總文件數**: 14 個 .md 文件
- **狀態**: 所有文件都是有效的指南

### 移除的文件
- **過期指南**: 3 個 → `archive/guides/`
- **報告文檔**: 1 個 → `internal/reports/`
- **技術文檔**: 3 個 → `internal/docs/`
- **總計移除**: 7 個

---

## 🎯 分類標準

### ✅ 應該在 `internal/guides/` 的文件

**特徵**:
- 教導如何使用某個工具/服務/流程
- 長期有效，不針對特定版本或時間點
- 包含配置方法、使用場景、最佳實踐
- 可以被反覆參考

**範例**:
- MCP 服務器使用指南
- 發布流程指南
- 項目標準和規範

### ❌ 不應該在 `internal/guides/` 的文件

#### 移到 `archive/guides/`
- 過期的版本特定指南
- 已被新版本替代的文檔
- 包含過時信息的指南

#### 移到 `internal/reports/`
- 審查報告
- 工作完成報告
- 帶有日期前綴的報告

#### 移到 `internal/docs/`
- 技術方案文檔
- 架構設計文檔
- 解決特定問題的文檔

---

## ✅ 清理效果

### 1. 目錄清晰
- ✅ 只包含有效的指南
- ✅ 文件分類明確
- ✅ 易於查找和使用

### 2. 文檔一致性
- ✅ 所有 MCP 指南格式統一
- ✅ 都包含配置、使用、故障排除
- ✅ 都支持多個 AI agent

### 3. 維護性提升
- ✅ 清楚哪些是長期維護的指南
- ✅ 清楚哪些是歷史文檔
- ✅ 新增文檔時有明確的分類標準

---

## 📚 相關目錄

### `internal/guides/` - 使用指南
- 14 個有效指南
- 長期維護
- 反覆參考

### `internal/docs/` - 技術文檔
- 4 個技術文檔
- 解決特定問題
- 按需查閱

### `internal/reports/` - 報告文檔
- 30+ 個報告
- 記錄歷史
- 追溯查詢

### `archive/guides/` - 過期指南
- 3 個過期指南
- 歷史參考
- 不再維護

---

## 🔄 維護建議

### 定期審查（每季度）
- [ ] 檢查是否有新的過期指南
- [ ] 檢查是否有誤放的文檔
- [ ] 更新 README.md

### 新增文檔時
1. **判斷類型**
   - 使用指南？→ `internal/guides/`
   - 技術文檔？→ `internal/docs/`
   - 工作報告？→ `internal/reports/`

2. **檢查命名**
   - 指南：描述性名稱（如 `FETCH_MCP_GUIDE.md`）
   - 報告：日期前綴（如 `20251007_*.md`）

3. **確保一致性**
   - 使用統一的格式
   - 包含必要的章節
   - 添加互相引用

---

## 🎊 完成狀態

- [x] 移除過期指南
- [x] 移除非指南文件
- [x] 統一 MCP 指南格式
- [x] 添加互相引用
- [x] 創建清理報告
- [x] 提交到 Git

---

## 📈 對比

### 清理前的問題
- ❌ 包含過期的版本特定指南
- ❌ 混雜報告和技術文檔
- ❌ MCP 指南格式不統一
- ❌ 缺少互相引用

### 清理後的狀態
- ✅ 只包含有效的指南
- ✅ 文檔分類清晰
- ✅ MCP 指南格式統一
- ✅ 完整的互相引用

---

**清理完成時間**: 2025-10-07  
**Git Commits**: 6 個  
**狀態**: ✅ 完成

**下次審查時間**: 2026-01-07（3 個月後）
