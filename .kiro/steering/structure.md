# Project Structure

## Core Extension
```
├── manifest.json          # Extension configuration
├── scripts/               # Core modules (background.js, content.js, highlighter-v2.js, utils.js)
├── popup/                 # Extension UI (html, js, css)
├── options/               # Settings page
├── lib/                   # Third-party (Readability.js)
└── icons/                 # Extension icons
```

## Testing & Build
```
├── tests/                 # Jest unit tests, mocks, helpers
├── package.json           # Dependencies and scripts
├── jest.config.js         # Test configuration
└── build.sh              # Release packaging
```

## Documentation Strategy
```
├── README.md              # User-facing documentation
├── CHANGELOG.md           # Complete version history
├── RELEASE_NOTES_v*.md    # Individual release announcements
├── Agents.md              # Complete AI agent guidelines
└── AI_AGENT_QUICK_REF.md  # Essential rules and standards
```

## Key Conventions
- Modular architecture with clear separation of concerns
- Testable helpers in `tests/helpers/` for unit testing
- Comprehensive version management and migration handling
- Three-tier documentation: README → CHANGELOG → Release Notes

## Detailed Information
For complete project structure, file organization, and development conventions:
- **Complete guide**: `Agents.md` - Full project architecture and file system structure
- **Quick reference**: `AI_AGENT_QUICK_REF.md` - Documentation standards and file classification