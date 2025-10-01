// 無痛自動遷移 - 用戶零感知的標註升級方案
// v2.5.0 - 完全自動化，智能回退
(function() {
    'use strict';

    const { StorageUtil } = window;

    /**
     * 智能遷移狀態
     */
    const MigrationPhase = {
        NOT_STARTED: 'not_started',      // 未開始
        PHASE_1_CREATED: 'phase_1',      // 階段1：新標註已創建，舊span已隱藏
        PHASE_2_VERIFIED: 'phase_2',     // 階段2：新標註已驗證有效
        COMPLETED: 'completed',          // 完成：舊span已移除
        FAILED: 'failed'                 // 失敗：已回退
    };

    /**
     * 無痛自動遷移管理器
     */
    class SeamlessMigrationManager {
        constructor() {
            this.storageKey = 'seamless_migration_state';
            this.statistics = {
                oldHighlightsFound: 0,
                newHighlightsCreated: 0,
                verified: 0,
                removed: 0,
                failed: 0
            };
        }

        /**
         * 獲取當前頁面的遷移狀態
         */
        async getMigrationState() {
            try {
                const key = `${this.storageKey}_${window.location.href}`;
                const data = await chrome.storage.local.get(key);
                return data[key] || {
                    phase: MigrationPhase.NOT_STARTED,
                    timestamp: Date.now(),
                    attempts: 0
                };
            } catch (error) {
                console.warn('[遷移] 無法讀取狀態:', error);
                return { phase: MigrationPhase.NOT_STARTED };
            }
        }

        /**
         * 更新遷移狀態
         */
        async updateMigrationState(phase, metadata = {}) {
            try {
                const key = `${this.storageKey}_${window.location.href}`;
                const state = {
                    phase: phase,
                    timestamp: Date.now(),
                    metadata: metadata
                };
                await chrome.storage.local.set({ [key]: state });
                console.log(`[遷移] 狀態更新: ${phase}`);
            } catch (error) {
                console.error('[遷移] 無法保存狀態:', error);
            }
        }

        /**
         * 執行完整的自動遷移流程
         */
        async performSeamlessMigration(highlightManager) {
            console.log('[遷移] 開始無痛自動遷移...');

            // 檢查瀏覽器支持
            if (!this.checkBrowserSupport()) {
                console.log('[遷移] 瀏覽器不支持 CSS Highlight API，跳過遷移');
                return { skipped: true, reason: 'browser_not_supported' };
            }

            // 獲取當前狀態
            const state = await this.getMigrationState();
            console.log(`[遷移] 當前階段: ${state.phase}`);

            // 根據階段執行相應操作
            switch (state.phase) {
                case MigrationPhase.NOT_STARTED:
                    return await this.phase1_CreateNewHighlights(highlightManager);
                
                case MigrationPhase.PHASE_1_CREATED:
                    return await this.phase2_VerifyAndHide(highlightManager);
                
                case MigrationPhase.PHASE_2_VERIFIED:
                    return await this.phase3_RemoveOldSpans(highlightManager);
                
                case MigrationPhase.COMPLETED:
                    console.log('[遷移] ✅ 已完成');
                    return { completed: true };
                
                case MigrationPhase.FAILED:
                    console.log('[遷移] ⚠️ 之前失敗，嘗試重新遷移');
                    await this.updateMigrationState(MigrationPhase.NOT_STARTED);
                    return await this.performSeamlessMigration(highlightManager);
                
                default:
                    return { skipped: true };
            }
        }

        /**
         * 階段1：創建新標註，隱藏舊span
         */
        async phase1_CreateNewHighlights(highlightManager) {
            console.log('[遷移] === 階段1：創建新標註 ===');

            // 查找舊標註
            const oldSpans = document.querySelectorAll('.simple-highlight');
            if (oldSpans.length === 0) {
                console.log('[遷移] 沒有發現舊標註，無需遷移');
                await this.updateMigrationState(MigrationPhase.COMPLETED);
                return { skipped: true, reason: 'no_old_highlights' };
            }

            this.statistics.oldHighlightsFound = oldSpans.length;
            console.log(`[遷移] 發現 ${oldSpans.length} 個舊標註`);

            const newHighlights = [];

            // 為每個舊標註創建新標註
            for (const span of oldSpans) {
                try {
                    // 提取標註信息
                    const text = span.textContent;
                    const bgColor = span.style.backgroundColor;
                    const color = this.convertColorToName(bgColor);

                    // 創建Range
                    const range = document.createRange();
                    range.selectNodeContents(span);

                    // 添加新標註
                    const id = highlightManager.addHighlight(range, color);
                    
                    if (id) {
                        // 標記舊span（添加特殊屬性，但不移除）
                        span.setAttribute('data-migrated', 'true');
                        span.setAttribute('data-new-id', id);
                        
                        // 隱藏舊span（視覺上看不到，但DOM中保留）
                        span.style.opacity = '0';
                        span.style.pointerEvents = 'none';
                        
                        newHighlights.push({ 
                            oldSpan: span, 
                            newId: id, 
                            text: text.substring(0, 30) 
                        });
                        
                        this.statistics.newHighlightsCreated++;
                        console.log(`[遷移] ✓ 創建新標註: ${text.substring(0, 20)}...`);
                    }
                } catch (error) {
                    console.error('[遷移] ✗ 創建失敗:', error);
                    this.statistics.failed++;
                }
            }

            // 更新狀態到階段1
            await this.updateMigrationState(MigrationPhase.PHASE_1_CREATED, {
                newHighlights: newHighlights.map(h => ({ 
                    id: h.newId, 
                    text: h.text 
                })),
                statistics: this.statistics
            });

            console.log(`[遷移] ✅ 階段1完成: 創建了 ${this.statistics.newHighlightsCreated} 個新標註`);
            console.log('[遷移] 💡 舊標註已隱藏但保留，下次加載時驗證');

            return { 
                phase: MigrationPhase.PHASE_1_CREATED,
                statistics: this.statistics 
            };
        }

        /**
         * 階段2：驗證新標註能正常恢復
         */
        async phase2_VerifyAndHide(highlightManager) {
            console.log('[遷移] === 階段2：驗證新標註 ===');

            const oldSpans = document.querySelectorAll('.simple-highlight[data-migrated="true"]');
            console.log(`[遷移] 檢查 ${oldSpans.length} 個舊標註`);

            // 檢查新標註是否正常加載
            const newHighlightsCount = highlightManager.getCount();
            console.log(`[遷移] 新標註數量: ${newHighlightsCount}`);

            if (newHighlightsCount === 0) {
                // 新標註恢復失敗，回滾
                console.error('[遷移] ❌ 新標註未恢復，執行回滾');
                return await this.rollback('verification_failed');
            }

            // 驗證成功，更新狀態
            this.statistics.verified = oldSpans.length;
            
            await this.updateMigrationState(MigrationPhase.PHASE_2_VERIFIED, {
                verified: true,
                statistics: this.statistics
            });

            console.log('[遷移] ✅ 階段2完成: 新標註驗證成功');
            console.log('[遷移] 💡 下次加載時將完全移除舊標註');

            // 立即進入階段3
            return await this.phase3_RemoveOldSpans(highlightManager);
        }

        /**
         * 階段3：完全移除舊span
         */
        async phase3_RemoveOldSpans(highlightManager) {
            console.log('[遷移] === 階段3：移除舊標註 ===');

            const oldSpans = document.querySelectorAll('.simple-highlight[data-migrated="true"]');
            console.log(`[遷移] 準備移除 ${oldSpans.length} 個舊標註`);

            let removed = 0;
            for (const span of oldSpans) {
                try {
                    const parent = span.parentNode;
                    
                    // 將span內容移到父節點
                    while (span.firstChild) {
                        parent.insertBefore(span.firstChild, span);
                    }
                    
                    // 移除span
                    parent.removeChild(span);
                    parent.normalize();
                    
                    removed++;
                } catch (error) {
                    console.error('[遷移] 移除span失敗:', error);
                }
            }

            this.statistics.removed = removed;

            // 標記完成
            await this.updateMigrationState(MigrationPhase.COMPLETED, {
                statistics: this.statistics,
                completedAt: new Date().toISOString()
            });

            console.log(`[遷移] 🎉 完全完成！移除了 ${removed} 個舊標註`);
            console.log('[遷移] DOM結構已完全恢復乾淨');

            return { 
                completed: true, 
                statistics: this.statistics 
            };
        }

        /**
         * 回滾：恢復舊標註顯示
         */
        async rollback(reason) {
            console.warn(`[遷移] ⚠️ 執行回滾，原因: ${reason}`);

            // 恢復舊span的顯示
            const oldSpans = document.querySelectorAll('.simple-highlight[data-migrated="true"]');
            oldSpans.forEach(span => {
                span.style.opacity = '1';
                span.style.pointerEvents = 'auto';
                span.removeAttribute('data-migrated');
                span.removeAttribute('data-new-id');
            });

            await this.updateMigrationState(MigrationPhase.FAILED, {
                reason: reason,
                failedAt: new Date().toISOString()
            });

            console.log('[遷移] ✓ 回滾完成，舊標註已恢復');

            return { 
                rolledBack: true, 
                reason: reason 
            };
        }

        /**
         * 檢查瀏覽器支持
         */
        checkBrowserSupport() {
            return 'highlights' in CSS && CSS.highlights !== undefined;
        }

        /**
         * 轉換顏色值
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
         * 手動觸發遷移重試（開發者工具）
         */
        async retryMigration(highlightManager) {
            console.log('[遷移] 手動觸發重試...');
            await this.updateMigrationState(MigrationPhase.NOT_STARTED);
            return await this.performSeamlessMigration(highlightManager);
        }

        /**
         * 獲取遷移統計信息（用於調試）
         */
        getStatistics() {
            return {
                ...this.statistics,
                supportsCSSHighlight: this.checkBrowserSupport()
            };
        }
    }

    // 導出到全局
    window.SeamlessMigrationManager = SeamlessMigrationManager;

    console.log('✅ 無痛自動遷移工具已加載');

})();
