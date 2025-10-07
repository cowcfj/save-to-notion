# 📋 報告撰寫規範

**文檔性質：** 內部指南（不同步到 GitHub）  
**創建日期：** 2025-10-07  
**最後更新：** 2025-10-07

---

## 🎯 目的

建立統一的報告命名和撰寫規範，確保：
- 報告易於追溯和查找
- 版本歷史清晰可見
- 時間順序一目了然
- 避免檔案命名衝突

---

## 📝 檔案命名規範

### 標準格式

```
YYYYMMDD_v{version}_{REPORT_TYPE}.md
```

### 命名規則

1. **日期格式**：`YYYYMMDD`（8 位數字）
   - 例：`20251007`（2025年10月7日）
   - 使用報告創建日期，非項目版本發布日期

2. **版本號**：`v{major}.{minor}.{patch}`
   - 例：`v2.7.3`
   - 使用報告撰寫時的項目版本號
   - 如果報告跨版本，使用主要相關版本

3. **報告類型**：`{REPORT_TYPE}`
   - 使用大寫字母和底線
   - 簡潔描述報告內容
   - 例：`TEST_COVERAGE_REPORT`、`MCP_INSTALLATION_RECORD`

### 命名範例

```
✅ 正確範例：
20251007_v2.7.3_FILE_REORGANIZATION_COMPLETE.md
20251006_v2.7.3_MCP_INSTALLATION_RECORD.md
20251005_v2.7.3_TEST_PROGRESS_REPORT.md
20251005_v2.7.2_CODECOV_INTEGRATION_MILESTONE.md

❌ 錯誤範例：
FILE_REORGANIZATION_COMPLETE.md          # 缺少日期和版本
2025-10-07_FILE_REPORT.md                # 日期格式錯誤（有連字號）
20251007_FILE_REPORT.md                  # 缺少版本號
20251007_v2.7.3_file_report.md           # 報告類型應使用大寫
```

---

## 📂 檔案組織

### 目錄結構

```
internal/reports/
├── completed/                           # 已完成/已歸檔的報告
│   └── 20251001_v2.7.0_OLD_REPORT.md
├── 20251007_v2.7.3_CURRENT_REPORT.md   # 當前活躍報告
├── 20251006_v2.7.3_RECENT_REPORT.md
└── 20251005_v2.7.3_ANOTHER_REPORT.md
```

### 歸檔規則

1. **何時歸檔**：
   - 報告內容已過時
   - 相關任務已完成
   - 大版本更新時（如 v2.7.x → v2.8.0）

2. **如何歸檔**：
   ```bash
   # 移動到 completed 子目錄
   mv internal/reports/20251001_v2.7.0_OLD_REPORT.md \
      internal/reports/completed/
   ```

3. **保留期限**：
   - 永久保留，不刪除
   - 便於歷史追溯和問題調試

---

## ✍️ 報告內容規範

### 必要元素

每個報告應包含以下標準元素：

```markdown
# 報告標題

**報告類型：** [進度報告/完成報告/分析報告/安裝記錄]  
**項目版本：** v2.7.3  
**創建日期：** 2025-10-07  
**撰寫者：** [AI Agent/開發者名稱]

---

## 📋 摘要

[2-3 句話概述報告重點]

---

## 🎯 目標/背景

[說明報告的目的或背景]

---

## 📊 主要內容

[報告的核心內容]

---

## ✅ 結論/下一步

[總結和後續行動項目]

---

**相關文檔：**
- [連結到相關指南或報告]
```

### 報告類型指南

#### 1. 進度報告 (Progress Report)

**用途**：記錄項目或任務的進展狀態

**命名範例**：
```
20251007_v2.7.3_TEST_COVERAGE_PROGRESS.md
20251007_v2.7.3_FEATURE_DEVELOPMENT_PROGRESS.md
```

**內容要點**：
- 當前進度百分比
- 已完成項目
- 進行中項目
- 遇到的問題
- 下一步計劃

#### 2. 完成報告 (Completion Report)

**用途**：記錄任務或階段的完成情況

**命名範例**：
```
20251007_v2.7.3_FILE_REORGANIZATION_COMPLETE.md
20251007_v2.7.3_JEST_SETUP_COMPLETE.md
```

**內容要點**：
- 完成的任務清單
- 達成的目標
- 遇到並解決的問題
- 驗證結果
- 後續建議

#### 3. 分析報告 (Analysis Report)

**用途**：深入分析特定問題或系統狀態

**命名範例**：
```
20251007_v2.7.3_PERFORMANCE_ANALYSIS.md
20251007_v2.7.3_CODE_REVIEW_REPORT.md
```

**內容要點**：
- 分析目標
- 方法論
- 發現的問題
- 數據和證據
- 建議和結論

#### 4. 安裝/配置記錄 (Installation/Configuration Record)

**用途**：記錄工具或系統的安裝配置過程

**命名範例**：
```
20251007_v2.7.3_MCP_INSTALLATION_RECORD.md
20251007_v2.7.3_CODECOV_SETUP.md
```

**內容要點**：
- 安裝步驟
- 配置細節
- 遇到的問題和解決方案
- 驗證測試
- 使用說明

