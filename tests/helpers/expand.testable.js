/**
 * Testable version of expandCollapsibleElements.
 * Accepts a document-like object (jsdom) and performs best-effort expansion.
 */
async function expandCollapsibleElementsForTest(doc, timeout = 0) {
    try {
        const expanded = [];

        // 1) <details> elements
        const details = Array.from(doc.querySelectorAll('details:not([open])'));
        details.forEach(d => {
            d.setAttribute('open', '');
            expanded.push(d);
        });

        // 2) aria-expanded triggers
        const triggers = Array.from(doc.querySelectorAll('[aria-expanded="false"]'));
        triggers.forEach(t => {
            t.setAttribute('aria-expanded', 'true');
            try {
                t.click && t.click();
            } catch (_e) {
                // Ignore click errors
            }

            const ctrl = t.getAttribute && t.getAttribute('aria-controls');
            if (ctrl) {
                const target = doc.getElementById(ctrl) || doc.querySelector(`#${ctrl}`);
                if (target) {
                    target.removeAttribute('aria-hidden');
                    target.classList.remove('collapsed');
                    target.classList.remove('collapse');
                    expanded.push(target);
                }
            }
        });

        // 3) collapsed / collapse classes
        const collapsedEls = Array.from(doc.querySelectorAll('.collapsed, .collapse:not(.show)'));
        collapsedEls.forEach(el => {
            el.classList.remove('collapsed');
            el.classList.remove('collapse');
            el.classList.add('expanded-by-clipper');
            el.removeAttribute('aria-hidden');
            expanded.push(el);
        });

        // 4) hidden by style or hidden attribute
        const hiddenByStyle = Array.from(doc.querySelectorAll('[style*="display:none"], [hidden]'));
        hiddenByStyle.forEach(el => {
            const textLen = (el.textContent || '').trim().length;
            if (textLen > 20) {
                el.style.display = '';
                el.removeAttribute('hidden');
                expanded.push(el);
            }
        });

        if (timeout > 0) await new Promise(r => setTimeout(r, timeout));
        return expanded;
    } catch (_error) {
        return [];
    }
}

module.exports = { expandCollapsibleElementsForTest };
