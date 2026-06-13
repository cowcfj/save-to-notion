/**
 * @jest-environment node
 */

const { detectPageComplexity } = require('../../scripts/utils/pageComplexityDetector.js');

describe('pageComplexityDetector non-browser environment regression', () => {
  test('detectPageComplexity should not fall back when document lacks URL fields outside browser', () => {
    const documentLike = {
      body: { textContent: 'plain article content for node environment' },
      title: '',
      querySelectorAll: jest.fn(() => []),
    };

    const result = detectPageComplexity(documentLike);

    expect(result.metrics).toEqual(
      expect.objectContaining({
        isDocSite: false,
        textLength: documentLike.body.textContent.length,
      })
    );
    expect(result.hasAds).toBe(false);
    expect(result.isComplexLayout).toBe(false);
  });
});
