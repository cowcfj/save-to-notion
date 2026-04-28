/**
 * Destination profile service.
 *
 * Centralizes local destination profile storage, migration from legacy single
 * Notion target settings, and account-gated profile entitlement checks.
 */

/* global chrome */

import { getAccountSession, isAccountSessionExpired } from '../../auth/accountSession.js';

export const DESTINATION_PROFILE_STORAGE_KEYS = {
  PROFILES: 'destinationProfiles',
  LAST_USED_PROFILE_ID: 'destinationLastUsedProfileId',
  VERSION: 'destinationProfilesVersion',
};

const LEGACY_DATA_SOURCE_KEYS = ['notionDataSourceId', 'notionDatabaseId', 'notionDataSourceType'];

const CURRENT_DESTINATION_PROFILE_VERSION = 1;
const DEFAULT_PROFILE_ID = 'default';
const DEFAULT_PROFILE_NAME = 'Default';
const DEFAULT_PROFILE_ICON = 'bookmark';
const DEFAULT_PROFILE_COLOR = '#2563eb';

const CREATE_PROFILE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed'];

function normalizeDataSourceType(type) {
  return type === 'page' ? 'page' : 'database';
}

function pickNonEmptyString(...candidates) {
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

function nowTimestamp() {
  return Date.now();
}

function createProfileId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `destination_${globalThis.crypto.randomUUID()}`;
  }
  throw new Error('crypto.randomUUID is required to create destination profile ids');
}

function normalizeProfileAtIndex(profile, index) {
  return normalizeProfile(profile, index);
}

