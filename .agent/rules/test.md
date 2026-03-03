---
trigger: model_testing
description: Triggered when writing, running, or analyzing tests.
globs: ['**/*test*', '**/*spec*', 'tests/*']
---

# Testing Guidelines (Trigger)

> ⚠️ **CRITICAL**: Do NOT write tests based on guesswork or generic suggestions.

## 🚨 Mandatory Execution Protocol

When this rule is triggered (e.g., when adding, modifying, or fixing tests), you MUST immediately do the following two things:

1. **Invoke the Appropriate Testing Skill**:
   - If writing/fixing Unit Tests: You MUST follow the `javascript-testing-patterns` skill.
   - If writing/fixing E2E Tests: You MUST follow the `e2e-testing-patterns` skill.
   - If writing a new feature: You MUST follow `test-driven-development` (Write failing test first).

2. **Load Project-Specific Context**:
   - You MUST load and read the following JSON file to understand Chrome API mocking rules, Service Worker injection limits, and coverage baseline:
   - `[testing_rules.json](../../.agent/.shared/knowledge/testing_rules.json)`

## 🔗 Hub Reference

For other AI tools (like Cursor or Claude Code) that cannot trigger this rule, they should be pointed to:

- [`TESTING_GUIDE.md`](../../docs/guides/TESTING_GUIDE.md)
