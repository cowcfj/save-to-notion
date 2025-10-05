# 📊 测试覆盖率提升计划

> **当前状态**: 5.81% (70 测试) | **目标**: 50%+ (200+ 测试)
> 
> **创建日期**: 2025-10-05 | **预计完成**: 2025-12-31

---

## 🎯 总体目标

| 阶段 | 覆盖率目标 | 测试数量 | 预计时间 | 状态 |
|------|-----------|---------|---------|------|
| **阶段 0** | 5.81% | 70 | - | ✅ 完成 |
| **阶段 1** | 20% | 120+ | 2-3 周 | 🔄 计划中 |
| **阶段 2** | 35% | 180+ | 4-6 周 | ⏳ 待开始 |
| **阶段 3** | 50%+ | 250+ | 8-12 周 | ⏳ 待开始 |

---

## 📋 当前测试覆盖情况

### ✅ 已测试模块 (2 个)
```
tests/unit/
├── normalizeUrl.test.js (21 测试)
│   ✅ 协议规范化
│   ✅ URL 参数处理
│   ✅ 锚点处理
│   ✅ 尾部斜杠处理
│   ✅ 边界情况
│
└── imageUtils.test.js (49 测试)
    ✅ 图片 URL 清理
    ✅ 懒加载属性提取
    ✅ 响应式图片处理
    ✅ 边界情况和错误处理
```

### ❌ 未测试模块 (核心功能)
```
scripts/
├── background.js (2100+ 行) - 🔴 0% 覆盖
│   ❌ Notion API 集成
│   ❌ 批量保存处理
│   ❌ 数据存储管理
│   ❌ 图标徽章逻辑
│   ❌ 模板处理
│
├── highlighter-v2.js (600+ 行) - 🔴 0% 覆盖
│   ❌ CSS Highlight API
│   ❌ 标注创建/删除
│   ❌ 颜色管理
│   ❌ 数据持久化
│   ❌ 迁移逻辑
│
├── content.js (400+ 行) - 🔴 0% 覆盖
│   ❌ Readability 集成
│   ❌ 内容提取
│   ❌ 图标提取
│   ❌ 封面图识别
│
└── utils.js (部分覆盖)
    ✅ normalizeUrl
    ✅ 图片工具函数
    ❌ 其他工具函数
```

---

## 🎯 阶段 1: 基础核心功能 (目标 20%)

**时间**: 2-3 周 | **新增测试**: 50+

### 优先级 1: `scripts/utils.js` 完整覆盖
```javascript
✅ normalizeUrl (已完成)
✅ 图片工具函数 (已完成)

待添加:
- [ ] 日期格式化函数 (5 测试)
- [ ] 模板变量替换 (8 测试)
- [ ] URL 验证函数 (5 测试)
- [ ] 数据清理函数 (6 测试)
```

**预计新增**: 24 测试

### 优先级 2: `scripts/background.js` - Notion API 核心
```javascript
测试范围:
- [ ] createNotionPage() - 基础页面创建 (10 测试)
- [ ] appendBlocksInBatches() - 批量追加逻辑 (8 测试)
- [ ] fetchDatabases() - 数据库获取 (5 测试)
- [ ] testApiKey() - API Key 验证 (4 测试)

Mock 策略:
- Mock fetch() 进行 API 调用
- Mock chrome.storage API
- 测试错误处理和重试逻辑
```

**预计新增**: 27 测试

---

## 🎯 阶段 2: 标注系统和内容提取 (目标 35%)

**时间**: 4-6 周 (从阶段 1 完成后) | **新增测试**: 60+

### 优先级 3: `scripts/highlighter-v2.js` - 标注系统
```javascript
核心功能测试:
- [ ] 创建标注 (15 测试)
  - Range 选择处理
  - 跨元素标注
  - 颜色管理
  - 边界情况

- [ ] 删除标注 (10 测试)
  - 单个删除
  - 批量删除
  - 快捷键删除

- [ ] 数据持久化 (12 测试)
  - 保存到 storage
  - 恢复标注
  - 数据迁移

- [ ] CSS Highlight API (8 测试)
  - API 可用性检测
  - Highlight 创建
  - 样式应用
```

**预计新增**: 45 测试

### 优先级 4: `scripts/content.js` - 内容提取
```javascript
核心功能测试:
- [ ] extractContent() (10 测试)
  - Readability 集成
  - HTML 清理
  - 特殊内容处理

- [ ] extractIcon() (8 测试)
  - 多种图标格式
  - 优先级排序
  - 错误处理

- [ ] extractCoverImage() (7 测试)
  - 封面图识别
  - 过滤规则
  - 默认行为
```

