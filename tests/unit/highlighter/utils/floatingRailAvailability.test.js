/**
 * @jest-environment jsdom
 */

const {
  formatRuntimeErrorMessage,
} = require('../../../../scripts/highlighter/utils/floatingRailAvailability.js');
const {
  RUNTIME_ERROR_MESSAGES,
} = require('../../../../scripts/config/runtimeActions/errorMessages.js');

describe('floatingRailAvailability', () => {
  describe('formatRuntimeErrorMessage', () => {
    test('應允許白名單內的 runtime error 字串', () => {
      expect(
        formatRuntimeErrorMessage(
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_SHOW_METHOD_MISSING,
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_SHOW_METHOD_MISSING);
    });

    test('應允許白名單內的 runtime error.message', () => {
      expect(
        formatRuntimeErrorMessage(
          new TypeError(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING),
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING);
    });

    test('任意字串應回退到 fallbackMessage', () => {
      expect(
        formatRuntimeErrorMessage(
          'internal failure details',
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED);
    });

    test('任意 error.message 應回退到 fallbackMessage', () => {
      expect(
        formatRuntimeErrorMessage(
          new Error('unexpected rail crash'),
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED);
    });
  });
});
