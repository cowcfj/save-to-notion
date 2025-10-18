/**
 * Notion API 調試工具 JavaScript
 * 在 Chrome 擴展環境中運行
 */

let currentToken = null;
let lastApiResponse = null;

// 檢查 Cookies
document.getElementById('check-cookies').addEventListener('click', async () => {
    const resultDiv = document.getElementById('cookie-result');
    
    try {
        if (!chrome || !chrome.cookies) {
            throw new Error('Chrome Cookies API 不可用');
        }
        
        const cookies = await chrome.cookies.getAll({ domain: '.notion.so' });
        const tokenCookie = cookies.find(c => c.name === 'token_v2');
        
        if (tokenCookie && tokenCookie.value) {
            currentToken = tokenCookie.value;
            resultDiv.className = 'result success';
            resultDiv.textContent = `✅ 找到 token_v2 cookie
長度: ${tokenCookie.value.length}
前10個字符: ${tokenCookie.value.substring(0, 10)}...

所有 Notion cookies (${cookies.length} 個):
${cookies.map(c => `${c.name}: ${c.value ? '[有值]' : '[空值]'}`).join('\n')}`;
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ 未找到 token_v2 cookie

找到的 cookies (${cookies.length} 個):
${cookies.map(c => c.name).join(', ')}`;
        }
        
        console.log('所有 Notion cookies:', cookies);
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `錯誤: ${error.message}`;
        console.error('Cookie 檢查錯誤:', error);
    }
});

// 測試 loadUserContent API
document.getElementById('test-load-user-content').addEventListener('click', async () => {
    const resultDiv = document.getElementById('api-result');
    
    if (!currentToken) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '請先檢查 Cookies';
        return;
    }
    
    try {
        resultDiv.className = 'result';
        resultDiv.textContent = '正在調用 loadUserContent API...';
        
        const response = await fetch('https://www.notion.so/api/v3/loadUserContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token_v2=${currentToken}`
            },
            body: JSON.stringify({})
        });
        
        if (response.ok) {
            const data = await response.json();
            lastApiResponse = data;
            
            const analysis = {
                hasRecordMap: !!data.recordMap,
                recordMapKeys: data.recordMap ? Object.keys(data.recordMap) : [],
                hasCollection: !!(data.recordMap && data.recordMap.collection),
                collectionCount: data.recordMap && data.recordMap.collection ? Object.keys(data.recordMap.collection).length : 0,
                hasBlock: !!(data.recordMap && data.recordMap.block),
                blockCount: data.recordMap && data.recordMap.block ? Object.keys(data.recordMap.block).length : 0,
                hasSpace: !!(data.recordMap && data.recordMap.space),
                spaceCount: data.recordMap && data.recordMap.space ? Object.keys(data.recordMap.space).length : 0
            };
            
            resultDiv.className = 'result success';
            resultDiv.textContent = `✅ loadUserContent API 成功

響應分析:
${JSON.stringify(analysis, null, 2)}

完整響應已保存到 console.log`;
            
            console.log('loadUserContent 完整響應:', data);
            
            // 如果有 collection，顯示詳細信息
            if (data.recordMap && data.recordMap.collection) {
                const collections = data.recordMap.collection;
                console.log('Collections 詳細信息:');
                Object.keys(collections).forEach(id => {
                    console.log(`Collection ${id}:`, collections[id]);
                });
            }
            
        } else {
            const errorText = await response.text();
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ API 調用失敗: ${response.status} ${response.statusText}

錯誤詳情: ${errorText}`;
        }
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `錯誤: ${error.message}`;
        console.error('loadUserContent API 錯誤:', error);
    }
});

// 測試 getSpaces API
document.getElementById('test-get-spaces').addEventListener('click', async () => {
    const resultDiv = document.getElementById('api-result');
    
    if (!currentToken) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '請先檢查 Cookies';
        return;
    }
    
    try {
        resultDiv.className = 'result';
        resultDiv.textContent = '正在調用 getSpaces API...';
        
        const response = await fetch('https://www.notion.so/api/v3/getSpaces', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token_v2=${currentToken}`
            },
            body: JSON.stringify({})
        });
        
        if (response.ok) {
            const data = await response.json();
            
            resultDiv.className = 'result success';
            resultDiv.textContent = `✅ getSpaces API 成功

空間數量: ${Object.keys(data).length}
空間 IDs: ${Object.keys(data).join(', ')}

完整響應已保存到 console.log`;
            
            console.log('getSpaces 完整響應:', data);
        } else {
            const errorText = await response.text();
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ API 調用失敗: ${response.status} ${response.statusText}

錯誤詳情: ${errorText}`;
        }
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `錯誤: ${error.message}`;
        console.error('getSpaces API 錯誤:', error);
    }
});

// 測試 search API
document.getElementById('test-search').addEventListener('click', async () => {
    const resultDiv = document.getElementById('api-result');
    
    if (!currentToken) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '請先檢查 Cookies';
        return;
    }
    
    try {
        resultDiv.className = 'result';
        resultDiv.textContent = '正在調用 search API...';
        
        const response = await fetch('https://www.notion.so/api/v3/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token_v2=${currentToken}`
            },
            body: JSON.stringify({
                type: 'BlocksInAncestor',
                source: 'quick_find_public',
                ancestorId: 'root',
                sort: 'Relevance',
                limit: 50,
                filters: {
                    isDeletedOnly: false,
                    excludeTemplates: false,
                    isNavigableOnly: false,
                    requireEditPermissions: false
                }
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            lastApiResponse = data;
            
            const resultTypes = {};
            if (data.results) {
                data.results.forEach(r => {
                    const type = r.value?.type || 'unknown';
                    resultTypes[type] = (resultTypes[type] || 0) + 1;
                });
            }
            
            resultDiv.className = 'result success';
            resultDiv.textContent = `✅ search API 成功

結果數量: ${data.results ? data.results.length : 0}

結果類型統計:
${Object.keys(resultTypes).map(type => `${type}: ${resultTypes[type]}`).join('\n')}

完整響應已保存到 console.log`;
            
            console.log('search 完整響應:', data);
            
            // 顯示數據庫相關的結果
            if (data.results) {
                const databaseResults = data.results.filter(r => 
                    r.value && (r.value.type === 'collection_view' || r.value.type === 'collection')
                );
                console.log('數據庫相關結果:', databaseResults);
            }
            
        } else {
            const errorText = await response.text();
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ API 調用失敗: ${response.status} ${response.statusText}

錯誤詳情: ${errorText}`;
        }
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `錯誤: ${error.message}`;
        console.error('search API 錯誤:', error);
    }
});

// 解析數據庫
document.getElementById('parse-databases').addEventListener('click', () => {
    const resultDiv = document.getElementById('parse-result');
    
    if (!lastApiResponse) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '請先調用一個 API';
        return;
    }
    
    try {
        let databases = [];
        
        // 嘗試從 recordMap.collection 解析
        if (lastApiResponse.recordMap && lastApiResponse.recordMap.collection) {
            const collections = lastApiResponse.recordMap.collection;
            databases = Object.keys(collections).map(id => {
                const collection = collections[id].value;
                return {
                    id: collection.id,
                    title: collection.name?.[0]?.[0] || collection.title?.[0]?.[0] || 'Untitled',
                    type: 'collection',
                    source: 'recordMap.collection'
                };
            });
        }
        
        // 嘗試從 results 解析
        if (lastApiResponse.results) {
            const databaseResults = lastApiResponse.results.filter(r => 
                r.value && (r.value.type === 'collection_view' || r.value.type === 'collection')
            );
            
            const searchDatabases = databaseResults.map(r => ({
                id: r.value.collection_id || r.value.id,
                title: r.value.properties?.title || r.value.name || 'Untitled',
                type: r.value.type,
                source: 'search.results'
            }));
            
            databases = databases.concat(searchDatabases);
        }
        
        // 嘗試從 recordMap.block 解析
        if (lastApiResponse.recordMap && lastApiResponse.recordMap.block) {
            const blocks = lastApiResponse.recordMap.block;
            console.log('🔍 分析所有 blocks:', Object.keys(blocks).length);
            
            // 分析所有 block 類型
            const blockTypes = {};
            Object.keys(blocks).forEach(id => {
                const block = blocks[id].value;
                const type = block?.type || 'unknown';
                blockTypes[type] = (blockTypes[type] || 0) + 1;
                
                // 詳細記錄每個 block
                console.log(`Block ${id}:`, {
                    type: block?.type,
                    parent_id: block?.parent_id,
                    parent_table: block?.parent_table,
                    collection_id: block?.collection_id,
                    properties: block?.properties,
                    format: block?.format
                });
            });
            
            console.log('Block 類型統計:', blockTypes);
            
            // 查找所有可能的數據庫相關 block
            const databaseBlocks = [];
            Object.keys(blocks).forEach(id => {
                const block = blocks[id].value;
                
                // collection_view 類型
                if (block && block.type === 'collection_view') {
                    databaseBlocks.push({
                        id: block.collection_id,
                        title: block.properties?.title?.[0]?.[0] || 'Untitled',
                        type: 'collection_view',
                        source: 'recordMap.block',
                        blockId: id,
                        parentId: block.parent_id
                    });
                }
                
                // page 類型但有 collection_id
                if (block && block.type === 'page' && block.collection_id) {
                    databaseBlocks.push({
                        id: block.collection_id,
                        title: block.properties?.title?.[0]?.[0] || 'Untitled Page',
                        type: 'page_in_collection',
                        source: 'recordMap.block',
                        blockId: id,
                        parentId: block.parent_id
                    });
                }
            });
            
            databases = databases.concat(databaseBlocks);
        }
        
        // 去重
        const uniqueDatabases = databases.filter((db, index, self) => 
            index === self.findIndex(d => d.id === db.id)
        );
        
        resultDiv.className = uniqueDatabases.length > 0 ? 'result success' : 'result error';
        resultDiv.textContent = `找到 ${uniqueDatabases.length} 個數據庫:

${uniqueDatabases.map(db => `${db.title}
  ID: ${db.id}
  類型: ${db.type}
  來源: ${db.source}
`).join('\n')}`;
        
        console.log('解析出的數據庫:', uniqueDatabases);
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `解析錯誤: ${error.message}`;
        console.error('數據庫解析錯誤:', error);
    }
});

// 測試 Background Script 搜索
document.getElementById('test-background-search').addEventListener('click', async () => {
    const resultDiv = document.getElementById('background-result');
    
    try {
        resultDiv.className = 'result';
        resultDiv.textContent = '正在調用 Background Script 搜索...';
        
        const response = await chrome.runtime.sendMessage({
            action: 'searchDatabases'
        });
        
        if (response && response.success) {
            resultDiv.className = 'result success';
            resultDiv.textContent = `✅ Background Script 搜索成功

找到數據庫: ${response.databases ? response.databases.length : 0} 個

${response.databases ? response.databases.map(db => `${db.title} (${db.id})`).join('\n') : '無數據庫'}`;
        } else {
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ Background Script 搜索失敗: ${response?.error || '未知錯誤'}`;
        }
        
        console.log('Background Script 響應:', response);
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `錯誤: ${error.message}`;
        console.error('Background Script 測試錯誤:', error);
    }
});

