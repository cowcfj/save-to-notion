---
trigger: architecture
description: Triggered when modifying core architectural components, services, or configurations.
globs: ['**/*Service*', '**/*Manager*', 'package.json', 'manifest.json', 'webpack.config.js']
---

# 🏛️ Architecture Decision Protocol (Trigger)

> ⚠️ **CRITICAL**: Significant architectural changes detected.

## 🚨 Mandatory ADR Evaluation

When modifying core services, foundational managers, or fundamental project configuration (like `package.json` dependencies or `manifest.json`), you **MUST** evaluate if this change requires an Architecture Decision Record (ADR).

1. **Review the Strategy**: Read `[DOCUMENTATION_STRATEGY.md](../../docs/guides/DOCUMENTATION_STRATEGY.md)` and jump straight to the **"⚖️ 架構決策紀錄策略 (docs/adr/)"** section.
2. **Evaluate the Need**: Ask yourself:
   - Does this change introduce a new library or dependency?
   - Does it change how data is stored or synchronized?
   - Does it change communication patterns between extension components?
   - Is it a decision that reviewers will question "Why wasn't option B chosen?"
3. **Execute ADR Creation**: If the answer is YES to any of the above, you **MUST** pause implementation and generate an ADR using `docs/adr/0000-template.md` to document the decision context before proceeding.