#### 5. 里程碑報告 (Milestone Report)

**用途**：記錄重要里程碑的達成

**命名範例**：
```
20251007_v2.7.3_TEST_COVERAGE_MILESTONE_20_PERCENT.md
20251007_v2.7.3_CODECOV_INTEGRATION_MILESTONE.md
```

**內容要點**：
- 里程碑定義
- 達成標準
- 達成過程
- 影響和意義
- 下一個里程碑

---

## 🔧 實用工具

### 快速生成報告模板

```bash
#!/bin/bash
# scripts/create-report.sh

# 使用方法：./scripts/create-report.sh TEST_COVERAGE_PROGRESS

REPORT_TYPE=$1
DATE=$(date +%Y%m%d)
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')

FILENAME="internal/reports/${DATE}_v${VERSION}_${REPORT_TYPE}.md"

cat > "$FILENAME" << EOF
# ${REPORT_TYPE//_/ }

**報告類型：** [進度報告/完成報告/分析報告/安裝記錄]  
**項目版本：** v${VERSION}  
**創建日期：** $(date +%Y-%m-%d)  
**撰寫者：** [AI Agent/開發者名稱]

---

## 📋 摘要

[2-3 句話概述報告重點]

---

## 🎯 目標/背景

[說明報告的目的或背景]

---

## 📊 主要內容

[報告的核心內容]

---

## ✅ 結論/下一步

[總結和後續行動項目]

---

**相關文檔：**
- [連結到相關指南或報告]
EOF

echo "✅ 報告已創建：$FILENAME"
```

### 查找報告

```bash
# 查找特定日期的報告
ls internal/reports/20251007_*.md

# 查找特定版本的報告
ls internal/reports/*_v2.7.3_*.md

# 查找特定類型的報告
ls internal/reports/*_TEST_*.md

# 按時間排序查看所有報告
ls -lt internal/reports/*.md
```

---

## 📊 遷移現有報告

### 遷移策略

對於現有的不符合規範的報告檔案：

1. **評估優先級**：
   - 高優先級：近期活躍的報告（最近 30 天）
   - 中優先級：重要的歷史報告
   - 低優先級：已歸檔的舊報告

2. **重命名步驟**：
   ```bash
   # 範例：重命名舊報告
   git mv internal/reports/FILE_REORGANIZATION_COMPLETE.md \
          internal/reports/20251005_v2.7.3_FILE_REORGANIZATION_COMPLETE.md
   ```

3. **批量處理**：
   - 可以使用腳本批量重命名
   - 建議分批處理，避免一次性大量變更
   - 每次提交時在 commit message 中說明

### 遷移檢查清單

- [ ] 識別需要重命名的報告
- [ ] 確定每個報告的創建日期
- [ ] 確定每個報告對應的版本號
- [ ] 執行重命名操作
- [ ] 更新相關文檔中的連結
- [ ] 提交變更並說明

---

## ⚠️ 注意事項

### 特殊情況處理

1. **跨版本報告**：
   ```
   # 如果報告涵蓋 v2.7.0 到 v2.7.3
   20251007_v2.7.0-v2.7.3_COMPREHENSIVE_ANALYSIS.md
   
   # 或使用主要版本
   20251007_v2.7.3_COMPREHENSIVE_ANALYSIS.md
   ```

2. **同日多個同類報告**：
   ```
   # 添加序號或更具體的描述
   20251007_v2.7.3_TEST_PROGRESS_REPORT_1.md
   20251007_v2.7.3_TEST_PROGRESS_REPORT_2.md
   
   # 或
   20251007_v2.7.3_TEST_PROGRESS_UNIT_TESTS.md
   20251007_v2.7.3_TEST_PROGRESS_INTEGRATION_TESTS.md
   ```

3. **緊急修復報告**：
   ```
   # 可以添加時間戳
   20251007_1430_v2.7.3_HOTFIX_REPORT.md
   ```

### 常見錯誤

❌ **不要使用空格**：
```
20251007 v2.7.3 TEST REPORT.md  # 錯誤
20251007_v2.7.3_TEST_REPORT.md  # 正確
```

❌ **不要使用特殊字符**：
```
20251007_v2.7.3_TEST-REPORT.md  # 避免使用連字號
20251007_v2.7.3_TEST_REPORT.md  # 使用底線
```

❌ **不要省略版本號**：
```
20251007_TEST_REPORT.md         # 錯誤
20251007_v2.7.3_TEST_REPORT.md  # 正確
```

---

## 🔗 相關文檔

- [DOCUMENTATION_STRATEGY.md](./DOCUMENTATION_STRATEGY.md) - 整體文檔管理策略
- [PROJECT_STANDARDS.md](./PROJECT_STANDARDS.md) - 項目開發規範
- [Agents.md](../../Agents.md) - AI Agent 工作指南

---

## 📈 版本歷史

### v1.0.0 (2025-10-07)
- 初始版本
- 建立基本命名規範
- 定義報告類型和內容結構
- 提供實用工具和遷移指南

---

**最後更新：** 2025-10-07  
**維護者：** 項目團隊  
**狀態：** ✅ 已發布
