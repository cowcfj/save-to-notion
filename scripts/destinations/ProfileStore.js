/**
 * Destination profile storage and shared domain helpers.
 */

/* global chrome */

import { getAccountSession, isAccountSessionExpired } from '../auth/accountSession.js';
import Logger from '../utils/Logger.js';

export const DESTINATION_PROFILE_STORAGE_KEYS = {
  PROFILES: 'destinationProfiles',
  LAST_USED_PROFILE_ID: 'destinationLastUsedProfileId',
  VERSION: 'destinationProfilesVersion',
};

export const LEGACY_DATA_SOURCE_KEYS = [
  'notionDataSourceId',
  'notionDatabaseId',
  'notionDataSourceType',
];

export const CURRENT_DESTINATION_PROFILE_VERSION = 1;
export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PROFILE_NAME = '預設';
export const DEFAULT_PROFILE_ICON = 'bookmark';
export const DEFAULT_PROFILE_COLOR = '#2563eb';
export const CREATE_PROFILE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed'];
export const ACCOUNT_GATED_FOUNDATION_ENTITLEMENT_SOURCE = 'account_gated_foundation';

export const DESTINATION_PROFILE_ERRORS = {
  NOT_FOUND: '找不到目的地設定檔',
  LIMIT_REACHED: '已達目的地數量上限',
  TARGET_REQUIRED: '保存目標需要有效的 Notion 目標',
  LAST_DELETE: '無法刪除最後一個保存目標',
  NOT_CONFIGURED: '尚未設定保存目標',
  NOT_ALLOWED: '此保存目標目前不可使用',
  DUPLICATE_ID: '保存目標 ID 已存在',
};

export function normalizeDataSourceType(type) {
  return type === 'page' ? 'page' : 'database';
}

export function pickNonEmptyString(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return '';
}

export function nowTimestamp() {
  return Date.now();
}

export function createProfileId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `destination_${globalThis.crypto.randomUUID()}`;
  }
  throw new Error('crypto.randomUUID is required to create destination profile ids');
}

export function normalizeProfile(profile, index = 0) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  const notionDataSourceId = pickNonEmptyString(
    profile.notionDataSourceId,
    profile.notionDatabaseId
  );
  if (!notionDataSourceId) {
    return null;
  }

  const timestamp = Number.isFinite(profile.createdAt) ? profile.createdAt : nowTimestamp();
  return {
    id: pickNonEmptyString(profile.id) || (index === 0 ? DEFAULT_PROFILE_ID : createProfileId()),
    name: pickNonEmptyString(profile.name) || (index === 0 ? DEFAULT_PROFILE_NAME : '保存目標'),
    icon: pickNonEmptyString(profile.icon) || DEFAULT_PROFILE_ICON,
    color:
      pickNonEmptyString(profile.color) ||
      CREATE_PROFILE_COLORS[index % CREATE_PROFILE_COLORS.length],
    notionDataSourceId,
    notionDataSourceType: normalizeDataSourceType(profile.notionDataSourceType),
    createdAt: timestamp,
    updatedAt: Number.isFinite(profile.updatedAt) ? profile.updatedAt : timestamp,
  };
}

export function normalizeProfiles(profiles) {
  return Array.isArray(profiles)
    ? profiles.map((profile, index) => normalizeProfile(profile, index)).filter(Boolean)
    : [];
}

