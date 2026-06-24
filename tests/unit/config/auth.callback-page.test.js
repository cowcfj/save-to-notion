/**
 * auth callback page regression tests
 *
 * 驗證 canonical auth page 會以 ES module 載入 bundled auth.js，
 * 且 auth.js 會讀取 ../config/env/index.js 的設定。
 */

const fs = require('node:fs');
const path = require('node:path');

describe('auth callback page regressions', () => {
  let authHtml;
  let legacyAuthHtml;
  let authJs;

  beforeAll(() => {
    authHtml = fs.readFileSync(path.resolve(__dirname, '../../../pages/auth/auth.html'), 'utf8');
    legacyAuthHtml = fs.readFileSync(path.resolve(__dirname, '../../../auth.html'), 'utf8');
    authJs = fs.readFileSync(path.resolve(__dirname, '../../../scripts/auth/auth.js'), 'utf8');
  });

  test('canonical auth page 應以 module script 載入 bundled auth.js', () => {
    expect(authHtml).toMatch(
      /<script\b(?=[^>]*\bsrc="..\/..\/dist\/pages\/auth\.js")(?=[^>]*\btype="module")[^>]*><\/script>/
    );
  });

  test('auth.js 應從 env/index.js 讀取 BUILD_ENV', () => {
    expect(authJs).toContain("import { BUILD_ENV } from '../config/env/index.js';");
    expect(authJs).not.toContain("import { BUILD_ENV } from '../config/env.example.js';");
  });

  test('canonical auth page 應引用共用 callback stylesheet', () => {
    expect(authHtml).toMatch(
      /<link\s+rel="stylesheet"\s+href="..\/..\/styles\/callback-bridge\.css"\s*\/?>/
    );
  });

  test('root auth.html 應只作為 legacy redirect shim', () => {
    expect(legacyAuthHtml).toContain('dist/pages/auth-redirect.js');
    expect(legacyAuthHtml).not.toContain('dist/pages/auth.js');
  });
});
