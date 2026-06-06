/**
 * @jest-environment node
 */

import { RUNTIME_ERROR_MESSAGES } from '../../../../scripts/config/messages/runtimeErrorMessages.js';

describe('FloatingRailRuntime (node env — no window)', () => {
  it('window 不存在時拋 EXTENSION_UNAVAILABLE', async () => {
    const { checkPageStatus } =
      await import('../../../../scripts/highlighter/ui/FloatingRailRuntime.js');

    await expect(checkPageStatus()).rejects.toThrow(RUNTIME_ERROR_MESSAGES.EXTENSION_UNAVAILABLE);
  });
});