// 詳細分析 blocks
document.getElementById('analyze-blocks').addEventListener('click', () => {
    const resultDiv = document.getElementById('parse-result');
    
    if (!lastApiResponse || !lastApiResponse.recordMap || !lastApiResponse.recordMap.block) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '請先調用 loadUserContent API';
        return;
    }
    
    try {
        const blocks = lastApiResponse.recordMap.block;
        const blockCount = Object.keys(blocks).length;
        
        // 分析所有 block 類型
        const typeStats = {};
        const databaseRelated = [];
        const pageBlocks = [];
        
        Object.keys(blocks).forEach(blockId => {
            const block = blocks[blockId].value;
            const type = block?.type || 'unknown';
            
            // 統計類型
            typeStats[type] = (typeStats[type] || 0) + 1;
            
            // 查找數據庫相關的 blocks
            if (type === 'collection_view' || type === 'collection_view_page') {
                databaseRelated.push({
                    id: blockId,
                    type: type,
                    collectionId: block.collection_id,
                    title: block.properties?.title?.[0]?.[0] || 'No Title',
                    parentId: block.parent_id,
                    parentTable: block.parent_table
                });
            }
            
            // 查找頁面類型的 blocks（可能是數據庫頁面）
            if (type === 'page') {
                const title = block.properties?.title?.[0]?.[0] || 'No Title';
                pageBlocks.push({
                    id: blockId,
                    title: title,
                    parentId: block.parent_id,
                    parentTable: block.parent_table,
                    hasChildren: block.content && block.content.length > 0,
                    format: block.format
                });
            }
        });
        
        let output = `詳細 Blocks 分析 (總共 ${blockCount} 個):

Block 類型統計:
${Object.keys(typeStats).map(type => `${type}: ${typeStats[type]} 個`).join('\n')}

數據庫相關 Blocks (${databaseRelated.length} 個):
${databaseRelated.map(db => `${db.title} (${db.type})
  Block ID: ${db.id}
  Collection ID: ${db.collectionId}
  Parent: ${db.parentId} (${db.parentTable})`).join('\n\n')}

頁面 Blocks (前 10 個):
${pageBlocks.slice(0, 10).map(page => `${page.title}
  ID: ${page.id}
  Parent: ${page.parentId} (${page.parentTable})
  有子內容: ${page.hasChildren ? '是' : '否'}`).join('\n\n')}`;
        
        if (pageBlocks.length > 10) {
            output += `\n\n... 還有 ${pageBlocks.length - 10} 個頁面`;
        }
        
        resultDiv.className = 'result success';
        resultDiv.textContent = output;
        
        console.log('詳細 Blocks 分析:', {
            typeStats,
            databaseRelated,
            pageBlocks: pageBlocks.slice(0, 20) // 只記錄前 20 個
        });
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `分析錯誤: ${error.message}`;
        console.error('Blocks 分析錯誤:', error);
    }
});