function normalizeProfile(profile, index = 0) {
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
    name: pickNonEmptyString(profile.name) || (index === 0 ? DEFAULT_PROFILE_NAME : 'Destination'),
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

function buildDefaultProfileFromLegacy(data) {
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

function buildLegacyTargetWrite(profile) {
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

  async listProfiles() {
    const state = await this.getRawState();
    return Array.isArray(state[DESTINATION_PROFILE_STORAGE_KEYS.PROFILES])
      ? state[DESTINATION_PROFILE_STORAGE_KEYS.PROFILES]
      : [];
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

export class AccountGatedDestinationEntitlementProvider {
  async getDestinationEntitlement() {
    try {
      const session = await getAccountSession();
      if (!session || isAccountSessionExpired(session)) {
        return { maxProfiles: 1, source: 'account_gated_foundation', accountSignedIn: false };
      }
      return { maxProfiles: 2, source: 'account_gated_foundation', accountSignedIn: true };
    } catch {
      return { maxProfiles: 1, source: 'account_gated_foundation', accountSignedIn: false };
    }
  }
}

export class DestinationProfileService {
  constructor(options = {}) {
    this.repository =
      options.repository ||
      new LocalDestinationProfileRepository({ chromeStorage: options.chromeStorage });
    this.entitlementProvider =
      options.entitlementProvider || new AccountGatedDestinationEntitlementProvider();
  }

  async ensureMigratedDefaultProfile() {
    const state = await this.repository.getRawState();
    const existingProfiles = Array.isArray(state[DESTINATION_PROFILE_STORAGE_KEYS.PROFILES])
      ? state[DESTINATION_PROFILE_STORAGE_KEYS.PROFILES]
          .map((profile, index) => normalizeProfileAtIndex(profile, index))
          .filter(Boolean)
      : [];

    if (existingProfiles.length > 0) {
      return existingProfiles;
    }

    const defaultProfile = buildDefaultProfileFromLegacy(state);
    if (!defaultProfile) {
      return [];
    }

    await this.repository.writeProfiles([defaultProfile], {
      lastUsedProfileId: defaultProfile.id,
    });
    await this.repository.writeLegacyTarget(defaultProfile);
    return [defaultProfile];
  }

  async listProfiles() {
    const profiles = await this.ensureMigratedDefaultProfile();
    return profiles
      .map((profile, index) => normalizeProfileAtIndex(profile, index))
      .filter(Boolean);
  }

  async getDestinationEntitlement() {
    return await this.entitlementProvider.getDestinationEntitlement();
  }

  async getLastUsedProfile() {
    const profiles = await this.listProfiles();
    if (profiles.length === 0) {
      return null;
    }

    const lastUsedProfileId = await this.repository.getLastUsedProfileId();
    return profiles.find(profile => profile.id === lastUsedProfileId) || profiles[0];
  }

  async setLastUsedProfile(profileId) {
    const profile = await this.getProfile(profileId);
    await this.repository.setLastUsedProfileId(profile.id);
    return profile;
  }

  async getProfile(profileId) {
    const profiles = await this.listProfiles();
    const profile = profiles.find(item => item.id === profileId);
    if (!profile) {
      throw new Error('Destination profile not found');
    }
    return profile;
  }

  async createProfile(input) {
    const profiles = await this.listProfiles();
    const entitlement = await this.getDestinationEntitlement();
    if (profiles.length >= entitlement.maxProfiles) {
      throw new Error('Destination profile limit reached');
    }

    const timestamp = nowTimestamp();
    const profile = normalizeProfile(
      {
        id: input?.id || createProfileId(),
        name: input?.name,
        icon: input?.icon || DEFAULT_PROFILE_ICON,
        color:
          input?.color || CREATE_PROFILE_COLORS[profiles.length % CREATE_PROFILE_COLORS.length],
        notionDataSourceId: input?.notionDataSourceId,
        notionDataSourceType: input?.notionDataSourceType,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      profiles.length
    );

    if (!profile) {
      throw new Error('Destination profile target is required');
    }

    const nextProfiles = [...profiles, profile];
    await this.repository.writeProfiles(nextProfiles);
    return profile;
  }

  async updateProfile(profileId, updates) {
    const profiles = await this.listProfiles();
    const profileIndex = profiles.findIndex(profile => profile.id === profileId);
    if (profileIndex === -1) {
      throw new Error('Destination profile not found');
    }

    const updatedProfile = normalizeProfile(
      {
        ...profiles[profileIndex],
        ...updates,
        updatedAt: nowTimestamp(),
      },
      profileIndex
    );

    if (!updatedProfile) {
      throw new Error('Destination profile target is required');
    }

    const nextProfiles = [...profiles];
    nextProfiles[profileIndex] = updatedProfile;
    await this.repository.writeProfiles(nextProfiles);

    if (updatedProfile.id === DEFAULT_PROFILE_ID) {
      await this.repository.writeLegacyTarget(updatedProfile);
    }

    return updatedProfile;
  }

  async deleteProfile(profileId) {
    const profiles = await this.listProfiles();
    if (profiles.length <= 1) {
      throw new Error('Cannot delete the last destination profile');
    }

    const nextProfiles = profiles.filter(profile => profile.id !== profileId);
    if (nextProfiles.length === profiles.length) {
      throw new Error('Destination profile not found');
    }

    const lastUsedProfileId = await this.repository.getLastUsedProfileId();
    const nextLastUsedProfileId =
      lastUsedProfileId === profileId ? nextProfiles[0].id : lastUsedProfileId;
    await this.repository.writeProfiles(nextProfiles, {
      lastUsedProfileId: nextLastUsedProfileId,
    });
    return nextProfiles;
  }

  async resolveProfileForSave(profileId) {
    const profiles = await this.listProfiles();
    if (profiles.length === 0) {
      throw new Error('Destination profile not configured');
    }

    const requestedProfileId =
      profileId || (await this.repository.getLastUsedProfileId()) || profiles[0].id;
    const profileIndex = profiles.findIndex(profile => profile.id === requestedProfileId);
    if (profileIndex === -1) {
      throw new Error('Destination profile not found');
    }

    const entitlement = await this.getDestinationEntitlement();
    if (profileIndex >= entitlement.maxProfiles) {
      throw new Error('Destination profile is not allowed');
    }

    return profiles[profileIndex];
  }
}
