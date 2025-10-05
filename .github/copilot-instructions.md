# Notion Smart Clipper - AI Coding Guide

## Project Overview
Chrome Extension (Manifest V3) for saving web content to Notion with intelligent text highlighting. Current version: v2.7.3

## Architecture Overview

### Three-Layer Design
1. **Background Service** (`scripts/background.js`): Notion API integration, batch processing
2. **Content Scripts**: Web content extraction and highlighting system
   - `scripts/content.js`: Readability.js-based extraction
   - `scripts/highlighter-v2.js`: CSS Custom Highlight API annotations
   - `scripts/utils.js`: Shared utilities
3. **UI Layer**: `popup/` and `options/` directories

### Key Technical Decisions

**CSS Highlight API over DOM Manipulation**
- Zero-DOM modification approach (v2.5.0+)
- Supports cross-element selections
- Automatic migration from legacy `<span>`-based system

**Batch Processing for Long Content**
- Notion API: 100 blocks/request limit
- Auto-splitting with 350ms delays (rate limiting)
- Graceful degradation on partial failures

**Storage Pattern**
- Keys: `saved_${normalizedUrl}` and `highlights_${normalizedUrl}`
- Always normalize URLs before storage operations
- Cleanup both keys together when page deleted

## Development Basics

### Load Extension for Testing
```bash
1. chrome://extensions/ → Enable "Developer mode"
2. "Load unpacked" → Select project root
3. Verify manifest.json version
```

### Debug Content Scripts
```javascript
// Open webpage → DevTools Console
// Filter by emoji: "🎨" (highlights), "📦" (storage), "🚀" (init)
```

### Debug Background Service
```bash
chrome://extensions/ → "Inspect service worker"
chrome.storage.local.get(null, console.log) // View all data
```

## Code Conventions

### Logging Pattern
```javascript
console.log('🚀 [初始化]...') // Initialization
console.log('📦 [存儲]...')   // Storage
console.log('🎨 [標註]...')   // Highlights
console.log('❌ [錯誤]...')   // Errors
```

### Error Handling
- Multi-layer fallback strategies
- Always log with context
- User-friendly error messages

### Version Updates
Update these files together:
- `manifest.json:version`
- `package.json:version`
- `README.md` changelog
- `CHANGELOG.md` technical details

## Integration Points

### Notion API (v2022-06-28)
- Rate limit: 3 requests/second
- Block limit: 100 per request
- Use `appendBlocksInBatches()` for large content

### Content Extraction
- Mozilla Readability.js for article parsing
- Multi-source icon extraction (Apple Touch Icon preferred)
- Image URL cleaning for proxy/CDN compatibility

## Key Files

- `scripts/background.js`: Core business logic
- `scripts/highlighter-v2.js`: Highlight system
- `manifest.json`: Extension configuration
- `CHANGELOG.md`: Technical change history

## Common Issues

1. Highlight order: Migration must complete before restoration
2. URL normalization required for all storage operations
3. Background worker cannot access DOM directly
4. Check browser support for CSS Highlight API
5. Prevent duplicate saves via `saved_` key tracking