// 分析完整結構
document.getElementById('analyze-structure').addEventListener('click', () => {
    const resultDiv = document.getElementById('parse-result');
    
    if (!lastApiResponse) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '請先調用 loadUserContent API';
        return;
    }
    
    try {
        const analysis = {
            topLevel: Object.keys(lastApiResponse),
            recordMap: lastApiResponse.recordMap ? Object.keys(lastApiResponse.recordMap) : null
        };
        
        let output = `API 響應完整結構分析:

頂級字段: ${analysis.topLevel.join(', ')}
`;
        
        if (lastApiResponse.recordMap) {
            output += `\nrecordMap 字段: ${analysis.recordMap.join(', ')}\n`;
            
            // 分析每個 recordMap 字段
            analysis.recordMap.forEach(field => {
                const data = lastApiResponse.recordMap[field];
                if (data && typeof data === 'object') {
                    const count = Object.keys(data).length;
                    output += `\n${field}: ${count} 個項目`;
                    
                    if (count > 0 && count <= 10) {
                        output += `\n  項目 IDs: ${Object.keys(data).join(', ')}`;
                    }
                    
                    // 如果是 collection，顯示詳細信息
                    if (field === 'collection' && count > 0) {
                        Object.keys(data).forEach(id => {
                            const collection = data[id].value;
                            output += `\n  Collection ${id}:`;
                            output += `\n    名稱: ${collection.name?.[0]?.[0] || 'N/A'}`;
                            output += `\n    標題: ${collection.title?.[0]?.[0] || 'N/A'}`;
                            output += `\n    圖標: ${collection.icon || 'N/A'}`;
                        });
                    }
                    
                    // 如果是 space，顯示工作空間信息
                    if (field === 'space' && count > 0) {
                        Object.keys(data).forEach(id => {
                            const space = data[id].value;
                            output += `\n  Space ${id}:`;
                            output += `\n    名稱: ${space.name || 'N/A'}`;
                            output += `\n    域名: ${space.domain || 'N/A'}`;
                        });
                    }
                }
            });
        }
        
        resultDiv.className = 'result success';
        resultDiv.textContent = output;
        
        console.log('完整結構分析:', lastApiResponse);
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `分析錯誤: ${error.message}`;
        console.error('結構分析錯誤:', error);
    }
});

