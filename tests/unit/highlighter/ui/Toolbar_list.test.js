import { Toolbar } from '../../../../scripts/highlighter/ui/Toolbar.js';
import { createToolbarContainer } from '../../../../scripts/highlighter/ui/components/ToolbarContainer.js';
import { renderHighlightList } from '../../../../scripts/highlighter/ui/components/HighlightList.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/ui/components/ToolbarContainer.js', () => ({
  createToolbarContainer: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/MiniIcon.js', () => ({
  createMiniIcon: jest.fn(),
  bindMiniIconEvents: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/ColorPicker.js', () => ({
  renderColorPicker: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/HighlightList.js', () => ({
  renderHighlightList: jest.fn(),
}));

describe('Toolbar Highlight List Management', () => {
  let managerMock = null;
  let toolbar = null;
  let listContainer = null;
  let container = null;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    document.body.innerHTML = '';

    // Mock chrome API
    globalThis.window.chrome = {
      runtime: {
        sendMessage: jest.fn(),
      },
    };

    // Create container with list element
    listContainer = document.createElement('div');
    listContainer.id = 'highlight-list-v2';
    listContainer.style.display = 'none';

    container = document.createElement('div');
    container.append(listContainer);

    // Add other required elements
    const countSpan = document.createElement('span');
    countSpan.id = 'highlight-count-v2';
    container.append(countSpan);

    createToolbarContainer.mockReturnValue(container);

    const { createMiniIcon } = require('../../../../scripts/highlighter/ui/components/MiniIcon.js');
    createMiniIcon.mockReturnValue(document.createElement('div'));

    // Mock Manager with some highlights
    const highlights = new Map([
      ['id1', { id: 'id1', text: 'Highlight 1', color: 'yellow' }],
      ['id2', { id: 'id2', text: 'Highlight 2', color: 'green' }],
    ]);

    managerMock = {
      highlights,
      colors: { yellow: '#ff0', green: '#0f0' },
      currentColor: 'yellow',
      getCount: jest.fn().mockReturnValue(2),
      setColor: jest.fn(),
      addHighlight: jest.fn(),
      removeHighlight: jest.fn(),
      handleDocumentClick: jest.fn(),
      collectHighlightsForNotion: jest.fn(),
    };

    toolbar = new Toolbar(managerMock);
  });

  describe('toggleHighlightList', () => {
    test('should show list when it is hidden', () => {
      expect(listContainer.style.display).toBe('none');

      toolbar.toggleHighlightList();

      expect(renderHighlightList).toHaveBeenCalledTimes(1);
      expect(listContainer.style.display).toBe('block');
    });

    test('should hide list when it is visible', () => {
      // First, show the list
      toolbar.toggleHighlightList();
      expect(listContainer.style.display).toBe('block');

      // Clear the mock to check second call
      jest.clearAllMocks();

      // Now toggle again to hide
      toolbar.toggleHighlightList();

      expect(renderHighlightList).not.toHaveBeenCalled();
      expect(listContainer.style.display).toBe('none');
    });

    test('should pass delete callback that calls refreshHighlightList', () => {
      toolbar.toggleHighlightList();

      expect(renderHighlightList).toHaveBeenCalledTimes(1);
      const deleteCallback = renderHighlightList.mock.calls[0][2];
      expect(deleteCallback).toBeInstanceOf(Function);

      // Spy on refreshHighlightList
      const refreshSpy = jest.spyOn(toolbar, 'refreshHighlightList');

      // Call the delete callback
      deleteCallback('id1');

      expect(managerMock.removeHighlight).toHaveBeenCalledWith('id1');
      expect(managerMock.getCount).toHaveBeenCalled();
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('refreshHighlightList', () => {
    test('should refresh list when it is visible', () => {
      // Show the list first
      toolbar.toggleHighlightList();
      expect(listContainer.style.display).toBe('block');

      // Clear the mock
      jest.clearAllMocks();

      // Now refresh
      toolbar.refreshHighlightList();

      expect(renderHighlightList).toHaveBeenCalledTimes(1);
      expect(listContainer.style.display).toBe('block'); // Should remain visible
    });

    test('should not refresh list when it is hidden', () => {
      expect(listContainer.style.display).toBe('none');

      toolbar.refreshHighlightList();

      expect(renderHighlightList).not.toHaveBeenCalled();
      expect(listContainer.style.display).toBe('none');
    });

    test('should pass updated highlights to renderHighlightList', () => {
      // Show the list
      toolbar.toggleHighlightList();
      jest.clearAllMocks();

      // Update highlights
      managerMock.highlights.delete('id1');
      managerMock.getCount.mockReturnValue(1);

      // Refresh
      toolbar.refreshHighlightList();

      expect(renderHighlightList).toHaveBeenCalledWith(
        listContainer,
        expect.arrayContaining([expect.objectContaining({ id: 'id2' })]),
        expect.any(Function),
        expect.any(Function)
      );
      expect(renderHighlightList).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([expect.objectContaining({ id: 'id1' })]),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Ctrl+click delete integration', () => {
    test('should refresh list when deleting via Ctrl+click and list is visible', () => {
      // Show the list
      toolbar.toggleHighlightList();
      expect(listContainer.style.display).toBe('block');
      jest.clearAllMocks();

      // Spy on refreshHighlightList
      const refreshSpy = jest.spyOn(toolbar, 'refreshHighlightList');

      // Simulate Ctrl+click delete
      managerMock.handleDocumentClick.mockReturnValue(true);
      const clickEvent = new MouseEvent('click');
      document.dispatchEvent(clickEvent);

      expect(refreshSpy).toHaveBeenCalled();
      expect(listContainer.style.display).toBe('block'); // List should still be visible
    });

    test('should not refresh list when deleting via Ctrl+click and list is hidden', () => {
      expect(listContainer.style.display).toBe('none');

      const refreshSpy = jest.spyOn(toolbar, 'refreshHighlightList');

      // Simulate Ctrl+click delete
      managerMock.handleDocumentClick.mockReturnValue(true);
      const clickEvent = new MouseEvent('click');
      document.dispatchEvent(clickEvent);

      expect(refreshSpy).not.toHaveBeenCalled();
    });
  });
});
