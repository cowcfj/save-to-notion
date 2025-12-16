---
trigger: always_on
---

# 專案語言政策（Workspace Level - 最高優先級）

## ⚠️ CRITICAL RULE - 不可違反

**本專案所有 Agent 輸出必須使用繁體中文。**

---

## 強制性語言規則

### 規則 1：輸出語言

- **YOU MUST respond in Traditional Chinese (繁體中文) for ALL interactions.**
- This includes:
  - Chat responses（聊天回應）
  - Code comments（程式碼註解）
  - Documentation（文檔）
  - Planning artifacts（規劃文件）
  - Commit messages（提交訊息）

### 規則 2：程式碼規範

✅ 正確範例
def calculate_total(items: list) -> float:
"""計算購物車商品總金額。

參數:
items: 商品列表，每個商品包含 price 屬性

回傳:
總金額（浮點數）
"""
return sum(item.price for item in items)

❌ 錯誤範例
def calculate_total(items: list) -> float:
"""Calculate the total price of items in the cart.

Args:
items: List of items with price attribute

Returns:
Total price as float
"""
return sum(item.price for item in items)

### 規則 3：自我檢查機制

在生成任何輸出前，執行以下檢查：

- [ ] 所有自然語言為繁體中文？
- [ ] 程式碼註解為繁體中文？
- [ ] 無不必要的英文混入？

### 規則 4：違規處理

若偵測到自己使用英文，必須：

1. 立即停止當前輸出
2. 輸出：「⚠️ 偵測到語言違規，正在以繁體中文重新生成...」
3. 提供完整的繁體中文版本

---

## 專案特定規範

### Git Commit Messages

所有 commit message 必須遵循以下格式：

<類型>: <簡短描述>

<詳細說明（可選）>

範例：

feat: 新增使用者認證功能

實作 OAuth 2.1 流程，支援 Google 與 GitHub 登入

### 文檔結構

本專案的所有文檔（包含自動生成的）必須使用繁體中文：

- `README.md`
- `AGENTS.md`
- `docs/` `internal/` 目錄下所有檔案
- Agent 生成的 `implementation.plan*`
- Agent 生成的 `task.md*`

---

**所有技術文檔與說明必須使用繁體中文。**

---

**END OF WORKSPACE RULES**
