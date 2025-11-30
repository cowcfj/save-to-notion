/**
 * 工具欄樣式定義
 * 集中管理所有 UI 樣式配置
 */

/**
 * 獲取工具欄基礎樣式
 * @returns {Object} 工具欄樣式對象
 */
export function getToolbarStyles() {
    return {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '2147483647', // 最高層級
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        minWidth: '200px',
        maxWidth: '280px'
    };
}

/**
 * 獲取按鈕樣式類別
 * @returns {Object} 包含不同類型按鈕樣式的對象
 */
export function getButtonStyles() {
    return {
        primary: {
            flex: '1',
            padding: '8px 12px',
            border: '1px solid #48bb78',
            borderRadius: '4px',
            background: 'white',
            color: '#48bb78',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
        },
        icon: {
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            background: 'white',
            color: '#666',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease'
        },
        action: {
            flex: '1',
            padding: '8px 10px',
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            background: 'white',
            color: '#333',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
        },
        mini: {
            padding: '4px 8px',
            border: '1px solid #e5e7eb',
            borderRadius: '3px',
            background: 'white',
            color: '#333',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
        }
    };
}

/**
 * 獲取最小化圖標樣式
 * @returns {Object} 最小化圖標樣式對象
 */
export function getMiniIconStyles() {
    return {
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '40px',
        height: '40px',
        background: 'white',
        border: '2px solid #ddd',
        borderRadius: '50%',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: '2147483647',
        cursor: 'pointer',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        transition: 'all 0.2s ease'
    };
}
