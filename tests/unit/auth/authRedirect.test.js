import { buildCanonicalAuthUrl } from '../../../scripts/auth/authRedirect.js';

describe('authRedirect', () => {
  test('preserves account ticket query when redirecting root auth shim to canonical auth page', () => {
    const result = buildCanonicalAuthUrl({
      href: 'chrome-extension://ext_id_123/auth.html?account_ticket=ticket_123',
      search: '?account_ticket=ticket_123',
      hash: '',
    });

    expect(result).toBe(
      'chrome-extension://ext_id_123/pages/auth/auth.html?account_ticket=ticket_123'
    );
  });

  test('preserves hash when present', () => {
    const result = buildCanonicalAuthUrl({
      href: 'chrome-extension://ext_id_123/auth.html?account_ticket=ticket_123#done',
      search: '?account_ticket=ticket_123',
      hash: '#done',
    });

    expect(result).toBe(
      'chrome-extension://ext_id_123/pages/auth/auth.html?account_ticket=ticket_123#done'
    );
  });

  test('returns empty URL when location href is unavailable', () => {
    expect(buildCanonicalAuthUrl(null)).toBe('');
    expect(buildCanonicalAuthUrl({ search: '?account_ticket=ticket_123', hash: '' })).toBe('');
  });
});
