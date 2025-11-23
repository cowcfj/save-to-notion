/**
 * 測試 convertMarkdownToNotionBlocks 函數
 * 這是針對用戶請求的 Markdown 原生支持功能的測試
 */

describe('convertMarkdownToNotionBlocks - Markdown 原生支持', () => {
    /** @type {Function} Markdown 轉換函數,在 beforeAll 中初始化 */
    let convertMarkdownToNotionBlocks = null;

    beforeAll(() => {
        // 模擬控制台日誌
        global.console = {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        // 直接定義函數（從 background.js 複製過來）
        convertMarkdownToNotionBlocks = function (markdown) {
            const blocks = [];
            const lines = markdown.split('\n');
            let currentParagraph = '';
            let inCodeBlock = false;
            let codeContent = '';
            let codeLanguage = 'plain text';

            console.log(`🔄 Converting Markdown to Notion blocks: ${lines.length} lines`);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();

                // 處理代碼區塊
                if (trimmedLine.startsWith('```')) {
                    if (inCodeBlock) {
                        // 結束代碼區塊
                        if (codeContent.trim()) {
                            blocks.push({
                                object: 'block',
                                type: 'code',
                                code: {
                                    rich_text: [{ type: 'text', text: { content: codeContent.trim() } }],
                                    language: codeLanguage
                                }
                            });
                        }
                        inCodeBlock = false;
                        codeContent = '';
                        codeLanguage = 'plain text';
                    } else {
                        // 開始代碼區塊
                        // 先保存當前段落
                        if (currentParagraph.trim()) {
                            blocks.push({
                                object: 'block',
                                type: 'paragraph',
                                paragraph: {
                                    rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                }
                            });
                            currentParagraph = '';
                        }
                        inCodeBlock = true;
                        // 提取語言（如果有）
                        const lang = trimmedLine.substring(3).trim();
                        if (lang) {
                            codeLanguage = lang;
                        }
                    }
                    continue;
                }

                if (inCodeBlock) {
                    codeContent += `${line}\n`;
                    continue;
                }

                // 處理標題
                if (trimmedLine.startsWith('#')) {
                    // 先保存當前段落
                    if (currentParagraph.trim()) {
                        blocks.push({
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                            }
                        });
                        currentParagraph = '';
                    }

                    // 計算標題級別
                    const level = Math.min(3, trimmedLine.match(/^#+/)[0].length);
                    const headingText = trimmedLine.replace(/^#+\s*/, '');

                    if (headingText) {
                        blocks.push({
                            object: 'block',
                            type: `heading_${level}`,
                            [`heading_${level}`]: {
                                rich_text: [{ type: 'text', text: { content: headingText } }]
                            }
                        });
                    }
                    continue;
                }

                // 處理列表項
                if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || /^\d+\.\s/.test(trimmedLine)) {
                    // 先保存當前段落
                    if (currentParagraph.trim()) {
                        blocks.push({
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                            }
                        });
                        currentParagraph = '';
                    }

                    // 提取列表項文本
                    let listText = '';
                    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
                        listText = trimmedLine.substring(2).trim();
                    } else {
                        listText = trimmedLine.replace(/^\d+\.\s/, '');
                    }

                    // 處理加粗格式 **text**
                    const richText = [];
                    const parts = listText.split(/(\*\*[^*]+\*\*)/);

                    for (const part of parts) {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            // 加粗文本
                            const boldText = part.slice(2, -2);
                            richText.push({
                                type: 'text',
                                text: { content: boldText },
                                annotations: { bold: true }
                            });
                        } else if (part) {
                            // 普通文本
                            richText.push({
                                type: 'text',
                                text: { content: part }
                            });
                        }
                    }

                    blocks.push({
                        object: 'block',
                        type: 'bulleted_list_item',
                        bulleted_list_item: {
                            rich_text: richText.length > 0 ? richText : [{ type: 'text', text: { content: listText } }]
                        }
                    });
                    continue;
                }

                // 處理空行
                if (!trimmedLine) {
                    if (currentParagraph.trim()) {
                        blocks.push({
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                            }
                        });
                        currentParagraph = '';
                    }
                    continue;
                }

                // 累積段落內容
                if (currentParagraph) {
                    currentParagraph += ` ${trimmedLine}`;
                } else {
                    currentParagraph = trimmedLine;
                }
            }

            // 處理最後的段落
            if (currentParagraph.trim()) {
                blocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                    }
                });
            }

            // 處理未結束的代碼區塊
            if (inCodeBlock && codeContent.trim()) {
                blocks.push({
                    object: 'block',
                    type: 'code',
                    code: {
                        rich_text: [{ type: 'text', text: { content: codeContent.trim() } }],
                        language: codeLanguage
                    }
                });
            }

            console.log(`✅ Converted Markdown to ${blocks.length} Notion blocks`);
            return blocks;
        };
    });

    describe('標題轉換', () => {
        test('應該正確轉換 H1 標題', () => {
            const markdown = '# 主標題\n\n這是內容。';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(2);
            expect(blocks[0]).toEqual({
                object: 'block',
                type: 'heading_1',
                heading_1: {
                    rich_text: [{ type: 'text', text: { content: '主標題' } }]
                }
            });
        });

        test('應該正確轉換 H2 標題', () => {
            const markdown = '## 次標題';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(1);
            expect(blocks[0]).toEqual({
                object: 'block',
                type: 'heading_2',
                heading_2: {
                    rich_text: [{ type: 'text', text: { content: '次標題' } }]
                }
            });
        });

        test('應該正確轉換 H3 標題', () => {
            const markdown = '### 三級標題';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(1);
            expect(blocks[0]).toEqual({
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [{ type: 'text', text: { content: '三級標題' } }]
                }
            });
        });

        test('應該限制最大標題級別為 3', () => {
            const markdown = '#### 四級標題\n##### 五級標題\n###### 六級標題';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(3);
            blocks.forEach(block => {
                expect(block.type).toBe('heading_3');
            });
        });
    });

    describe('列表轉換', () => {
        test('應該轉換無序列表', () => {
            const markdown = '- 第一項\n- 第二項\n- 第三項';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(3);
            blocks.forEach((block, index) => {
                expect(block.type).toBe('bulleted_list_item');
                expect(block.bulleted_list_item.rich_text[0].text.content).toBe(`第${['一', '二', '三'][index]}項`);
            });
        });

        test('應該轉換帶星號的無序列表', () => {
            const markdown = '* Item 1\n* Item 2';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(2);
            blocks.forEach(block => {
                expect(block.type).toBe('bulleted_list_item');
            });
        });

        test('應該轉換有序列表', () => {
            const markdown = '1. 第一項\n2. 第二項\n3. 第三項';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(3);
            blocks.forEach(block => {
                expect(block.type).toBe('bulleted_list_item');
            });
        });

        test('應該處理帶加粗的列表項', () => {
            const markdown = '- **重要項目**\n- 普通項目';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(2);
            expect(blocks[0].bulleted_list_item.rich_text[0]).toEqual({
                type: 'text',
                text: { content: '重要項目' },
                annotations: { bold: true }
            });
        });
    });

    describe('代碼區塊轉換', () => {
        test('應該轉換代碼區塊', () => {
            const markdown = '```javascript\nconst x = 1;\nconsole.log(x);\n```';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(1);
            expect(blocks[0]).toEqual({
                object: 'block',
                type: 'code',
                code: {
                    rich_text: [{ type: 'text', text: { content: 'const x = 1;\nconsole.log(x);' } }],
                    language: 'javascript'
                }
            });
        });

        test('應該處理沒有語言標註的代碼區塊', () => {
            const markdown = '```\nsome code\n```';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(1);
            expect(blocks[0].code.language).toBe('plain text');
        });

        test('應該處理未關閉的代碼區塊', () => {
            const markdown = '```python\nprint("hello")\n# 沒有結束標記';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('code');
            expect(blocks[0].code.language).toBe('python');
        });
    });

    describe('段落轉換', () => {
        test('應該轉換普通段落', () => {
            const markdown = '這是第一段。\n\n這是第二段。';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(2);
            blocks.forEach(block => {
                expect(block.type).toBe('paragraph');
            });
        });

        test('應該合併連續的行到同一段落', () => {
            const markdown = '這是第一行\n這是第二行\n這是第三行';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(1);
            expect(blocks[0].paragraph.rich_text[0].text.content).toBe('這是第一行 這是第二行 這是第三行');
        });
    });

    describe('混合內容轉換', () => {
        test('應該正確處理混合的 Markdown 內容', () => {
            const markdown = `# CLI Commands

## Slash commands (\`/\`)

### Built-in Commands

- **\`/bug\`**
  - **Description:** File an issue

\`\`\`bash
gemini chat
\`\`\`

這是一個段落。`;

            const blocks = convertMarkdownToNotionBlocks(markdown);

            // 驗證結構
            expect(blocks.length).toBeGreaterThan(5);

            // 檢查第一個區塊是 H1
            expect(blocks[0].type).toBe('heading_1');
            expect(blocks[0].heading_1.rich_text[0].text.content).toBe('CLI Commands');

            // 檢查包含列表項
            const listItems = blocks.filter(block => block.type === 'bulleted_list_item');
            expect(listItems.length).toBeGreaterThan(0);

            // 檢查包含代碼區塊
            const codeBlocks = blocks.filter(block => block.type === 'code');
            expect(codeBlocks.length).toBe(1);
            expect(codeBlocks[0].code.language).toBe('bash');
        });
    });

    describe('邊界情況', () => {
        test('應該處理空的 Markdown', () => {
            const blocks = convertMarkdownToNotionBlocks('');
            expect(blocks).toHaveLength(0);
        });

        test('應該處理只有空行的 Markdown', () => {
            const blocks = convertMarkdownToNotionBlocks('\n\n\n');
            expect(blocks).toHaveLength(0);
        });

        test('應該處理只有標題的 Markdown', () => {
            const markdown = '# 標題';
            const blocks = convertMarkdownToNotionBlocks(markdown);

            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('heading_1');
        });
    });

    describe('用戶報告的 gemini-cli 文檔格式', () => {
        test('應該正確處理 gemini-cli 文檔的典型結構', () => {
            const markdown = `# CLI Commands

## Slash commands (\`/\`)

### Built-in Commands

- **\`/bug\`**
  - **Description:** File an issue with a link to create a GitHub issue
  - **Usage:** \`/bug [optional description]\`

- **\`/commit\`**
  - **Description:** Generate a commit message based on staged changes
  - **Usage:** \`/commit [optional context]\`

### Custom Commands

You can create custom commands by adding them to your config file.

\`\`\`json
{
  "commands": {
    "test": "npm test",
    "build": "npm run build"
  }
}
\`\`\``;

            const blocks = convertMarkdownToNotionBlocks(markdown);

            // 應該有合理數量的區塊
            expect(blocks.length).toBeGreaterThan(8);

            // 檢查標題結構
            const headings = blocks.filter(block =>
                block.type.startsWith('heading_')
            );
            expect(headings.length).toBeGreaterThanOrEqual(3); // 至少 H1, H2, H3

            // 檢查列表項
            const listItems = blocks.filter(block =>
                block.type === 'bulleted_list_item'
            );
            expect(listItems.length).toBeGreaterThan(4);

            // 檢查代碼區塊
            const codeBlocks = blocks.filter(block => block.type === 'code');
            expect(codeBlocks.length).toBe(1);
            expect(codeBlocks[0].code.language).toBe('json');

            // 檢查段落
            const paragraphs = blocks.filter(block => block.type === 'paragraph');
            expect(paragraphs.length).toBeGreaterThan(0);

            console.log('✅ gemini-cli 文檔轉換結果：');
            console.log(`- 總共 ${blocks.length} 個區塊`);
            console.log(`- ${headings.length} 個標題`);
            console.log(`- ${listItems.length} 個列表項`);
            console.log(`- ${codeBlocks.length} 個代碼區塊`);
            console.log(`- ${paragraphs.length} 個段落`);
        });
    });
});