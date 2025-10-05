# 📊 測試覆蓋率提升計劃

> **當前狀態**: 5.81% (70 測試) | **目標**: 50%+ (200+ 測試)
> 
> **創建日期**: 2025-10-05 | **預計完成**: 2025-12-31

---

## 🎯 总体目標

| 階段 | 覆蓋率目標 | 測試数量 | 預計時間 | 狀態 |
|------|-----------|---------|---------|------|
| **階段 0** | 5.81% | 70 | - | ✅ 完成 |
| **階段 1** | 20% | 120+ | 2-3 周 | 🔄 計劃中 |
| **階段 2** | 35% | 180+ | 4-6 周 | ⏳ 待开始 |
| **階段 3** | 50%+ | 250+ | 8-12 周 | ⏳ 待开始 |

---

## 📋 當前測試覆盖情况

### ✅ 已測試模組 (2 个)
```
tests/unit/
├── normalizeUrl.test.js (21 測試)
│   ✅ 协议规范化
│   ✅ URL 参数處理
│   ✅ 锚点處理
│   ✅ 尾部斜杠處理
│   ✅ 邊界情况
│
└── imageUtils.test.js (49 測試)
    ✅ 圖片 URL 清理
    ✅ 懒加载属性提取
    ✅ 响应式圖片處理
    ✅ 邊界情况和錯誤處理
```

### ❌ 未測試模組 (核心功能)
```
scripts/
├── background.js (2100+ 行) - 🔴 0% 覆盖
│   ❌ Notion API 整合
│   ❌ 批次保存處理
│   ❌ 資料儲存管理
│   ❌ 圖標徽章邏輯
│   ❌ 模板處理
│
├── highlighter-v2.js (600+ 行) - 🔴 0% 覆盖
│   ❌ CSS Highlight API
│   ❌ 標註創建/删除
│   ❌ 顏色管理
│   ❌ 資料持久化
│   ❌ 迁移邏輯
│
├── content.js (400+ 行) - 🔴 0% 覆盖
│   ❌ Readability 整合
│   ❌ 內容提取
│   ❌ 圖標提取
│   ❌ 封面图識別
│
└── utils.js (部分覆盖)
    ✅ normalizeUrl
    ✅ 圖片工具函數
    ❌ 其他工具函數
```

---

## 🎯 階段 1: 基础核心功能 (目標 20%)

**時間**: 2-3 周 | **新增測試**: 50+

### 優先級 1: `scripts/utils.js` 完整覆盖
```javascript
✅ normalizeUrl (已完成)
✅ 圖片工具函數 (已完成)

待添加:
- [ ] 日期格式化函數 (5 測試)
- [ ] 模板變數替换 (8 測試)
- [ ] URL 驗證函數 (5 測試)
- [ ] 資料清理函數 (6 測試)
```

**預計新增**: 24 測試

### 優先級 2: `scripts/background.js` - Notion API 核心
```javascript
測試範圍:
- [ ] createNotionPage() - 基础頁面創建 (10 測試)
- [ ] appendBlocksInBatches() - 批次追加邏輯 (8 測試)
- [ ] fetchDatabases() - 資料库获取 (5 測試)
- [ ] testApiKey() - API Key 驗證 (4 測試)

Mock 策略:
- Mock fetch() 进行 API 调用
- Mock chrome.storage API
- 測試錯誤處理和重试邏輯
```

**預計新增**: 27 測試

---

## 🎯 階段 2: 標註系统和內容提取 (目標 35%)

**時間**: 4-6 周 (从階段 1 完成后) | **新增測試**: 60+

### 優先級 3: `scripts/highlighter-v2.js` - 標註系统
```javascript
核心功能測試:
- [ ] 創建標註 (15 測試)
  - Range 选择處理
  - 跨元素標註
  - 顏色管理
  - 邊界情况

- [ ] 删除標註 (10 測試)
  - 单个删除
  - 批次删除
  - 快捷键删除

- [ ] 資料持久化 (12 測試)
  - 保存到 storage
  - 恢復標註
  - 資料迁移

- [ ] CSS Highlight API (8 測試)
  - API 可用性检测
  - Highlight 創建
  - 样式应用
```

**預計新增**: 45 測試

### 優先級 4: `scripts/content.js` - 內容提取
```javascript
核心功能測試:
- [ ] extractContent() (10 測試)
  - Readability 整合
  - HTML 清理
  - 特殊內容處理

- [ ] extractIcon() (8 測試)
  - 多种圖標格式
  - 優先級排序
  - 錯誤處理

- [ ] extractCoverImage() (7 測試)
  - 封面图識別
  - 过滤规则
  - 預設行为
```

