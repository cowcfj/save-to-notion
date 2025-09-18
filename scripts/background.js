// This script runs in the background and handles the core logic.

// 在 content script 中執行的模板處理函數
function applyTemplateInContent(result, templateSettings, url) {
    // 模板處理函數（在 content script 環境中執行）
    function processTitle(template, originalTitle, url) {
        if (!template || template === '{title}') return originalTitle;
        
        const now = new Date();
        const domain = new URL(url).hostname;
        
        // 格式化日期
        const formatDate = (date) => {
            return date.getFullYear() + '-' + 
                   String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(date.getDate()).padStart(2, '0');
        };
        
        // 格式化時間
        const formatTime = (date) => {
            return String(date.getHours()).padStart(2, '0') + ':' + 
                   String(date.getMinutes()).padStart(2, '0');
        };
        
        // 格式化日期時間
        const formatDateTime = (date) => {
            return formatDate(date) + ' ' + formatTime(date);
        };
        
        // 替換變量
        return template
            .replace(/\{title\}/g, originalTitle)
            .replace(/\{url\}/g, url)
            .replace(/\{domain\}/g, domain)
            .replace(/\{date\}/g, formatDate(now))
            .replace(/\{time\}/g, formatTime(now))
            .replace(/\{datetime\}/g, formatDateTime(now));
    }

    function addTimestamp(blocks) {
        const now = new Date();
        const timestamp = now.getFullYear() + '-' + 
                         String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(now.getDate()).padStart(2, '0') + ' ' +
                         String(now.getHours()).padStart(2, '0') + ':' + 
                         String(now.getMinutes()).padStart(2, '0');
        
        const timestampBlock = {
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{
                    type: 'text',
                    text: { content: `📅 保存時間: ${timestamp}` },
                    annotations: {
                        color: 'gray'
                    }
                }]
            }
        };
        
        return [timestampBlock, ...blocks];
    }

    function addSource(blocks, url, title) {
        const sourceBlock = {
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [
                    {
                        type: 'text',
                        text: { content: '🔗 來源: ' }
                    },
                    {
                        type: 'text',
                        text: { content: title, link: { url: url } },
                        annotations: {
                            color: 'blue'
                        }
                    }
                ]
            }
        };
        
        return [...blocks, sourceBlock];
    }

    // 應用模板設置
    let processedTitle = result.title;
    let processedBlocks = [...result.blocks];

    try {
        // 處理標題模板
        if (templateSettings.titleTemplate && templateSettings.titleTemplate !== '{title}') {
            processedTitle = processTitle(templateSettings.titleTemplate, result.title, url);
        }
        
        // 添加時間戳
        if (templateSettings.addTimestamp) {
            processedBlocks = addTimestamp(processedBlocks);
        }
        
        // 添加來源信息
        if (templateSettings.addSource) {
            processedBlocks = addSource(processedBlocks, url, result.title);
        }
    } catch (error) {
        console.error('Template processing error:', error);
        // 如果模板處理失敗，使用原始內容
        processedTitle = result.title;
        processedBlocks = result.blocks;
    }

    return {
        title: processedTitle,
        blocks: processedBlocks
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'savePage') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                sendResponse({ success: false, error: 'Could not get active tab.' });
                return;
            }

            // 首先獲取模板設置
            chrome.storage.sync.get([
                'notionApiKey', 
                'notionDatabaseId', 
                'titleTemplate', 
                'addSource', 
                'addTimestamp'
            ], (config) => {
                if (!config.notionApiKey || !config.notionDatabaseId) {
                    sendResponse({ success: false, error: 'API Key or Database ID is not set.' });
                    return;
                }

                // 準備模板設置
                const templateSettings = {
                    titleTemplate: config.titleTemplate || '{title}',
                    addSource: config.addSource !== false,
                    addTimestamp: config.addTimestamp !== false
                };

                // Inject scripts and pass template settings
                chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    files: ['lib/Readability.js', 'scripts/content.js']
                }, (injectionResults) => {
                if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                    console.error('Script injection failed:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: 'Failed to inject content script.' });
                    return;
                }
                
                const result = injectionResults[0].result;
                console.log('Content extraction result:', result);

                    if (result && result.blocks) {
                        // 現在在 content script 中應用模板設置
                        chrome.scripting.executeScript({
                            target: { tabId: activeTab.id },
                            func: applyTemplateInContent,
                            args: [result, templateSettings, activeTab.url]
                        }, (templateResults) => {
                            if (chrome.runtime.lastError || !templateResults || templateResults.length === 0) {
                                console.error('Template processing failed:', chrome.runtime.lastError);
                                // 使用原始結果
                                const imageCount = result.blocks.filter(b => b.type === 'image').length;
                                saveToNotion(result.title, result.blocks, activeTab.url, config.notionApiKey, config.notionDatabaseId, (response) => {
                                    if (response.success) {
                                        response.imageCount = imageCount;
                                        response.blockCount = result.blocks.length;
                                    }
                                    sendResponse(response);
                                });
                                return;
                            }

                            const processedResult = templateResults[0].result;
                            const imageCount = processedResult.blocks.filter(b => b.type === 'image').length;
                            saveToNotion(processedResult.title, processedResult.blocks, activeTab.url, config.notionApiKey, config.notionDatabaseId, (response) => {
                                if (response.success) {
                                    response.imageCount = imageCount;
                                    response.blockCount = processedResult.blocks.length;
                                }
                                sendResponse(response);
                            });
                        });
                    } else {
                        sendResponse({ success: false, error: 'Could not parse the article content.' });
                    }
                });
            });

        return true; // Indicates asynchronous response
    }
});

async function saveToNotion(title, blocks, pageUrl, apiKey, databaseId, sendResponse) {
    const notionApiUrl = 'https://api.notion.com/v1/pages';

    const pageData = {
        parent: { database_id: databaseId },
        properties: {
            'Title': { // 'Title' must match the title property in your Notion database
                title: [{ text: { content: title } }]
            },
            'URL': { // Assumes you have a 'URL' property of type URL
                url: pageUrl
            }
        },
        // The blocks are already in the correct format from content.js
        children: blocks.slice(0, 100) // Notion API limit of 100 blocks
    };

    try {
        const response = await fetch(notionApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(pageData)
        });

        if (response.ok) {
            sendResponse({ success: true });
        } else {
            const errorData = await response.json();
            console.error('Notion API Error:', errorData);
            sendResponse({ success: false, error: errorData.message || 'Failed to save to Notion.' });
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}