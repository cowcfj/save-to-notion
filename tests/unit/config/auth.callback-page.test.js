/**
 * auth callback page regression tests
 *
 * 驗證 auth.html 會以 ES module 載入 auth.js，
 * 且 auth.js 會讀取 ../config/env/index.js 的設定。
 */

const fs = require('node:fs');
const path = require('node:path');

describe('auth callback page regressions', () => {
  let authHtml;
  let authJs;

  beforeAll(() => {
    authHtml = fs.readFileSync(path.resolve(__dirname, '../../../auth.html'), 'utf8');
    authJs = fs.readFileSync(path.resolve(__dirname, '../../../scripts/auth/auth.js'), 'utf8');
  });

  test('auth.html 應以 module script 載入 auth.js', () => {
    expect(authHtml).toMatch(/<script\s+src="scripts\/auth\/auth\.js"\s+type="module"><\/script>/);
  });

  test('auth.js 應從 env/index.js 讀取 BUILD_ENV', () => {
    expect(authJs).toContain("import { BUILD_ENV } from '../config/env/index.js';");
    expect(authJs).not.toContain("import { BUILD_ENV } from '../config/env.example.js';");
    expect(authJs).not.toContain("import { BUILD_ENV } from '../config/env.js';");
  });

  test('auth.html 應引用共用 callback stylesheet', () => {
    expect(authHtml).toMatch(
      /<link\s+rel="stylesheet"\s+href="styles\/callback-bridge\.css"\s*\/?>/
    );
  });
});