// 測試 loadPageChunk API（查詢工作空間內容）
document.getElementById('test-load-page-chunk').addEventListener('click', async () => {
    const resultDiv = document.getElementById('api-result');
    
    if (!currentToken) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '請先檢查 Cookies';
        return;
    }
    
    try {
        resultDiv.className = 'result';
        resultDiv.textContent = '正在調用 loadPageChunk API...';
        
        // 使用第一個工作空間 ID
        const spaceId = '56cb5fb2-5dfc-4c72-8b55-3915c096269f'; // cow 工作空間
        
        const response = await fetch('https://www.notion.so/api/v3/loadPageChunk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token_v2=${currentToken}`
            },
            body: JSON.stringify({
                pageId: spaceId,
                limit: 100,
                cursor: { stack: [] },
                chunkNumber: 0,
                verticalColumns: false
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            lastApiResponse = data;
            
            const analysis = {
                hasRecordMap: !!data.recordMap,
                recordMapKeys: data.recordMap ? Object.keys(data.recordMap) : [],
                hasCollection: !!(data.recordMap && data.recordMap.collection),
                collectionCount: data.recordMap && data.recordMap.collection ? Object.keys(data.recordMap.collection).length : 0,
                hasBlock: !!(data.recordMap && data.recordMap.block),
                blockCount: data.recordMap && data.recordMap.block ? Object.keys(data.recordMap.block).length : 0
            };
            
            resultDiv.className = 'result success';
            resultDiv.textContent = `✅ loadPageChunk API 成功 (工作空間: cow)

響應分析:
${JSON.stringify(analysis, null, 2)}

完整響應已保存到 console.log`;
            
            console.log('loadPageChunk 完整響應:', data);
            
            // 如果有 collection，顯示詳細信息
            if (data.recordMap && data.recordMap.collection) {
                const collections = data.recordMap.collection;
                console.log('Collections 詳細信息:');
                Object.keys(collections).forEach(id => {
                    console.log(`Collection ${id}:`, collections[id]);
                });
            }
            
        } else {
            const errorText = await response.text();
            resultDiv.className = 'result error';
            resultDiv.textContent = `❌ API 調用失敗: ${response.status} ${response.statusText}

錯誤詳情: ${errorText}`;
        }
        
    } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = `錯誤: ${error.message}`;
        console.error('loadPageChunk API 錯誤:', error);
    }
});

// 頁面載入時自動檢查 cookies
document.addEventListener('DOMContentLoaded', () => {
    console.log('Notion API 調試工具載入完成');
    document.getElementById('check-cookies').click();
});