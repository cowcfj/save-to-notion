let shouldShowUpdateNotification;

beforeAll(async () => {
  ({ shouldShowUpdateNotification } =
    await import('../../../scripts/background/utils/updateNotificationVersion.js'));
});

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
      ['1.x.0', '2.0.0', false],
      ['1.0.0', '2.x.0', false],
      ['abc.def', '2.0.0', false],
      ['1.0.0', 'abc.def', false],
      ['1', '2.0.0', false],
      ['1.0.0', '2', false],
      ['', '2.0.0', false],
      [' ', '2.0.0', false],
      ['1.0.0', '', false],
      ['1.0.0', ' ', false],
    ])('upgrading from %s to %s should return %s', (previousVersion, currentVersion, expected) => {
      expect(shouldShowUpdateNotification(previousVersion, currentVersion)).toBe(expected);
    });
  });
});
