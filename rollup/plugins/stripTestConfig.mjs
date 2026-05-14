export function stripTestConfig() {
  return {
    name: 'strip-test-config',
    transform(code) {
      const testExposureBlockPattern = /\/\/ TEST_EXPOSURE_START[\s\S]*?\/\/ TEST_EXPOSURE_END/g;

      return {
        code: code.replaceAll(testExposureBlockPattern, ''),
        map: null,
      };
    },
  };
}
