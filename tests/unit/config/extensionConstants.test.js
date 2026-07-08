let AuthMode;
let ACCOUNT_API;
let NOTION_API;
let notionApiModule;
let NOTION_OAUTH;

beforeAll(async () => {
  ({ AuthMode } = await import('../../../scripts/config/extension/authMode.js'));
  ({ ACCOUNT_API } = await import('../../../scripts/config/extension/accountApi.js'));
  notionApiModule = await import('../../../scripts/config/extension/notionApi.js');
  ({ NOTION_API } = notionApiModule);
  ({ NOTION_OAUTH } = await import('../../../scripts/config/extension/notionAuth.js'));
});

describe('extension config constants', () => {
  it('exports immutable constant objects', () => {
    expect(Object.isFrozen(AuthMode)).toBe(true);
    expect(Object.isFrozen(ACCOUNT_API)).toBe(true);
    expect(Object.isFrozen(NOTION_OAUTH)).toBe(true);
    expect(Object.isFrozen(NOTION_API)).toBe(true);
  });

  it('keeps NOTION_API as the only canonical Notion config export', () => {
    expect(notionApiModule).not.toHaveProperty('NOTION_CONFIG');
  });
});
