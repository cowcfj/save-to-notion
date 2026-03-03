---
name: notion-qa
description: Quality Assurance tools for Notion Chrome Extension. Triggers on test, e2e, coverage, debug, verify.
---

# Notion QA

專案專用的品質保證與測試技能。

## 🎯 核心能力

### 1. 執行 E2E 測試

使用 Playwright 執行端到端測試。

```bash
# 執行所有測試
python3 scripts/run_e2e_suite.py

# 執行特定類型測試
python3 scripts/run_e2e_suite.py save      # 保存功能
python3 scripts/run_e2e_suite.py highlight # 標註功能
python3 scripts/run_e2e_suite.py migration # 遷移功能
```

**參考文檔**: [`internal/guides/TEST_E2E_MCP_GUIDE.md`](../../internal/guides/TEST_E2E_MCP_GUIDE.md)

### 2. 檢查覆蓋率

分析 Jest 測試覆蓋率是否達標 (>20%)。

```bash
python3 scripts/check_coverage.py
```

**參考文檔**: [`internal/guides/TESTING_GUIDE.md`](../../internal/guides/TESTING_GUIDE.md)

### 3. 當前狀態除錯

生成用於 Chrome Console 的除錯腳本，檢查 Storage 和 DOM 狀態。

```bash
python3 scripts/debug_state.py
```

**參考文檔**: [`internal/guides/DEBUGGING_GUIDE.md`](../../internal/guides/DEBUGGING_GUIDE.md)

### 4. 測試數據規範

查看 [`.agent/.shared/mocks/fixtures/README.md`](../../.agent/.shared/mocks/fixtures/README.md) 了解 Fixture 格式與可用假資料庫。

## 🧪 測試場景對照

| 場景         | 覆蓋腳本                     | 相關 Spec                             |
| ------------ | ---------------------------- | ------------------------------------- |
| **保存功能** | `run_e2e_suite.py save`      | `CONTENT_EXTRACTION_SYSTEM.md`        |
| **標註功能** | `run_e2e_suite.py highlight` | `HIGHLIGHT_COLOR_SYNC_SPEC.md`        |
| **遷移**     | `run_e2e_suite.py migration` | `HIGHLIGHT_MIGRATION_ARCHITECTURE.md` |
