/* global chrome */
import { MigrationScanner } from '../scripts/options/MigrationScanner.js';

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const databaseIdInput = document.getElementById('database-id');
  const databaseSelect = document.getElementById('database-select');
  const saveButton = document.getElementById('save-button');
  const oauthButton = document.getElementById('oauth-button');
  const disconnectButton = document.getElementById('disconnect-button');
  const testApiButton = document.getElementById('test-api-button');
  const status = document.getElementById('status');
  const debugToggle = document.getElementById('enable-debug-logs');
  const authStatus = document.getElementById('auth-status');
  const manualSection = document.querySelector('.manual-section');

  // 模板相關元素
  const titleTemplateInput = document.getElementById('title-template');
  const addSourceCheckbox = document.getElementById('add-source');
  const addTimestampCheckbox = document.getElementById('add-timestamp');
  const previewButton = document.getElementById('preview-template');
  const templatePreview = document.getElementById('template-preview');

  let upgradeNoticeBanner = null;
  let searchableSelector = null;

  const Logger = typeof window !== 'undefined' && window.Logger ? window.Logger : console;

  // 驗證 Chrome 擴充 API 是否可用，避免在測試或非擴充環境爆錯
  const isChromeExtensionContext =
    typeof chrome !== 'undefined' &&
    typeof chrome.storage === 'object' &&
    typeof chrome.storage.sync === 'object';

  if (!isChromeExtensionContext) {
    if (status) {
      status.textContent = '❌ 無法載入擴充功能設定：請於 Chrome 擴充環境中開啟。';
      status.className = 'status error';
    }
    Logger.error('❌ [選項頁] 偵測到缺少 Chrome 擴充功能 API，已停止初始化流程。');
    return;
  }

  /**
   * 顯示資料來源升級通知橫幅
   * @description 當偵測到用戶仍在使用舊的Database ID時，顯示升級通知，提醒用戶切換到新的Data Source
   * @param {string} legacyDatabaseId - 舊的資料庫ID，用於在通知中顯示
   * @returns {void}
   */
  function showDataSourceUpgradeNotice(legacyDatabaseId = '') {
    if (!manualSection) {
      return;
    }

    if (!upgradeNoticeBanner) {
      upgradeNoticeBanner = document.createElement('div');
      upgradeNoticeBanner.className = 'upgrade-notice';
      upgradeNoticeBanner.innerHTML = `
                <strong>Notion API 已升級至 2025-09-03 版本</strong>
                <p>偵測到您仍在使用舊的 Database ID：<code class="upgrade-notice-id">${legacyDatabaseId || '未設定'}</code>。請重新載入並選擇資料來源（Data Source），以儲存新的 Data Source ID，確保同步與標註完全正常。</p>
                <div class="upgrade-hint">提示：點擊下方按鈕重新載入資料來源後，從列表重新選擇並儲存設定即可完成升級。</div>
                <div class="upgrade-actions">
                    <button type="button" class="upgrade-refresh-button">🔄 重新載入資料來源</button>
                </div>
            `;

      manualSection.insertBefore(upgradeNoticeBanner, manualSection.firstChild);

      const refreshButton = upgradeNoticeBanner.querySelector('.upgrade-refresh-button');
      if (refreshButton) {
        refreshButton.addEventListener('click', () => {
          if (!testApiButton.disabled) {
            testApiButton.click();
          }
        });
      }
    }

    const idDisplay = upgradeNoticeBanner.querySelector('.upgrade-notice-id');
    if (idDisplay) {
      idDisplay.textContent = legacyDatabaseId || '未設定';
    }
  }

  /**
   * 隱藏資料來源升級通知橫幅
   * @description 從頁面中移除升級通知橫幅並清除引用，用於用戶已完成升級或不需要顯示通知時
   * @returns {void}
   */
  function hideDataSourceUpgradeNotice() {
    upgradeNoticeBanner?.parentNode?.remove();
    upgradeNoticeBanner = null;
  }

  // 檢查授權狀態和載入設置
  function checkAuthStatus() {
    chrome.storage.sync.get(
      [
        'notionApiKey',
        'notionDataSourceId',
        'notionDatabaseId',
        'titleTemplate',
        'addSource',
        'addTimestamp',
        'enableDebugLogs',
      ],
      result => {
        if (result.notionApiKey) {
          authStatus.textContent = '✅ 已連接到 Notion';
          authStatus.className = 'auth-status success';
          oauthButton.innerHTML = '<span class="notion-icon">🔄</span>重新設置';
          disconnectButton.style.display = 'inline-block';

          apiKeyInput.value = result.notionApiKey;

          const storedLegacyId = result.notionDatabaseId || '';
          const storedDataSourceId = result.notionDataSourceId || '';
          const resolvedId = storedDataSourceId || storedLegacyId;

          if (resolvedId) {
            databaseIdInput.value = resolvedId;
          } else {
            databaseIdInput.value = '';
          }

          if (storedLegacyId && !storedDataSourceId) {
            showDataSourceUpgradeNotice(storedLegacyId);
          } else {
            hideDataSourceUpgradeNotice();
          }

          // 載入資料來源列表
          loadDatabases(result.notionApiKey);
        } else {
          authStatus.textContent = '未連接到 Notion';
          authStatus.className = 'auth-status';
          oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
          disconnectButton.style.display = 'none';
          hideDataSourceUpgradeNotice();
        }

        // 載入模板設置
        titleTemplateInput.value = result.titleTemplate || '{title}';
        addSourceCheckbox.checked = result.addSource !== false; // 默認為 true
        addTimestampCheckbox.checked = result.addTimestamp !== false; // 默認為 true
        // 日誌模式
        if (debugToggle) {
          debugToggle.checked = Boolean(result.enableDebugLogs);
        }
      }
    );
  }

  // 引導用戶到 Notion 設置頁面
  async function startNotionSetup() {
    try {
      oauthButton.disabled = true;
      oauthButton.innerHTML = '<span class="loading"></span>正在打開 Notion...';

      // 打開 Notion 集成頁面
      const integrationUrl = 'https://www.notion.so/my-integrations';
      await chrome.tabs.create({ url: integrationUrl });

      // 顯示設置指南
      showSetupGuide();

      setTimeout(() => {
        oauthButton.disabled = false;
        oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
      }, 2000);
    } catch (error) {
      oauthButton.disabled = false;
      oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
      showStatus(`打開 Notion 頁面失敗: ${error.message}`, 'error');
    }
  }

  // 顯示簡化設置指南
  function showSetupGuide() {
    const guideHtml = `
            <div style="background: #e6fffa; border: 1px solid #38b2ac; border-radius: 6px; padding: 15px; margin: 15px 0;">
                <h3 style="margin: 0 0 10px 0; color: #2c7a7b;">📋 快速設置</h3>
                <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
                    <li>點擊 <strong>"+ New integration"</strong> 創建新的集成</li>
                    <li>複製 <strong>"Internal Integration Token"</strong></li>
                    <li>將 Token 貼到下方的 API Key 欄位</li>
                    <li>系統會自動載入可用的資料來源列表</li>
                </ol>
            </div>
        `;

    const existingGuide = document.querySelector('.setup-guide');
    if (existingGuide) {
      existingGuide.remove();
    }

    const guideDiv = document.createElement('div');
    guideDiv.className = 'setup-guide';
    guideDiv.innerHTML = guideHtml;

    manualSection.insertBefore(guideDiv, manualSection.firstChild);
  }

  /**
   * 檢查數據庫 schema 是否包含 URL 屬性
   * @param {Object} database - 數據庫對象
   * @returns {boolean} 是否有 URL 屬性
   */
  function hasUrlProperty(database) {
    if (database.object !== 'data_source' || !database.properties) {
      return false;
    }
    // 檢查 properties（schema）中是否有 URL 類型的屬性
    return Object.values(database.properties).some(prop => prop.type === 'url');
  }

  /**
   * 檢查頁面是否可能是已保存的網頁
   * 判斷依據：有 URL 屬性且 parent 為 data_source_id
   * @param {Object} page - 頁面對象
   * @returns {boolean} 是否可能是已保存的網頁
   */
  function isSavedWebPage(page) {
    if (page.object !== 'page') {
      return false;
    }

    // 如果 parent 是 data_source_id，更可能是已保存的網頁
    if (page.parent?.type === 'data_source_id') {
      // 嘗試檢查是否有 URL 屬性（如果 properties 可用）
      if (page.properties) {
        const hasUrl = Object.entries(page.properties).some(([key, prop]) => {
          // 檢查屬性名稱或類型是否為 URL
          return key.toLowerCase().includes('url') || prop.type === 'url';
        });
        if (hasUrl) {
          return true;
        }
      }
      // 如果無法確認，保守處理：不排除
      return false;
    }

    return false;
  }

  /**
   * 智能篩選和排序資料來源（v4.4 優化：基於 schema/properties 精確篩選）
   * @param {Array} results - API 返回的原始結果
   * @param {number} maxResults - 最大返回數量
   * @returns {Array} 篩選並排序後的結果
   */
  function filterAndSortResults(results, maxResults = 100) {
    window.Logger?.info?.(`開始篩選 ${results.length} 個項目，目標: ${maxResults} 個`);

    // 步驟 1：分類項目（5層優先級，基於 schema/properties）
    const workspacePages = []; // 第1層：workspace 頁面（幾乎必定是分類）
    const urlDatabases = []; // 第2層：有 URL 屬性的數據庫（保存目的地）
    const categoryPages = []; // 第3層：無 URL 的頁面（可能是分類）
    const otherDatabases = []; // 第4層：無 URL 的數據庫（其他容器）
    const otherPages = []; // 第5層：其他頁面

    let excludedCount = 0; // 被排除的項目計數

    results.forEach(item => {
      // 排除非目標類型
      if (item.object !== 'page' && item.object !== 'data_source') {
        window.Logger?.debug?.(`過濾掉非目標類型: ${item.object}`);
        return;
      }

      // 排除已保存的網頁（有 URL 屬性的 data_source_id 子頁面）
      if (isSavedWebPage(item)) {
        excludedCount++;
        window.Logger?.debug?.(`排除已保存網頁: ${item.id}`);
        return;
      }

      // 分類到對應層級
      if (item.object === 'data_source') {
        // 數據庫按是否有 URL 屬性分類
        if (hasUrlProperty(item)) {
          // 有 URL 屬性：很可能是保存網頁的數據庫（第2層）
          urlDatabases.push(item);
        } else {
          // 無 URL 屬性：其他用途的數據庫（第4層）
          otherDatabases.push(item);
        }
      } else if (item.object === 'page') {
        // 頁面按 parent 類型和屬性分層
        if (item.parent?.type === 'workspace') {
          // workspace 直屬：幾乎必定是分類頁面（第1層）
          workspacePages.push(item);
        } else if (item.parent?.type === 'page_id') {
          // page_id parent：可能是分類頁面（第3層）
          categoryPages.push(item);
        } else {
          // 其他頁面（第5層）
          otherPages.push(item);
        }
      }
    });

    // 步驟 2：保持 API 返回順序（不進行時間排序）

    // 步驟 3：合併結果（按新的優先級順序）
    const filtered = [
      ...workspacePages, // 第1層：workspace 頁面（分類）
      ...urlDatabases, // 第2層：有 URL 的數據庫（保存目的地）
      ...categoryPages, // 第3層：可能的分類頁面
      ...otherDatabases, // 第4層：其他數據庫
      ...otherPages, // 第5層：其他頁面
    ].slice(0, maxResults);

    window.Logger?.info?.(
      `篩選完成: ${filtered.length} 個項目（${workspacePages.length} 個 workspace 頁面，${urlDatabases.length} 個 URL 數據庫，${categoryPages.length} 個分類頁面，${otherDatabases.length} 個其他數據庫，${otherPages.length} 個其他頁面，排除 ${excludedCount} 個已保存網頁）`
    );

    return filtered;
  }

  // 載入資料來源列表（支援頁面和數據庫）
  async function loadDatabases(apiKey) {
    try {
      showStatus('正在載入保存目標列表...', 'info');
      window.Logger?.info?.(`開始載入保存目標，API Key: ${apiKey.substring(0, 20)}...`);

      // 移除 filter，同時獲取 pages 和 data_sources
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2025-09-03',
        },
        body: JSON.stringify({
          page_size: 100, // 保持 100 以提供充足的篩選池
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time',
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        window.Logger?.info?.(`API 返回 ${data.results?.length || 0} 個項目`);

        if (data.results && data.results.length > 0) {
          // 客戶端智能篩選和排序（增加到 100 個）
          const filteredResults = filterAndSortResults(data.results, 100);

          if (filteredResults.length > 0) {
            populateDatabaseSelect(filteredResults);
          } else {
            showStatus(
              '未找到可用的保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料來源',
              'error'
            );
            databaseSelect.style.display = 'none';
          }
        } else {
          showStatus(
            '未找到任何保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料來源',
            'error'
          );
          databaseSelect.style.display = 'none';
        }
      } else {
        const errorData = await response.json();
        Logger.error('API 錯誤:', errorData);

        let errorMessage = '載入保存目標失敗: ';
        if (response.status === 401) {
          errorMessage += 'API Key 無效或已過期';
        } else if (response.status === 403) {
          errorMessage += 'API Key 沒有足夠的權限';
        } else {
          errorMessage += errorData.message || `HTTP ${response.status}`;
        }

        showStatus(errorMessage, 'error');
        databaseSelect.style.display = 'none';
      }
    } catch (error) {
      Logger.error('載入保存目標失敗:', error);

      let errorMessage = '載入保存目標失敗: ';
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage += '網絡連接問題，請檢查網絡連接';
      } else {
        errorMessage += error.message;
      }

      showStatus(errorMessage, 'error');
      databaseSelect.style.display = 'none';
    }
  }

  // 填充資料來源選擇器
  function populateDatabaseSelect(databases) {
    window.Logger?.info?.('populateDatabaseSelect 被調用，資料來源數量:', databases.length);

    // 初始化搜索式選擇器（如果還沒有）
    if (!searchableSelector) {
      searchableSelector = new SearchableDatabaseSelector({ showStatus, loadDatabases });
    }

    // 使用新的搜索式選擇器

    searchableSelector.populateDatabases(databases);

    // 隱藏原有的簡單選擇器
    databaseSelect.style.display = 'none';

    // 保留原有邏輯作為回退（但隱藏）
    databaseSelect.innerHTML = '<option value="">選擇資料來源...</option>';

    window.Logger?.info?.('找到資料來源:', databases.length, '個');

    databases.forEach(db => {
      const option = document.createElement('option');
      option.value = db.id;
      // 修復標題提取邏輯
      let title = '未命名資料來源';
      if (db.title && db.title.length > 0) {
        title = db.title[0].plain_text || db.title[0].text?.content || '未命名資料來源';
      } else if (db.properties?.title) {
        // 有些資料來源的標題在 properties 中
        const titleProp = Object.values(db.properties).find(prop => prop.type === 'title');
        if (titleProp?.title && titleProp.title.length > 0) {
          title =
            titleProp.title[0].plain_text || titleProp.title[0].text?.content || '未命名資料來源';
        }
      }
      option.textContent = title;
      databaseSelect.appendChild(option);
      window.Logger?.debug?.('添加資料來源:', title, 'ID:', db.id);
    });

    if (databases.length > 0) {
      // 移除舊的事件監聽器，避免重複綑続
      databaseSelect.removeEventListener('change', handleDatabaseSelect);
      databaseSelect.addEventListener('change', handleDatabaseSelect);

      showStatus(`找到 ${databases.length} 個資料來源，請從下拉選單中選擇`, 'success');
    } else {
      showStatus('未找到任何資料來源，請確保 API Key 有權限訪問資料來源', 'error');
    }
  }

  // 處理資料來源選擇
  function handleDatabaseSelect() {
    if (databaseSelect.value) {
      databaseIdInput.value = databaseSelect.value;
      showStatus('資料來源已選擇，請點擊保存設置', 'info');
    }
  }

  // 顯示狀態消息
  function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = type;

    if (type === 'success') {
      setTimeout(() => {
        status.textContent = '';
        status.className = '';
      }, 3000);
    }
  }

  // 手動保存設置
  function saveManualSettings() {
    const apiKey = apiKeyInput.value.trim();
    let databaseId = databaseIdInput.value.trim();

    if (apiKey && databaseId) {
      // Clean the database ID: remove query parameters like ?v=...
      const queryParamIndex = databaseId.indexOf('?');
      if (queryParamIndex !== -1) {
        databaseId = databaseId.substring(0, queryParamIndex);
      }
      // Also remove hyphens, some Notion links have them
      databaseId = databaseId.replace(/-/g, '');

      // Update the input field to show the cleaned ID
      databaseIdInput.value = databaseId;

      // 獲取類型信息（從隱藏字段或默認為 data_source）
      const typeInput = document.getElementById('database-type');
      const dataSourceType = typeInput?.value || 'data_source'; // 默認為 data_source 以保持向後兼容

      window.Logger?.info?.(`保存設置: ID=${databaseId}, 類型=${dataSourceType}`);

      // 保存所有設置
      const settings = {
        notionApiKey: apiKey,
        notionDataSourceId: databaseId,
        notionDatabaseId: databaseId, // 保持舊字段以兼容
        notionDataSourceType: dataSourceType, // 新增類型字段
        titleTemplate: titleTemplateInput.value.trim() || '{title}',
        addSource: addSourceCheckbox.checked,
        addTimestamp: addTimestampCheckbox.checked,
        enableDebugLogs: Boolean(debugToggle?.checked),
      };

      chrome.storage.sync.set(settings, () => {
        const typeLabel = dataSourceType === 'page' ? '頁面' : '資料來源';
        showStatus(`設置保存成功！已選擇${typeLabel}`, 'success');
        checkAuthStatus();
      });
    } else {
      showStatus('請填寫 API Key 和資料來源 ID', 'error');
    }
  }

  // 日誌模式切換（即時保存）
  if (debugToggle) {
    debugToggle.addEventListener('change', () => {
      try {
        chrome.storage.sync.set({ enableDebugLogs: Boolean(debugToggle.checked) }, () => {
          showStatus(
            debugToggle.checked ? '已啟用偵錯日誌（前端日誌將轉送到背景頁）' : '已停用偵錯日誌',
            'success'
          );
        });
      } catch (errToggle) {
        showStatus(`切換日誌模式失敗: ${errToggle.message}`, 'error');
      }
    });
  }

  // API Key 輸入時自動載入資料來源
  let loadDatabasesTimeout = null;

  /**
   * 處理 API Key 輸入事件
   * 當用戶輸入 API Key 時，自動嘗試載入資料來源列表
   * 使用防抖動（debounce）避免頻繁請求
   */
  function handleApiKeyInput() {
    const apiKey = apiKeyInput.value.trim();

    // 清除之前的定時器
    if (loadDatabasesTimeout) {
      clearTimeout(loadDatabasesTimeout);
    }

    // 檢查 API Key 格式 - Notion API Key 通常較長
    if (apiKey && apiKey.length > 20) {
      // 延遲載入，避免頻繁請求
      loadDatabasesTimeout = setTimeout(() => {
        loadDatabases(apiKey);
      }, 1000);
    }
  }

  apiKeyInput.addEventListener('input', handleApiKeyInput);
  apiKeyInput.addEventListener('blur', handleApiKeyInput);

  // 測試 API Key 功能
  function testApiKey() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('請先輸入 API Key', 'error');
      return;
    }

    if (apiKey.length < 20) {
      showStatus('API Key 格式不正確，長度太短', 'error');
      return;
    }

    testApiButton.disabled = true;
    testApiButton.textContent = '測試中...';

    loadDatabases(apiKey).finally(() => {
      testApiButton.disabled = false;
      testApiButton.textContent = '測試 API Key';
    });
  }

  // 模板預覽功能
  function previewTemplate() {
    const template = titleTemplateInput.value.trim() || '{title}';
    const sampleTitle = '示例文章標題';
    const sampleUrl = 'https://example.com/article';

    // 簡化的模板處理（不引入完整的 template.js）
    const now = new Date();
    const domain = 'example.com';
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const datetime = `${date} ${time}`;

    const processedTitle = template
      .replace(/\{title\}/g, sampleTitle)
      .replace(/\{url\}/g, sampleUrl)
      .replace(/\{domain\}/g, domain)
      .replace(/\{date\}/g, date)
      .replace(/\{time\}/g, time)
      .replace(/\{datetime\}/g, datetime);

    let previewText = `標題預覽: "${processedTitle}"`;

    if (addTimestampCheckbox.checked) {
      previewText += '\n✓ 會在內容開頭添加時間戳';
    }

    if (addSourceCheckbox.checked) {
      previewText += '\n✓ 會在內容末尾添加來源鏈接';
    }

    templatePreview.textContent = previewText;
    templatePreview.className = 'template-preview show';
  }

  // 斷開連接功能
  async function disconnectFromNotion() {
    try {
      Logger.info('🔌 [斷開連接] 開始斷開 Notion 連接');

      // 清除授權相關數據
      await chrome.storage.sync.remove(['notionApiKey', 'notionDataSourceId', 'notionDatabaseId']);

      Logger.info('✅ [斷開連接] 已清除授權數據');

      // 重新檢查授權狀態，這會更新UI
      checkAuthStatus();

      // 清除輸入框內容
      if (apiKeyInput) {
        apiKeyInput.value = '';
      }
      if (databaseIdInput) {
        databaseIdInput.value = '';
      }

      showStatus('已成功斷開與 Notion 的連接。', 'success');
      Logger.info('🔄 [斷開連接] UI 已更新為未連接狀態');
    } catch (error) {
      Logger.error('❌ [斷開連接] 斷開連接失敗:', error);
      showStatus(`斷開連接失敗: ${error.message}`, 'error');
    }
  }

  // 事件監聽器
  oauthButton.addEventListener('click', startNotionSetup);
  disconnectButton.addEventListener('click', disconnectFromNotion);
  saveButton.addEventListener('click', saveManualSettings);
  testApiButton.addEventListener('click', testApiKey);
  previewButton.addEventListener('click', previewTemplate);

  // 數據管理功能
  setupDataManagement();

  // 初始化
  checkAuthStatus();

  // 數據管理功能實現
  function setupDataManagement() {
    const exportButton = document.getElementById('export-data-button');
    const importButton = document.getElementById('import-data-button');
    const importFile = document.getElementById('import-data-file');
    const checkButton = document.getElementById('check-data-button');
    const dataStatus = document.getElementById('data-status');

    // 備份數據
    exportButton.addEventListener('click', async () => {
      try {
        showDataStatus('正在備份數據...', 'info');

        const data = await new Promise(resolve => {
          chrome.storage.local.get(null, resolve);
        });

        const backup = {
          timestamp: new Date().toISOString(),
          version: chrome.runtime.getManifest().version,
          data,
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: 'application/json',
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `notion-clipper-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showDataStatus('✅ 數據備份成功！備份文件已下載。', 'success');
      } catch (error) {
        console.error('Backup failed:', error);
        showDataStatus(`❌ 備份失敗：${error.message}`, 'error');
      }
    });

    // 恢復數據
    importButton.addEventListener('click', () => {
      importFile.click();
    });

    importFile.addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = async readerEvent => {
        try {
          showDataStatus('正在恢復數據...', 'info');

          const backup = JSON.parse(readerEvent.target.result);

          if (!backup.data) {
            throw new Error('無效的備份文件格式');
          }

          await new Promise(resolve => {
            chrome.storage.local.set(backup.data, resolve);
          });

          showDataStatus(
            `✅ 數據恢復成功！已恢復 ${Object.keys(backup.data).length} 項數據。請重新整理頁面查看。`,
            'success'
          );

          // 清除文件選擇
          importFile.value = '';

          // 3秒後重新載入設定
          setTimeout(() => {
            checkAuthStatus();
          }, 2000);
        } catch (error) {
          console.error('Import failed:', error);
          showDataStatus(`❌ 恢復失敗：${error.message}`, 'error');
          importFile.value = '';
        }
      };
      reader.readAsText(file);
    });

    // 檢查數據完整性
    checkButton.addEventListener('click', async () => {
      try {
        showDataStatus('正在檢查數據完整性...', 'info');

        const data = await new Promise(resolve => {
          chrome.storage.local.get(null, resolve);
        });

        const report = analyzeData(data);

        let statusText = '📊 數據完整性報告：\n';
        statusText += `• 總共 ${report.totalKeys} 個數據項\n`;
        statusText += `• ${report.highlightPages} 個頁面有標記\n`;
        statusText += `• ${report.configKeys} 個配置項\n`;

        // v2.8.0: 顯示遷移數據統計
        if (report.migrationKeys > 0) {
          const migrationSizeKB = (report.migrationDataSize / 1024).toFixed(1);
          statusText += `• ⚠️ ${report.migrationKeys} 個遷移數據（${migrationSizeKB} KB，可清理）\n`;
        }

        if (report.corruptedData.length > 0) {
          statusText += `• ⚠️ ${report.corruptedData.length} 個損壞的數據項`;
          showDataStatus(statusText, 'error');
        } else if (report.migrationKeys > 0) {
          statusText += '• 💡 建議使用「數據重整」功能清理遷移數據';
          showDataStatus(statusText, 'warning');
        } else {
          statusText += '• ✅ 所有數據完整無損';
          showDataStatus(statusText, 'success');
        }
      } catch (error) {
        console.error('Data check failed:', error);
        showDataStatus(`❌ 檢查失敗：${error.message}`, 'error');
      }
    });

    /**
     * 顯示數據狀態訊息
     * @param {string} message - 要顯示的訊息
     * @param {string} type - 訊息類型（info, success, warning, error）
     */
    function showDataStatus(message, type) {
      dataStatus.textContent = message;
      dataStatus.className = `data-status ${type}`;
    }

    /**
     * 分析存儲數據的完整性
     * @param {Object} data - chrome.storage.local 中的所有數據
     * @returns {Object} 包含分析報告的對象
     */
    function analyzeData(data) {
      const report = {
        totalKeys: Object.keys(data).length,
        highlightPages: 0,
        configKeys: 0,
        migrationKeys: 0, // v2.8.0: 新增遷移數據統計
        migrationDataSize: 0, // v2.8.0: 遷移數據大小
        corruptedData: [],
      };

      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('highlights_')) {
          report.highlightPages++;
          if (!Array.isArray(value) && (!value || !Array.isArray(value.highlights))) {
            report.corruptedData.push(key);
          }
        } else if (key.startsWith('config_') || key.includes('notion')) {
          report.configKeys++;
        } else if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
          // v2.8.0: 統計遷移數據（包括舊版本備份）
          report.migrationKeys++;
          const size = new Blob([JSON.stringify({ [key]: value })]).size;
          report.migrationDataSize += size;
        }
      }

      return report;
    }

    // 存儲使用情況相關功能
    const refreshUsageButton = document.getElementById('refresh-usage-button');

    // 頁面載入時更新存儲使用情況
    updateStorageUsage();

    // 刷新按鈕事件
    refreshUsageButton.addEventListener('click', updateStorageUsage);

    /**
     * 更新存儲使用量統計
     * 從 chrome.storage.local 獲取數據並更新顯示
     */
    async function updateStorageUsage() {
      try {
        const usage = await getStorageUsage();
        updateUsageDisplay(usage);
      } catch (error) {
        console.error('Failed to get storage usage:', error);
      }
    }

    /**
     * 取得 chrome.storage.local 的使用統計，並回傳容量與標註分佈摘要。
     * 由於本擴展已申請 unlimitedStorage 權限，不受 5MB 限制。
     * 健康度百分比基於 100MB 參考值計算，僅供直觀顯示用。
     * @returns {Promise<{used:number,percentage:string,usedMB:string,pages:number,highlights:number,configs:number,isUnlimited:boolean}>}
     * 使用量概覽（含字節與 MB 單位、標註頁面數、標註數量與設定鍵數）
     * @throws {chrome.runtime.LastError} 無法存取 storage 時拋出，供上層顯示錯誤
     */
    async function getStorageUsage() {
      const data = await new Promise((resolve, reject) => {
        chrome.storage.local.get(null, result => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(result);
        });
      });

      const jsonString = JSON.stringify(data);
      const sizeInBytes = new Blob([jsonString]).size;
      // unlimitedStorage：使用 100MB 作為顯示參考值（非實際限制）
      const referenceSize = 100 * 1024 * 1024; // 100MB 參考值

      // 分析數據
      let pagesCount = 0;
      let highlightsCount = 0;
      let configCount = 0;

      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('highlights_')) {
          pagesCount++;
          if (Array.isArray(value)) {
            highlightsCount += value.length;
          }
        } else if (key.includes('notion') || key.startsWith('config_')) {
          configCount++;
        }
      }

      // 百分比僅供視覺化參考，不代表實際限制
      const percentage = Math.min((sizeInBytes / referenceSize) * 100, 100).toFixed(1);

      const usage = {
        used: sizeInBytes,
        percentage,
        usedMB: (sizeInBytes / (1024 * 1024)).toFixed(2),
        pages: pagesCount,
        highlights: highlightsCount,
        configs: configCount,
        isUnlimited: true, // 標識已啟用無限存儲
      };

      return usage;
    }

    /**
     * 更新存儲使用量的 UI 顯示
     * 支援 unlimitedStorage 模式，顯示實際使用量而非固定上限。
     * @param {Object} usage - 包含使用量統計的對象
     */
    function updateUsageDisplay(usage) {
      const usageFill = document.getElementById('usage-fill');
      const usagePercentage = document.getElementById('usage-percentage');
      const usageDetails = document.getElementById('usage-details');
      const pagesCount = document.getElementById('pages-count');
      const highlightsCount = document.getElementById('highlights-count');
      const configCount = document.getElementById('config-count');

      // 更新使用率條（視覺化參考，非實際限制）
      usageFill.style.width = `${usage.percentage}%`;

      // 根據實際使用量設置顏色提示（unlimitedStorage 模式）
      // 使用量 > 50MB 警告，> 80MB 危險（性能考量，非存儲限制）
      const usedMB = parseFloat(usage.usedMB);
      usageFill.className = 'usage-fill';
      if (usedMB > 80) {
        usageFill.classList.add('danger');
      } else if (usedMB > 50) {
        usageFill.classList.add('warning');
      }

      // 更新百分比顯示（基於 100MB 參考值）
      usagePercentage.textContent = `${usage.percentage}%`;

      // unlimitedStorage 模式：只顯示實際使用量
      if (usage.isUnlimited) {
        usageDetails.textContent = `${usage.usedMB} MB（無限存儲）`;
      } else {
        usageDetails.textContent = `${usage.usedMB} MB`;
      }

      // 更新統計信息
      pagesCount.textContent = usage.pages.toLocaleString();
      highlightsCount.textContent = usage.highlights.toLocaleString();
      configCount.textContent = usage.configs;

      // 基於實際使用量的性能建議（大量數據可能影響性能）
      if (usedMB > 80) {
        showDataStatus(
          `⚠️ 數據量較大 (${usage.usedMB} MB)，建議清理不需要的標記數據以維持最佳性能`,
          'warning'
        );
      } else if (usedMB > 100) {
        showDataStatus(
          `🚨 數據量過大 (${usage.usedMB} MB)，可能影響擴展性能，建議立即清理`,
          'error'
        );
      }
    }

    // 數據優化功能
    const previewCleanupButton = document.getElementById('preview-cleanup-button');
    const executeCleanupButton = document.getElementById('execute-cleanup-button');
    const analyzeOptimizationButton = document.getElementById('analyze-optimization-button');
    const executeOptimizationButton = document.getElementById('execute-optimization-button');
    const cleanupPreview = document.getElementById('cleanup-preview');
    const optimizationPreview = document.getElementById('optimization-preview');

    let cleanupPlan = null;
    let optimizationPlan = null;

    previewCleanupButton.addEventListener('click', previewSafeCleanup);
    executeCleanupButton.addEventListener('click', executeSafeCleanup);
    analyzeOptimizationButton.addEventListener('click', analyzeOptimization);
    executeOptimizationButton.addEventListener('click', executeOptimization);

    // 安全清理：清理已刪除頁面的標註數據
    async function previewSafeCleanup() {
      const cleanDeletedPages = document.getElementById('cleanup-deleted-pages').checked;

      // 顯示加載狀態
      setPreviewButtonLoading(true);

      try {
        const plan = await generateSafeCleanupPlan(cleanDeletedPages);
        cleanupPlan = plan;
        displayCleanupPreview(plan);

        if (plan.items.length > 0) {
          executeCleanupButton.style.display = 'inline-block';
        } else {
          executeCleanupButton.style.display = 'none';
        }
      } catch (error) {
        console.error('預覽清理失敗:', error);
        showDataStatus(`❌ 預覽清理失敗: ${error.message}`, 'error');
      } finally {
        // 恢復按鈕狀態
        setPreviewButtonLoading(false);
      }
    }

    // 設置預覽按鈕的加載狀態
    function setPreviewButtonLoading(loading) {
      const button = document.getElementById('preview-cleanup-button');
      const buttonText = button.querySelector('.button-text');

      if (loading) {
        button.classList.add('loading');
        button.disabled = true;
        buttonText.textContent = '🔍 檢查中...';
      } else {
        button.classList.remove('loading');
        button.disabled = false;
        buttonText.textContent = '👀 預覽清理效果';
      }
    }

    // 更新檢查進度
    function updateCheckProgress(current, total) {
      const button = document.getElementById('preview-cleanup-button');
      const buttonText = button.querySelector('.button-text');

      if (total > 0) {
        const percentage = Math.round((current / total) * 100);
        buttonText.textContent = `🔍 檢查中... ${current}/${total} (${percentage}%)`;
      }
    }

    /**
     * 生成安全清理計劃
     * @param {boolean} cleanDeletedPages - 是否清理已刪除頁面的數據
     * @returns {Promise<Object>} 包含清理計劃的對象
     */
    async function generateSafeCleanupPlan(cleanDeletedPages) {
      const data = await new Promise(resolve => {
        chrome.storage.local.get(null, resolve);
      });

      const plan = {
        items: [],
        totalKeys: 0,
        spaceFreed: 0,
        deletedPages: 0,
      };

      // 清理已刪除頁面的標註數據
      if (cleanDeletedPages) {
        const savedPages = Object.keys(data)
          .filter(key => key.startsWith('saved_'))
          .map(key => ({
            key,
            url: key.replace('saved_', ''),
            data: data[key],
          }));

        // 顯示檢查進度
        updateCheckProgress(0, savedPages.length);

        // 批量檢查（避免 API 速率限制）
        for (let i = 0; i < savedPages.length; i++) {
          const page = savedPages[i];

          // 更新進度
          updateCheckProgress(i + 1, savedPages.length);

          if (!page.data || !page.data.notionPageId) {
            continue;
          }

          try {
            // 檢查 Notion 頁面是否存在
            const exists = await checkNotionPageExists(page.data.notionPageId);

            if (!exists) {
              // 頁面已刪除，添加到清理計劃
              const savedKey = page.key;
              const highlightsKey = `highlights_${page.url}`;

              const savedSize = new Blob([JSON.stringify({ [savedKey]: page.data })]).size;
              const highlightsData = data[highlightsKey];
              const highlightsSize = highlightsData
                ? new Blob([JSON.stringify({ [highlightsKey]: highlightsData })]).size
                : 0;
              const totalSize = savedSize + highlightsSize;

              // 添加兩個項目（saved_ 和 highlights_）
              plan.items.push({
                key: savedKey,
                url: page.url,
                size: savedSize,
                reason: '已刪除頁面的保存狀態',
              });

              if (highlightsData) {
                plan.items.push({
                  key: highlightsKey,
                  url: page.url,
                  size: highlightsSize,
                  reason: '已刪除頁面的標註數據',
                });
              }

              plan.spaceFreed += totalSize;
              plan.deletedPages++;
            }

            // 避免 API 速率限制（Notion: 3 requests/second）
            if (i < savedPages.length - 1) {
              await new Promise(sleep => setTimeout(sleep, 350));
            }
          } catch (error) {
            console.error(`檢查頁面失敗: ${page.url}`, error);
            // 繼續處理下一個頁面
          }
        }
      }

      plan.totalKeys = plan.items.length;
      return plan;
    }

    // 輔助函數：檢查 Notion 頁面是否存在
    async function checkNotionPageExists(pageId) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'checkNotionPageExists',
          pageId,
        });
        return response && response.exists === true;
      } catch (error) {
        console.error('檢查頁面存在失敗:', error);
        return true; // 發生錯誤時假設頁面存在（安全策略）
      }
    }

    /**
     * 顯示清理預覽
     * @param {Object} plan - 清理計劃對象
     */
    function displayCleanupPreview(plan) {
      cleanupPreview.className = 'cleanup-preview show';

      if (plan.items.length === 0) {
        cleanupPreview.innerHTML = `
                    <div class="cleanup-summary">
                        <strong>✅ 沒有發現需要清理的數據</strong>
                        <p>所有頁面記錄都是有效的，無需清理。</p>
                    </div>
                `;
        return;
      }

      const spaceMB = (plan.spaceFreed / (1024 * 1024)).toFixed(3);

      let summaryText = '🧹 安全清理預覽\n\n將清理：\n';
      if (plan.deletedPages > 0) {
        summaryText += `• ${plan.deletedPages} 個已刪除頁面的數據\n`;
      }
      summaryText += `\n釋放約 ${spaceMB} MB 空間`;

      cleanupPreview.innerHTML = `
                <div class="cleanup-summary">
                    <strong>🧹 安全清理預覽</strong>
                    <p>${summaryText
                      .split('\n')
                      .filter(line => line)
                      .map(line => {
                        if (line.includes('將清理：')) {
                          return `<strong>${line.replace('將清理：', '')}</strong>`;
                        }
                        if (line.startsWith('•')) {
                          return line;
                        }
                        if (line.includes('釋放約')) {
                          return `<br>${line}`;
                        }
                        return line;
                      })
                      .join('<br>')}</p>
                    <div class="warning-notice">
                        ⚠️ <strong>重要提醒：</strong>這只會清理擴展中的無效記錄，<strong>絕對不會影響您在 Notion 中保存的任何頁面</strong>。
                    </div>
                </div>
                <div class="cleanup-list">
                    ${plan.items
                      .slice(0, 10)
                      .map(
                        item => `
                        <div class="cleanup-item">
                            <strong>${decodeURIComponent(item.url)}</strong> - ${item.reason}
                            <br><small>${(item.size / 1024).toFixed(1)} KB</small>
                        </div>
                    `
                      )
                      .join('')}
                    ${plan.items.length > 10 ? `<div class="cleanup-item"><em>... 還有 ${plan.items.length - 10} 個項目</em></div>` : ''}
                </div>
            `;
    }

    /**
     * 執行安全清理
     * 根據生成的清理計劃刪除不需要的數據
     */
    async function executeSafeCleanup() {
      if (!cleanupPlan || cleanupPlan.items.length === 0) {
        showDataStatus('❌ 沒有清理計劃可執行', 'error');
        return;
      }

      try {
        showDataStatus('🔄 正在執行安全清理...', 'info');

        const keysToRemove = cleanupPlan.items.map(item => item.key);

        // 執行刪除操作
        await new Promise((resolve, reject) => {
          chrome.storage.local.remove(keysToRemove, () => {
            if (chrome.runtime.lastError) {
              console.error('❌ 刪除失敗:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });

        const spaceKB = (cleanupPlan.spaceFreed / 1024).toFixed(1);
        let message = `✅ 安全清理完成！已移除 ${cleanupPlan.totalKeys} 個無效記錄，釋放 ${spaceKB} KB 空間`;

        if (cleanupPlan.deletedPages > 0) {
          message += `\n• 清理了 ${cleanupPlan.deletedPages} 個已刪除頁面的數據`;
        }

        showDataStatus(message, 'success');

        // 重新整理使用情況和預覽
        updateStorageUsage();
        executeCleanupButton.style.display = 'none';
        cleanupPreview.className = 'cleanup-preview';
        cleanupPlan = null;
      } catch (error) {
        console.error('Cleanup failed:', error);
        showDataStatus(`❌ 清理失敗：${error.message}`, 'error');
      }
    }

    // 數據重整優化
    async function analyzeOptimization() {
      const plan = await generateOptimizationPlan();
      optimizationPlan = plan;
      displayOptimizationPreview(plan);

      if (plan.canOptimize) {
        executeOptimizationButton.style.display = 'inline-block';
      } else {
        executeOptimizationButton.style.display = 'none';
      }
    }

    // 生成資料重整分析計劃，統計遷移殘留與空標註以評估可節省空間
    function generateOptimizationPlan() {
      return new Promise(resolve => {
        chrome.storage.local.get(null, data => {
          const plan = {
            canOptimize: false,
            originalSize: 0,
            optimizedSize: 0,
            spaceSaved: 0,
            optimizations: [],
            highlightPages: 0,
            totalHighlights: 0,
            keysToRemove: [],
            optimizedData: {},
          };

          const originalData = JSON.stringify(data);
          plan.originalSize = new Blob([originalData]).size;

          // v2.8.0: 統計遷移數據
          let migrationDataSize = 0;
          let migrationKeysCount = 0;
          let emptyHighlightKeys = 0;
          let emptyHighlightSize = 0;

          // 分析可能的優化
          const optimizedData = {};
          const keysToRemove = [];

          for (const [key, value] of Object.entries(data)) {
            // v2.8.0: 檢測並清理遷移數據（包括舊版本備份）
            if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
              migrationKeysCount++;
              const size = new Blob([JSON.stringify({ [key]: value })]).size;
              migrationDataSize += size;
              keysToRemove.push(key);
              // 不加入 optimizedData（清理掉）
              continue;
            }

            if (key.startsWith('highlights_')) {
              const highlightsArray = Array.isArray(value) ? value : value?.highlights;
              if (Array.isArray(highlightsArray) && highlightsArray.length > 0) {
                plan.highlightPages++;
                plan.totalHighlights += highlightsArray.length;
                optimizedData[key] = value;
              } else {
                emptyHighlightKeys++;
                emptyHighlightSize += new Blob([JSON.stringify({ [key]: value })]).size;
                keysToRemove.push(key);
              }
            } else {
              optimizedData[key] = value;
            }
          }

          // v2.8.0: 添加遷移數據清理到優化計劃
          if (migrationDataSize > 1024) {
            const sizeKB = (migrationDataSize / 1024).toFixed(1);
            plan.optimizations.push(`清理遷移數據（${migrationKeysCount} 項，${sizeKB} KB）`);
            plan.canOptimize = true;
          }

          if (emptyHighlightKeys > 0) {
            const sizeKB = (emptyHighlightSize / 1024).toFixed(1);
            plan.optimizations.push(`移除空標註紀錄（${emptyHighlightKeys} 項，${sizeKB} KB）`);
            plan.canOptimize = true;
          }

          plan.keysToRemove = keysToRemove;
          plan.optimizedData = optimizedData;

          const optimizedJson = JSON.stringify(optimizedData);
          plan.optimizedSize = new Blob([optimizedJson]).size;
          plan.spaceSaved = plan.originalSize - plan.optimizedSize;

          // 只要有遷移或空標註數據就可以優化
          if (migrationKeysCount > 0 || emptyHighlightKeys > 0) {
            plan.canOptimize = true;
          }

          // 檢查是否需要索引重建
          const hasFragmentation = Object.keys(data).some(
            key => key.startsWith('highlights_') && (!data[key] || !Array.isArray(data[key]))
          );

          if (hasFragmentation) {
            plan.optimizations.push('修復數據碎片');
            plan.canOptimize = true;
          }

          resolve(plan);
        });
      });
    }

    /**
     * 顯示優化預覽
     * @param {Object} plan - 優化計劃對象
     */
    function displayOptimizationPreview(plan) {
      optimizationPreview.className = 'optimization-preview show';

      if (!plan.canOptimize) {
        optimizationPreview.innerHTML = `
                    <div class="optimization-summary">
                        <strong>✅ 數據已經處於最佳狀態</strong>
                        <p>當前數據結構已經很好，暫時不需要重整優化。</p>
                        <div class="data-stats">
                            <div>📑 標記頁面：${plan.highlightPages}</div>
                            <div>🎯 總標記數：${plan.totalHighlights}</div>
                            <div>💾 數據大小：${(plan.originalSize / 1024).toFixed(1)} KB</div>
                        </div>
                    </div>
                `;
        return;
      }

      const spaceSavedMB = (plan.spaceSaved / (1024 * 1024)).toFixed(3);
      const percentSaved = ((plan.spaceSaved / plan.originalSize) * 100).toFixed(1);

      optimizationPreview.innerHTML = `
                <div class="optimization-summary">
                    <strong>⚡ 數據重整分析結果</strong>
                    <p>可以優化您的數據結構，預計節省 <strong>${spaceSavedMB} MB</strong> 空間（<strong>${percentSaved}%</strong>）</p>
                    <div class="optimization-details">
                        <div class="size-comparison">
                            <div>📊 當前大小：${(plan.originalSize / 1024).toFixed(1)} KB</div>
                            <div>📊 優化後：${(plan.optimizedSize / 1024).toFixed(1)} KB</div>
                            <div>💾 節省空間：${(plan.spaceSaved / 1024).toFixed(1)} KB</div>
                        </div>
                        <div class="optimization-list">
                            <strong>將執行的優化：</strong>
                            ${plan.optimizations.map(opt => `<div class="optimization-item">✅ ${opt}</div>`).join('')}
                        </div>
                    </div>
                </div>
            `;
    }

    /**
     * 執行數據優化
     * 根據優化計劃重整數據結構
     */
    async function executeOptimization() {
      if (!optimizationPlan || !optimizationPlan.canOptimize) {
        showDataStatus('❌ 沒有優化計劃可執行', 'error');
        return;
      }

      try {
        showDataStatus('🔄 正在執行數據重整...', 'info');

        // v2.8.0: 使用預先計算好的優化數據
        const optimizedData = optimizationPlan.optimizedData;
        const keysToRemove = optimizationPlan.keysToRemove;

        // 先刪除遷移數據
        if (keysToRemove.length > 0) {
          await new Promise((resolve, reject) => {
            chrome.storage.local.remove(keysToRemove, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        }

        // 然後寫入優化後的數據（如果有變化）
        const currentData = await new Promise(resolve => {
          chrome.storage.local.get(null, resolve);
        });

        const needsUpdate = Object.keys(optimizedData).some(key => {
          return JSON.stringify(currentData[key]) !== JSON.stringify(optimizedData[key]);
        });

        if (needsUpdate) {
          await new Promise((resolve, reject) => {
            chrome.storage.local.set(optimizedData, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        }

        const spaceSavedKB = (optimizationPlan.spaceSaved / 1024).toFixed(1);
        showDataStatus(
          `✅ 數據重整完成！已清理遷移數據，節省 ${spaceSavedKB} KB 空間，所有標記內容完整保留`,
          'success'
        );

        // 重新整理使用情況和預覽
        updateStorageUsage();
        executeOptimizationButton.style.display = 'none';
        optimizationPreview.className = 'optimization-preview';
        optimizationPlan = null;
      } catch (error) {
        console.error('Optimization failed:', error);
        showDataStatus(`❌ 數據重整失敗：${error.message}`, 'error');
      }
    }

    // ==========================================
    // 標註遷移工具功能
    // ==========================================
    setupMigrationTool();

    /**
     * 設置遷移工具 UI 邏輯
     */
    function setupMigrationTool() {
      const scanButton = document.getElementById('migration-scan-button');
      const executeButton = document.getElementById('migration-execute-button');
      const deleteButton = document.getElementById('migration-delete-button');
      const selectAllCheckbox = document.getElementById('migration-select-all');
      const selectedCountSpan = document.getElementById('migration-selected-count');
      const migrationList = document.getElementById('migration-list');
      const migrationItems = document.getElementById('migration-items');
      const progressDiv = document.getElementById('migration-progress');
      const progressBar = document.getElementById('migration-progress-bar');
      const progressText = document.getElementById('migration-progress-text');
      const resultDiv = document.getElementById('migration-result');

      if (!scanButton) {
        return; // 區塊不存在，可能是舊版 HTML
      }

      let scanResults = []; // { url, highlightCount }

      // 掃描按鈕事件
      scanButton.addEventListener('click', async () => {
        scanButton.disabled = true;
        scanButton.querySelector('.button-text').textContent = '掃描中...';
        resultDiv.innerHTML = '';
        resultDiv.className = 'migration-result';
        migrationList.style.display = 'none';

        try {
          const result = await scanForLegacyHighlights();
          scanResults = result.items;

          if (result.needsMigration) {
            renderMigrationList(scanResults);
            migrationList.style.display = 'block';
            resultDiv.innerHTML = '';
            const strong = document.createElement('strong');
            strong.textContent = `發現 ${result.legacyCount} 個頁面有舊版標註`;
            resultDiv.appendChild(strong);
            resultDiv.append(`，共 ${result.totalHighlights} 個標註。請勾選需要處理的項目。`);
            resultDiv.className = 'migration-result info';
          } else {
            resultDiv.textContent = '✅ 沒有發現需要遷移的舊版標註數據。所有標註數據已是最新格式！';
            resultDiv.className = 'migration-result success';
          }
        } catch (error) {
          console.error('Migration scan failed:', error);
          resultDiv.textContent = `❌ 掃描失敗：${error.message}`;
          resultDiv.className = 'migration-result error';
        } finally {
          scanButton.disabled = false;
          scanButton.querySelector('.button-text').textContent = '開始檢查';
        }
      });

      // 渲染勾選列表
      function renderMigrationList(items) {
        migrationItems.innerHTML = ''; // 清空列表

        items.forEach((item, index) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'migration-item';
          itemDiv.dataset.index = index;

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'migration-item-checkbox';
          checkbox.dataset.url = item.url;
          checkbox.addEventListener('change', updateSelectionState);

          const infoDiv = document.createElement('div');
          infoDiv.className = 'migration-item-info';

          const urlDiv = document.createElement('div');
          urlDiv.className = 'migration-item-url';
          urlDiv.textContent = MigrationScanner.truncateUrl(item.url, 80);

          const metaDiv = document.createElement('div');
          metaDiv.className = 'migration-item-meta';
          metaDiv.textContent = `${item.highlightCount} 個標註`;

          infoDiv.appendChild(urlDiv);
          infoDiv.appendChild(metaDiv);

          itemDiv.appendChild(checkbox);
          itemDiv.appendChild(infoDiv);

          migrationItems.appendChild(itemDiv);
        });

        if (selectAllCheckbox) {
          selectAllCheckbox.checked = false;
        }
        updateSelectionState();
      }

      // 全選事件
      selectAllCheckbox?.addEventListener('change', () => {
        const checkboxes = migrationItems.querySelectorAll('.migration-item-checkbox');
        checkboxes.forEach(cb => {
          cb.checked = selectAllCheckbox.checked;
        });
        updateSelectionState();
      });

      // 更新選中狀態
      function updateSelectionState() {
        const checkboxes = migrationItems.querySelectorAll('.migration-item-checkbox');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

        selectedCountSpan.textContent = `已選 ${checkedCount} 項`;

        const hasSelection = checkedCount > 0;
        executeButton.disabled = !hasSelection;
        deleteButton.disabled = !hasSelection;

        // 更新全選狀態
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = checkedCount === checkboxes.length && checkedCount > 0;
          selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        }
      }

      // 獲取選中的 URL
      function getSelectedUrls() {
        const checkboxes = migrationItems.querySelectorAll('.migration-item-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.dataset.url);
      }

      // 遷移按鈕事件
      executeButton?.addEventListener('click', async () => {
        const selectedUrls = getSelectedUrls();
        if (selectedUrls.length === 0) {
          return;
        }

        await processUrls(selectedUrls, 'migration_execute', '遷移');
      });

      // 刪除按鈕事件
      deleteButton?.addEventListener('click', async () => {
        const selectedUrls = getSelectedUrls();
        if (selectedUrls.length === 0) {
          return;
        }

        // 確認刪除
        // skipcq: JS-0053
        if (
          !window.confirm(
            `確定要刪除選中的 ${selectedUrls.length} 個頁面的標註數據嗎？\n\n此操作不可恢復！`
          )
        ) {
          return;
        }

        await processUrls(selectedUrls, 'migration_delete', '刪除');
      });

      // 處理選中的 URL（遷移或刪除）
      async function processUrls(urls, action, actionName) {
        executeButton.disabled = true;
        deleteButton.disabled = true;
        progressDiv.style.display = 'block';

        let success = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          const progress = Math.round(((i + 1) / urls.length) * 100);

          progressBar.style.width = `${progress}%`;
          progressText.textContent = `${progress}% (${i + 1}/${urls.length})`;

          try {
            const response = await chrome.runtime.sendMessage({ action, url });

            if (response?.success) {
              success++;
              // 從列表中移除已處理項目
              const item = migrationItems
                .querySelector(`[data-url="${url}"]`)
                ?.closest('.migration-item');
              item?.remove();
            } else {
              failed++;
              errors.push(`${MigrationScanner.truncateUrl(url)}: ${response?.error || '未知錯誤'}`);
            }
          } catch (error) {
            failed++;
            errors.push(`${MigrationScanner.truncateUrl(url)}: ${error.message}`);
          }
        }

        // 顯示結果
        progressDiv.style.display = 'none';

        if (failed === 0) {
          resultDiv.innerHTML = `✅ ${actionName}完成！成功處理 ${success} 個頁面。`;
          resultDiv.className = 'migration-result success';
        } else {
          resultDiv.innerHTML = `
            ⚠️ ${actionName}完成：${success} 成功，${failed} 失敗
            <div class="url-list">
              ${errors
                .slice(0, 5)
                .map(err => `<div class="url-item">${err}</div>`)
                .join('')}
              ${errors.length > 5 ? `<div class="url-item">...及其他 ${errors.length - 5} 個錯誤</div>` : ''}
            </div>
          `;
          resultDiv.className = 'migration-result error';
        }

        // 更新列表狀態
        updateSelectionState();
        const remainingItems = migrationItems.querySelectorAll('.migration-item');
        if (remainingItems.length === 0) {
          migrationList.style.display = 'none';
        }

        // 刷新存儲使用情況
        updateStorageUsage();
      }

      /**
       * 掃描舊版標註數據
       * @returns {Promise<{items: {url: string, highlightCount: number}[], totalHighlights: number, legacyCount: number, needsMigration: boolean}>}
       */
      /**
       * 掃描舊版標註數據
       * @returns {Promise<import("../scripts/options/MigrationScanner.js").ScanResult>}
       */
      async function scanForLegacyHighlights() {
        const scanner = new MigrationScanner();
        return scanner.scanStorage();
      }
    }
  }
});
// ==========================================
// 可搜索資料來源選擇器
// ==========================================

class SearchableDatabaseSelector {
  constructor(dependencies = {}) {
    const { showStatus, loadDatabases } = dependencies;

    if (typeof showStatus !== 'function') {
      throw new Error('SearchableDatabaseSelector 需要 showStatus 函式');
    }
    if (typeof loadDatabases !== 'function') {
      throw new Error('SearchableDatabaseSelector 需要 loadDatabases 函式');
    }

    this.showStatus = showStatus;
    this.loadDatabases = loadDatabases;
    this.databases = [];
    this.filteredDatabases = [];
    this.selectedDatabase = null;
    this.isOpen = false;
    this.focusedIndex = -1;

    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.container = document.getElementById('database-selector-container');
    this.searchInput = document.getElementById('database-search');
    this.toggleButton = document.getElementById('selector-toggle');
    this.dropdown = document.getElementById('database-dropdown');
    this.databaseList = document.getElementById('database-list');
    this.databaseCount = document.getElementById('database-count');
    this.refreshButton = document.getElementById('refresh-databases');
    this.databaseIdInput = document.getElementById('database-id');

    window.Logger?.info?.('SearchableDatabaseSelector 元素初始化:', {
      container: this.container,
      searchInput: this.searchInput,
      toggleButton: this.toggleButton,
      dropdown: this.dropdown,
      databaseList: this.databaseList,
      databaseCount: this.databaseCount,
      refreshButton: this.refreshButton,
      databaseIdInput: this.databaseIdInput,
    });

    if (!this.container) {
      console.error('找不到 database-selector-container 元素！');
    }
    if (!this.searchInput) {
      console.error('找不到 database-search 元素！');
    }
  }

  setupEventListeners() {
    // 搜索輸入
    this.searchInput.addEventListener('input', event => {
      this.filterDatabases(event.target.value);
      this.showDropdown();
    });

    // 搜索框焦點事件
    this.searchInput.addEventListener('focus', () => {
      if (this.databases.length > 0) {
        this.showDropdown();
      }
    });

    // 切換下拉選單
    this.toggleButton.addEventListener('click', event => {
      event.preventDefault();
      this.toggleDropdown();
    });

    // 重新載入資料來源
    this.refreshButton.addEventListener('click', event => {
      event.preventDefault();
      this.refreshDatabases();
    });

    // 點擊外部關閉
    document.addEventListener('click', event => {
      if (!this.container.contains(event.target)) {
        this.hideDropdown();
      }
    });

    // 鍵盤導航
    this.searchInput.addEventListener('keydown', event => {
      this.handleKeyNavigation(event);
    });
  }

  populateDatabases(databases) {
    // 映射數據，添加類型和父級信息
    this.databases = databases.map(db => ({
      id: db.id,
      title: SearchableDatabaseSelector.extractDatabaseTitle(db),
      type: db.object, // 'page' 或 'data_source'
      isWorkspace: db.parent?.type === 'workspace', // 是否為工作區直屬項目
      parent: db.parent, // 保留完整父級信息
      raw: db,
      created: db.created_time,
      lastEdited: db.last_edited_time,
    }));

    window.Logger?.info?.('處理後的保存目標:', this.databases);
    window.Logger?.info?.(
      `類型分布: ${this.databases.filter(db => db.type === 'page').length} 個頁面, ${this.databases.filter(db => db.type === 'data_source').length} 個資料來源`
    );
    window.Logger?.info?.(`工作區項目: ${this.databases.filter(db => db.isWorkspace).length} 個`);

    // 不再按標題排序，保持 API 返回的智能排序
    // this.databases.sort((a, b) => a.title.localeCompare(b.title));

    this.filteredDatabases = [...this.databases];
    this.updateDatabaseCount();
    this.renderDatabaseList();

    // 顯示選擇器
    this.container.style.display = 'block';

    // 更新搜索框提示
    const pageCount = databases.filter(db => db.object === 'page').length;
    const dsCount = databases.filter(db => db.object === 'data_source').length;
    this.searchInput.placeholder = `搜索 ${databases.length} 個保存目標（${dsCount} 個資料來源 + ${pageCount} 個頁面）`;

    // 如果當前有選中的保存目標，在搜索框中顯示
    if (this.databaseIdInput.value) {
      const selectedDb = this.databases.find(db => db.id === this.databaseIdInput.value);
      if (selectedDb) {
        this.searchInput.value = selectedDb.title;
        this.selectedDatabase = selectedDb;
      }
    }
  }

  filterDatabases(query) {
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) {
      this.filteredDatabases = [...this.databases];
    } else {
      this.filteredDatabases = this.databases.filter(
        db =>
          db.title.toLowerCase().includes(lowerQuery) || db.id.toLowerCase().includes(lowerQuery)
      );
    }

    this.focusedIndex = -1;
    this.updateDatabaseCount();
    this.renderDatabaseList();
  }

  renderDatabaseList() {
    if (this.filteredDatabases.length === 0) {
      this.databaseList.innerHTML = `
                <div class="no-results">
                    <span class="icon">🔍</span>
                    <div>未找到匹配的資料來源</div>
                    <small>嘗試使用不同的關鍵字搜索</small>
                </div>
            `;
      return;
    }

    this.databaseList.innerHTML = this.filteredDatabases
      .map((db, index) => this.createDatabaseItemHTML(db, index))
      .join('');

    // 添加點擊事件
    this.databaseList.querySelectorAll('.database-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.selectDatabase(this.filteredDatabases[index]);
      });
    });
  }

  createDatabaseItemHTML(db, index) {
    const isSelected = this.selectedDatabase && this.selectedDatabase.id === db.id;
    const isFocused = index === this.focusedIndex;

    // 高亮搜索關鍵字
    const query = this.searchInput.value.toLowerCase().trim();
    let highlightedTitle = db.title;
    if (query) {
      const regex = new RegExp(`(${SearchableDatabaseSelector.escapeRegex(query)})`, 'gi');
      highlightedTitle = db.title.replace(regex, '<span class="search-highlight">$1</span>');
    }

    // 類型圖標和標籤
    const typeIcon = db.type === 'page' ? '📄' : '📊';
    const typeLabel = db.type === 'page' ? '頁面' : '資料來源';

    // 工作區標記
    const workspaceBadge = db.isWorkspace ? '<span class="workspace-badge">工作區</span>' : '';

    // 容器頁面標記（啟發式判斷：workspace 直屬頁面更可能是容器）
    const isLikelyContainer = db.type === 'page' && db.parent?.type === 'workspace';
    const containerBadge = isLikelyContainer ? '<span class="container-badge">📁 容器</span>' : '';

    // 分類頁面標記（啟發式判斷：page_id parent 的頁面可能是分類頁面）
    const isLikelyCategory = db.type === 'page' && db.parent?.type === 'page_id';
    const categoryBadge = isLikelyCategory ? '<span class="category-badge">🗂️ 分類</span>' : '';

    // Parent 路徑信息
    let parentPath = '';
    if (db.parent) {
      switch (db.parent.type) {
        case 'workspace':
          parentPath = '📁 工作區';
          break;
        case 'page_id':
          parentPath = '📄 子頁面';
          break;
        case 'data_source_id':
        case 'database_id': // 舊版 API 命名，映射到相同顯示
          parentPath = '📊 資料庫項目';
          break;
        case 'block_id':
          parentPath = '🧩 區塊項目';
          break;
        default:
          // 記錄未知類型以便調試
          parentPath = `❓ 其他 (${db.parent.type})`;
          window.Logger?.warn?.(`未知的 parent 類型: ${db.parent.type}`);
      }
    }

    return `
            <div class="database-item ${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focus' : ''}"
                 data-index="${index}"
                 data-type="${db.type}"
                 data-is-workspace="${db.isWorkspace}"
                 data-is-container="${isLikelyContainer}"
                 data-is-category="${isLikelyCategory}">
                <div class="database-title">
                    ${highlightedTitle}
                    ${workspaceBadge}
                    ${containerBadge}
                    ${categoryBadge}
                </div>
                <div class="database-parent-path">${parentPath}</div>
                <div class="database-id">${db.id}</div>
                <div class="database-meta">
                    <span class="database-icon">${typeIcon}</span>
                    <span>${typeLabel}</span>
                    ${db.created ? `<span>•</span><span>創建於 ${SearchableDatabaseSelector.formatDate(db.created)}</span>` : ''}
                </div>
            </div>
        `;
  }

  selectDatabase(database) {
    this.selectedDatabase = database;

    // 更新搜索框顯示
    this.searchInput.value = database.title;

    // 更新隱藏的資料來源 ID 輸入框
    this.databaseIdInput.value = database.id;

    // 保存類型信息到隱藏字段（用於後續保存）
    const typeInput = document.getElementById('database-type');
    if (typeInput) {
      typeInput.value = database.type;
    } else {
      // 如果不存在，創建隱藏字段
      const newTypeInput = document.createElement('input');
      newTypeInput.type = 'hidden';
      newTypeInput.id = 'database-type';
      newTypeInput.value = database.type;
      this.databaseIdInput.parentNode.appendChild(newTypeInput);
    }

    window.Logger?.info?.(
      `選擇了 ${database.type === 'page' ? '頁面' : '資料來源'}: ${database.title} (${database.id})`
    );

    // 重新渲染以顯示選中狀態
    this.renderDatabaseList();

    this.hideDropdown();

    // 顯示成功狀態
    const typeLabel = database.type === 'page' ? '頁面' : '資料來源';
    this.showStatus(`已選擇${typeLabel}: ${database.title}`, 'success');

    // 觸發選擇事件（如果需要）
    this.onDatabaseSelected?.(database);
  }

  showDropdown() {
    this.dropdown.style.display = 'block';
    this.isOpen = true;
    this.toggleButton.classList.add('open');
  }

  hideDropdown() {
    this.dropdown.style.display = 'none';
    this.isOpen = false;
    this.focusedIndex = -1;
    this.toggleButton.classList.remove('open');
    this.renderDatabaseList(); // 清除鍵盤焦點樣式
  }

  toggleDropdown() {
    if (this.isOpen) {
      this.hideDropdown();
    } else if (this.databases.length > 0) {
      this.showDropdown();
    }
  }

  handleKeyNavigation(event) {
    if (!this.isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault();
        this.showDropdown();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusedIndex = Math.min(this.focusedIndex + 1, this.filteredDatabases.length - 1);
        this.renderDatabaseList();
        this.scrollToFocused();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.focusedIndex = Math.max(this.focusedIndex - 1, -1);
        this.renderDatabaseList();
        this.scrollToFocused();
        break;

      case 'Enter':
        event.preventDefault();
        if (this.focusedIndex >= 0 && this.filteredDatabases[this.focusedIndex]) {
          this.selectDatabase(this.filteredDatabases[this.focusedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.hideDropdown();
        break;

      default:
        // 其他按鍵不處理
        break;
    }
  }

  scrollToFocused() {
    if (this.focusedIndex >= 0) {
      const focusedElement = this.databaseList.querySelector('.keyboard-focus');
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  updateDatabaseCount() {
    const total = this.databases.length;
    const filtered = this.filteredDatabases.length;

    if (filtered === total) {
      this.databaseCount.textContent = `${total} 個資料來源`;
    } else {
      this.databaseCount.textContent = `${filtered} / ${total} 個資料來源`;
    }
  }

  refreshDatabases() {
    const apiKey = document.getElementById('api-key').value;
    if (apiKey) {
      this.showLoading();
      this.loadDatabases(apiKey);
    }
  }

  showLoading() {
    this.databaseList.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <span>重新載入資料來源中...</span>
            </div>
        `;
    this.showDropdown();
  }

  /**
   * 提取數據庫或頁面的標題
   * @param {Object} db - 數據庫或頁面對象
   * @returns {string} 提取的標題
   */
  static extractDatabaseTitle(db) {
    let title = db.object === 'page' ? '未命名頁面' : '未命名資料來源';

    // 處理 page 對象（標題在 properties.title）
    if (db.object === 'page' && db.properties?.title?.title) {
      const titleContent = db.properties.title.title;
      if (titleContent.length > 0) {
        title = titleContent[0].plain_text || titleContent[0].text?.content || title;
      }
    }
    // 處理 data_source 對象（標題在 title 或 properties）
    else if (db.title && db.title.length > 0) {
      title = db.title[0].plain_text || db.title[0].text?.content || title;
    } else if (db.properties) {
      const titleProp = Object.values(db.properties).find(prop => prop.type === 'title');
      if (titleProp?.title && titleProp.title.length > 0) {
        title = titleProp.title[0].plain_text || titleProp.title[0].text?.content || title;
      }
    }

    return title;
  }

  /**
   * 格式化日期字串
   * @param {string} dateString - ISO 日期字串
   * @returns {string} 格式化後的日期，失敗時返回空字串
   */
  static formatDate(dateString) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (_e) {
      // 日期格式化失敗時返回空字符串，錯誤可以安全忽略
      return '';
    }
  }

  /**
   * 轉義正則表示式中的特殊字符
   * @param {string} string - 要轉義的字串
   * @returns {string} 轉義後的字串
   */
  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 轉義 HTML 特殊字符
   * @param {string} text - 要轉義的文本
   * @returns {string} 轉義後的 HTML
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
