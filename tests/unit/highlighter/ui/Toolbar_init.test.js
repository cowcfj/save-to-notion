
import { Toolbar } from '../../../../scripts/highlighter/ui/Toolbar.js';
import { createToolbarContainer } from '../../../../scripts/highlighter/ui/components/ToolbarContainer.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/ui/components/ToolbarContainer.js', () => ({
    createToolbarContainer: jest.fn()
}));

import { createMiniIcon } from '../../../../scripts/highlighter/ui/components/MiniIcon.js';

jest.mock('../../../../scripts/highlighter/ui/components/MiniIcon.js', () => ({
    createMiniIcon: jest.fn(),
    bindMiniIconEvents: jest.fn()
}));

jest.mock('../../../../scripts/highlighter/ui/components/ColorPicker.js', () => ({
    renderColorPicker: jest.fn()
}));

describe('Toolbar Initialization Integration', () => {
    let managerMock;
    let toolbar;

    beforeEach(() => {
        document.body.innerHTML = '';

        // Setup mock implementation inside beforeEach where document is available
        createToolbarContainer.mockImplementation(() => {
            const div = document.createElement('div');
            div.innerHTML = '<span id="highlight-count-v2">0</span>';
            return div;
        });

        createMiniIcon.mockImplementation(() => document.createElement('div'));

        // Mock HighlightManager
        managerMock = {
            highlights: new Map(),
            colors: { yellow: '#ff0' },
            currentColor: 'yellow',
            getCount: jest.fn().mockReturnValue(0),
            setColor: jest.fn(),
            addHighlight: jest.fn(),
            handleDocumentClick: jest.fn(),
            initialize: jest.fn().mockResolvedValue()
        };
    });

    test('should update count after manager initialization', async () => {
        // 1. Setup: Manager has 0 highlights initially
        managerMock.getCount.mockReturnValue(0);

        // 2. Create Toolbar
        toolbar = new Toolbar(managerMock);

        // Verify initial count is 0
        const countSpan = toolbar.container.querySelector('#highlight-count-v2');
        expect(countSpan.textContent).toBe('0');

        // 3. Simulate Manager loading data asynchronously
        managerMock.highlights.set('h1', {});
        managerMock.getCount.mockReturnValue(1);

        // 4. Simulate the fix in index.js: wait for initialization then update
        await managerMock.initialize().then(() => {
            toolbar.updateHighlightCount();
        });

        // 5. Verify count is updated
        expect(countSpan.textContent).toBe('1');
    });

    test('reproduction: count stays 0 without explicit update', async () => {
        // 1. Setup
        managerMock.getCount.mockReturnValue(0);
        toolbar = new Toolbar(managerMock);

        // 2. Simulate async load
        managerMock.highlights.set('h1', {});
        managerMock.getCount.mockReturnValue(1);

        // 3. Do NOT call updateHighlightCount (simulating current buggy behavior)
        await managerMock.initialize();

        // 4. Verify count is STILL 0 (Bug reproduced)
        const countSpan = toolbar.container.querySelector('#highlight-count-v2');
        expect(countSpan.textContent).toBe('0');
    });
});
