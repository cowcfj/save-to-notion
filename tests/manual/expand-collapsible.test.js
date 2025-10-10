/**
 * Tests for expandCollapsibleElementsForTest helper
 */
const { JSDOM } = require('jsdom');
const { expandCollapsibleElementsForTest } = require('../../helpers/expand.testable');

describe('expandCollapsibleElementsForTest', () => {
    test('expands <details> elements', async () => {
        const dom = new JSDOM(`<!doctype html><body><details id="d1"><summary>Hi</summary><p>Hidden content here</p></details></body>`);
        const doc = dom.window.document;
        // ensure not open initially
        const details = doc.querySelector('details');
        details.removeAttribute('open');

        const expanded = await expandCollapsibleElementsForTest(doc);
        expect(expanded.length).toBeGreaterThanOrEqual(1);
        expect(details.hasAttribute('open')).toBeTruthy();
    });

    test('expands aria-controlled element via trigger', async () => {
        const dom = new JSDOM(`<!doctype html><body><button id="btn" aria-expanded="false" aria-controls="target">more</button><div id="target" aria-hidden="true">long text ..................................................................</div></body>`);
        const doc = dom.window.document;
        const btn = doc.getElementById('btn');
        const target = doc.getElementById('target');

        const expanded = await expandCollapsibleElementsForTest(doc);
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(target.getAttribute('aria-hidden')).toBeNull();
        expect(expanded).toContain(target);
    });

    test('removes collapsed/collapse classes and aria-hidden', async () => {
        const dom = new JSDOM(`<!doctype html><body><div class="collapsed" aria-hidden="true">some long content that is more than 20 characters</div></body>`);
        const doc = dom.window.document;
        const el = doc.querySelector('.collapsed');

        const expanded = await expandCollapsibleElementsForTest(doc);
        expect(el.classList.contains('collapsed')).toBeFalsy();
        expect(el.classList.contains('expanded-by-clipper')).toBeTruthy();
        expect(el.getAttribute('aria-hidden')).toBeNull();
        expect(expanded).toContain(el);
    });

    test('reveals elements hidden by style when text long enough', async () => {
        const dom = new JSDOM(`<!doctype html><body><div style="display:none">This is a long hidden content that should be revealed by the expander helper.</div></body>`);
        const doc = dom.window.document;
        const el = doc.querySelector('div');

        const expanded = await expandCollapsibleElementsForTest(doc);
        expect(el.style.display === '' || el.style.display === undefined).toBeTruthy();
        expect(expanded).toContain(el);
    });
});