**预计新增**: 25 测试

---

## 🎯 阶段 3: 完整集成和边界情况 (目标 50%+)

**时间**: 8-12 周 | **新增测试**: 80+

### 优先级 5: 集成测试
```javascript
完整工作流测试:
- [ ] 保存页面完整流程 (15 测试)
  - 提取内容 → 创建页面 → 保存标注
  - 错误恢复
  - 数据一致性

- [ ] 数据管理流程 (12 测试)
  - 清理过期数据
  - 导出/导入
  - 存储配额管理

- [ ] 模板系统 (10 测试)
  - 变量替换
  - 预览功能
  - 复杂模板
```

**预计新增**: 37 测试

### 优先级 6: UI 组件测试
```javascript
- [ ] popup/popup.js (15 测试)
  - 按钮交互
  - 状态显示
  - 错误提示

- [ ] options/options.js (18 测试)
  - 设置保存/加载
  - API Key 测试
  - 数据库选择
  - 模板编辑
```

**预计新增**: 33 测试

### 优先级 7: 边界情况和性能
```javascript
- [ ] 异常情况处理 (10 测试)
  - 网络错误
  - API 限流
  - 存储满
  - 无效数据

- [ ] 性能测试 (10 测试)
  - 大内容处理
  - 批量标注
  - 内存使用
```

**预计新增**: 20 测试

---

## 🛠️ 测试工具和最佳实践

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
// tests/mocks/fetch.js (待创建)
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
// 可以直接测试 DOM 操作
document.body.innerHTML = '<div>Test content</div>';
```

### 测试文件组织

```
tests/
├── mocks/
│   ├── chrome.js ✅
│   ├── fetch.js (待创建)
│   ├── notion-api.js (待创建)
│   └── dom.js (待创建)
│
├── unit/
│   ├── utils/
│   │   ├── normalizeUrl.test.js ✅
│   │   ├── imageUtils.test.js ✅
│   │   ├── dateUtils.test.js (待创建)
│   │   └── templateUtils.test.js (待创建)
│   │
│   ├── background/
│   │   ├── notionApi.test.js (待创建)
│   │   ├── batchProcessing.test.js (待创建)
│   │   └── storage.test.js (待创建)
│   │
│   ├── highlighter/
│   │   ├── create.test.js (待创建)
│   │   ├── delete.test.js (待创建)
│   │   └── persistence.test.js (待创建)
│   │
│   └── content/
│       ├── extraction.test.js (待创建)
│       ├── icon.test.js (待创建)
│       └── coverImage.test.js (待创建)
│
├── integration/
│   ├── saveFlow.test.js (待创建)
│   ├── highlightSync.test.js (待创建)
│   └── dataManagement.test.js (待创建)
│
└── e2e/ (未来考虑)
    └── playwright/ (使用 Playwright 进行端到端测试)
```

---

## 📈 测试指标追踪

### 每周目标
```
Week 1: 达到 10% (新增 30 测试)
Week 2: 达到 15% (新增 30 测试)
Week 3: 达到 20% (新增 30 测试) - 阶段 1 完成
Week 4-6: 达到 30% (新增 60 测试)
Week 7-8: 达到 35% (新增 30 测试) - 阶段 2 完成
Week 9-12: 达到 50% (新增 80 测试) - 阶段 3 完成
```

### 质量要求
- ✅ 所有测试必须通过
- ✅ 测试执行时间 < 10 秒
- ✅ 每个测试独立可运行
- ✅ Mock 数据真实反映实际场景
- ✅ 测试描述清晰易懂

---

## 🔄 持续集成

### GitHub Actions 自动化
```yaml
# .github/workflows/test.yml (已配置)
✅ 每次 push 自动运行测试
✅ Node.js 18.x, 20.x 多版本测试
✅ 生成覆盖率报告
⏳ 覆盖率达到 30% 后添加 Codecov 徽章
```

### 本地开发
```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- normalizeUrl.test.js

# 生成覆盖率报告
npm run test:coverage

# 监听模式 (开发时使用)
npm test -- --watch
```

---

## 📝 实施步骤

### 阶段 1 启动 (本周)

#### Step 1: 创建 Mock 基础设施
```bash
# 创建 Notion API Mock
touch tests/mocks/notion-api.js

