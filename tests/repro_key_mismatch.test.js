import { normalizeUrl, computeStableUrl } from '../scripts/utils/urlUtils.js';

describe('Key Mismatch Reproduction', () => {
  const originalUrlEncoded =
    'https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320713/%E6%B6%88%E9%98%B2%E5%93%A1%E6%B6%89%E5%A7%A6%E5%A5%B3%E5%8F%8B%E4%BA%BA-%E7%9C%81%E9%96%8B%E7%93%B6%E8%B2%BB%E8%AA%98%E5%88%B0%E5%96%AE%E4%BD%8D%E7%85%AE%E9%A3%9F-%E5%A5%B3%E6%96%B9%E9%86%92%E4%BE%86%E7%8D%B2%E5%91%8A%E7%9F%A5%E5%B7%B2%E6%80%A7%E4%BA%A4';

  test('normalizeUrl should be idempotent', () => {
    const once = normalizeUrl(originalUrlEncoded);
    const twice = normalizeUrl(once);
    console.log('Once:', once);
    console.log('Twice:', twice);
    expect(once).toBe(twice);
  });

  test('computeStableUrl output should survive double normalizeUrl', () => {
    const stable = computeStableUrl(originalUrlEncoded);
    console.log('Stable:             ', stable);
    const normalized = normalizeUrl(stable);
    console.log('normalizeUrl(stable):', normalized);
    expect(stable).toBe(normalized);
  });

  test('Background key vs Content key should match', () => {
    // Simulating background: resolveStorageUrl -> computeStableUrl -> normalizeUrl
    const stable = computeStableUrl(originalUrlEncoded);
    const bgKey = `highlights_${stable}`;

    // Simulating content script StorageUtil: normalizeUrl(stable) -> key
    const contentNorm = normalizeUrl(stable);
    const csKey = `highlights_${contentNorm}`;

    console.log('Background key:', bgKey);
    console.log('Content key:   ', csKey);
    expect(bgKey).toBe(csKey);
  });

  test('Content script fallback key', () => {
    // Simulate: HighlightStorage fallback: normalizeUrl(location.href)
    const originalNorm = normalizeUrl(originalUrlEncoded);
    const fallbackKey = `highlights_${normalizeUrl(originalNorm)}`;

    console.log('Fallback key:', fallbackKey);
    // Check if this matches the old key
    const oldKey = `highlights_${normalizeUrl(originalUrlEncoded)}`;
    console.log('Old key:     ', oldKey);
    expect(fallbackKey).toBe(oldKey);
  });
});
