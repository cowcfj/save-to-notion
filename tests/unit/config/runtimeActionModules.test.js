import { CONTENT_BRIDGE_ACTIONS } from '../../../scripts/config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../../../scripts/config/runtimeActions/highlighterActions.js';
import { PAGE_SAVE_ACTIONS } from '../../../scripts/config/runtimeActions/pageSaveActions.js';
import { PRELOADER_ACTIONS } from '../../../scripts/config/runtimeActions/preloaderActions.js';
import { RUNTIME_ACTIONS } from '../../../scripts/config/shared/runtimeActions.js';

describe('runtime action 模組拆分', () => {
  const expectedModules = [
    {
      registry: PRELOADER_ACTIONS,
      keys: ['USER_ACTIVATE_SHORTCUT', 'PING', 'INIT_BUNDLE', 'REPLAY_BUFFERED_EVENTS'],
    },
    {
      registry: CONTENT_BRIDGE_ACTIONS,
      keys: ['PING', 'SET_STABLE_URL', 'GET_STABLE_URL', 'INIT_BUNDLE', 'REPLAY_BUFFERED_EVENTS'],
    },
    {
      registry: HIGHLIGHTER_ACTIONS,
      keys: [
        'SHOW_TOOLBAR',
        'SHOW_HIGHLIGHTER',
        'TOGGLE_HIGHLIGHTER',
        'START_HIGHLIGHT',
        'SYNC_HIGHLIGHTS',
        'UPDATE_HIGHLIGHTS',
        'CLEAR_HIGHLIGHTS',
        'REMOVE_HIGHLIGHT_DOM',
      ],
    },
    {
      registry: PAGE_SAVE_ACTIONS,
      keys: [
        'CHECK_PAGE_STATUS',
        'SAVE_PAGE',
        'SAVE_PAGE_FROM_TOOLBAR',
        'PAGE_SAVE_HINT',
        'OPEN_NOTION_PAGE',
        'OPEN_SIDE_PANEL',
      ],
    },
  ];

  test('拆分模組應輸出凍結的 action registry，且值與 aggregate registry 一致', () => {
    for (const { registry: actionRegistry, keys } of expectedModules) {
      expect(actionRegistry).toBeDefined();
      expect(Object.isFrozen(actionRegistry)).toBe(true);
      expect(Object.keys(actionRegistry).toSorted((a, b) => a.localeCompare(b))).toEqual(
        keys.toSorted((a, b) => a.localeCompare(b))
      );

      for (const key of keys) {
        expect(actionRegistry[key]).toBe(RUNTIME_ACTIONS[key]);
      }
    }
  });
});
