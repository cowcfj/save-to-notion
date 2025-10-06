# Technology Stack

## Architecture
- **Manifest V3** Chrome extension
- **Service Worker**: `scripts/background.js` (Notion API, batch processing)
- **Content Scripts**: `scripts/content.js`, `scripts/highlighter-v2.js`
- **UI**: `popup/` and `options/` directories

## Key Technologies
- Mozilla Readability.js, CSS Highlight API, Chrome Extension APIs, Notion API
- Jest testing (20% coverage, targeting incremental improvement)

## Essential Commands
```bash
npm test                    # Run tests
npm test -- --coverage     # Coverage report
./build.sh                  # Package for release
```

## Development Notes
- Manual Chrome extension loading (no hot reload)
- Modular architecture with shared `scripts/utils.js`
- Seamless migration system for version upgrades

## Detailed Information
For comprehensive technical details, debugging guides, and code patterns:
- **Complete guide**: `Agents.md` - Full development workflow and standards
- **Quick reference**: `AI_AGENT_QUICK_REF.md` - Language rules and commit standards