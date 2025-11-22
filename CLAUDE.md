# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Notion Smart Clipper is a Chrome extension (Manifest V3) that intelligently extracts web content and saves it to Notion with multi-color highlighting support. The extension uses Mozilla Readability for content extraction and CSS Highlight API for non-invasive text highlighting.

## Development Commands

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run tests with coverage
npm test:coverage

# Run tests for CI (includes junit reporting)
npm test:ci

# Run a single test file
npm test -- path/to/test.test.js

# Run tests with verbose output
npm test -- --verbose

# Run specific test suites
npm test -- tests/unit/errorHandling/ErrorHandler.comprehensive.test.js
npm test -- tests/unit/performance/PerformanceOptimizer.comprehensive.test.js
```

### Building
```bash
# Development build (Rollup, no compression)
npm run build

#開發模式（實時編譯）
npm run build:watch

# Production build (Rollup + Terser compression)
npm run build:prod
```

**構建產物**：
- `dist/highlighter-v2.bundle.js` - 打包後的 highlighter 模組
  - 開發版本：166KB（未壓縮）
  - 生產版本：15KB（Terser 壓縮，-91%）

### Test Structure
- Unit tests: `tests/unit/**/*.test.js`
- Manual tests: `tests/manual/**/*.test.js` (not run in CI)
- E2E tests: `tests/e2e/**/*.test.js` (separate execution)
- Test helpers: `tests/helpers/*` (testable versions of scripts)
- Test mocks: `tests/mocks/chrome.js` (Chrome API mocks)

## Architecture Overview

### Core Scripts

**background.js** (Service Worker)
- Handles extension lifecycle, Notion API calls, template processing
- Message routing for popup ↔ content script communication
- Update notification system
- Key modules: `ScriptInjector`, `StorageUtil`, URL normalization, Notion API integration

**content.js** (Content Script)
- Extracts article content using Mozilla Readability
- CMS-aware fallback strategies (Drupal, WordPress, etc.)
- Large list extraction fallback for CLI documentation
- Image collection with featured image prioritization
- Expandable content detection and extraction

**highlighter-v2** (ES6 模組化)
- 位置：`scripts/highlighter/`（9個獨立模組）
- 構建產物：`dist/highlighter-v2.bundle.js`（Rollup + Terser）
- CSS Highlight API-based highlighting (non-DOM-modifying)
- Zero-DOM-mutation approach for better compatibility
- Legacy data migration from localStorage to chrome.storage
- Seamless migration from old span-based highlighting
- Multi-color support (yellow, green, blue, red, purple)
- Ctrl/Cmd+click or double-click to delete highlights

**模組結構**：
- `index.js` (124行) - 入口、全局 API 設置
- `core/Range.js` (125行) - Range 序列化/反序列化
- `core/HighlightManager.js` (701行) - 標註管理、事件處理
- `utils/color.js` (53行) - 顏色配置
- `utils/dom.js` (101行) - DOM 操作工具
- `utils/validation.js` (121行) - 輸入驗證
- `utils/path.js` (198行) - 節點路徑計算
- `utils/textSearch.js` (200行) - 文本搜索
- `utils/domStability.js` (146行) - DOM 穩定性檢測

### Key Features

**Highlighting System** (v2.5.0+)
- Uses CSS Custom Highlight API when available
- Graceful fallback to traditional span-based approach
- Automatic migration from legacy highlighting
- Persistent storage via chrome.storage.local
- Supports cross-paragraph text selection

**Content Extraction**
- Mozilla Readability as primary method
- Multi-layer CMS fallback strategies
- List-based content extraction for documentation pages
- Emergency extraction for technical docs
- Expandable/collapsible content detection

**Image Extraction**
- Featured/hero image prioritization
- 20+ selector strategies for cover images
- Author avatar/logo filtering
- Size-based scoring for best icon selection
- SVG icon preference with smart fallback

**Storage Architecture**
- Normalized URLs for consistent keys
- Tracking parameter removal (utm_*, gclid, fbclid, etc.)
- Per-page highlight storage: `highlights_${normalizedUrl}`
- Saved page metadata: `saved_${normalizedUrl}`

### Performance Optimizations

**PerformanceOptimizer** (scripts/performance/)
- Query result caching with LRU eviction
- Smart prewarming for common selectors
- Batch processing for large image collections
- Adaptive performance management

**AdaptivePerformanceManager**
- Dynamic performance tuning based on page complexity
- Automatic cache size and TTL adjustment
- Page complexity detection heuristics

**ErrorHandler & RetryManager** (scripts/errorHandling/)
- Exponential backoff retry logic
- Network error categorization
- Graceful degradation strategies

## Important Implementation Details

### URL Normalization
All URLs are normalized before storage/comparison:
- Remove hash fragments
- Remove tracking parameters
- Normalize trailing slashes
- Function: `normalizeUrl()` in utils.js and background.js

### Notion API Constraints
- Max 100 blocks per API call (use `appendBlocksInBatches`)
- Max 2000 characters per rich_text block (use `splitTextForHighlight`)
- Image URL validation required (use `isValidImageUrl`)
- Rate limit: ~3 requests/second (use delays in batch operations)

### Testing Considerations
- Tests use jsdom environment
- Chrome API is mocked via `tests/mocks/chrome.js`
- Testable versions of scripts in `tests/helpers/`
- Coverage threshold: branches 25%, functions 37%, lines/statements 29%
- Tests excluded from coverage collection are noted in jest.config.js

### Migration System
The extension includes automatic migration for:
1. localStorage highlights → chrome.storage.local
2. Old span-based highlights → CSS Highlight API
3. URL format changes between versions
4. Data format updates (v2.8.0, v2.9.0)

### Script Injection Pattern
Use `ScriptInjector` class in background.js:
```javascript
// Inject and execute
await ScriptInjector.injectAndExecute(tabId, files, func, options);

// Inject highlighter
await ScriptInjector.injectHighlighter(tabId);

// Collect highlights
const highlights = await ScriptInjector.collectHighlights(tabId);
```

## Testing Patterns

### Common Test Patterns
```javascript
// Mock chrome storage
const mockStorage = {};
global.chrome.storage.local.get.mockImplementation((keys, callback) => {
  const result = {};
  keys.forEach(key => result[key] = mockStorage[key]);
  callback(result);
});

// Test async functions
await expect(asyncFunction()).resolves.toBe(expectedValue);
await expect(asyncFunction()).rejects.toThrow(ExpectedError);

// Test DOM operations (jsdom)
const element = document.createElement('div');
element.innerHTML = '<p>Test</p>';
expect(element.querySelector('p').textContent).toBe('Test');
```

## File Organization

```
scripts/
├── background.js              # Service worker (main orchestrator)
├── content.js                 # Content extraction logic
├── highlighter/               # 🆕 ES6 Modular Highlighter
│   ├── index.js               #     Entry point (124 lines)
│   ├── core/
│   │   ├── Range.js           #     Range serialization (125 lines)
│   │   └── HighlightManager.js #    Highlight management (701 lines)
│   └── utils/
│       ├── color.js           #     Color configuration (53 lines)
│       ├── dom.js             #     DOM utilities (101 lines)
│       ├── validation.js      #     Input validation (121 lines)
│       ├── path.js            #     Node path computation (198 lines)
│       ├── textSearch.js      #     Text search (200 lines)
│       └── domStability.js    #     DOM stability (146 lines)
├── highlighter-v2.js          # Legacy file (kept for compatibility)
├── highlight-restore.js       # Restore highlights on page load
├── highlighter-migration.js   # Legacy migration utilities
├── seamless-migration.js      # Span → CSS API migration
├── script-injector.js         # Script injection helper
├── utils.js                   # Shared utilities (normalizeUrl, StorageUtil)
├── errorHandling/
│   ├── ErrorHandler.js        # Error logging and categorization
│   └── RetryManager.js        # Exponential backoff retries
├── performance/
│   ├── PerformanceOptimizer.js       # Query caching & batching
│   └── AdaptivePerformanceManager.js # Dynamic perf tuning
├── imageExtraction/
│   ├── ImageExtractor.js      # Main image extraction
│   ├── AttributeExtractor.js  # Extract from various attributes
│   ├── SrcsetParser.js        # Parse srcset/sizes
│   ├── ExtractionStrategy.js  # Strategy pattern for extraction
│   └── FallbackStrategies.js  # Fallback extraction methods
└── utils/
    ├── imageUtils.js          # Image URL validation & cleaning
    ├── htmlToNotionConverter.js  # HTML → Notion blocks
    └── pageComplexityDetector.js # Detect page complexity (ESM)

dist/                          # 🆕 Build outputs
└── highlighter-v2.bundle.js   #     Rollup + Terser bundle (15KB)
    └── highlighter-v2.bundle.js.map #  Source map (70KB)
```

## Development Workflow

1. **Adding new features**: Start with tests, then implement
2. **Modifying content extraction**: Test with manual test pages in `tests/manual/`
3. **Performance changes**: Run performance tests to validate improvements
4. **API changes**: Update both background.js and corresponding message handlers
5. **Storage changes**: Implement migration logic for backward compatibility

## CI/CD

- GitHub Actions workflows in `.github/workflows/`
- `test.yml`: Runs on every push, executes test suite
- `coverage.yml`: Runs after tests, uploads coverage to Codecov
- `branch-protection.yml`: Enforces PR requirements

## Common Debugging Tips

- Check service worker console: chrome://extensions → Inspect service worker
- Check content script console: Right-click page → Inspect → Console
- View storage: chrome://extensions → Details → Inspect views: service worker → Application tab
- Test content extraction: Use manual test files in `tests/manual/`
- Performance profiling: Enable PerformanceOptimizer metrics in dev mode

## Version History Notes

- v2.9.0: Compact path format for highlight storage
- v2.8.0: Search-style database selector, update notification system
- v2.7.3: Fixed long article truncation issue
- v2.6.0: Site icon extraction
- v2.5.6: Featured image prioritization
- v2.5.0: CSS Highlight API implementation, seamless migration
