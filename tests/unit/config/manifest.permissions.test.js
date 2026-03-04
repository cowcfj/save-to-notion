const fs = require('fs');
const path = require('path');

describe('manifest permissions', () => {
  test('應包含 OAuth 必需的 identity 權限', () => {
    const manifestPath = path.resolve(__dirname, '../../../manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(Array.isArray(manifest.permissions)).toBe(true);
    expect(manifest.permissions).toContain('identity');
  });
});
