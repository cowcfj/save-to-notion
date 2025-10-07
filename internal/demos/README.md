# 演示文件目錄

**位置**: `internal/demos/`  
**用途**: 存放功能演示、測試頁面、原型

---

## 📋 目錄說明

此目錄包含用於演示和測試的 HTML 頁面，不是擴展的核心功能。

---

## 📁 當前演示列表

- `seamless-migration-demo.html` - 無縫遷移演示頁面
- ~~`template-test.html`~~ - 模板功能演示（待創建）

---

## 🎯 使用場景

### 1. **功能演示**
- 向用戶展示新功能
- 提供互動式演示
- 測試用戶體驗

### 2. **開發測試**
- 測試新功能
- 驗證 UI/UX
- 調試問題

### 3. **原型開發**
- 快速原型
- 概念驗證
- 設計迭代

---

## 📝 創建新演示的指南

### 文件命名規範
```
{feature-name}-demo.html
```

**範例**:
- `seamless-migration-demo.html` ✅
- `template-test-demo.html` ✅
- `highlight-colors-demo.html` ✅

### 文件結構
```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <title>{功能名稱} 演示 - Notion Smart Clipper</title>
    <style>
        /* 內嵌樣式 */
    </style>
</head>
<body>
    <h1>{功能名稱} 演示</h1>
    
    <!-- 演示內容 -->
    
    <script>
        // 演示腳本
    </script>
</body>
</html>
```

### 最佳實踐
1. **自包含** - 所有資源內嵌（CSS、JS）
2. **清晰標題** - 明確說明演示目的
3. **互動性** - 提供可操作的元素
4. **說明文字** - 解釋如何使用演示
5. **版本標記** - 註明適用版本

---

## ⚠️ 注意事項

### 不要放在這裡的內容
- ❌ 擴展核心文件（應該在根目錄）
- ❌ 測試文件（應該在 `tests/`）
- ❌ 文檔文件（應該在 `internal/guides/` 或 `internal/specs/`）
- ❌ 腳本文件（應該在 `internal/scripts/`）

### 應該放在這裡的內容
- ✅ HTML 演示頁面
- ✅ 功能原型
- ✅ 互動式示例
- ✅ 測試用的網頁

---

## 🤖 給 AI Agents 的指示

### 創建演示時
```markdown
當需要創建演示頁面時：
1. 在 internal/demos/ 目錄下創建
2. 使用 {feature-name}-demo.html 命名格式
3. 包含清晰的標題和說明
4. 確保自包含（內嵌所有資源）
5. 更新此 README.md 的演示列表
```

### 測試功能時
```markdown
如果需要測試頁面來驗證功能：
1. 創建演示頁面在 internal/demos/
2. 不要創建在根目錄
3. 演示完成後可以保留供未來參考
```

---

## 📚 相關目錄

- **tests/** - 單元測試和集成測試
- **internal/scripts/** - 工具腳本
- **internal/specs/** - 技術規格和文檔

---

**最後更新**: 2025-10-07  
**維護者**: 項目團隊
