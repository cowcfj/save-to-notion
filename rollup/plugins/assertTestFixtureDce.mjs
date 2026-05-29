const FORBIDDEN_TOKENS = [
  '__UNIT_TESTING__',
  '__notion_extraction_promise',
  '__notion_extraction_result',
  'TOOLBAR_TEST_FIXTURE_ENABLED',
  'ensureToolbar',
];

export function assertTestFixtureDce() {
  return {
    name: 'assert-test-fixture-dce',
    generateBundle(_options, bundle) {
      const violations = [];
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (asset.type !== 'chunk') continue;
        for (const token of FORBIDDEN_TOKENS) {
          if (asset.code.includes(token)) {
            violations.push({ fileName, token });
          }
        }
      }
      if (violations.length > 0) {
        const detail = violations
          .map(v => `  - ${v.fileName}: contains "${v.token}"`)
          .join('\n');
        this.error(
          [
            'Test-fixture gate leaked into production bundle.',
            'The following tokens MUST be eliminated by replace + terser DCE:',
            detail,
            '',
            'Likely cause: source token name and rollup/content.config.mjs `replace` mapping disagree.',
            'See docs/plans/2026-05-14-windowapi-legacy-compat-hardening-plan.md.',
          ].join('\n')
        );
      }
    },
  };
}
