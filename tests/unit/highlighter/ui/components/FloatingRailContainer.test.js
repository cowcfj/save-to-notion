/**
 * @jest-environment jsdom
 */

import { createFloatingRailContainer } from '../../../../../scripts/highlighter/ui/components/FloatingRailContainer.js';
import { HIGHLIGHTER_MESSAGES } from '../../../../../scripts/config/messages/highlighterMessages.js';

describe('FloatingRailContainer', () => {
  test('color swatches should use localized aria-labels while keeping color keys', () => {
    const container = createFloatingRailContainer({ selectedColor: 'yellow' });

    const yellowSwatch = container.querySelector('[data-color="yellow"]');
    const greenSwatch = container.querySelector('[data-color="green"]');

    expect(yellowSwatch.getAttribute('aria-label')).toBe(
      HIGHLIGHTER_MESSAGES.TOOLBAR.COLOR_PICKER_ARIA_LABEL('黃')
    );
    expect(greenSwatch.getAttribute('aria-label')).toBe(
      HIGHLIGHTER_MESSAGES.TOOLBAR.COLOR_PICKER_ARIA_LABEL('綠')
    );
    expect(yellowSwatch.dataset.color).toBe('yellow');
    expect(yellowSwatch.getAttribute('role')).toBe('radio');
    expect(yellowSwatch.getAttribute('aria-checked')).toBe('true');
  });
});
