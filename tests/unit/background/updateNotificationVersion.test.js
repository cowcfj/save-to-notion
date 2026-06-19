const {
  shouldShowUpdateNotification,
} = require('../../../scripts/background/utils/updateNotificationVersion.cjs');

describe('updateNotificationVersion', () => {
  describe('shouldShowUpdateNotification', () => {
    test.each([
      ['1.0.0', '2.0.0', true],
      ['1.0.0', '1.1.0', true],
      ['2.47.0', '2.48.0', true],
      ['2.47.0', '2.47.1', false],
      ['2.7.2', '2.7.3', false],
      ['2.48.0', '2.47.0', false],
      ['1.1.0', '1.0.0', false],
      ['1.0.0', '1.0.0', false],
      [null, '2.0.0', false],
      ['1.0.0', null, false],
      [undefined, '2.0.0', false],
      ['1.0.0', undefined, false],
      [null, null, false],
    ])('returns %s for %s -> %s', (previousVersion, currentVersion, expected) => {
      expect(shouldShowUpdateNotification(previousVersion, currentVersion)).toBe(expected);
    });
  });
});
