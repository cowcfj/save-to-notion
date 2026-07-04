import { describe, expect, test } from '@jest/globals';

import { shouldShowUpdateNotification } from '../../../../scripts/background/utils/updateNotificationVersion.js';

describe('updateNotificationVersion native ESM', () => {
  test.each([
    ['2.47.0', '2.48.0', true],
    ['2.0.0', '3.0.0', true],
    ['2.47.0', '2.47.1', false],
    ['2.48.0', '2.47.0', false],
    ['2.8.0-dev', '2.8.1', false],
    [null, '2.8.0', false],
  ])('compares %s -> %s as %s', (previousVersion, currentVersion, expected) => {
    expect(shouldShowUpdateNotification(previousVersion, currentVersion)).toBe(expected);
  });
});
