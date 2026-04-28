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

  it('標註主要動作應在同一列呈現並保留主次層級', () => {
    const html = readFileSync('popup/popup.html', 'utf8');
    const css = readFileSync('popup/popup.css', 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionRow = doc.querySelector('.annotation-actions');

    expect(actionRow).not.toBeNull();
    expect(actionRow.children).toHaveLength(2);
    expect(actionRow.children[0].id).toBe('highlight-button');
    expect(actionRow.children[1].id).toBe('manage-button');
    expect(doc.querySelector('#manage-button').classList.contains('secondary-action')).toBe(true);
    expect(css).toMatch(/\.annotation-actions\s*\{[^}]*display:\s*grid;/);
    expect(css).toMatch(
      /\.annotation-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/
    );
    expect(css).toMatch(/\.annotation-actions\s*\{[^}]*gap:\s*var\(--spacing-sm\);/);
    expect(css).toMatch(
      /\.annotation-actions\s*>\s*button\s*\{[^}]*margin-bottom:\s*var\(--spacing-sm\);/
    );
    expect(css).toMatch(/#manage-button\.secondary-action\s*\{[^}]*background-color:\s*#f8fafc;/);
  });

  it('設定入口應移到 titlebar 左側並保留可見文字', () => {
    const html = readFileSync('popup/popup.html', 'utf8');
    const css = readFileSync('popup/popup.css', 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const titlebar = doc.querySelector('.popup-titlebar');
    const settingsLink = doc.querySelector('#settings-link');
    const accountSection = doc.querySelector('#account-section');

    expect(titlebar).not.toBeNull();
    expect(titlebar.children[0].classList.contains('titlebar-left')).toBe(true);
    expect(titlebar.children[0].contains(settingsLink)).toBe(true);
    expect(titlebar.children[1].id).toBe('popup-title');
    expect(titlebar.children[2]).toBe(accountSection);
    expect(settingsLink.classList.contains('settings-button')).toBe(true);
    expect(settingsLink.querySelector('#settings-link-text')).not.toBeNull();
    expect(doc.querySelector('.links')).toBeNull();
    expect(css).toMatch(/\.popup-titlebar\s*\{[^}]*display:\s*grid;/);
    expect(css).toMatch(/\.titlebar-left\s*\{[^}]*justify-self:\s*start;/);
    expect(css).toMatch(/\.account-section\s*\{[^}]*justify-self:\s*end;/);
    expect(css).toMatch(/\.settings-button\s*\{[^}]*min-height:\s*32px;/);
  });
});
