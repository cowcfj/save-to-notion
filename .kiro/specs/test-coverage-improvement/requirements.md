# Requirements Document - 測試覆蓋率改進

## Introduction

本項目旨在提升 Notion Smart Clipper Chrome 擴展的測試覆蓋率，從當前的 19.13% 提升至 20%+。重點關注核心功能模塊的單元測試，確保代碼質量和穩定性。

## Requirements

### Requirement 1: 提升 background.js 測試覆蓋率

**User Story:** 作為開發者，我希望 background.js 的測試覆蓋率從 7.89% 提升至 15%+，以確保後台服務的核心功能穩定可靠。

#### Acceptance Criteria

1. WHEN 運行測試時 THEN background.js 的語句覆蓋率應該達到 15% 以上
2. WHEN 測試 Notion API 相關功能時 THEN 應該覆蓋 createNotionPage、appendBlocksInBatches、fetchDatabases 等核心函數
3. WHEN 測試消息處理時 THEN 應該覆蓋 chrome.runtime.onMessage 的主要消息類型
4. WHEN 測試存儲操作時 THEN 應該覆蓋 chrome.storage 的讀寫操作
5. WHEN 測試錯誤處理時 THEN 應該覆蓋 API 錯誤、網絡錯誤等異常情況

### Requirement 2: 為 utils.js 添加完整測試

**User Story:** 作為開發者，我希望 utils.js 有完整的測試覆蓋，以確保工具函數在各種場景下都能正確工作。

#### Acceptance Criteria

1. WHEN 運行測試時 THEN utils.js 的語句覆蓋率應該達到 80% 以上
2. WHEN 測試 StorageUtil 時 THEN 應該覆蓋 saveHighlights、loadHighlights、clearHighlights 等方法
3. WHEN 測試 Logger 時 THEN 應該覆蓋 debug、info、warn、error 等日誌級別
4. WHEN 測試 normalizeUrl 時 THEN 應該覆蓋各種 URL 格式和邊界情況
5. WHEN 測試錯誤處理時 THEN 應該覆蓋 null、undefined、無效輸入等情況

### Requirement 3: 為 content.js 添加基礎測試

**User Story:** 作為開發者，我希望 content.js 有基礎測試覆蓋，以確保內容腳本的核心功能正常運作。

#### Acceptance Criteria

1. WHEN 運行測試時 THEN content.js 的語句覆蓋率應該達到 10% 以上
2. WHEN 測試內容提取時 THEN 應該覆蓋 extractContent 函數的基本邏輯
3. WHEN 測試圖片處理時 THEN 應該覆蓋 extractImageSrc、cleanImageUrl、isValidImageUrl 等函數
4. WHEN 測試消息處理時 THEN 應該覆蓋主要的消息監聽器
5. WHEN 測試 DOM 操作時 THEN 應該使用 JSDOM 模擬瀏覽器環境

### Requirement 4: 整體覆蓋率目標

**User Story:** 作為開發者，我希望項目整體測試覆蓋率達到 20%+，以提升代碼質量和可維護性。

#### Acceptance Criteria

1. WHEN 運行 `npm test -- --coverage` 時 THEN 整體語句覆蓋率應該 >= 20%
2. WHEN 運行測試時 THEN 所有測試應該通過
3. WHEN 添加新測試時 THEN 不應該破壞現有測試
4. WHEN 測試完成時 THEN 應該生成覆蓋率報告
5. WHEN 查看報告時 THEN 應該清楚顯示哪些代碼已覆蓋、哪些未覆蓋

### Requirement 5: 測試質量保證

**User Story:** 作為開發者，我希望測試代碼質量高、可維護性強，以便長期維護和擴展。

#### Acceptance Criteria

1. WHEN 編寫測試時 THEN 應該遵循 AAA 模式（Arrange-Act-Assert）
2. WHEN 測試失敗時 THEN 錯誤信息應該清晰明確
3. WHEN 使用 mock 時 THEN 應該正確模擬 Chrome API 和外部依賴
4. WHEN 測試異步代碼時 THEN 應該正確處理 Promise 和回調
5. WHEN 組織測試時 THEN 應該使用清晰的 describe 和 it 結構