**預計新增**: 25 測試

---

## 🎯 階段 3: 完整整合和邊界情况 (目標 50%+)

**時間**: 8-12 周 | **新增測試**: 80+

### 優先級 5: 整合測試
```javascript
完整工作流測試:
- [ ] 保存頁面完整流程 (15 測試)
  - 提取內容 → 創建頁面 → 保存標註
  - 錯誤恢復
  - 資料一致性

- [ ] 資料管理流程 (12 測試)
  - 清理过期資料
  - 匯出/匯入
  - 儲存配额管理

- [ ] 模板系统 (10 測試)
  - 變數替换
  - 预览功能
  - 复杂模板
```

**預計新增**: 37 測試

### 優先級 6: UI 元件測試
```javascript
- [ ] popup/popup.js (15 測試)
  - 按钮交互
  - 狀態显示
  - 錯誤提示

- [ ] options/options.js (18 測試)
  - 設置保存/加载
  - API Key 測試
  - 資料库选择
  - 模板编辑
```

**預計新增**: 33 測試

### 優先級 7: 邊界情况和效能
```javascript
- [ ] 異常情况處理 (10 測試)
  - 網路錯誤
  - API 限流
  - 儲存满
  - 無效資料

- [ ] 效能測試 (10 測試)
  - 大內容處理
  - 批次標註
  - 内存使用
```

**預計新增**: 20 測試

---

## 🛠️ 測試工具和最佳实践

### Mock 策略

#### Chrome APIs Mock
```javascript
// tests/mocks/chrome.js (已有)
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  }
};
```

#### Fetch API Mock
```javascript
// tests/mocks/fetch.js (待創建)
global.fetch = jest.fn((url, options) => {
  // 根据 URL 返回不同的 mock 响应
  if (url.includes('notion.com/v1/databases')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ results: [...] })
    });
  }
  // ... 其他 API endpoints
});
```

#### DOM Mock (jsdom)
```javascript
// Jest 配置已包含 jsdom
// 可以直接測試 DOM 操作
document.body.innerHTML = '<div>Test content</div>';
```

### 測試文件组织

```
tests/
├── mocks/
│   ├── chrome.js ✅
│   ├── fetch.js (待創建)
│   ├── notion-api.js (待創建)
│   └── dom.js (待創建)
│
├── unit/
│   ├── utils/
│   │   ├── normalizeUrl.test.js ✅
│   │   ├── imageUtils.test.js ✅
│   │   ├── dateUtils.test.js (待創建)
│   │   └── templateUtils.test.js (待創建)
│   │
│   ├── background/
│   │   ├── notionApi.test.js (待創建)
│   │   ├── batchProcessing.test.js (待創建)
│   │   └── storage.test.js (待創建)
│   │
│   ├── highlighter/
│   │   ├── create.test.js (待創建)
│   │   ├── delete.test.js (待創建)
│   │   └── persistence.test.js (待創建)
│   │
│   └── content/
│       ├── extraction.test.js (待創建)
│       ├── icon.test.js (待創建)
│       └── coverImage.test.js (待創建)
│
├── integration/
│   ├── saveFlow.test.js (待創建)
│   ├── highlightSync.test.js (待創建)
│   └── dataManagement.test.js (待創建)
│
└── e2e/ (未来考虑)
    └── playwright/ (使用 Playwright 进行端到端測試)
```

---

## 📈 測試指标追踪

### 每周目標
```
Week 1: 达到 10% (新增 30 測試)
Week 2: 达到 15% (新增 30 測試)
Week 3: 达到 20% (新增 30 測試) - 階段 1 完成
Week 4-6: 达到 30% (新增 60 測試)
Week 7-8: 达到 35% (新增 30 測試) - 階段 2 完成
Week 9-12: 达到 50% (新增 80 測試) - 階段 3 完成
```

### 质量要求
- ✅ 所有測試必须通过
- ✅ 測試執行時間 < 10 秒
- ✅ 每个測試独立可執行
- ✅ Mock 資料真实反映实际场景
- ✅ 測試描述清晰易懂

---

## 🔄 持续整合

### GitHub Actions 自动化
```yaml
# .github/workflows/test.yml (已配置)
✅ 每次 push 自动執行測試
✅ Node.js 18.x, 20.x 多版本測試
✅ 生成覆蓋率报告
⏳ 覆蓋率达到 30% 后添加 Codecov 徽章
```

### 本地开发
```bash
# 執行所有測試
npm test

# 執行特定測試文件
npm test -- normalizeUrl.test.js

# 生成覆蓋率报告
npm run test:coverage

# 监听模式 (开发时使用)
npm test -- --watch
```

