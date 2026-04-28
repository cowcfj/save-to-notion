import { readFileSync } from 'node:fs';

describe('popup.html accessibility fallbacks', () => {
  it('應提供可被 screen reader 讀取的靜態 popup heading 與 document title', () => {
    const html = readFileSync('popup/popup.html', 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('#popup-title');

    expect(doc.title.trim()).toBe('Save to Notion');
    expect(heading).not.toBeNull();
    expect(heading.textContent.trim()).toBe('Save to Notion');
  });

  it('保存目標列應作為 32px 輔助狀態列並避免撐高 popup', () => {
    const css = readFileSync('popup/popup.css', 'utf8');

    expect(css).toMatch(/\.destination-section\s*\{[^}]*font-size:\s*13px;/);
    expect(css).toMatch(/\.destination-section\s*\{[^}]*margin-top:\s*0;/);
    expect(css).toMatch(/\.destination-current\s*\{[^}]*height:\s*32px;/);
    expect(css).toMatch(/\.destination-current\s*\{[^}]*display:\s*flex;/);
    expect(css).toMatch(/\.destination-current\s*\{[^}]*align-items:\s*center;/);
    expect(css).toMatch(/\.destination-current\s*\{[^}]*white-space:\s*nowrap;/);
    expect(css).toMatch(/\.destination-current\s*\{[^}]*text-overflow:\s*ellipsis;/);
    expect(css).toMatch(/\.destination-toggle\s*\{[^}]*height:\s*32px;/);
    expect(css).toMatch(/\.destination-menu-item\s*\{[^}]*font-size:\s*13px;/);
  });
});
