import { resolveAccountDisplayProfile } from '../../../scripts/utils/accountDisplayUtils.js';

describe('accountDisplayUtils', () => {
  describe('resolveAccountDisplayProfile', () => {
    it('應優先使用 trim 後的 displayName 作為顯示標籤與頭像回退字元', () => {
      const result = resolveAccountDisplayProfile({
        displayName: '  Test User  ',
        email: 'user@example.com',
      });

      expect(result).toEqual({
        normalizedDisplayName: 'Test User',
        email: 'user@example.com',
        displayLabel: 'Test User',
        avatarFallbackInitial: 'T',
      });
    });

    it('displayName 缺失或空白時應回退到 email', () => {
      expect(
        resolveAccountDisplayProfile({
          displayName: '   ',
          email: 'user@example.com',
        })
      ).toMatchObject({
        normalizedDisplayName: '',
        email: 'user@example.com',
        displayLabel: 'user@example.com',
        avatarFallbackInitial: 'U',
      });

      expect(
        resolveAccountDisplayProfile({
          displayName: null,
          email: 'fallback@example.com',
        })
      ).toMatchObject({
        normalizedDisplayName: '',
        email: 'fallback@example.com',
        displayLabel: 'fallback@example.com',
        avatarFallbackInitial: 'F',
      });
    });

    it('displayName 與 email 都缺失時應提供安全的預設頭像回退字元', () => {
      expect(
        resolveAccountDisplayProfile({
          displayName: '   ',
          email: '',
        })
      ).toMatchObject({
        normalizedDisplayName: '',
        email: '',
        displayLabel: '',
        avatarFallbackInitial: '?',
      });

      expect(resolveAccountDisplayProfile(null)).toMatchObject({
        normalizedDisplayName: '',
        email: '',
        displayLabel: '',
        avatarFallbackInitial: '?',
      });
    });
  });
});
