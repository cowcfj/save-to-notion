// 測試 Open in Notion 按鈕功能的腳本
// 在瀏覽器控制台中運行此腳本來測試功能

console.log('🧪 開始測試 Open in Notion 按鈕功能...');

// 測試函數：檢查工具欄是否存在
function testToolbarExists() {
  const toolbar = document.getElementById('notion-highlighter-v2');
  if (toolbar) {
    console.log('✅ 標註工具欄已找到');
    return toolbar;
  }
  console.log('❌ 標註工具欄未找到');
  return null;
}

// 測試函數：檢查 Open in Notion 按鈕
function testOpenNotionButtons(toolbar) {
  if (!toolbar) {
    return;
  }

  const mainOpenBtn = toolbar.querySelector('#open-notion-v2');
  const listOpenBtn = toolbar.querySelector('#list-open-notion-v2');

  console.log('🔍 檢查主要的 Open in Notion 按鈕:');
  if (mainOpenBtn) {
    console.log('✅ 主要按鈕已找到');
    console.log('   - 顯示狀態:', mainOpenBtn.style.display);
    console.log('   - 按鈕文字:', mainOpenBtn.textContent);
  } else {
    console.log('❌ 主要按鈕未找到');
  }

  console.log('🔍 檢查標註列表中的 Open in Notion 按鈕:');
  if (listOpenBtn) {
    console.log('✅ 列表按鈕已找到');
    console.log('   - 顯示狀態:', listOpenBtn.style.display);
    console.log('   - 按鈕文字:', listOpenBtn.textContent);
  } else {
    console.log('❌ 列表按鈕未找到');
  }
}

// 測試函數：模擬頁面狀態檢查
function testPageStatusCheck() {
  console.log('🔍 測試頁面狀態檢查...');

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ action: 'checkPageStatus' }, response => {
      console.log('📡 頁面狀態響應:', response);
      if (response?.success && response.isSaved && response.notionUrl) {
        console.log('✅ 頁面已保存到 Notion，URL:', response.notionUrl);
      } else {
        console.log('ℹ️ 頁面未保存到 Notion 或無法獲取狀態');
      }
    });
  } else {
    console.log('⚠️ Chrome 擴展 API 不可用');
  }
}

// 測試函數：檢查標註管理器
function testHighlightManager() {
  console.log('🔍 檢查標註管理器...');

  if (window.notionHighlighter) {
    console.log('✅ notionHighlighter 對象已找到');
    console.log('   - 管理器:', window.notionHighlighter.manager ? '✅' : '❌');
    console.log('   - 工具欄:', window.notionHighlighter.toolbar ? '✅' : '❌');
    console.log('   - 是否激活:', window.notionHighlighter.isActive());

    if (window.notionHighlighter.manager) {
      const count = window.notionHighlighter.manager.getCount();
      console.log('   - 標註數量:', count);
    }
  } else {
    console.log('❌ notionHighlighter 對象未找到');
  }
}

// 測試函數：模擬同步操作
function testSyncOperation() {
  console.log('🔍 測試同步操作...');

  const toolbar = document.getElementById('notion-highlighter-v2');
  if (!toolbar) {
    console.log('❌ 無法測試同步操作：工具欄未找到');
    return;
  }

  const syncBtn = toolbar.querySelector('#sync-to-notion-v2');
  if (syncBtn) {
    console.log('✅ 同步按鈕已找到');
    console.log('   - 按鈕文字:', syncBtn.textContent);
    console.log('   - 是否禁用:', syncBtn.disabled);

    // 不實際點擊，只是檢查按鈕是否可點擊
    console.log('ℹ️ 同步按鈕可用，但不執行實際同步操作');
  } else {
    console.log('❌ 同步按鈕未找到');
  }
}

// 主測試函數
function runAllTests() {
  console.log('🚀 開始完整測試...');
  console.log('=====================================');

  const toolbar = testToolbarExists();
  testOpenNotionButtons(toolbar);
  testPageStatusCheck();
  testHighlightManager();
  testSyncOperation();

  console.log('=====================================');
  console.log('🏁 測試完成');

  // 提供手動測試建議
  console.log('\n📋 手動測試建議:');
  console.log('1. 點擊「開始標註」按鈕');
  console.log('2. 選擇一些文字進行標註');
  console.log('3. 檢查 Open in Notion 按鈕是否顯示');
  console.log('4. 點擊「同步」按鈕');
  console.log('5. 檢查同步後按鈕是否仍然顯示');
  console.log('6. 點擊「管理」按鈕查看標註列表');
  console.log('7. 檢查列表中的 Open in Notion 按鈕');
}

// 延遲執行測試，確保頁面完全加載
setTimeout(runAllTests, 1000);

// 導出測試函數供手動調用
window.testOpenNotionButton = {
  runAllTests,
  testToolbarExists,
  testOpenNotionButtons,
  testPageStatusCheck,
  testHighlightManager,
  testSyncOperation,
};

console.log('💡 測試腳本已加載。可以調用 window.testOpenNotionButton.runAllTests() 重新運行測試');