export function buildDefaultProfileFromLegacy(data) {
  const notionDataSourceId = pickNonEmptyString(data.notionDataSourceId, data.notionDatabaseId);
  if (!notionDataSourceId) {
    return null;
  }

  const timestamp = nowTimestamp();
  return {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    icon: DEFAULT_PROFILE_ICON,
    color: DEFAULT_PROFILE_COLOR,
    notionDataSourceId,
    notionDataSourceType: normalizeDataSourceType(data.notionDataSourceType),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildLegacyTargetWrite(profile) {
  return {
    notionDataSourceId: profile.notionDataSourceId,
    notionDatabaseId: profile.notionDataSourceId,
    notionDataSourceType: profile.notionDataSourceType,
  };
}

export class LocalDestinationProfileRepository {
  constructor(options = {}) {
    this.storage = options.chromeStorage || (typeof chrome === 'undefined' ? null : chrome.storage);
  }

  _requireStorage() {
    if (!this.storage?.local) {
      throw new Error('Chrome local storage is unavailable');
    }
    return this.storage.local;
  }

  async getRawState() {
    const storageLocal = this._requireStorage();
    return await storageLocal.get([
      DESTINATION_PROFILE_STORAGE_KEYS.PROFILES,
      DESTINATION_PROFILE_STORAGE_KEYS.LAST_USED_PROFILE_ID,
      DESTINATION_PROFILE_STORAGE_KEYS.VERSION,
      ...LEGACY_DATA_SOURCE_KEYS,
    ]);
  }

  async getLastUsedProfileId() {
    const state = await this.getRawState();
    const id = state[DESTINATION_PROFILE_STORAGE_KEYS.LAST_USED_PROFILE_ID];
    return typeof id === 'string' && id.trim() ? id : null;
  }

  async writeProfiles(profiles, options = {}) {
    const storageLocal = this._requireStorage();
    const values = {
      [DESTINATION_PROFILE_STORAGE_KEYS.PROFILES]: profiles,
      [DESTINATION_PROFILE_STORAGE_KEYS.VERSION]: CURRENT_DESTINATION_PROFILE_VERSION,
    };

    if (options.lastUsedProfileId !== undefined) {
      values[DESTINATION_PROFILE_STORAGE_KEYS.LAST_USED_PROFILE_ID] =
        options.lastUsedProfileId ?? null;
    }

    await storageLocal.set(values);
  }

  async setLastUsedProfileId(profileId) {
    const storageLocal = this._requireStorage();
    await storageLocal.set({
      [DESTINATION_PROFILE_STORAGE_KEYS.LAST_USED_PROFILE_ID]: profileId,
    });
  }

  async writeLegacyTarget(profile) {
    const storageLocal = this._requireStorage();
    await storageLocal.set(buildLegacyTargetWrite(profile));
  }
}

export async function ensureMigratedDefaultProfile(repository) {
  const state = await repository.getRawState();
  const existingProfiles = normalizeProfiles(state[DESTINATION_PROFILE_STORAGE_KEYS.PROFILES]);

  if (existingProfiles.length > 0) {
    return existingProfiles;
  }

  const defaultProfile = buildDefaultProfileFromLegacy(state);
  if (!defaultProfile) {
    return [];
  }

  await repository.writeProfiles([defaultProfile], {
    lastUsedProfileId: defaultProfile.id,
  });
  await repository.writeLegacyTarget(defaultProfile);
  return [defaultProfile];
}

export class AccountGatedDestinationEntitlementProvider {
  async getDestinationEntitlement() {
    try {
      const session = await getAccountSession();
      if (!session || isAccountSessionExpired(session)) {
        return {
          maxProfiles: 1,
          source: ACCOUNT_GATED_FOUNDATION_ENTITLEMENT_SOURCE,
          accountSignedIn: false,
        };
      }
      return {
        maxProfiles: 2,
        source: ACCOUNT_GATED_FOUNDATION_ENTITLEMENT_SOURCE,
        accountSignedIn: true,
      };
    } catch (error) {
      Logger.warn('[DestinationProfileService] Failed to get account session for entitlement', {
        action: 'getAccountSession',
        operation: 'entitlementCheck',
        phase: 'fetch',
        result: 'failure',
        reason: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : typeof error,
        error,
      });
      return {
        maxProfiles: 1,
        source: ACCOUNT_GATED_FOUNDATION_ENTITLEMENT_SOURCE,
        accountSignedIn: false,
      };
    }
  }
}
