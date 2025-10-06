# Implementation Plan - 測試覆蓋率改進

## 任務列表

- [x] 1. 設置測試基礎設施
  - 驗證 Jest 配置正確
  - 確認 Chrome API mock 完整
  - 確認 JSDOM 環境正常
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. 增強 background.js 測試（目標：7.89% → 15%）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2.1 測試消息處理器
  - 創建 `tests/unit/background/message-handlers.test.js`
  - 測試 `saveToNotion` 消息處理
  - 測試 `getHighlights` 消息處理
  - 測試 `clearHighlights` 消息處理
  - 測試錯誤處理和邊界情況
  - _Requirements: 1.2, 1.5_

- [x] 2.2 測試存儲操作
  - 創建 `tests/unit/background/storage-operations.test.js`
  - 測試設置保存和讀取
  - 測試存儲配額錯誤處理
  - 測試數據遷移邏輯
  - _Requirements: 1.4, 1.5_

- [x] 2.3 增強 Notion API 測試
  - 擴展現有的 `tests/unit/background.notionApi.test.js`
  - 測試 401 未授權錯誤處理
  - 測試 404 數據庫不存在錯誤
  - 測試 429 速率限制處理
  - 測試網絡超時和重試邏輯
  - _Requirements: 1.2, 1.3, 1.5_

- [ ] 3. 完善 utils.js 測試（目標：0% → 80%）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3.1 增強 StorageUtil 測試
  - 擴展現有的 `tests/unit/storageUtil.test.js`
  - 測試並發保存操作
  - 測試並發讀取操作
  - 測試數據遷移場景
  - 測試存儲配額檢測
  - _Requirements: 2.2, 2.3, 2.5_

- [x] 3.2 驗證 Logger 測試覆蓋率
  - 檢查現有的 `tests/unit/logger.test.js`
  - 確認所有日誌級別都已測試
  - 確認邊界情況已覆蓋
  - _Requirements: 2.2, 2.5_

- [x] 3.3 驗證 URL 標準化測試
  - 檢查現有的 `tests/unit/normalizeUrl.test.js`
  - 確認所有 URL 變體已測試
  - 確認錯誤處理已覆蓋
  - _Requirements: 2.2, 2.5_

- [ ] 4. 添加 content.js 基礎測試（目標：0% → 10%）
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4.1 測試內容提取功能
  - 創建 `tests/unit/content/content-extraction.test.js`
  - 測試 Drupal CMS 結構識別
  - 測試 WordPress CMS 結構識別
  - 測試通用內容選擇器回退
  - 測試內容質量檢查（長度、連結密度）
  - _Requirements: 3.2, 3.3, 3.5_

- [ ] 4.2 驗證圖片處理測試
  - 檢查現有的 `tests/unit/content.test.js`
  - 確認圖片提取邏輯已測試
  - 確認懶加載圖片處理已測試
  - 補充缺失的測試場景
  - _Requirements: 3.2, 3.5_

- [ ] 5. 驗證覆蓋率目標達成
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5.1 運行完整測試套件
  - 執行 `npm test -- --coverage`
  - 確認所有測試通過
  - 生成覆蓋率報告
  - _Requirements: 4.1, 4.2, 4.4_

- [ ] 5.2 檢查覆蓋率指標
  - 驗證整體覆蓋率 >= 20%
  - 驗證 background.js >= 15%
  - 驗證 utils.js >= 80%
  - 驗證 content.js >= 10%
  - _Requirements: 4.1, 4.5_

- [ ] 5.3 更新覆蓋率門檻
  - 更新 `jest.config.js` 中的 coverageThreshold
  - 設置新的最低覆蓋率標準
  - 確保 CI/CD 使用新標準
  - _Requirements: 4.1, 4.5_

- [ ] 6. 文檔和清理
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6.1 更新測試文檔
  - 更新 `tests/README.md` 記錄新測試
  - 記錄測試覆蓋率提升歷程
  - 添加測試最佳實踐指南
  - 更新測試目錄結構說明（已完成：2025-10-07）
  - _Requirements: 5.1, 5.5_

- [ ] 6.2 代碼審查和重構
  - 審查新增測試代碼質量
  - 重構重複的測試邏輯
  - 提取共用的測試輔助函數
  - _Requirements: 5.1, 5.2, 5.5_

- [ ]* 6.3 性能優化（可選）
  - 識別慢速測試
  - 優化測試執行時間
  - 考慮並行測試執行
  - _Requirements: 5.3_

## 實施注意事項

### 測試編寫原則
1. **AAA 模式** - Arrange, Act, Assert
2. **單一職責** - 每個測試只驗證一個行為
3. **清晰命名** - 使用中文描述測試意圖
4. **獨立性** - 測試之間不應有依賴

### Mock 使用指南
1. **最小化原則** - 只 mock 必要的依賴
2. **真實性** - Mock 行為應接近真實 API
3. **清理** - 使用 afterEach 清理 mock 狀態

### 覆蓋率提升策略
1. **優先核心功能** - 先測試最重要的代碼路徑
2. **增量改進** - 每次提升 1-2%
3. **質量優先** - 不為覆蓋率而寫無意義的測試

### 常見陷阱
1. **過度 mock** - 導致測試脫離實際
2. **測試實現細節** - 應測試行為而非實現
3. **忽略邊界情況** - null、undefined、空值等
4. **測試依賴** - 測試順序不應影響結果

## 預期成果

### 量化指標
- ✅ 整體覆蓋率從 19.13% → 20%+
- ✅ background.js 從 7.89% → 15%+
- ✅ utils.js 從 0% → 80%+
- ✅ content.js 從 0% → 10%+
- ✅ 所有測試通過率 100%

### 質量改進
- ✅ 核心功能有測試保護
- ✅ 錯誤處理有測試驗證
- ✅ 邊界情況有測試覆蓋
- ✅ 測試代碼可維護性高

### 開發體驗
- ✅ 測試運行速度快（< 5 秒）
- ✅ 測試失敗信息清晰
- ✅ 測試幫助發現問題
- ✅ 測試文檔完善
