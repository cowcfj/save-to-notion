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

  it('保存目標文字應與 popup 按鈕文字使用一致字級與穩定間距', () => {
    const css = readFileSync('popup/popup.css', 'utf8');

    expect(css).toMatch(/\.destination-section\s*\{[^}]*font-size:\s*13px;/);
    expect(css).toMatch(/\.destination-section\s*\{[^}]*margin-top:\s*0;/);
    expect(css).toMatch(/\.destination-current\s*\{[^}]*line-height:\s*1\.35;/);
    expect(css).toMatch(/\.destination-menu-item\s*\{[^}]*font-size:\s*13px;/);
  });
});
