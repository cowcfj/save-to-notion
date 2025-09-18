// This script runs in the background and handles the core logic.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'savePage') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                sendResponse({ success: false, error: 'Could not get active tab.' });
                return;
            }

            // Inject scripts to extract and process content
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

                if (result && result.blocks) {
                    chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId'], (config) => {
                        if (!config.notionApiKey || !config.notionDatabaseId) {
                            sendResponse({ success: false, error: 'API Key or Database ID is not set.' });
                            return;
                        }
                        // Call the function to save to Notion with the pre-formatted blocks
                        const imageCount = result.blocks.filter(b => b.type === 'image').length;
                        saveToNotion(result.title, result.blocks, activeTab.url, config.notionApiKey, config.notionDatabaseId, (response) => {
                            if (response.success) {
                                response.imageCount = imageCount;
                                response.blockCount = result.blocks.length;
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