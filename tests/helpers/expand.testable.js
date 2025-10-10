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
            try {
                d.setAttribute('open', '');
                expanded.push(d);
            } catch (e) { }
        });

        // 2) aria-expanded triggers
        const triggers = Array.from(doc.querySelectorAll('[aria-expanded="false"]'));
        triggers.forEach(t => {
            try {
                t.setAttribute('aria-expanded', 'true');
                try { t.click && t.click(); } catch (e) { }

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
            } catch (e) { }
        });

        // 3) collapsed / collapse classes
        const collapsedEls = Array.from(doc.querySelectorAll('.collapsed, .collapse:not(.show)'));
        collapsedEls.forEach(el => {
            try {
                el.classList.remove('collapsed');
                el.classList.remove('collapse');
                el.classList.add('expanded-by-clipper');
                el.removeAttribute('aria-hidden');
                expanded.push(el);
            } catch (e) { }
        });

        // 4) hidden by style or hidden attribute
        const hiddenByStyle = Array.from(doc.querySelectorAll('[style*="display:none"], [hidden]'));
        hiddenByStyle.forEach(el => {
            try {
                const textLen = (el.textContent || '').trim().length;
                if (textLen > 20) {
                    el.style.display = '';
                    el.removeAttribute('hidden');
                    expanded.push(el);
                }
            } catch (e) { }
        });

        if (timeout > 0) await new Promise(r => setTimeout(r, timeout));
        return expanded;
    } catch (error) {
        return [];
    }
}

module.exports = { expandCollapsibleElementsForTest };
