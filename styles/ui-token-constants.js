/**
 * Shared UI token constants.
 * Canonical source for design tokens used across extension pages and Toolbar.
 * Extension pages consume these via shared/ui-tokens.css (CSS custom properties).
 * Toolbar consumes these directly as JS constants (Shadow DOM isolation).
 */

/**
 * 將 hex 色碼轉為 rgba 字串。用於從 token 動態產生帶透明度的色彩值。
 *
 * @param {string} hex - 6 碼 hex 色碼（含 # 前綴）
 * @param {number} alpha - 透明度 0~1
 * @returns {string} rgba(...) 字串
 */
export function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return 'rgba(0, 0, 0, 0)';
  }
  const clampedAlpha = typeof alpha === 'number' ? Math.max(0, Math.min(1, alpha)) : 1;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}

export const UI_TOKENS = {
  color: {
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    danger: '#ef4444',
    dangerHover: '#dc2626',
    success: '#10b981',
    warning: '#f59e0b',
    white: '#ffffff',
    black: '#000000',
    text: '#1e293b',
    textMuted: '#64748b',
    bg: '#ffffff',
    bgPage: '#f8fafc',
    bgHover: '#f1f5f9',
    border: '#e2e8f0',
    brand: '#F47565',
    brandHover: '#E66651',
    actionSave: '#0A84FF',
    actionSaveHover: '#0070E5',
    actionManage: '#8B5CF6',
    actionManageHover: '#7C3AED',
    iconOnAccent: '#FFFFFF',
  },
  theme: {
    light: {
      surface: 'rgba(244, 244, 247, 0.82)',
      border: 'rgba(0, 0, 0, 0.06)',
      iconMuted: 'rgba(31, 33, 38, 0.78)',
    },
    dark: {
      surface: 'rgba(22, 24, 30, 0.78)',
      border: 'rgba(255, 255, 255, 0.10)',
      iconMuted: 'rgba(240, 243, 247, 0.88)',
    },
  },
  status: {
    successBg: '#dcfce7',
    successText: '#166534',
    successBorder: '#bbf7d0',
    errorBg: '#fee2e2',
    errorText: '#991b1b',
    errorBorder: '#fecaca',
    warningBg: '#fef3c7',
    warningText: '#92400e',
    warningBorder: '#fcd34d',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
  shadow: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.1)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.1)',
    md: '0 4px 16px rgba(0, 0, 0, 0.15)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.12)',
    xl: '0 8px 24px rgba(0, 0, 0, 0.2)',
  },
  toolbar: {
    primary: '#2eaadc',
    primaryHover: '#2590ba',
  },
};
