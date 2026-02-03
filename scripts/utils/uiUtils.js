/**
 * UI Utilities Module
 * Provides generic, page-agnostic UI operations.
 */

import Logger from './Logger.js';

/**
 * Injects SVG Sprite Sheet into the document body.
 * Accepts an icons object (key-value pairs of SVG strings).
 *
 * @param {Object} icons - The icons configuration object (e.g., UI_ICONS)
 */
export function injectIcons(icons) {
  if (typeof document === 'undefined') {
    return;
  }

  // Prevent duplicate injection
  if (document.getElementById('notion-clipper-svg-definitions')) {
    return;
  }

  if (!icons || typeof icons !== 'object') {
    Logger.warn('Invalid icons object provided to injectIcons', {
      action: 'injectIcons',
      icons,
    });
    return;
  }

  const parser = new DOMParser();
  const symbols = [];

  Object.entries(icons).forEach(([key, svgString]) => {
    try {
      // Use DOMParser to ensure attributes and structure are handled correctly
      const doc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      if (svgEl) {
        const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
        // ID Rule: GENERAL -> icon-general
        symbol.id = `icon-${key.toLowerCase().replace(/_/g, '-')}`;

        // Migrate viewBox and appearance attributes
        const attributes = [
          'viewBox',
          'fill',
          'stroke',
          'stroke-width',
          'stroke-linecap',
          'stroke-linejoin',
        ];
        attributes.forEach(attr => {
          if (svgEl.hasAttribute(attr)) {
            symbol.setAttribute(attr, svgEl.getAttribute(attr));
          }
        });
        symbol.innerHTML = svgEl.innerHTML;
        symbols.push(symbol);
      }
    } catch (error) {
      Logger.warn('Failed to parse icon', {
        action: 'injectIcons',
        key,
        error,
      });
    }
  });

  const spriteContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  spriteContainer.id = 'notion-clipper-svg-definitions';
  spriteContainer.style.display = 'none';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  symbols.forEach(symbol => defs.appendChild(symbol));

  spriteContainer.appendChild(defs);

  const verifySymbols = () => {
    try {
      const defsEl = document.querySelector('#notion-clipper-svg-definitions defs');
      if (!defsEl) {
        Logger.warn('SVG sprite defs not found after injection', {
          action: 'injectIcons',
          operation: 'verifySymbols',
        });
        return;
      }

      // Dynamic ID list for verification
      const required = Object.keys(icons).map(
        key => `icon-${key.toLowerCase().replace(/_/g, '-')}`
      );
      required.forEach(id => {
        if (!defsEl.querySelector(`#${id}`)) {
          Logger.warn('Missing SVG symbol', {
            action: 'injectIcons',
            operation: 'verifySymbols',
            id,
          });
        }
      });
    } catch (error) {
      Logger.warn('Failed to verify SVG symbols', {
        action: 'injectIcons',
        operation: 'verifySymbols',
        error,
      });
    }
  };

  // Inject into body
  if (document.body) {
    document.body.prepend(spriteContainer);
    verifySymbols();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.prepend(spriteContainer);
      verifySymbols();
    });
  }
}