---

## 📝 實施步骤

### 階段 1 启动 (本周)

#### Step 1: 創建 Mock 基础设施
```bash
# 創建 Notion API Mock
touch tests/mocks/notion-api.js

# 創建 Fetch Mock
touch tests/mocks/fetch.js
```

#### Step 2: 完成 utils.js 測試
```bash
# 創建日期工具測試
touch tests/unit/utils/dateUtils.test.js

# 創建模板工具測試
touch tests/unit/utils/templateUtils.test.js
```

#### Step 3: 开始 background.js 核心測試
```bash
# 創建測試目录
mkdir -p tests/unit/background

# 創建 Notion API 測試
touch tests/unit/background/notionApi.test.js
```

#### Step 4: 每日測試執行
```bash
# 每天提交前執行
npm test

# 查看覆蓋率
npm run test:coverage
```

---

## 📊 進度追踪

### 里程碑記錄

| 日期 | 覆蓋率 | 測試数 | 里程碑 |
|------|--------|--------|--------|
| 2025-10-05 | 5.81% | 70 | ✅ 測試框架建立,CI/CD 配置完成 |
| 2025-10-12 | 10% | 100 | 🎯 階段 1.1 - Utils 完整覆盖 |
| 2025-10-19 | 15% | 120 | 🎯 階段 1.2 - Notion API 核心 |
| 2025-10-26 | 20% | 150 | 🎯 階段 1 完成 |
| 2025-11-16 | 30% | 180 | 🎯 階段 2.1 - 標註系统 |
| 2025-11-30 | 35% | 210 | 🎯 階段 2 完成 |
| 2025-12-31 | 50% | 250+ | 🎯 階段 3 完成 |

---

## 🎁 预期收益

### 代码质量
- ✅ 减少 80% 的回归 Bug
- ✅ 重构更安全,有測試保护
- ✅ 新功能开发更快速

### 开发效率
- ✅ 快速驗證代码改动
- ✅ 更早发现問題
- ✅ 减少手动測試時間

### 项目信誉
- ✅ 吸引更多贡献者
- ✅ 提升用户信任度
- ✅ 展示专业开发流程

### 维护成本
- ✅ 降低长期维护成本
- ✅ 文件即測試(測試即文件)
- ✅ 更容易交接和协作

---

## 📚 学习资源

### Jest 測試框架
- [Jest 官方文件](https://jestjs.io/docs/getting-started)
- [Jest Mock Functions](https://jestjs.io/docs/mock-functions)
- [Jest Matchers](https://jestjs.io/docs/expect)

### Chrome Extensions 測試
- [Testing Chrome Extensions](https://developer.chrome.com/docs/extensions/mv3/testing/)
- [Chrome API Mocking](https://github.com/clarkbw/jest-webextension-mock)

### 測試最佳实践
- [JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

## 🔍 常见問題

### Q: 測試覆蓋率一定要达到 100% 吗?
**A:** 不需要。50-70% 是健康的目標。重点是測試**核心业务邏輯**,而不是追求数字。

### Q: 如何平衡測試時間和开发時間?
**A:** 遵循 80/20 原则:
- 优先測試 20% 的核心代码(提供 80% 的价值)
- 新功能开发时同步写測試
- 修复 Bug 时先写測試重现問題

### Q: Mock 太复杂怎么办?
**A:** 
- 先从简单的纯函數开始測試
- 逐步建立 Mock 库复用
- 对于过于复杂的依赖,考虑重构代码

### Q: 測試執行太慢怎么办?
**A:**
- 使用 `jest --onlyChanged` 只執行相关測試
- 开启 `--maxWorkers` 并行執行
- 避免在单元測試中做实际的網路请求

---

## 🎯 成功标准

### 階段 1 完成标准
- ✅ 測試覆蓋率 ≥ 20%
- ✅ 所有核心工具函數有測試
- ✅ Notion API 核心功能有測試
- ✅ CI/CD 通过率 100%

### 階段 2 完成标准
- ✅ 測試覆蓋率 ≥ 35%
- ✅ 標註系统完整測試
- ✅ 內容提取邏輯測試
- ✅ 測試執行時間 < 10 秒

### 階段 3 完成标准
- ✅ 測試覆蓋率 ≥ 50%
- ✅ 整合測試覆盖主要工作流
- ✅ UI 元件基础測試
- ✅ 添加 Codecov 徽章

---

**最后更新**: 2025-10-05  
**维护者**: @cowcfj  
**狀態**: 🟢 活跃

---

💡 **提示**: 这是一个活文件,随着项目进展会持续更新。欢迎提供反馈和建议!
