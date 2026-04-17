/**
 * manifest.json — auth.html web_accessible_resources 測試
 *
 * 驗證 auth.html 已正確加入 web_accessible_resources，
 * 且 matches 不包含 <all_urls>（安全限制）。
 *
 * bridge rollout 完成前，legacy direct redirect 仍可能存在，因此 auth.html 的
 * web_accessible_resources 條目暫時 **MUST NOT** 移除。
 *
 * @see manifest.json
 * @see docs/plans/2026-04-17-cloudflare-frontend-account-integration-plan.md §Task 2
 */

const fs = require('node:fs');
const path = require('node:path');

describe('manifest.json — auth.html web_accessible_resources', () => {
  let manifest;

  beforeAll(() => {
    const manifestPath = path.resolve(__dirname, '../../../manifest.json');
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  });

  test('web_accessible_resources 應包含 auth.html 條目', () => {
    const war = manifest.web_accessible_resources;
    const authEntry = war.find(entry => entry.resources?.includes('auth.html'));
    expect(authEntry).toBeDefined();
  });

  test('auth.html 的 matches MUST NOT 包含 <all_urls>（安全限制）', () => {
    const war = manifest.web_accessible_resources;
    const authEntry = war.find(entry => entry.resources?.includes('auth.html'));
    expect(authEntry?.matches).not.toContain('<all_urls>');
  });

  test('auth.html 的 matches 應限制在正式 Worker origin 與 localhost', () => {
    const war = manifest.web_accessible_resources;
    const authEntry = war.find(entry => entry.resources?.includes('auth.html'));
    expect(authEntry?.matches).toEqual([
      'https://save-to-notion-api.bulldrive.workers.dev/*',
      'http://localhost/*',
    ]);
  });

  test('auth.html 的 matches 不應使用 workers.dev 萬用字元', () => {
    const war = manifest.web_accessible_resources;
    const authEntry = war.find(entry => entry.resources?.includes('auth.html'));
    expect(authEntry?.matches).not.toContain('https://*.workers.dev/*');
  });

  test('auth.html 條目應與 content.bundle.js 條目完全分開', () => {
    const war = manifest.web_accessible_resources;
    const contentEntry = war.find(entry =>
      entry.resources?.some(r => r.includes('content.bundle.js'))
    );
    const authEntry = war.find(entry => entry.resources?.includes('auth.html'));

    // 必須是獨立的兩個不同物件
    expect(contentEntry).toBeDefined();
    expect(authEntry).toBeDefined();
    expect(contentEntry).not.toBe(authEntry);
  });
});
