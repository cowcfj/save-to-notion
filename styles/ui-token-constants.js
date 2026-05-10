/**
 * Shared UI token constants.
 * Canonical source for design tokens used across extension pages and Toolbar.
 * Extension pages consume these via shared/ui-tokens.css (CSS custom properties).
 * Toolbar consumes these directly as JS constants (Shadow DOM isolation).
 */

export const UI_TOKENS = {
  color: {
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    danger: '#ef4444',
    dangerHover: '#dc2626',
    success: '#10b981',
    warning: '#f59e0b',
    text: '#1e293b',
    textMuted: '#64748b',
    bg: '#ffffff',
    bgPage: '#f8fafc',
    bgHover: '#f1f5f9',
    border: '#e2e8f0',
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
  toolbar: {
    primary: '#2eaadc',
    primaryHover: '#2590ba',
  },
};
