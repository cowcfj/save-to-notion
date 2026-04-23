import { AuthMode } from '../../../scripts/config/extension/authMode.js';
import { ACCOUNT_API } from '../../../scripts/config/extension/accountApi.js';
import { NOTION_API } from '../../../scripts/config/extension/notionApi.js';
import * as notionApiModule from '../../../scripts/config/extension/notionApi.js';
import { NOTION_OAUTH } from '../../../scripts/config/extension/notionAuth.js';

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
