---
name: security-review
description: Provide rigorous security reviews for pull requests or daily coding tasks. Focus on XSS, Secrets Management, Input Validation, and Authorization.
---

# Security Review Skill

This skill ensures all code follows security best practices and identifies potential vulnerabilities. Use this skill when reviewing code, implementing authentication/authorization, handling user input, or dealing with secrets.

## Core Security Checklist

### 1. Secrets Management

- **Never hardcode secrets** (API keys, tokens, passwords) in the source code.
- Always retrieve secrets from environment variables (e.g., `process.env.OPENAI_API_KEY`).
- Validate that secrets exist before proceeding.
- Ensure no sensitive material is checked into `.env.local` or Git history.

### 2. Input Validation

- **Always Validate User Input** using schema validation (e.g., Zod).
- Avoid relying on client-side validation alone; always enforce validation on the server/backend.
- Validate file uploads strictly by size, MIME type, and extension whitelist.

### 3. XSS (Cross-Site Scripting) Prevention

- Use DOM API like `textContent` or `innerText` instead of `innerHTML`.
- If `innerHTML` or `dangerouslySetInnerHTML` is unavoidable, ALWAYS sanitize input using DOMPurify.
- Ensure Content Security Policy (CSP) headers are configured to prevent unsafe inline scripts and evals.

### 4. Authentication & Authorization

- Store tokens in HTTP-only, secure, SameSite cookies, NOT in `localStorage`.
- Perform authorization checks before any sensitive operation (e.g., checking if the user owns the data or is an admin before deletion).
- Do not trust user-provided identifiers (e.g., user IDs in requests) without verification against the session.

### 5. Dependency Security

- Verify the versions of dependencies against known vulnerabilities (e.g., ReDoS in minimatch).
- Enforce version baselines using `overrides` or `resolutions` in `package.json`.

### 6. Logging and PII

- Never log Authentication Tokens, PII (Personally Identifiable Information), or secrets in plain text.
- Clean and sanitize logs to prevent sensitive leakage into observability platforms.
