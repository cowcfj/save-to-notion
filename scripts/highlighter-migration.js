// 標註數據遷移工具
// v2.5.0 - 從舊版DOM標註遷移到新版CSS Highlight API
'use strict';

(function() {

    const { Logger } = window;

    /**
     * 標註遷移管理器
     */
    class HighlightMigrationManager {
        constructor() {
            this.migrationKey = 'highlight_migration_status';
            this.oldHighlightsFound = 0;
            this.migratedCount = 0;
            this.failedCount = 0;
        }

        /**
         * 檢查是否需要遷移
         */
        async needsMigration() {
            // 檢查遷移狀態
            const status = await this.getMigrationStatus();

            if (status === 'completed') {
                Logger.info('✅ 此頁面已完成標註遷移');
                return false;
            }

            // 檢查頁面中是否有舊版標註
            const oldHighlights = document.querySelectorAll('.simple-highlight');
            this.oldHighlightsFound = oldHighlights.length;

            if (oldHighlights.length > 0) {
                Logger.info(`🔍 檢測到 ${oldHighlights.length} 個舊版標註`);
                return true;
            }

            return false;
        }

        /**
         * 獲取遷移狀態
         */
        async getMigrationStatus() {
            try {
                const key = `${this.migrationKey}_${window.location.href}`;
                const data = await chrome.storage.local.get(key);
                return data[key] || 'pending';
            } catch (error) {
                console.warn('無法讀取遷移狀態:', error);
                return 'pending';
            }
        }

        /**
         * 設置遷移狀態
         */
        async setMigrationStatus(status) {
            try {
                const key = `${this.migrationKey}_${window.location.href}`;
                await chrome.storage.local.set({ [key]: status });
                Logger.log(`📝 遷移狀態已更新: ${status}`);
            } catch (error) {
                console.error('無法保存遷移狀態:', error);
            }
        }

        /**
         * 執行自動遷移
         */
        async autoMigrate(highlightManager) {
            Logger.log('🔄 開始自動遷移舊版標註...');

            const oldHighlights = document.querySelectorAll('.simple-highlight');
            const migratedData = [];

            for (const span of oldHighlights) {
                try {
                    const result = this.migrateSpanToRange(span, highlightManager);
                    if (result) {
                        migratedData.push(result);
                        this.migratedCount++;
                    } else {
                        this.failedCount++;
                    }
                } catch (error) {
                    console.error('遷移失敗:', error);
                    this.failedCount++;
                }
            }

            // 保存遷移結果
            await this.setMigrationStatus('completed');

            // 返回統計信息
            return {
                total: this.oldHighlightsFound,
                migrated: this.migratedCount,
                failed: this.failedCount,
                data: migratedData
            };
        }

        /**
         * 將舊的span元素轉換為Range對象
         */
        migrateSpanToRange(span, highlightManager) {
            Logger.info('🔄 遷移標註:', span.textContent.substring(0, 30) + '...');

            try {
                // 提取標註信息
                const text = span.textContent;
                const bgColor = span.style.backgroundColor;
                const color = this.convertColorToName(bgColor);

                // 創建範圍包含整個span
                const range = document.createRange();
                range.selectNodeContents(span);

                // 使用新版標註管理器添加標註
                const id = highlightManager.addHighlight(range, color);

                if (id) {
                    Logger.info(`✅ 成功遷移: ${text.substring(0, 20)}... (${color})`);

                    // 移除舊的span元素（可選）
                    // 如果要保持舊標註，註釋掉下面這段
                    this.removeOldSpan(span);

                    return { id, text, color };
                } else {
                    Logger.warn('❌ 新版標註添加失敗');
                    return null;
                }
            } catch (error) {
                if (typeof ErrorHandler !== 'undefined') {
                    ErrorHandler.logError({
                        type: 'migration_error',
                        context: '標註遷移過程',
                        originalError: error,
                        timestamp: Date.now()
                    });
                } else {
                    console.error('遷移過程出錯:', error);
                }
                return null;
            }
        }

        /**
         * 移除舊的span元素
         */
        removeOldSpan(span) {
            try {
                const parent = span.parentNode;

                // 將span的內容移到父節點
                while (span.firstChild) {
                    parent.insertBefore(span.firstChild, span);
                }

                // 移除span
                parent.removeChild(span);

                // 合併文本節點
                parent.normalize();

                Logger.info('🗑️ 已移除舊標註元素');
            } catch (error) {
                console.error('移除舊標註失敗:', error);
            }
        }

        /**
         * 轉換顏色值到顏色名稱
         */
        convertColorToName(bgColor) {
            const colorMap = {
                'rgb(255, 243, 205)': 'yellow',
                '#fff3cd': 'yellow',
                'rgb(212, 237, 218)': 'green',
                '#d4edda': 'green',
                'rgb(204, 231, 255)': 'blue',
                '#cce7ff': 'blue',
                'rgb(248, 215, 218)': 'red',
                '#f8d7da': 'red'
            };

            return colorMap[bgColor] || 'yellow';
        }

        /**
         * 顯示遷移提示UI
         */
        showMigrationPrompt() {
            return new Promise((resolve) => {
                // 創建遷移提示對話框
                const dialog = document.createElement('div');
                dialog.id = 'highlight-migration-dialog';
                dialog.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    z-index: 999999;
                    max-width: 500px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                `;

                dialog.innerHTML = `
                    <h2 style="margin: 0 0 15px 0; color: #333; font-size: 20px;">
                        🔄 標註功能升級
                    </h2>
                    <p style="margin: 0 0 15px 0; color: #666; line-height: 1.6;">
                        檢測到此頁面有 <strong>${this.oldHighlightsFound}</strong> 個舊版標註。
                    </p>
                    <p style="margin: 0 0 20px 0; color: #666; line-height: 1.6;">
                        新版標註功能：<br>
                        ✨ 不修改網頁結構<br>
                        🎯 完美支持跨元素標註<br>
                        ⚡ 性能更好，更穩定
                    </p>
                    <p style="margin: 0 0 20px 0; color: #666; line-height: 1.6;">
                        是否要將舊標註遷移到新格式？
                    </p>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="migration-keep-old" style="
                            padding: 10px 20px;
                            border: 1px solid #ddd;
                            background: white;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                        ">保持舊版</button>
                        <button id="migration-migrate" style="
                            padding: 10px 20px;
                            border: none;
                            background: #007bff;
                            color: white;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                        ">遷移到新版</button>
                    </div>
                `;

                // 創建遮罩層
                const overlay = document.createElement('div');
                overlay.id = 'highlight-migration-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 999998;
                `;

                document.body.appendChild(overlay);
                document.body.appendChild(dialog);

                // 按鈕事件
                document.getElementById('migration-migrate').onclick = () => {
                    this.removeMigrationUI();
                    resolve('migrate');
                };

                document.getElementById('migration-keep-old').onclick = () => {
                    this.removeMigrationUI();
                    resolve('keep');
                };
            });
        }

        /**
         * 移除遷移UI
         */
        removeMigrationUI() {
            const dialog = document.getElementById('highlight-migration-dialog');
            const overlay = document.getElementById('highlight-migration-overlay');
            if (dialog) dialog.remove();
            if (overlay) overlay.remove();
        }

        /**
         * 顯示遷移結果
         */
        showMigrationResult(result) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 999999;
                max-width: 300px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            const successRate = Math.round((result.migrated / result.total) * 100);
            const icon = successRate === 100 ? '✅' : successRate > 50 ? '⚠️' : '❌';

            notification.innerHTML = `
                <h3 style="margin: 0 0 10px 0; font-size: 16px;">
                    ${icon} 遷移完成
                </h3>
                <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;">
                    成功: ${result.migrated} / ${result.total}
                </p>
                ${result.failed > 0 ? `
                    <p style="margin: 0; color: #dc3545; font-size: 14px;">
                        失敗: ${result.failed}
                    </p>
                ` : ''}
            `;

            document.body.appendChild(notification);

            // 3秒後自動消失
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }

        /**
         * 執行完整的遷移流程
         */
        async performMigration(highlightManager) {
            Logger.info('🚀 開始標註遷移流程...');

            // 1. 檢查是否需要遷移
            const needsMigration = await this.needsMigration();

            if (!needsMigration) {
                Logger.info('✅ 無需遷移');
                return { skipped: true };
            }

            // 2. 詢問用戶
            const userChoice = await this.showMigrationPrompt();

            if (userChoice === 'keep') {
                Logger.info('👤 用戶選擇保持舊版');
                await this.setMigrationStatus('skipped');
                return { skipped: true, reason: 'user_declined' };
            }

            // 3. 執行遷移
            const result = await this.autoMigrate(highlightManager);

            // 4. 顯示結果
            this.showMigrationResult(result);

            Logger.info('✅ 遷移流程完成:', result);
            return result;
        }
    }

    // 導出到全局
    window.HighlightMigrationManager = HighlightMigrationManager;

    Logger.info('✅ 標註遷移工具已加載');

})();
