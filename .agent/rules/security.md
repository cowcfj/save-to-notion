---
trigger: security_check
description: Triggered when handling user input, DOM manipulation, or authentication.
globs: ['**/*security*', '**/*Auth*', '**/*sanitize*']
---

# Security Guidelines (Trigger)

> ⚠️ **CRITICAL**: Do NOT write code handling external input or output without defense-in-depth measures.

## 🚨 Mandatory Execution Protocol

When this rule is triggered, you MUST immediately do the following two things:

1. **Invoke the Security Review Skill**:
   - You MUST follow the `security-review` skill to conduct a rigorous check.
   - Specifically focus on XSS, Secrets Management, Input Validation, and Authorization.

2. **Load Project-Specific Context**:
   - You MUST load and read the following JSON file to understand production build safety overrides, Chrome extension limitations, and critical supply chain vulnerabilities specific to this project:
   - `[security_rules.json](../../.agent/.shared/knowledge/security_rules.json)`

## 🔗 Hub Reference

For other AI tools (like Cursor or Claude Code) that cannot trigger this rule, they should be pointed to:

- [`SECURITY_BEST_PRACTICES.md`](../../docs/guides/SECURITY_BEST_PRACTICES.md)