# 创建 Fetch Mock
touch tests/mocks/fetch.js
```

#### Step 2: 完成 utils.js 测试
```bash
# 创建日期工具测试
touch tests/unit/utils/dateUtils.test.js

# 创建模板工具测试
touch tests/unit/utils/templateUtils.test.js
```

#### Step 3: 开始 background.js 核心测试
```bash
# 创建测试目录
mkdir -p tests/unit/background

# 创建 Notion API 测试
touch tests/unit/background/notionApi.test.js
```

#### Step 4: 每日测试执行
```bash
# 每天提交前运行
npm test

# 查看覆盖率
npm run test:coverage
```

---

## 📊 进度追踪

### 里程碑记录

| 日期 | 覆盖率 | 测试数 | 里程碑 |
|------|--------|--------|--------|
| 2025-10-05 | 5.81% | 70 | ✅ 测试框架建立,CI/CD 配置完成 |
| 2025-10-12 | 10% | 100 | 🎯 阶段 1.1 - Utils 完整覆盖 |
| 2025-10-19 | 15% | 120 | 🎯 阶段 1.2 - Notion API 核心 |
| 2025-10-26 | 20% | 150 | 🎯 阶段 1 完成 |
| 2025-11-16 | 30% | 180 | 🎯 阶段 2.1 - 标注系统 |
| 2025-11-30 | 35% | 210 | 🎯 阶段 2 完成 |
| 2025-12-31 | 50% | 250+ | 🎯 阶段 3 完成 |

---

## 🎁 预期收益

### 代码质量
- ✅ 减少 80% 的回归 Bug
- ✅ 重构更安全,有测试保护
- ✅ 新功能开发更快速

### 开发效率
- ✅ 快速验证代码改动
- ✅ 更早发现问题
- ✅ 减少手动测试时间

### 项目信誉
- ✅ 吸引更多贡献者
- ✅ 提升用户信任度
- ✅ 展示专业开发流程

### 维护成本
- ✅ 降低长期维护成本
- ✅ 文档即测试(测试即文档)
- ✅ 更容易交接和协作

---

## 📚 学习资源

### Jest 测试框架
- [Jest 官方文档](https://jestjs.io/docs/getting-started)
- [Jest Mock Functions](https://jestjs.io/docs/mock-functions)
- [Jest Matchers](https://jestjs.io/docs/expect)

### Chrome Extensions 测试
- [Testing Chrome Extensions](https://developer.chrome.com/docs/extensions/mv3/testing/)
- [Chrome API Mocking](https://github.com/clarkbw/jest-webextension-mock)

### 测试最佳实践
- [JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

## 🔍 常见问题

### Q: 测试覆盖率一定要达到 100% 吗?
**A:** 不需要。50-70% 是健康的目标。重点是测试**核心业务逻辑**,而不是追求数字。

### Q: 如何平衡测试时间和开发时间?
**A:** 遵循 80/20 原则:
- 优先测试 20% 的核心代码(提供 80% 的价值)
- 新功能开发时同步写测试
- 修复 Bug 时先写测试重现问题

### Q: Mock 太复杂怎么办?
**A:** 
- 先从简单的纯函数开始测试
- 逐步建立 Mock 库复用
- 对于过于复杂的依赖,考虑重构代码

### Q: 测试执行太慢怎么办?
**A:**
- 使用 `jest --onlyChanged` 只运行相关测试
- 开启 `--maxWorkers` 并行执行
- 避免在单元测试中做实际的网络请求

---

## 🎯 成功标准

### 阶段 1 完成标准
- ✅ 测试覆盖率 ≥ 20%
- ✅ 所有核心工具函数有测试
- ✅ Notion API 核心功能有测试
- ✅ CI/CD 通过率 100%

### 阶段 2 完成标准
- ✅ 测试覆盖率 ≥ 35%
- ✅ 标注系统完整测试
- ✅ 内容提取逻辑测试
- ✅ 测试执行时间 < 10 秒

### 阶段 3 完成标准
- ✅ 测试覆盖率 ≥ 50%
- ✅ 集成测试覆盖主要工作流
- ✅ UI 组件基础测试
- ✅ 添加 Codecov 徽章

---

**最后更新**: 2025-10-05  
**维护者**: @cowcfj  
**状态**: 🟢 活跃

---

💡 **提示**: 这是一个活文档,随着项目进展会持续更新。欢迎提供反馈和建议!
